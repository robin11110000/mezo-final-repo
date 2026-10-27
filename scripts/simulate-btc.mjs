// Uses eth_call state overrides only. Never signs, broadcasts or creates a persistent position.
import {readFile,writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import solc from 'solc';
import {createPublicClient,http,parseAbi,encodeAbiParameters,keccak256,parseEther} from 'viem';
const config=JSON.parse(await readFile(new URL('../exports/protocol-testnet.json',import.meta.url),'utf8'));
const client=createPublicClient({transport:http(config.rpc,{timeout:60000,retryCount:0})});
if(await client.getChainId()!==31611)throw Error('Wrong chain');
const helper='0x00000000000000000000000000000000b7c0babe';
const source=`pragma solidity 0.8.30;
import "src/BtcRedemptionAccount.sol";
interface BO {function openTrove(uint256,address,address)external payable;function addColl(address,address)external payable;function repayMUSD(uint256,address,address)external;function closeTrove()external;function minNetDebt()external view returns(uint256);}
interface TM{function getTroveDebt(address)external view returns(uint256);function getTroveColl(address)external view returns(uint256);function getTroveStatus(address)external view returns(uint256);function getEntireDebtAndColl(address)external view returns(uint256,uint256,uint256,uint256,uint256,uint256);function MUSD_GAS_COMPENSATION()external view returns(uint256);function borrowerOperations()external view returns(address);}
interface Token{function balanceOf(address)external view returns(uint256);function approve(address,uint256)external returns(bool);}
interface VE{function createLock(uint256,uint256)external returns(uint256);function ownerOf(uint256)external view returns(address);function locked(uint256)external view returns(int128,uint256,bool);}
interface Hints {function getRedemptionHints(uint256,uint256,uint256)external view returns(address,uint256,uint256);function getApproxHint(uint256,uint256,uint256)external view returns(address,uint256,uint256);}
interface Sorted {function findInsertPosition(uint256,address,address)external view returns(address,address);}
interface PF {function fetchPrice()external view returns(uint256);}
contract Simulation {
 address constant C_MUSD=${config.contracts.MUSD.address};
 address constant C_MANAGER=${config.contracts.TroveManager.address};
 address constant C_HINTS=${config.contracts.HintHelpers.address};
 address constant C_SORTED=${config.contracts.SortedTroves.address};
 address constant C_PRICE=${config.contracts.PriceFeed.address};
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
 function redemption()external returns(uint256 spent,uint256 received,uint256 fee){
  BtcRedemptionAccount account=new BtcRedemptionAccount(C_MUSD,C_MANAGER,address(this));
  require(Token(C_MUSD).approve(address(account),100 ether));account.fund(100 ether);
  account.setPolicy(BtcRedemptionAccount.Policy(0,100 ether,100 ether,1,0,uint64(block.timestamp+3600),0,true));
  BtcRedemptionAccount.Request memory r;
  (r.first,,)=Hints(C_HINTS).getRedemptionHints(100 ether,PF(C_PRICE).fetchPrice(),50);
  {
   (uint256 coll,uint256 principal,uint256 interest,,,)=TM(C_MANAGER).getEntireDebtAndColl(r.first);
   r.amount=100 ether;uint256 available=principal+interest-TM(C_MANAGER).MUSD_GAS_COMPENSATION()-BO(TM(C_MANAGER).borrowerOperations()).minNetDebt();
   if(r.amount>available)r.amount=available;require(r.amount>0);
   r.nicr=(coll-r.amount*1e18/PF(C_PRICE).fetchPrice())*1e20/(principal-(r.amount>interest?r.amount-interest:0));
  }
  { (address approx,,)=Hints(C_HINTS).getApproxHint(r.nicr,16,42);(r.upper,r.lower)=Sorted(C_SORTED).findInsertPosition(r.nicr,approx,approx); }
  r.iterations=50;r.minBtc=1;r.deadline=uint64(block.timestamp+180);
  (spent,received,fee)=account.execute(r);
  require(spent>0&&received>0&&fee==0);account.withdraw(Token(C_MUSD).balanceOf(address(account)),address(account).balance);
 }
}`;
const root=fileURLToPath(new URL('../',import.meta.url));
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Simulation.sol':{content:source}},settings:{evmVersion:'london',optimizer:{enabled:true,runs:1000},outputSelection:{'*':{'*':['abi','evm.deployedBytecode.object']}}}}),{import:path=>{try{return {contents:readFileSync(resolve(root,path.replace('@openzeppelin/contracts/','lib/openzeppelin-contracts/contracts/')),'utf8')};}catch{return {error:'Missing '+path};}}}));
const errors=(output.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw Error(errors.map(x=>x.formattedMessage).join('\n'));
const art=output.contracts['Simulation.sol'].Simulation;
const block=await client.getBlock();
const balanceSlot=keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'}],[helper,0n]));
const override=[{address:helper,code:'0x'+art.evm.deployedBytecode.object,balance:parseEther('1')},{address:config.contracts.MUSD.address,stateDiff:[{slot:balanceSlot,value:'0x'+parseEther('100').toString(16).padStart(64,'0')}]}];
const probe=await client.readContract({address:config.contracts.MUSD.address,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[helper],blockNumber:block.number,stateOverride:override});
if(probe!==parseEther('100'))throw Error('MUSD override slot mismatch');
const report={chainId:31611,block:String(block.number),observedAt:new Date().toISOString(),method:'eth_call with ephemeral helper code, BTC balance and MUSD storage overrides; no broadcast',borrowing:null,earn:null,redemption:null};
for(const [name,method,args] of [['borrowing','borrow',[config.contracts.BorrowerOperations.address,config.contracts.TroveManager.address,config.contracts.MUSD.address]],['earn','earn',[config.contracts.VeBTC.address,'0x7b7c000000000000000000000000000000000000']],['redemption','redemption',[]]]){
 try{const result=await client.simulateContract({address:helper,abi:art.abi,functionName:method,args,account:helper,gas:25000000n,blockNumber:block.number,stateOverride:override});report[name]={status:'simulated-success',result:result.result};}
 catch(e){report[name]={status:'simulation-failed',reason:e.shortMessage||e.message};}
}
await writeFile(new URL('../exports/btc-lifecycle-simulation.json',import.meta.url),JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');
console.log(JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
if(Object.values(report).some(r=>r&&typeof r==='object'&&r.status==='simulation-failed'))process.exitCode=1;
