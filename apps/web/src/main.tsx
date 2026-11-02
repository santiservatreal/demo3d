import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './styles.css';
import { App } from './App';
const client=new QueryClient({defaultOptions:{queries:{retry:(count,error)=>count<1&&(!('status'in error)||Number(error.status)>=500),staleTime:15000,refetchOnWindowFocus:true}}});
declare const __BIRDVIEW_BROWSER_DEMO__:boolean;
const root=createRoot(document.getElementById('root')!);
async function start(){
 const mode=new URLSearchParams(location.search).get('demo');let requested=false;try{if(mode==='local')sessionStorage.setItem('birdview-browser-demo','1');if(mode==='server')sessionStorage.removeItem('birdview-browser-demo');requested=sessionStorage.getItem('birdview-browser-demo')==='1';}catch{/* IndexedDB initialization reports storage availability. */}
 if(mode==='local'||(mode!=='server'&&(__BIRDVIEW_BROWSER_DEMO__||requested))){
  root.render(<main className="bv-auth-shell"><p>Preparando la demo gratuita…</p></main>);
  try{const[{openDemoPersistence},{createBrowserDemo},{configureDemoTransport}]=await Promise.all([import('./demo/persistence'),import('./demo/runtime'),import('./api')]);configureDemoTransport(await createBrowserDemo(await openDemoPersistence()));}
  catch{root.render(<main className="bv-auth-shell"><section className="bv-login-card"><h1>No se puede guardar la demo</h1><p>Permite el almacenamiento local de este sitio o utiliza otro navegador para conservar tus pruebas.</p></section></main>);return;}
 }
 root.render(<React.StrictMode><QueryClientProvider client={client}><BrowserRouter basename="/app"><App/></BrowserRouter></QueryClientProvider></React.StrictMode>);
}
void start();
