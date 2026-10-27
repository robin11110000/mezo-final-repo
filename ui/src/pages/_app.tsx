import type {AppProps} from 'next/app';
import Script from 'next/script';
import '../styles/capital-base.css';

export default function App({Component,pageProps}:AppProps){
 return <>{process.env.NODE_ENV!=='production'&&<Script src="https://mcp.figma.com/mcp/html-to-design/capture.js" strategy="afterInteractive"/>}<Component {...pageProps}/></>;
}
