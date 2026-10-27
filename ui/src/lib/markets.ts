import {Contract,formatUnits} from 'ethers';
import {checkedProvider} from './capital';
export async function readMarkets(){
 const p=await checkedProvider(),block=await p.getBlock('latest');if(!block)throw Error('Block unavailable.');
 const skip=new Contract('0x7b7c000000000000000000000000000000000015',['function decimals() view returns(uint8)','function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)'],p);
 const [decimals,data]=await Promise.all([skip.decimals(),skip.latestRoundData()]);
 const age=block.timestamp-Number(data[3]);if(data[1]<=0n||age<0||age>120)throw Error('Skip BTC price is invalid or stale.');
 const result:{btcUsd:string;btcAge:number;musdUsd:string|null;musdNote:string}={btcUsd:formatUnits(data[1],decimals),btcAge:age,musdUsd:null,musdNote:'MUSD oracle unavailable.'};
 try{
  const pyth=new Contract('0x2880aB155794e7179c9eE2e38200202908C17B43',['function getPriceNoOlderThan(bytes32,uint256) view returns((int64 price,uint64 conf,int32 expo,uint256 publishTime))'],p);
  const price=await pyth.getPriceNoOlderThan('0x0617a9b725011a126a2b9fd53563f4236501f32cf76d877644b943394606c6de',3600);
  if(price[0]<=0n||price[2]<-30n||price[2]>30n||price[3]>BigInt(block.timestamp)||BigInt(block.timestamp)-price[3]>3600n||price[1]*100n>price[0])throw Error('MUSD oracle fails price/confidence checks.');
  const usd=Number(price[0])*10**Number(price[2]);if(!Number.isFinite(usd)||usd<0.5||usd>1.5)throw Error('MUSD oracle outside configured bounds.');
  result.musdUsd=usd.toFixed(6);result.musdNote='Pyth MUSD price passed freshness, bounds and confidence checks.';
 }catch{result.musdNote='Pyth MUSD feed is unavailable, stale or outside configured confidence bounds. No $1 fallback is assumed.';}
 return result;
}
