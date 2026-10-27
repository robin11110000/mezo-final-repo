// Browser integration against a local fork. Never sends a public transaction.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ganache=require('ganache');
const solc=require('solc');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createPublicClient,custom,encodeAbiParameters,keccak256,parseEther}=require('viem');
const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../exports/protocol-testnet.json'),'utf8'));
(async()=>{
 const provider=ganache.provider({logging:{quiet:true},chain:{chainId:31611,hardfork:'shanghai'},fork:{url:config.rpc,blockNumber:16392388,disableCache:true},wallet:{totalAccounts:2,defaultBalance:10}});
 let browser,page;
 try{
  const accounts=await provider.request({method:'eth_accounts',params:[]}),owner=accounts[0];
  // Ganache cannot execute Mezo's native Skip precompile. Override just that oracle locally.
  const mock='pragma solidity 0.8.30; contract Oracle {function decimals()external pure returns(uint8){return 18;} function latestRoundData()external view returns(uint80,int256,uint256,uint256,uint80){return (1,80000e18,block.timestamp,block.timestamp,0);}}';
  const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Oracle.sol':{content:mock}},settings:{evmVersion:'london',outputSelection:{'*':{'*':['evm.deployedBytecode.object']}}}})));
  await provider.request({method:'evm_setAccountCode',params:['0x7b7c000000000000000000000000000000000015','0x'+compiled.contracts['Oracle.sol'].Oracle.evm.deployedBytecode.object]});
  const slot=keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'}],[owner,0n]));
  await provider.request({method:'evm_setAccountStorageAt',params:[config.contracts.MUSD.address,slot,'0x'+parseEther('100').toString(16).padStart(64,'0')]});
  browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(180000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('localWallet',async req=>{if(req.method==='eth_requestAccounts')return accounts;if(req.method==='wallet_switchEthereumChain')return null;return provider.request(req);});
  await page.addInitScript(()=>{const wallet={isMetaMask:true,request:req=>window.localWallet(req),on:()=>{},removeListener:()=>{}};window.ethereum={isPhantom:true,request:()=>{throw Error('Wrong wallet');}};window.addEventListener('eip6963:requestProvider',()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{rdns:'io.metamask'},provider:wallet}})));});
  await page.route('https://rpc.test.mezo.org/**',async route=>{
   const p=route.request().postDataJSON();const handle=async req=>{try{return {jsonrpc:'2.0',id:req.id,result:await provider.request({method:req.method,params:req.params||[]})};}catch(e){return {jsonrpc:'2.0',id:req.id,error:{code:e.code||-32000,message:e.message,data:e.data}};}};
   await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(Array.isArray(p)?await Promise.all(p.map(handle)):await handle(p))});
  });
  const base=process.env.CAPITAL_URL||'http://127.0.0.1:3004';await page.goto(base+'/btc',{timeout:120000});console.log('Loaded BTC frontend on local fork');
  await page.getByRole('button',{name:'Connect MetaMask',exact:true}).click();await page.getByText(/Protocol and position verified at block/).waitFor();console.log('Verified protocol and wallet');
  await page.getByLabel('BTC to deposit',{exact:true}).fill('0.1');await page.getByLabel('MUSD to receive',{exact:true}).fill('2000');
  await page.getByRole('button',{name:'Calculate & simulate borrowing'}).click();await page.getByRole('heading',{name:'Borrow preview'}).waitFor();
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Deposit BTC & borrow test MUSD'}).click();await page.getByText('BTC collateral deposited; MUSD borrowed confirmed on Mezo testnet.',{exact:true}).waitFor();
  await page.getByLabel('BTC to add',{exact:true}).fill('0.01');await page.getByRole('button',{name:'Add BTC collateral',exact:true}).click();await page.getByText('BTC collateral added confirmed on Mezo testnet.',{exact:true}).waitFor();
  await page.getByLabel('MUSD amount',{exact:true}).fill('100');await page.getByRole('button',{name:'Repay MUSD debt',exact:true}).click();await page.getByText('MUSD debt repaid confirmed on Mezo testnet.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Repay all & close',exact:true}).click();await page.getByText('Trove closed; BTC returned confirmed on Mezo testnet.',{exact:true}).waitFor();
  const client=createPublicClient({transport:custom(provider)});assert.equal(await client.readContract({address:config.contracts.TroveManager.address,abi:config.contracts.TroveManager.abi,functionName:'getTroveStatus',args:[owner]}),2);
  await page.goto(base+'/earn');await page.getByRole('button',{name:'Connect MetaMask',exact:true}).click();await page.getByText(/Earn contracts and positions verified/).waitFor();
  await page.goto(base+'/execution');await page.getByRole('heading',{name:'Redemption automation account'}).waitFor();
  await page.getByRole('button',{name:'Connect MetaMask',exact:true}).click();await page.getByRole('button',{name:'Deploy empty redemption account'}).click();await page.getByText('Account build, owner, targets and policy verified.',{exact:true}).waitFor();
  const address=await page.getByLabel('Account address',{exact:true}).inputValue();assert.match(address,/^0x[0-9a-fA-F]{40}$/);
  await page.getByLabel('MUSD amount',{exact:true}).fill('50');await page.getByRole('button',{name:'Approve & fund account',exact:true}).click();await page.getByText('Account build, owner, targets and policy verified.',{exact:true}).waitFor();
  assert.equal(await client.readContract({address:config.contracts.MUSD.address,abi:config.contracts.MUSD.abi,functionName:'balanceOf',args:[address]}),parseEther('50'));
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({network:'local fork of Mezo testnet at block 16392388; native oracle overridden for Ganache compatibility',passed:['verified core identities','MetaMask selection','borrow preview','BTC collateral deposit and MUSD borrowing','collateral top-up','partial repayment','full closure','Earn reads','redemption account deployment','account funding','mobile overflow'],publicTransactions:0}));
 }catch(e){if(page)console.error('UI status:',await page.locator('.btc-status').innerText().catch(()=>''));throw e;}finally{if(browser)await browser.close();await provider.disconnect();}
})().catch(e=>{console.error(e);process.exitCode=1;});
