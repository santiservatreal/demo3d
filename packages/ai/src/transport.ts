import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { DomainError } from '@birdview/contracts';
import type { ApprovedEndpoint,DNSResolver,HttpTransport } from './types.js';

function forbiddenV4(address:string):boolean {
  const parts=address.split('.').map(Number);if (parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255)) return true;
  const [a,b,c]=parts;
  return a===0||a===10||a===127||a!>=224||a===169&&b===254||a===172&&b!>=16&&b!<=31||a===192&&(b===168||b===0||b===2)||a===100&&b!>=64&&b!<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113;
}
export function isPrivateAddress(raw:string):boolean {
  const address=raw.replace(/^\[|\]$/g,'').toLowerCase();
  const family=isIP(address);
  if (family===4) return forbiddenV4(address);
  if (family!==6) return true;
  if (address.startsWith('::ffff:')) {
    const tail=address.slice(7);
    if (isIP(tail)===4) return forbiddenV4(tail);
    const parts=tail.split(':');
    if (parts.length===2) {const number=parseInt(parts[0]!,16)*65536+parseInt(parts[1]!,16);return forbiddenV4([number>>>24,(number>>>16)&255,(number>>>8)&255,number&255].join('.'));}
  }
  return !/^[23][0-9a-f]{0,3}:/i.test(address)||address.startsWith('2001:db8:')||address.startsWith('2001:0:')||address.startsWith('2002:');
}
export function normalizeEndpoint(value:string):string {
  let url:URL;try {url=new URL(value);} catch {throw new DomainError('AI_ENDPOINT_INVALID','El endpoint del proveedor no es válido.');}
  if (url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol)) throw new DomainError('AI_ENDPOINT_INVALID','El endpoint del proveedor no es válido.');
  return url.toString().replace(/\/+$/,'');
}
export async function validateDestination(endpoint:string,kind:'external'|'self_hosted',approved:readonly ApprovedEndpoint[],resolve:DNSResolver=defaultResolver):Promise<{url:string;addresses:Array<{address:string;family:4|6}>}> {
  const normalized=normalizeEndpoint(endpoint), entry=approved.find(item=>normalizeEndpoint(item.url)===normalized);
  if (!entry) throw new DomainError('AI_ENDPOINT_NOT_APPROVED','El operador no ha autorizado este endpoint.',403);
  const url=new URL(normalized);
  if (url.protocol!=='https:'&&!(kind==='self_hosted'&&entry.allowPrivateNetwork===true)) throw new DomainError('AI_ENDPOINT_NOT_APPROVED','El proveedor requiere una conexión HTTPS aprobada.',403);
  if (entry.allowPrivateNetwork&&kind!=='self_hosted') throw new DomainError('AI_ENDPOINT_NOT_APPROVED','Una excepción privada solo puede usarse con un proveedor autohospedado.',403);
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  const direct=isIP(hostname);
  const addresses=direct?[{address:hostname,family:direct as 4|6}]:await resolve(hostname);
  if (!addresses.length||addresses.length>16||addresses.some(item=>![4,6].includes(item.family)||isIP(item.address)!==item.family)) throw new DomainError('AI_DNS_INVALID','No se pudo validar el destino del proveedor.',503);
  if (!entry.allowPrivateNetwork&&(hostname==='localhost'||hostname.endsWith('.localhost')||hostname.endsWith('.local')||hostname.endsWith('.internal')||addresses.some(item=>isPrivateAddress(item.address)))) throw new DomainError('AI_PRIVATE_DESTINATION_BLOCKED','El destino del proveedor no está permitido.',403);
  return {url:normalized+'/chat/completions',addresses};
}
export const defaultResolver:DNSResolver=async hostname=>(await lookup(hostname,{all:true,verbatim:true})).map(item=>({address:item.address,family:item.family as 4|6}));

/** DNS is pinned into the actual connection; no second lookup or redirect follows. */
export const nodeHttpTransport:HttpTransport=async input=>new Promise((resolve,reject)=>{
  const url=new URL(input.url);let settled=false;
  const fail=(error:unknown)=>{if(settled)return;settled=true;reject(error instanceof DomainError?error:new DomainError('AI_TRANSPORT_FAILED','No se pudo completar la llamada al proveedor.',503));};
  const chosen=input.pinnedAddresses[0];if(!chosen){fail(new DomainError('AI_DNS_INVALID','El destino no está resuelto.',503));return;}
  const execute=url.protocol==='https:'?httpsRequest:httpRequest;
  const req=execute(url,{
    method:input.method,headers:{...input.headers,'content-length':Buffer.byteLength(input.body)},signal:input.signal,
    lookup:((_hostname:unknown,_options:unknown,callback:(error:null,address:string,family:number)=>void)=>callback(null,chosen.address,chosen.family)) as never,
    servername:url.hostname,
    timeout:Math.min(60000,Math.max(1000,input.timeoutMs)),
  },response=>{
    const status=response.statusCode||0;
    if(status>=300&&status<400){response.resume();fail(new DomainError('AI_REDIRECT_BLOCKED','El proveedor intentó redirigir la solicitud.',502));return;}
    const chunks:Buffer[]=[];let bytes=0;
    response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>2*1024*1024){req.destroy();fail(new DomainError('AI_RESPONSE_TOO_LARGE','La respuesta supera el límite permitido.',502));}else chunks.push(chunk);});
    response.on('error',fail);
    response.on('end',()=>{if(settled)return;settled=true;const headers:Record<string,string>={};for(const [key,value] of Object.entries(response.headers)) if(typeof value==='string')headers[key]=value;resolve({status,headers,body:Buffer.concat(chunks).toString('utf8')});});
  });
  req.on('timeout',()=>req.destroy(new Error('timeout')));req.on('error',fail);
  req.end(input.body);
});
