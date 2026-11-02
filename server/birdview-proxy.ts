import type { IncomingMessage,ServerResponse } from 'node:http';
import { Readable,Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MAX_BYTES=4*1024*1024;
const methods=new Set(['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']);
const requestHeaders=['accept','content-type','cookie','origin','referer','x-csrf-token','authorization','user-agent'];
const responseHeaders=['content-type','content-disposition','content-security-policy','referrer-policy','x-accel-buffering'];
type ProxyRequest=IncomingMessage&{body?:unknown};
type ProxyOptions={origin?:()=>string|undefined;request?:typeof fetch;timeoutMs?:number};

function failure(res:ServerResponse,status:number,code:string,message:string){
 if(res.destroyed)return;
 if(res.headersSent){res.destroy();return;}
 res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');
 res.end(JSON.stringify({error:{code,message}}));
}
function backendOrigin(value:string){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Invalid backend origin');
 return url.origin;
}
async function requestBody(req:ProxyRequest){
 if(req.body!==undefined){const result=Buffer.isBuffer(req.body)?req.body:Buffer.from(typeof req.body==='string'?req.body:JSON.stringify(req.body));if(result.length>MAX_BYTES)throw new RangeError('Body limit');return result;}
 const chunks:Buffer[]=[];let size=0;
 for await(const part of req){const chunk=Buffer.from(part);size+=chunk.length;if(size>MAX_BYTES)throw new RangeError('Body limit');chunks.push(chunk);}
 return Buffer.concat(chunks);
}

/** Same-origin bridge only. The destination is operator configuration, never request input. */
export function createBirdviewProxy(options:ProxyOptions={}){
 return async(req:ProxyRequest,res:ServerResponse)=>{
  res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
  const configured=(options.origin??(()=>process.env.BIRDVIEW_API_ORIGIN))();
  if(!configured)return failure(res,503,'BACKEND_NOT_CONFIGURED','Esta publicación tiene la interfaz de BirdView, pero todavía no tiene conectado su servidor.');
  let origin:string;try{origin=backendOrigin(configured);}catch{return failure(res,503,'BACKEND_CONFIGURATION_INVALID','La dirección del servidor debe ser un origen HTTPS válido, sin ruta ni credenciales.');}
  const method=req.method||'GET';if(!methods.has(method))return failure(res,405,'METHOD_NOT_ALLOWED','Método no disponible.');
  let path:URL;try{path=new URL(req.url||'/','https://birdview-proxy.invalid');}catch{return failure(res,400,'INVALID_PATH','Ruta no válida.');}
  if(!path.pathname.startsWith('/api/v1/')&&!path.pathname.startsWith('/api/auth/'))return failure(res,404,'NOT_FOUND','Ruta no disponible.');
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),options.timeoutMs??50000);
  req.once('aborted',()=>abort.abort());res.once('close',()=>{if(!res.writableFinished)abort.abort();});
  try{
   const headers=new Headers();for(const name of requestHeaders){const value=req.headers[name];if(typeof value==='string')headers.set(name,value);}
   const body=['GET','HEAD'].includes(method)?undefined:await requestBody(req);
   const upstream=await(options.request??fetch)(origin+path.pathname+path.search,{method,headers,body:body?new Uint8Array(body).buffer:undefined,redirect:'manual',signal:abort.signal});
   if(upstream.status>=300&&upstream.status<400){await upstream.body?.cancel();return failure(res,502,'BACKEND_REDIRECT_BLOCKED','El servidor ha redirigido la petición. Revisa su dirección y origen público.');}
   if(Number(upstream.headers.get('content-length')||0)>MAX_BYTES){await upstream.body?.cancel();return failure(res,502,'PROXY_RESPONSE_LIMIT','El archivo supera el límite de esta conexión de Vercel. Descárgalo desde la instalación principal de BirdView.');}
   res.statusCode=upstream.status;
   for(const name of responseHeaders){const value=upstream.headers.get(name);if(value)res.setHeader(name,value);}
   const cookies=upstream.headers.getSetCookie();if(cookies.length)res.setHeader('set-cookie',cookies);
   if(method==='HEAD'||!upstream.body){res.end();return;}
   let size=0;const bounded=new Transform({transform(chunk:Buffer,_encoding,callback){size+=chunk.length;callback(size>MAX_BYTES?new Error('Response limit'):null,chunk);}});
   await pipeline(Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream),bounded,res);
  }catch(error){
   if(error instanceof RangeError)return failure(res,413,'PROXY_REQUEST_LIMIT','La petición supera el límite de esta conexión de Vercel.');
   failure(res,502,'BACKEND_UNREACHABLE','No se puede contactar con el servidor de BirdView. Revisa que esté publicado y disponible.');
  }finally{clearTimeout(timer);}
 };
}
