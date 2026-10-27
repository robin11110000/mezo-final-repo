import {Contract,ContractRunner,JsonRpcProvider,ZeroAddress,getAddress,keccak256} from 'ethers';
import config from './protocol-testnet.json';
import {checkedProvider} from './capital';
import {borrowingPreview,ratio,repayToTarget,WAD} from './btc-math.mjs';
export {config};
export type ContractName=keyof typeof config.contracts;
const SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
export const CORE:ContractName[]=['BorrowerOperations','TroveManager','PriceFeed','HintHelpers','SortedTroves','GovernableVariables','InterestRateManager','MUSD'];
export function protocolContract(name:ContractName,runner:ContractRunner){const c=config.contracts[name];return new Contract(c.address,c.abi,runner);}
export async function verifyProtocol(provider:JsonRpcProvider,names:ContractName[]=CORE){
 if(BigInt(await provider.send('eth_chainId',[]))!==31611n)throw Error('Testnet required.');
 const block=await provider.getBlockNumber();
 await Promise.all(names.map(async name=>{
  const c=config.contracts[name];const [code,storage]=await Promise.all([provider.getCode(c.address,block),provider.getStorage(c.address,SLOT,block)]);
  if(code==='0x'||keccak256(code)!==c.runtimeHash)throw Error(`${name} runtime changed. Integration review required.`);
  const implementation=/^0x0*$/.test(storage)?null:getAddress('0x'+storage.slice(-40));
  if(implementation!==c.implementation)throw Error(`${name} implementation changed. Integration review required.`);
  if(implementation&&keccak256(await provider.getCode(implementation,block))!==c.implementationHash)throw Error(`${name} implementation code changed.`);
 }));
 const bo=protocolContract('BorrowerOperations',provider);
 for(const [method,name] of [['troveManager','TroveManager'],['priceFeed','PriceFeed'],['sortedTroves','SortedTroves'],['musd','MUSD'],['governableVariables','GovernableVariables'],['interestRateManager','InterestRateManager']] as const){
  if(names.includes('BorrowerOperations')&&getAddress(await bo[method]({blockTag:block}))!==config.contracts[name].address)throw Error(`Unexpected protocol linkage: ${method}`);
 }
 return block;
}
export async function readPosition(owner:string){
 const address=getAddress(owner),provider=await checkedProvider();const block=await verifyProtocol(provider);
 const tm=protocolContract('TroveManager',provider),bo=protocolContract('BorrowerOperations',provider),pf=protocolContract('PriceFeed',provider),irm=protocolContract('InterestRateManager',provider),gov=protocolContract('GovernableVariables',provider),token=protocolContract('MUSD',provider);
 const o={blockTag:block};
 const [price,status,amounts,minimumDebt,gasCompensation,mcr,ccr,walletBtc,walletMusd,globalRate,ownRate,feeExempt]=await Promise.all([pf.fetchPrice(o),tm.getTroveStatus(address,o),tm.getEntireDebtAndColl(address,o),bo.minNetDebt(o),tm.MUSD_GAS_COMPENSATION(o),tm.MCR(o),tm.CCR(o),provider.getBalance(address,block),token.balanceOf(address,o),irm.interestRate(o),tm.getTroveInterestRate(address,o),gov.isAccountFeeExempt(address,o)]);
 if(price<=0n)throw Error('Protocol BTC price unavailable.');
 // getEntireDebtAndColl already includes pending rewards. Do not add its last three outputs again.
 const collateral=BigInt(amounts[0]),principal=BigInt(amounts[1]),interest=BigInt(amounts[2]),debt=principal+interest;
 const [recovery,tcr]=await Promise.all([tm.checkRecoveryMode(price,o),tm.getTCR(price,o)]);
 return {address,block,price:BigInt(price),status:Number(status),collateral,principal,interest,debt,minimumDebt:BigInt(minimumDebt),gasCompensation:BigInt(gasCompensation),mcr:BigInt(mcr),ccr:BigInt(ccr),walletBtc:BigInt(walletBtc),walletMusd:BigInt(walletMusd),globalRate:Number(globalRate),ownRate:Number(ownRate),feeExempt:Boolean(feeExempt),recovery:Boolean(recovery),tcr:BigInt(tcr),icr:ratio(collateral,BigInt(price),debt)};
}
export type Position=Awaited<ReturnType<typeof readPosition>>;
export async function insertionHints(provider:JsonRpcProvider,collateral:bigint,principal:bigint){
 const hints=protocolContract('HintHelpers',provider),sorted=protocolContract('SortedTroves',provider);
 const nicr=await hints.computeNominalCR(collateral,principal);
 const approximate=await hints.getApproxHint(nicr,16,42);
 const position=await sorted.findInsertPosition(nicr,approximate[0],approximate[0]);return [position[0],position[1]] as [string,string];
}
export async function previewBorrow(owner:string,collateral:bigint,draw:bigint,targetBps:bigint){
 const position=await readPosition(owner),provider=await checkedProvider(),bo=protocolContract('BorrowerOperations',provider);
 const fee=position.feeExempt?0n:BigInt(await bo.getBorrowingFee(draw));
 const preview=borrowingPreview({collateral,price:position.price,draw,fee,gasCompensation:position.gasCompensation,targetBps,minimumDebt:position.minimumDebt});
 if(position.status===1)throw Error('This wallet already has a trove. Use the management controls.');
 if(!preview.aboveMinimum)throw Error('Borrowed amount plus fee is below the protocol minimum debt.');
 if(!preview.withinTarget)throw Error('Requested borrowing falls below your target collateral ratio. Reduce MUSD or add BTC.');
 if(collateral>=position.walletBtc)throw Error('Insufficient BTC. Leave BTC in the wallet for gas.');
 const hints=await insertionHints(provider,collateral,preview.totalDebt);
 const request={to:config.contracts.BorrowerOperations.address,data:bo.interface.encodeFunctionData('openTrove',[draw,...hints]),value:collateral,from:position.address};
 await provider.call(request);const gas=await provider.estimateGas(request),fees=await provider.getFeeData();
 if(collateral+gas*(fees.maxFeePerGas??fees.gasPrice??0n)>position.walletBtc)throw Error('Collateral plus estimated gas exceeds wallet BTC.');
 return {position,...preview,fee,draw,collateral,hints,gas,request,createdAt:Date.now()};
}
export type BorrowPreview=Awaited<ReturnType<typeof previewBorrow>>;
export function defensePlan(p:Position,targetBps:bigint){return repayToTarget({...p,targetBps});}
export async function preparePositionAction(owner:string,action:'addColl'|'repayMUSD'|'withdrawMUSD'|'closeTrove'|'refinance',amount:bigint,targetBps=20000n){
 const p=await readPosition(owner);if(p.status!==1)throw Error('No active trove for this wallet.');
 const provider=await checkedProvider(),bo=protocolContract('BorrowerOperations',provider);
 let collateral=p.collateral,principal=p.principal;let args:unknown[]=[],value=0n;
 if(action==='addColl'){if(amount<=0n)throw Error('Enter positive BTC.');collateral+=amount;value=amount;}
 if(action==='repayMUSD'){
  if(amount<=0n||amount>p.walletMusd)throw Error('Not enough wallet MUSD. Return savings and withdraw to your wallet first.');
  if(p.debt-amount<p.minimumDebt+p.gasCompensation)throw Error('Partial repayment leaves debt below minimum. Use close position instead.');
  principal-=amount>p.interest?amount-p.interest:0n;
 }
 if(action==='withdrawMUSD'){
  if(amount<=0n)throw Error('Enter positive MUSD.');const fee=p.feeExempt?0n:BigInt(await bo.getBorrowingFee(amount));principal+=amount+fee;
  if(collateral*p.price*10000n<(principal+p.interest)*targetBps*WAD)throw Error('Borrowing more would breach your collateral target.');
 }
 if(action==='refinance'){
  const percentage=BigInt(await bo.refinancingFeePercentage());
  const fee=p.feeExempt?0n:BigInt(await bo.getBorrowingFee((p.debt-p.gasCompensation)*percentage/100n));principal+=fee;
 }
 if(action==='closeTrove'){if(p.walletMusd<p.debt-p.gasCompensation)throw Error('Wallet MUSD is insufficient to close, including accrued interest.');}
 else {const hints=await insertionHints(provider,collateral,principal);args=['addColl','refinance'].includes(action)?hints:[amount,...hints];}
 const request={to:config.contracts.BorrowerOperations.address,from:p.address,data:bo.interface.encodeFunctionData(action,args),value};
 await provider.call(request);return {request,gas:await provider.estimateGas(request),position:p};
}
