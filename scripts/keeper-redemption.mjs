// One-shot keeper. Default mode only reads/simulates. No public transaction without --send.
import {readFile} from 'node:fs/promises';
import {createPublicClient,createWalletClient,http,getAddress,keccak256} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {planRedemption} from '../ui/src/lib/redemption-plan.mjs';
const config=JSON.parse(await readFile(new URL('../exports/protocol-testnet.json',import.meta.url),'utf8'));
const artifact=JSON.parse(await readFile(new URL('../exports/BtcRedemptionAccount.json',import.meta.url),'utf8'));
const sending=process.argv.includes('--send');
const accountAddress=getAddress(process.env.REDEMPTION_ACCOUNT??'');
let account;
if(sending){if(!process.env.KEEPER_PRIVATE_KEY)throw Error('Configure KEEPER_PRIVATE_KEY locally. Never paste keys into chat.');account=privateKeyToAccount(process.env.KEEPER_PRIVATE_KEY);}else account=getAddress(process.env.KEEPER_ADDRESS??'');
const caller=typeof account==='string'?account:account.address;
const transport=http(config.rpc,{timeout:20000,retryCount:0}),client=createPublicClient({transport});
if(await client.getChainId()!==31611)throw Error('Testnet required');
const block=await client.getBlock(),blockNumber=block.number;
const read=(name,functionName,args=[])=>client.readContract({address:config.contracts[name].address,abi:config.contracts[name].abi,functionName,args,blockNumber});
for(const name of ['TroveManager','BorrowerOperations','PriceFeed','HintHelpers','SortedTroves','MUSD']){
 const c=config.contracts[name],code=await client.getCode({address:c.address,blockNumber}),slot=await client.getStorageAt({address:c.address,slot:'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',blockNumber});
 if(!code||keccak256(code)!==c.runtimeHash)throw Error(`${name} runtime changed`);
 const implementation=slot&&!/^0x0*$/.test(slot)?getAddress('0x'+slot.slice(-40)):null;
 if(implementation!==c.implementation)throw Error(`${name} implementation changed`);
 if(implementation&&keccak256(await client.getCode({address:implementation,blockNumber}))!==c.implementationHash)throw Error(`${name} implementation runtime changed`);
}
const code=await client.getCode({address:accountAddress,blockNumber});if(!code)throw Error('Account missing');
let masked=code.slice(2).toLowerCase();for(const refs of Object.values(artifact.immutableReferences))for(const {start,length} of refs)masked=masked.slice(0,start*2)+'0'.repeat(length*2)+masked.slice((start+length)*2);
if(masked!==artifact.runtimeTemplate.slice(2).toLowerCase())throw Error('Account runtime does not match build');
const accountRead=(functionName,args=[])=>client.readContract({address:accountAddress,abi:artifact.abi,functionName,args,blockNumber});
const [owner,token,manager,allowed,policy,last]=await Promise.all([accountRead('owner'),accountRead('musd'),accountRead('manager'),accountRead('keepers',[caller]),accountRead('policy'),accountRead('lastExecution')]);
if(getAddress(token)!==config.contracts.MUSD.address||getAddress(manager)!==config.contracts.TroveManager.address)throw Error('Unexpected account targets');
if(getAddress(owner)!==getAddress(caller)&&!allowed)throw Error('Keeper not authorized');
const print=v=>console.log(JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2));
if(!policy[7]||block.timestamp>=policy[5]||(last!==0n&&block.timestamp<last+policy[4])){print({mode:'hold',reason:'Policy inactive, expired or cooling down',blockNumber});process.exit(0);}
const balance=await read('MUSD','balanceOf',[accountAddress]);
const surplus=balance>policy[0]?balance-policy[0]:0n;
const feeBps=getAddress(owner)===getAddress(caller)?0n:BigInt(policy[6]);
const affordable=surplus*10000n/(10000n+feeBps);
const maximum=BigInt(process.env.MAX_REDEEM_WEI??policy[1]);
const amount=[affordable,policy[1],policy[2],maximum].reduce((a,b)=>a<b?a:b);
if(amount<=0n){print({mode:'hold',reason:'No permitted balance/budget'});process.exit(0);}
const price=await read('PriceFeed','fetchPrice');
const plan=await planRedemption({amount,price,mcr:await read('TroveManager','MCR'),gasCompensation:await read('TroveManager','MUSD_GAS_COMPENSATION'),minimumDebt:await read('BorrowerOperations','minNetDebt'),last:()=>read('SortedTroves','getLast'),previous:address=>read('SortedTroves','getPrev',[address]),position:async address=>{const p=await read('TroveManager','getEntireDebtAndColl',[address]);return {collateral:p[0],principal:p[1],interest:p[2]};}});
if(plan.amount===0n)throw Error('No redemption liquidity within policy and debt limits');
let upper='0x0000000000000000000000000000000000000000',lower=upper;
if(plan.nicr>0n){const approx=await read('HintHelpers','getApproxHint',[plan.nicr,16n,42n]);[upper,lower]=await read('SortedTroves','findInsertPosition',[plan.nicr,approx[0],approx[0]]);}
const r={amount:plan.amount,first:plan.first,upper,lower,nicr:plan.nicr,iterations:50n,minBtc:(plan.amount*policy[3]+10n**18n-1n)/10n**18n,deadline:block.timestamp+180n};
const simulation=await client.simulateContract({address:accountAddress,abi:artifact.abi,functionName:'execute',args:[r],account:caller});
if(!sending){print({mode:'simulate',status:'passed',blockNumber,requested:r.amount,spent:simulation.result[0],btcReceived:simulation.result[1],keeperFee:simulation.result[2]});process.exit(0);}
const gasPrice=await client.getGasPrice();if(gasPrice>BigInt(process.env.MAX_GAS_PRICE_WEI??'10000000000'))throw Error('Gas price ceiling exceeded');
const wallet=createWalletClient({account,transport});
const hash=await wallet.writeContract({...simulation.request,chain:{id:31611,name:'Mezo Testnet',nativeCurrency:{name:'BTC',symbol:'BTC',decimals:18},rpcUrls:{default:{http:[config.rpc]}}},account,gasPrice});
const receipt=await client.waitForTransactionReceipt({hash});print({hash,status:receipt.status});if(receipt.status!=='success')process.exitCode=1;
