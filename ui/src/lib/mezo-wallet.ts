import {BrowserProvider} from 'ethers';
import {CAPITAL} from './capital';
type Wallet={request:(args:{method:string;params?:unknown[]})=>Promise<any>;isMetaMask?:boolean;isPhantom?:boolean;providers?:Wallet[]};
let announced:Wallet|undefined;
export function discoverMetaMask(){
 const listener=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.info?.rdns==='io.metamask')announced=d.provider;};
 window.addEventListener('eip6963:announceProvider',listener);window.dispatchEvent(new Event('eip6963:requestProvider'));
 return ()=>window.removeEventListener('eip6963:announceProvider',listener);
}
export function metaMask(){
 const root=(window as unknown as {ethereum?:Wallet}).ethereum;
 const wallet=announced??root?.providers?.find(p=>p.isMetaMask&&!p.isPhantom)??(root?.isMetaMask&&!root.isPhantom?root:undefined);
 if(!wallet)throw Error('MetaMask was not detected. Unlock the extension and refresh.');return wallet;
}
export async function connectMezo(){
 const wallet=metaMask();await wallet.request({method:'eth_requestAccounts'});
 try{await wallet.request({method:'wallet_switchEthereumChain',params:[{chainId:CAPITAL.chainHex}]});}
 catch(error:any){if(error.code!==4902)throw error;await wallet.request({method:'wallet_addEthereumChain',params:[{chainId:CAPITAL.chainHex,chainName:'Mezo Testnet',nativeCurrency:{name:'Test BTC',symbol:'BTC',decimals:18},rpcUrls:[CAPITAL.rpc],blockExplorerUrls:[CAPITAL.explorer]}]});await wallet.request({method:'wallet_switchEthereumChain',params:[{chainId:CAPITAL.chainHex}]});}
 return (await walletSigner()).getAddress();
}
export async function walletSigner(expected?:string){
 const wallet=metaMask();if(BigInt(await wallet.request({method:'eth_chainId'}))!==31611n)throw Error('Switch MetaMask to Mezo testnet.');
 const signer=await new BrowserProvider(wallet).getSigner();
 if(expected&&(await signer.getAddress()).toLowerCase()!==expected.toLowerCase())throw Error('Wallet changed. Reconnect before continuing.');return signer;
}
