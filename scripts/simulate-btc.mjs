// Uses eth_call state overrides only. Never signs, broadcasts or creates a persistent position.
import {readFile,writeFile} from 'node:fs/promises';
import solc from 'solc';
import {createPublicClient,http,parseAbi,encodeAbiParameters,keccak256,parseEther} from 'viem';
const config=JSON.parse(await readFile(new URL('../exports/protocol-testnet.json',import.meta.url),'utf8'));
const client=createPublicClient({transport:http(config.rpc,{timeout:60000,retryCount:0})});
if(await client.getChainId()!==31611)throw Error('Wrong chain');
const helper='0x00000000000000000000000000000000b7c0babe';
const source=`pragma solidity 0.8.30;
interface BO {function openTrove(uint256,address,address)external payable;function addColl(address,address)external payable;function repayMUSD(uint256,address,address)external;function closeTrove()external;}
interface TM{function getTroveDebt(address)external view returns(uint256);function getTroveColl(address)external view returns(uint256);function getTroveStatus(address)external view returns(uint256);}
interface Token{function balanceOf(address)external view returns(uint256);function approve(address,uint256)external returns(bool);}
interface VE{function createLock(uint256,uint256)external returns(uint256);function ownerOf(uint256)external view returns(address);function locked(uint256)external view returns(int128,uint256,bool);}
contract Simulation {
 receive()external payable{}
 function borrow(address operations,address manager,address musd)external returns(uint256 minted,uint256 debt,uint256 afterRepayment,uint256 finalStatus,uint256 finalBtc){
  BO b=BO(operations);TM t=TM(manager);Token token=Token(musd);uint256 beforeBalance=token.balanceOf(address(this));
  b.openTrove{value:0.1 ether}(2000 ether,address(0),address(0));minted=token.balanceOf(address(this))-beforeBalance;
  debt=t.getTroveDebt(address(this));b.addColl{value:0.01 ether}(address(0),address(0));require(t.getTroveColl(address(this))>=0.11 ether);
  b.repayMUSD(100 ether,address(0),address(0));afterRepayment=t.getTroveDebt(address(this));
  b.closeTrove();finalStatus=t.getTroveStatus(address(this));finalBtc=address(this).balance;
  require(minted==2000 ether&&afterRepayment<debt&&finalStatus==2);
 }
 function earn(address ve,address btc)external returns(uint256 id,uint256 lockedAmount,uint256 end){
  require(Token(btc).approve(ve,0.01 ether));id=VE(ve).createLock(0.01 ether,14 days);require(VE(ve).ownerOf(id)==address(this));
  (int128 amount,uint256 expiry,)=VE(ve).locked(id);lockedAmount=uint256(uint128(amount));end=expiry;require(lockedAmount==0.01 ether);
 }
}`;
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Simulation.sol':{content:source}},settings:{evmVersion:'london',optimizer:{enabled:true,runs:1000},outputSelection:{'*':{'*':['abi','evm.deployedBytecode.object']}}}})));
const errors=(output.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw Error(errors.map(x=>x.formattedMessage).join('\n'));
const art=output.contracts['Simulation.sol'].Simulation;
const block=await client.getBlock();
const balanceSlot=keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'}],[helper,0n]));
const override=[{address:helper,code:'0x'+art.evm.deployedBytecode.object,balance:parseEther('1')},{address:config.contracts.MUSD.address,stateDiff:[{slot:balanceSlot,value:'0x'+parseEther('100').toString(16).padStart(64,'0')}]}];
const probe=await client.readContract({address:config.contracts.MUSD.address,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[helper],blockNumber:block.number,stateOverride:override});
if(probe!==parseEther('100'))throw Error('MUSD override slot mismatch');
const report={chainId:31611,block:String(block.number),observedAt:new Date().toISOString(),method:'eth_call with ephemeral helper code, BTC balance and MUSD storage overrides; no broadcast',borrowing:null,earn:null};
for(const [name,method,args] of [['borrowing','borrow',[config.contracts.BorrowerOperations.address,config.contracts.TroveManager.address,config.contracts.MUSD.address]],['earn','earn',[config.contracts.VeBTC.address,'0x7b7c000000000000000000000000000000000000']]]){
 try{const result=await client.simulateContract({address:helper,abi:art.abi,functionName:method,args,account:helper,gas:25000000n,blockNumber:block.number,stateOverride:override});report[name]={status:'simulated-success',result:result.result};}
 catch(e){report[name]={status:'simulation-failed',reason:e.shortMessage||e.message};}
}
await writeFile(new URL('../exports/btc-lifecycle-simulation.json',import.meta.url),JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');
console.log(JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
if(report.borrowing.status!=='simulated-success'||report.earn.status!=='simulated-success')process.exitCode=1;
