import {Contract,ZeroAddress,getAddress} from 'ethers';
import {checkedProvider} from './capital';
import {config,protocolContract,verifyProtocol} from './protocol';
import {walletSigner} from './mezo-wallet';
export const EARN=['VeBTC','VeBTCVoter','VeBTCRewardsDistributor'] as const;
export async function readEarn(owner:string){
 const provider=await checkedProvider(),block=await verifyProtocol(provider,[...EARN]);
 const ve=protocolContract('VeBTC',provider),voter=protocolContract('VeBTCVoter',provider),distributor=protocolContract('VeBTCRewardsDistributor',provider),o={blockTag:block};
 const [token,voterAddress,distributorAddress,count,length]=await Promise.all([ve.token(o),ve.voter(o),ve.distributor(o),ve.balanceOf(owner,o),voter.length(o)]);
 if(getAddress(voterAddress)!==config.contracts.VeBTCVoter.address||getAddress(distributorAddress)!==config.contracts.VeBTCRewardsDistributor.address)throw Error('Earn configuration changed. Review required.');
 if(getAddress(token)!==getAddress('0x7b7C000000000000000000000000000000000000'))throw Error('Unexpected veBTC deposit token.');
 const positions=await Promise.all(Array.from({length:Math.min(Number(count),20)},async(_,i)=>{
  const id=BigInt(await ve.ownerToNFTokenIdList(owner,i,o));
  const [locked,power,claimable,lastVoted]=await Promise.all([ve.locked(id,o),ve.balanceOfNFT(id,o),distributor.claimable(id,o),voter.lastVoted(id,o)]);
  return {id,amount:BigInt(locked[0]),end:Number(locked[1]),permanent:Boolean(locked[2]),power:BigInt(power),claimable:BigInt(claimable),lastVoted:Number(lastVoted)};
 }));
 const pools=await Promise.all(Array.from({length:Math.min(Number(length),16)},async(_,i)=>{
  const pool=await voter.pools(i,o),gauge=await voter.gauges(pool,o),alive=gauge!==ZeroAddress&&await voter.isAlive(gauge,o);
  return {pool:getAddress(pool),gauge:getAddress(gauge),alive:Boolean(alive)};
 }));
 return {block,token:getAddress(token),positions,pools,totalPositions:Number(count),totalPools:Number(length)};
}
export type EarnSnapshot=Awaited<ReturnType<typeof readEarn>>;
export async function executeEarn(owner:string,action:'lock'|'extend'|'withdraw'|'claim'|'vote',input:{amount?:bigint;days?:number;id?:bigint;pool?:string}){
 const p=await checkedProvider();await verifyProtocol(p,[...EARN]);const signer=await walletSigner(owner);
 const ve=protocolContract('VeBTC',signer),voter=protocolContract('VeBTCVoter',signer),dist=protocolContract('VeBTCRewardsDistributor',signer);
 const token=await ve.token();if(getAddress(token)!==getAddress('0x7b7C000000000000000000000000000000000000')||getAddress(await ve.voter())!==config.contracts.VeBTCVoter.address||getAddress(await ve.distributor())!==config.contracts.VeBTCRewardsDistributor.address)throw Error('Earn linkage changed.');
 const id=input.id??0n;
 if(action!=='lock'&&getAddress(await ve.ownerOf(id))!==getAddress(owner))throw Error('You do not own that veBTC position.');
 if(['lock','extend'].includes(action)&&(!Number.isInteger(input.days)||input.days!<1||input.days!>28))throw Error('Choose a lock duration of 1–28 days.');
 if(action==='lock'){
  if(!input.amount||input.amount<=0n)throw Error('Enter positive BTC.');
  if(input.amount>=await p.getBalance(owner))throw Error('Leave BTC in the wallet for gas.');
  const btc=new Contract(token,['function approve(address,uint256) returns(bool)','function allowance(address,address) view returns(uint256)'],signer);
  if(await btc.allowance(owner,config.contracts.VeBTC.address)<input.amount){
   await btc.approve.staticCall(config.contracts.VeBTC.address,input.amount);
   const approval=await btc.approve(config.contracts.VeBTC.address,input.amount);const receipt=await approval.wait();if(receipt?.status!==1)throw Error('BTC approval failed.');
  }
 }
 const [contract,method,args]=action==='lock'?[ve,'createLock',[input.amount,BigInt(input.days!)*86400n]]:action==='extend'?[ve,'increaseUnlockTime',[id,BigInt(input.days!)*86400n]]:action==='withdraw'?[ve,'withdraw',[id]]:action==='claim'?[dist,'claim',[id]]:[voter,'vote',[id,[getAddress(input.pool!)],[1n]]];
 if(action==='vote'){
  const gauge=await voter.gauges(input.pool);if(gauge===ZeroAddress||!await voter.isAlive(gauge))throw Error('This pool has no active gauge.');
 }
 await contract[method].staticCall(...args);const tx=await contract[method](...args);const receipt=await tx.wait();if(receipt?.status!==1)throw Error('Earn transaction failed.');return tx.hash as string;
}
