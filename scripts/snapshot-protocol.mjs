// Read-only acquisition of public, pinned upstream ABIs and testnet runtime identities.
import {writeFile} from 'node:fs/promises';
import {createPublicClient,http,keccak256,parseAbi,getAddress} from 'viem';
const rpc='https://rpc.test.mezo.org';
const client=createPublicClient({transport:http(rpc,{timeout:20000,retryCount:1})});
const slot='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const revisions={musd:'da7888a10949c8a5d3f884454cec8978cfa87e48',tigris:'0a3b5e840ac8e187cc705fbeddcf00f88b09247e'};
const groups={musd:['BorrowerOperations','BorrowerOperationsSignatures','TroveManager','HintHelpers','SortedTroves','PriceFeed','GovernableVariables','InterestRateManager','MUSD'],tigris:['Router','PoolFactory','VeBTC','VeBTCVoter','VeBTCRewardsDistributor']};
if(await client.getChainId()!==31611)throw Error('Mezo testnet required');
const blockNumber=await client.getBlockNumber();
const contracts={};
await Promise.all(Object.entries(groups).flatMap(([repo,names])=>names.map(async name=>{
 const dir=repo==='musd'?'solidity/artifacts/deployments/matsnet':'solidity/deployments/testnet';
 const url=`https://raw.githubusercontent.com/mezo-org/${repo}/${revisions[repo]}/${dir}/${name}.json`;
 const response=await fetch(url);if(!response.ok)throw Error(`${name}: ${response.status}`);
 const artifact=await response.json();const address=getAddress(artifact.address);
 const code=await client.getCode({address,blockNumber});if(!code||code==='0x')throw Error(`Missing ${name}`);
 const storage=await client.getStorageAt({address,slot,blockNumber});
 const implementation=storage&&!/^0x0+$/.test(storage)?getAddress('0x'+storage.slice(-40)):null;
 const implementationCode=implementation?await client.getCode({address:implementation,blockNumber}):null;
 contracts[name]={address,abi:artifact.abi.filter(x=>x.type==='function'||x.type==='event'||x.type==='error'),source:url,runtimeHash:keccak256(code),implementation,implementationHash:implementationCode?keccak256(implementationCode):null};
})));
const read=(name,method,args=[])=>client.readContract({address:contracts[name].address,abi:contracts[name].abi,functionName:method,args,blockNumber});
for(const [method,target] of [['troveManager','TroveManager'],['priceFeed','PriceFeed'],['sortedTroves','SortedTroves'],['musd','MUSD'],['governableVariables','GovernableVariables'],['interestRateManager','InterestRateManager']]){
 if(getAddress(await read('BorrowerOperations',method))!==contracts[target].address)throw Error(`Core linkage mismatch: ${method}`);
}
const parameters={};
for(const [name,method] of [['BorrowerOperations','minNetDebt'],['BorrowerOperations','borrowingRate'],['BorrowerOperations','redemptionRate'],['TroveManager','MCR'],['TroveManager','CCR'],['TroveManager','MUSD_GAS_COMPENSATION'],['InterestRateManager','interestRate'],['Router','defaultFactory']]){
 try{parameters[method]=String(await read(name,method));}catch{parameters[method]=null;}
}
const report={chainId:31611,rpc,observedAt:new Date().toISOString(),blockNumber:String(blockNumber),revisions,parameters,contracts};
const json=JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n';
await writeFile(new URL('../ui/src/lib/protocol-testnet.json',import.meta.url),json);
await writeFile(new URL('../exports/protocol-testnet.json',import.meta.url),json);
console.log(JSON.stringify({blockNumber:String(blockNumber),parameters,contracts:Object.fromEntries(Object.entries(contracts).map(([k,v])=>[k,{address:v.address,implementation:v.implementation}]))},null,2));
