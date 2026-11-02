import type { Entity,OrganizationSummary } from '@birdview/contracts';
export interface DemoState {schemaVersion:1;revision:number;organizationId:string;signedIn:boolean;organizations:OrganizationSummary[];entities:Entity[];artifacts:Record<string,{blob:Blob;filename:string}>;}
export interface DemoPersistence {read:()=>Promise<DemoState|null>;write:(state:DemoState,expectedRevision:number|null)=>Promise<void>;}
export async function openDemoPersistence():Promise<DemoPersistence>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('birdview-browser-tests-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('workspace');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('No se puede abrir el almacenamiento local.'));});
 db.onversionchange=()=>db.close();
 return {
  read:()=>new Promise((resolve,reject)=>{const tx=db.transaction('workspace','readonly'),request=tx.objectStore('workspace').get('state');request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(new Error('No se pueden leer los datos locales.'));}),
  write:(state,expectedRevision)=>new Promise((resolve,reject)=>{const tx=db.transaction('workspace','readwrite'),store=tx.objectStore('workspace');const request=store.get('state');let conflict=false;request.onsuccess=()=>{const old=request.result as DemoState|undefined;if(expectedRevision!==null&&old?.revision!==expectedRevision){conflict=true;tx.abort();return;}store.put(state,'state');};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('No se pueden guardar los datos locales. Revisa el espacio del navegador.'));tx.onabort=()=>reject(new Error(conflict?'La demo cambió en otra pestaña. Actualiza la página antes de continuar.':'No se han guardado los cambios de esta prueba.'));}),
 };
}
