import Head from 'next/head';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {formatEther,parseEther} from 'ethers';
import {connectMezo,discoverMetaMask,walletSigner} from '../lib/mezo-wallet';
import {BorrowPreview,Position,config,defensePlan,preparePositionAction,previewBorrow,readPosition} from '../lib/protocol';
import {CAPITAL} from '../lib/capital';
const number=(n:bigint)=>Number(formatEther(n)).toLocaleString(undefined,{maximumFractionDigits:6});
const percent=(n:bigint|null)=>n===null?'—':`${(Number(n)/1e16).toFixed(2)}%`;
type Activity={hash:string;label:string;time:number};
export default function Bitcoin(){
 const [account,setAccount]=useState(''),[position,setPosition]=useState<Position|null>(null),[preview,setPreview]=useState<BorrowPreview|null>(null);
 const [collateral,setCollateral]=useState('0.1'),[draw,setDraw]=useState('1800'),[target,setTarget]=useState('200');
 const [amount,setAmount]=useState('100'),[btcAmount,setBtcAmount]=useState('0.01'),[ack,setAck]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('Connect MetaMask to inspect your BTC and Mezo borrowing position.'),[activity,setActivity]=useState<Activity[]>([]);
 useEffect(()=>discoverMetaMask(),[]);
 async function run(fn:()=>Promise<void>){setBusy(true);setMessage('Checking Mezo testnet…');try{await fn();}catch(e:any){setMessage(e.shortMessage||e.message||'Request failed.');}finally{setBusy(false);}}
 const targetBps=()=>{if(!/^\d{3}$/.test(target)||Number(target)<150||Number(target)>999)throw Error('Use a target between 150% and 999%.');return BigInt(target)*100n;};
 async function refresh(owner=account){const p=await readPosition(owner);setPosition(p);setMessage(`Protocol and position verified at block ${p.block.toLocaleString()}.`);return p;}
 async function connect(){setPreview(null);setPosition(null);const owner=await connectMezo();setAccount(owner);try{setActivity(JSON.parse(localStorage.getItem('btc-activity-'+owner.toLowerCase())||'[]').slice(0,12));}catch{setActivity([]);}await refresh(owner);}
 async function broadcast(label:string,request:{to:string;data:string;value?:bigint;from?:string}){
  const signer=await walletSigner(account);await signer.call(request);const gas=await signer.estimateGas(request);
  setMessage('Review the transaction in MetaMask.');const tx=await signer.sendTransaction({...request,gasLimit:gas*12n/10n});
  setMessage('Waiting for testnet confirmation…');const receipt=await tx.wait();if(receipt?.status!==1)throw Error('Transaction failed.');
  const next=[{hash:tx.hash,label,time:Date.now()},...activity].slice(0,12);setActivity(next);localStorage.setItem('btc-activity-'+account.toLowerCase(),JSON.stringify(next));setPreview(null);await refresh();setMessage(`${label} confirmed on Mezo testnet.`);
 }
 async function calculate(){setPreview(null);const p=await previewBorrow(account,parseEther(collateral),parseEther(draw),targetBps());setPreview(p);setPosition(p.position);setMessage('Borrowing simulated. Review debt, ratio and BTC required before signing.');}
 async function borrow(){
  if(!preview||!ack)throw Error('Preview and acknowledge the borrowing risk first.');
  if(Date.now()-preview.createdAt>60000)throw Error('Preview expired. Calculate it again.');
  const fresh=await previewBorrow(account,parseEther(collateral),parseEther(draw),targetBps());
  if(fresh.fee>preview.fee||fresh.totalDebt>preview.totalDebt)throw Error('Borrowing costs increased. Preview again.');
  await broadcast('BTC collateral deposited; MUSD borrowed',fresh.request);
 }
 async function manage(action:'addColl'|'repayMUSD'|'withdrawMUSD'|'closeTrove'|'refinance'){
  const request=await preparePositionAction(account,action,['closeTrove','refinance'].includes(action)?0n:parseEther(action==='addColl'?btcAmount:amount),targetBps());
  await broadcast({addColl:'BTC collateral added',repayMUSD:'MUSD debt repaid',withdrawMUSD:'Additional MUSD borrowed',closeTrove:'Trove closed; BTC returned',refinance:'Trove refinanced'}[action],request.request);
 }
 let defense:ReturnType<typeof defensePlan>|null=null;try{if(position?.status===1)defense=defensePlan(position,targetBps());}catch{}
 const edit=(setter:(v:string)=>void)=>(value:string)=>{setter(value);setPreview(null);setAck(false);};
 return <><Head><title>BTC / Capital Engine</title><meta name="description" content="Activate test BTC with Mezo borrowing, reserves and bounded execution."/></Head><main className="btc-app"><div className="btc-ripples" aria-hidden="true"/><div className="btc-shell">
  <nav className="btc-nav"><Link href="/btc" className="btc-brand">BTC / CAPITAL_</Link><span className="btc-tag">MEZO TESTNET · 31611</span></nav>
  <div className="btc-tabs"><Link href="/btc" aria-current="page">01 / BTC & LOANS</Link><Link href="/capital">02 / MUSD RESERVES</Link><Link href="/earn">03 / BTC EARN</Link><Link href="/execution">04 / KEEPER & EXITS</Link></div>
  <header className="btc-hero"><p className="btc-eyebrow">ACTIVATE YOUR BITCOIN</p><h1>BTC INTO<br/><em>WORKING CAPITAL.</em></h1><p>Use test BTC as collateral. Access MUSD. Keep your position visible.</p></header>
  <section className="btc-panel"><div className="btc-title"><h2>Your Bitcoin account</h2><span>01</span></div><div className="btc-actions"><button disabled={busy} onClick={()=>run(connect)}>{account?account.slice(0,6)+'…'+account.slice(-4):'Connect MetaMask'}</button><button className="secondary" disabled={busy||!account} onClick={()=>run(()=>refresh().then(()=>{}))}>Refresh position</button><a href="https://faucet.test.mezo.org/" target="_blank" rel="noreferrer">Get test BTC ↗</a></div><p className="btc-help">Borrowing locks BTC as collateral and creates MUSD debt. A price decline can cause liquidation. Every action requires your wallet confirmation.</p></section>
  <section className="btc-metrics"><article><span>WALLET BTC</span><strong>{position?number(position.walletBtc):'—'}</strong></article><article><span>COLLATERAL BTC</span><strong>{position?number(position.collateral):'—'}</strong></article><article><span>WALLET MUSD</span><strong>{position?number(position.walletMusd):'—'}</strong></article><article><span>COLLATERAL RATIO</span><strong>{position?percent(position.icr):'—'}</strong></article></section>
  <section className="btc-panel"><div className="btc-title"><h2>Activate BTC collateral</h2><span>02</span></div><div className="btc-fields"><label>BTC to deposit<input value={collateral} onChange={e=>edit(setCollateral)(e.target.value)} inputMode="decimal"/></label><label>MUSD to receive<input value={draw} onChange={e=>edit(setDraw)(e.target.value)} inputMode="decimal"/></label><label>Minimum collateral target / %<input value={target} onChange={e=>edit(setTarget)(e.target.value)} inputMode="numeric"/></label></div>
  <p className="btc-help">{position?`Protocol minimum net debt: ${number(position.minimumDebt)} MUSD. Gas compensation adds ${number(position.gasCompensation)} MUSD to total debt. Current new-loan interest: ${(position.globalRate/100).toFixed(2)}% per year.`:'Connect to read current fees, interest and minimum debt.'} The target is a borrowing guard, not a guarantee against liquidation.</p>
  <button disabled={busy||!account||position?.status===1} onClick={()=>run(calculate)}>Calculate & simulate borrowing</button>
  {preview&&<div className="btc-notice"><h3>Borrow preview</h3><dl><dt>BTC collateral</dt><dd>{number(preview.collateral)} BTC</dd><dt>MUSD received</dt><dd>{number(preview.draw)}</dd><dt>Issuance fee</dt><dd>{number(preview.fee)} MUSD</dd><dt>Total debt, including gas compensation</dt><dd>{number(preview.totalDebt)} MUSD</dd><dt>Initial collateral ratio</dt><dd>{percent(preview.icr)}</dd></dl><label className="btc-check"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>I understand the debt and liquidation risk. These are test assets.</label><button disabled={busy||!ack} onClick={()=>run(borrow)}>Deposit BTC & borrow test MUSD</button></div>}
  </section>
  <section className="btc-panel"><div className="btc-title"><h2>Manage your borrowing position</h2><span>03</span></div><p className="btc-help">{position?.status===1?`Debt ${number(position.debt)} MUSD · accrued interest ${number(position.interest)} MUSD · loan interest ${(position.ownRate/100).toFixed(2)}%/year · protocol minimum ratio ${percent(position.mcr)} · system ${position.recovery?'in recovery mode':'in normal mode'}`:'No active trove loaded. Open a position above or connect a wallet with an existing trove.'}</p>
  <div className="btc-fields"><label>MUSD amount<input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal"/></label><label>BTC to add<input value={btcAmount} onChange={e=>setBtcAmount(e.target.value)} inputMode="decimal"/></label></div><div className="btc-actions">{(['addColl','repayMUSD','withdrawMUSD','refinance','closeTrove'] as const).map((a,i)=><button key={a} className={i>1?'secondary':''} disabled={busy||!account||position?.status!==1} onClick={()=>run(()=>manage(a))}>{['Add BTC collateral','Repay MUSD debt','Borrow more MUSD','Refinance loan','Repay all & close'][i]}</button>)}</div>
  {defense&&<div className="btc-notice"><strong>Repayment planner</strong><p>To reach your {target}% target at the current protocol price, repay approximately {number(defense.desired)} MUSD.{defense.requiresClose?' A partial repayment cannot reach the target while respecting minimum debt. Full closure or additional BTC is required.':' Interest and prices can change before confirmation.'}</p></div>}
  <p className="btc-help">To repay using savings: return savings to reserve → withdraw MUSD to your wallet → repay here. These are separate confirmed transactions. Refinancing may add a fee and does not always reduce your costs.</p></section>
  <section className="btc-panel"><div className="btc-title"><h2>Put the MUSD to work</h2><span>04</span></div><p>Your borrowed MUSD arrives in your wallet. Fund your owner-controlled capital vault, preserve a liquid reserve, and choose how much surplus to allocate to savings.</p><Link className="btc-link-button" href="/capital">Open MUSD reserve vault →</Link><p className="btc-help">Savings income is variable. Borrowing interest applies to the debt even when only part of the MUSD is earning. We do not assume a profitable spread.</p></section>
  <section className="btc-panel"><div className="btc-title"><h2>Confirmed activity</h2><span>05</span></div>{activity.length?activity.map(a=><a className="btc-activity" key={a.hash} href={`${CAPITAL.explorer}/tx/${a.hash}`} target="_blank" rel="noreferrer">{a.label}<small>{new Date(a.time).toLocaleString()} · {a.hash.slice(0,16)}… ↗</small></a>):<p className="btc-help">Confirmed wallet actions from this browser will appear here.</p>}</section>
  <section className="btc-status" aria-live="polite"><span>{busy?'WORKING_':'STATUS_'}</span><p>{message}</p></section><footer className="btc-footer">TEST ASSETS ONLY / BTC COLLATERAL CARRIES LIQUIDATION RISK<br/><a href={`${CAPITAL.explorer}/address/${config.contracts.BorrowerOperations.address}`} target="_blank" rel="noreferrer">Verified protocol target ↗</a></footer>
 </div></main></>;
}
