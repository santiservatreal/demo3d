import { DomainError } from '@birdview/contracts';
import type { ConnectorContext } from './types.js';

const MAX_RESPONSE_BYTES=5*1024*1024;
const MAX_ATTEMPTS=4;
const defaultSleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export async function readJson(ctx:ConnectorContext,url:URL,headers:Record<string,string>):Promise<unknown> {
  if(url.protocol!=='https:'||url.origin!=='https://api.hubapi.com'||url.username||url.password)throw new DomainError('CONNECTOR_DESTINATION','Destino del conector no permitido',400);
  const request=ctx.fetch||fetch;
  for(let attempt=0;attempt<MAX_ATTEMPTS;attempt++){
    if(ctx.signal?.aborted)throw new DomainError('CONNECTOR_CANCELLED','Sincronización cancelada',409);
    const signal=ctx.signal?AbortSignal.any([ctx.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);
    let response:Response;
    try {response=await request(url,{method:'GET',headers,signal,redirect:'error'});} catch {
      if(ctx.signal?.aborted)throw new DomainError('CONNECTOR_CANCELLED','Sincronización cancelada',409);
      if(attempt===MAX_ATTEMPTS-1)throw new DomainError('CONNECTOR_TRANSPORT','No se ha podido leer el proveedor; no se han confirmado datos',502);
      await (ctx.sleep||defaultSleep)(Math.min(8000,400*2**attempt)+Math.floor(Math.random()*150));continue;
    }
    if(response.status===429||response.status>=500){
      await response.body?.cancel();
      if(attempt===MAX_ATTEMPTS-1)throw new DomainError('CONNECTOR_RETRY_EXHAUSTED','El proveedor sigue limitando o rechazando la lectura',502);
      const retry=response.headers.get('retry-after');let delay=Math.min(8000,400*2**attempt)+Math.floor(Math.random()*150);
      if(retry){const seconds=Number(retry);const parsed=Number.isFinite(seconds)?seconds*1000:Date.parse(retry)-(ctx.now?.()||new Date()).getTime();if(Number.isFinite(parsed)&&parsed>0)delay=Math.max(delay,parsed);}
      if(delay>30000)throw new DomainError('CONNECTOR_DEFERRED','El proveedor requiere esperar; el trabajo debe reprogramarse',429);
      await (ctx.sleep||defaultSleep)(delay);continue;
    }
    if(!response.ok){await response.body?.cancel();throw new DomainError(response.status===401||response.status===403?'CONNECTOR_AUTH':'CONNECTOR_RESPONSE',response.status===401||response.status===403?'Credencial o permisos del proveedor no válidos':'El proveedor rechazó la lectura',response.status===401||response.status===403?400:502);}
    const stated=Number(response.headers.get('content-length')||0);if(stated>MAX_RESPONSE_BYTES){await response.body?.cancel();throw new DomainError('CONNECTOR_SIZE','Respuesta del proveedor demasiado grande',502);}
    const reader=response.body?.getReader();if(!reader)throw new DomainError('CONNECTOR_RESPONSE','Respuesta vacía del proveedor',502);
    const pieces:Uint8Array[]=[];let total=0;
    for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_RESPONSE_BYTES){await reader.cancel();throw new DomainError('CONNECTOR_SIZE','Respuesta del proveedor demasiado grande',502);}pieces.push(value);}
    const bytes=new Uint8Array(total);let offset=0;for(const piece of pieces){bytes.set(piece,offset);offset+=piece.byteLength;}
    try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new DomainError('CONNECTOR_RESPONSE','El proveedor no devolvió JSON válido',502);}
  }
  throw new DomainError('CONNECTOR_RETRY_EXHAUSTED','No se pudo completar la lectura',502);
}
