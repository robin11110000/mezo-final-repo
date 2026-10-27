import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import solc from 'solc';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,parseEther,zeroAddress} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
const source='src/BtcRedemptionAccount.sol';
const mock=`pragma solidity 0.8.30;
import "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";
contract ManagerMock {
 ERC20Mock public musdToken; uint256 public fillBps=10000;uint256 public outputBps=10000;bool public attack;bool public reentered;
 constructor(address t){musdToken=ERC20Mock(t);} receive() external payable{}
 function configure(uint256 fill,uint256 output,bool reenter) external{fillBps=fill;outputBps=output;attack=reenter;}
 function redeemCollateral(uint256 amount,address,address,address,uint256,uint256) external{
  uint256 spent=amount*fillBps/10000;musdToken.burn(msg.sender,spent);
  if(attack){(bool ok,)=msg.sender.call(abi.encodeWithSignature("withdraw(uint256,uint256)",1,0));reentered=ok;}
  (bool paid,)=msg.sender.call{value:spent/100000*outputBps/10000}("");require(paid);
 }
}`;
const out=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{[source]:{content:readFileSync(source,'utf8')},'Mock.sol':{content:mock}},settings:{optimizer:{enabled:true,runs:1000},evmVersion:'london',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{import:p=>{try{return {contents:readFileSync(p.replace('@openzeppelin/contracts/','lib/openzeppelin-contracts/contracts/'),'utf8')};}catch{return {error:'Missing '+p};}}}));
assert.deepEqual((out.errors||[]).filter(e=>e.severity==='error'),[]);
const vaultArt=out.contracts[source].BtcRedemptionAccount,tokenArt=out.contracts['@openzeppelin/contracts/mocks/token/ERC20Mock.sol'].ERC20Mock,managerArt=out.contracts['Mock.sol'].ManagerMock;
async function setup(t){
 const provider=ganache.provider({logging:{quiet:true},chain:{chainId:31611,hardfork:'london'}});t.after(()=>provider.disconnect());
 const [owner,keeper,stranger]=Object.values(provider.getInitialAccounts()).map(a=>privateKeyToAccount(a.secretKey));
 const client=createPublicClient({transport:custom(provider)}),wallet=createWalletClient({transport:custom(provider),account:owner});
 const mined=hash=>client.waitForTransactionReceipt({hash});
 const deploy=async(a,args=[])=>{const r=await mined(await wallet.deployContract({chain:null,abi:a.abi,bytecode:'0x'+a.evm.bytecode.object,args}));assert.equal(r.status,'success');return r.contractAddress;};
 const send=(address,a,functionName,args=[],account=owner)=>wallet.writeContract({chain:null,address,abi:a.abi,functionName,args,account,gas:2000000n}).then(mined);
 const read=(address,a,functionName,args=[])=>client.readContract({address,abi:a.abi,functionName,args});
 const token=await deploy(tokenArt),manager=await deploy(managerArt,[token]),vault=await deploy(vaultArt,[token,manager,owner.address]);
 await mined(await wallet.sendTransaction({chain:null,to:manager,value:parseEther('1')}));
 await send(token,tokenArt,'mint',[owner.address,parseEther('1000')]);await send(token,tokenArt,'approve',[vault,parseEther('1000')]);
 const act=(method,args=[],who=owner)=>send(vault,vaultArt,method,args,who),view=(method,args=[])=>read(vault,vaultArt,method,args);
 await act('fund',[parseEther('1000')]);await act('setKeeper',[keeper.address,true]);
 const now=(await client.getBlock()).timestamp;
 const policy={reserve:parseEther('100'),maxPerExecution:parseEther('200'),remainingBudget:parseEther('400'),minBtcPerMusd:10000000000000n,cooldown:60n,expiresAt:now+3600n,keeperFeeBps:50,active:true};
 await act('setPolicy',[policy]);
 const request={amount:parseEther('100'),first:zeroAddress,upper:zeroAddress,lower:zeroAddress,nicr:1n,iterations:10n,minBtc:parseEther('0.0004'),deadline:now+300n};
 return {provider,client,owner,keeper,stranger,token,manager,vault,send,read,act,view,policy,request};
}
test('only authorized execution; partial fills debit actual spend and pay bounded fees',async t=>{
 const f=await setup(t);const {act,view,request,keeper,stranger,send,read,token,manager,vault}=f;
 assert.equal((await act('execute',[request],stranger)).status,'reverted');
 assert.equal((await act('withdraw',[1n,0n],keeper)).status,'reverted');
 await send(manager,managerArt,'configure',[5000n,10000n,true]);
 assert.equal((await act('execute',[request],keeper)).status,'success');
 assert.equal((await view('policy'))[2],parseEther('350'));
 assert.equal(await read(token,tokenArt,'balanceOf',[keeper.address]),parseEther('0.25'));
 assert.equal(await read(token,tokenArt,'balanceOf',[vault]),parseEther('949.75'));
 assert.equal(await read(manager,managerArt,'reentered'),false);
 assert.equal(await f.client.getBalance({address:vault}),parseEther('0.0005'));
 assert.equal((await act('execute',[request],keeper)).status,'reverted');
});
test('minimum BTC, policy exchange rate, reserve and iteration bounds revert atomically',async t=>{
 const f=await setup(t);const {act,view,request,keeper,send,read,token,manager,vault,policy}=f;
 await send(manager,managerArt,'configure',[10000n,1000n,false]);
 assert.equal((await act('execute',[{...request,minBtc:1n}],keeper)).status,'reverted');
 assert.equal((await view('policy'))[2],parseEther('400'));
 assert.equal(await read(token,tokenArt,'balanceOf',[vault]),parseEther('1000'));
 await send(manager,managerArt,'configure',[10000n,10000n,false]);
 assert.equal((await act('execute',[{...request,minBtc:parseEther('1')}],keeper)).status,'reverted');
 assert.equal((await act('execute',[{...request,iterations:0n}],keeper)).status,'reverted');
 assert.equal((await act('execute',[{...request,iterations:101n}],keeper)).status,'reverted');
 await act('setPolicy',[{...policy,reserve:parseEther('900')}]);
 assert.equal((await act('execute',[request],keeper)).status,'reverted');
});
test('expiry and revocation stop keepers while owner exits remain available',async t=>{
 const {act,request,keeper,provider,view}=await setup(t);
 await act('revoke');assert.equal((await act('execute',[request],keeper)).status,'reverted');
 assert.equal((await act('withdraw',[parseEther('1000'),0n])).status,'success');
 assert.equal((await view('policy'))[7],false);
 await provider.request({method:'evm_increaseTime',params:[4000]});await provider.request({method:'evm_mine',params:[]});
 assert.equal((await act('execute',[request],keeper)).status,'reverted');
});
