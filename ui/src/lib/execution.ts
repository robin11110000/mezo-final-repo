import {Contract,JsonRpcProvider,ZeroAddress,getAddress,parseEther} from 'ethers';
import {checkedProvider,CAPITAL} from './capital';
import {config,protocolContract,verifyProtocol} from './protocol';
import artifact from './abis/BtcRedemptionAccount.json';
export {artifact as redemptionArtifact};
const btc='0x7b7C000000000000000000000000000000000000';
export async function readRedemptionAccount(address:string){
 const provider=await checkedProvider(),target=getAddress(address),code=await provider.getCode(target);
 let masked=code.slice(2).toLowerCase();for(const refs of Object.values(artifact.immutableReferences))for(const ref of refs){const start=ref.start*2;masked=masked.slice(0,start)+'0'.repeat(ref.length*2)+masked.slice(start+ref.length*2);}
 if(masked!==artifact.runtimeTemplate.slice(2).toLowerCase())throw Error('Account runtime does not match this build.');
 const c=new Contract(target,artifact.abi,provider);const [owner,token,manager,policy,musd,balance]=await Promise.all([c.owner(),c.musd(),c.manager(),c.policy(),protocolContract('MUSD',provider).balanceOf(target),provider.getBalance(target)]);
 if(getAddress(token)!==CAPITAL.musd||getAddress(manager)!==config.contracts.TroveManager.address)throw Error('Unexpected redemption targets.');
 return {address:target,owner:getAddress(owner),musd:BigInt(musd),btc:balance,policy:{reserve:BigInt(policy[0]),maxPerExecution:BigInt(policy[1]),remainingBudget:BigInt(policy[2]),minBtcPerMusd:BigInt(policy[3]),cooldown:Number(policy[4]),expiresAt:Number(policy[5]),keeperFeeBps:Number(policy[6]),active:Boolean(policy[7])}};
}
export type RedemptionSnapshot=Awaited<ReturnType<typeof readRedemptionAccount>>;
export async function redemptionRequest(provider:JsonRpcProvider,amount:bigint,minBtc:bigint){
 const pf=protocolContract('PriceFeed',provider),helper=protocolContract('HintHelpers',provider),sorted=protocolContract('SortedTroves',provider);
 const price=BigInt(await pf.fetchPrice());if(price<=0n)throw Error('Protocol price unavailable.');
 const hints=await helper.getRedemptionHints(amount,price,50);
 if(hints[0]===ZeroAddress||hints[2]===0n)throw Error('No redeemable liquidity found.');
 let upper=ZeroAddress,lower=ZeroAddress;if(hints[1]>0n){const approx=await helper.getApproxHint(hints[1],64,42);const pos=await sorted.findInsertPosition(hints[1],approx[0],approx[0]);upper=pos[0];lower=pos[1];}
 const block=await provider.getBlock('latest');if(!block)throw Error('Missing block.');
 return {amount:BigInt(hints[2]),first:hints[0],upper,lower,nicr:BigInt(hints[1]),iterations:50n,minBtc,deadline:BigInt(block.timestamp+180)};
}
export async function quoteExits(owner:string,amount:bigint,minBtc:bigint,account?:string){
 if(amount<=0n||minBtc<=0n)throw Error('Enter positive MUSD and minimum BTC.');
 const provider=await checkedProvider();await verifyProtocol(provider);await verifyProtocol(provider,['Router','PoolFactory']);
 const gasPrice=(await provider.getFeeData()).gasPrice;if(gasPrice===null)throw Error('Gas pricing unavailable.');
 const results:{route:string;input:bigint;output:bigint;gas:bigint;net:bigint;simulated:boolean;note:string}[]=[];
 let request:Awaited<ReturnType<typeof redemptionRequest>>|null=null;
 try{
  request=await redemptionRequest(provider,amount,minBtc);
  if(!account)throw Error('Deploy, fund and activate a redemption account to simulate enforceable BTC output.');
  const snapshot=await readRedemptionAccount(account);if(snapshot.owner!==getAddress(owner))throw Error('This wallet does not own the loaded redemption account.');
  const c=new Contract(snapshot.address,artifact.abi,provider);
  const transaction={to:snapshot.address,from:owner,data:c.interface.encodeFunctionData('execute',[request])};
  const response=await provider.call(transaction);const decoded=c.interface.decodeFunctionResult('execute',response);const gas=await provider.estimateGas(transaction)*gasPrice;
  results.push({route:'Protocol redemption',input:BigInt(decoded[0]),output:BigInt(decoded[1]),gas,net:BigInt(decoded[1])-gas,simulated:true,note:'Actual BTC return measured by account simulation. Partial MUSD fill is possible; BTC remains in your account until withdrawal.'});
 }catch(e:any){results.push({route:'Protocol redemption',input:request?.amount??amount,output:0n,gas:0n,net:0n,simulated:false,note:e.shortMessage||e.message});}
 const factory=config.contracts.PoolFactory.address;
 const routes=[{from:CAPITAL.musd,to:btc,stable:false,factory}];
 try{
  const router=protocolContract('Router',provider);if(getAddress(await router.defaultFactory())!==factory)throw Error('Router factory changed.');
  const quoted=await router.getAmountsOut(amount,routes),output=BigInt(quoted[quoted.length-1]);if(output<=0n)throw Error('No executable pool quote.');
  const block=await provider.getBlock('latest');if(!block)throw Error('Missing block.');
  const transaction={to:config.contracts.Router.address,from:owner,data:router.interface.encodeFunctionData('swapExactTokensForTokens',[amount,minBtc,routes,owner,block.timestamp+180])};
  let gas=0n,simulated=false,note='Indicative quote. Exact MUSD approval and wallet funding are needed for simulation.';
  try{await provider.call(transaction);gas=await provider.estimateGas(transaction)*gasPrice;simulated=true;note='Wallet swap simulated with on-chain minimum BTC and deadline.';}catch{}
  results.push({route:'DEX swap',input:amount,output,gas,net:output-gas,simulated,note});
 }catch(e:any){results.push({route:'DEX swap',input:amount,output:0n,gas:0n,net:0n,simulated:false,note:e.shortMessage||e.message});}
 return {results,request,createdAt:Date.now()};
}
export async function liquidationPreview(borrowers:string[]){
 if(!borrowers.length||borrowers.length>20)throw Error('Use 1–20 borrower addresses.');
 const addresses=[...new Set(borrowers.map(getAddress))],provider=await checkedProvider();await verifyProtocol(provider);
 const tm=protocolContract('TroveManager',provider),price=await protocolContract('PriceFeed',provider).fetchPrice(),mcr=await tm.MCR();
 const positions=await Promise.all(addresses.map(async borrower=>({borrower,status:Number(await tm.getTroveStatus(borrower)),icr:BigInt(await tm.getCurrentICR(borrower,price))})));
 return positions.map(p=>({...p,eligible:p.status===1&&p.icr<BigInt(mcr)}));
}
