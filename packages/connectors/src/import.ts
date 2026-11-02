import { createHash } from 'node:crypto';
import { DomainError,type EntityKind,type RequestContext,type TenantStore } from '@birdview/contracts';
import {importPreview,type ImportRequest,type ImportCommitResult} from './validation.js';
export * from './validation.js';
const fail=(code:string,message:string):never=>{throw new DomainError(code,message);};
export function sourceEntityId(organizationId:string,connectionId:string,kind:EntityKind,externalId:string):string {
  return `src_${createHash('sha256').update(JSON.stringify([organizationId,connectionId,kind,externalId])).digest('hex').slice(0,40)}`;
}
export async function commitImport(store:TenantStore,ctx:RequestContext,request:ImportRequest):Promise<ImportCommitResult> {
  const preview=importPreview(request);
  if(preview.invalidCount&&!request.skipInvalid)fail('IMPORT_VALIDATION','Hay filas no válidas; revisa la vista previa antes de confirmar');
  let connectionId=request.connectionId;
  if(connectionId){const connection=await store.get('connections',connectionId);if(!connection||connection.organizationId!==ctx.organizationId)throw new DomainError('NOT_FOUND','No encontrado',404);if(connection.data.provider!=='file')fail('IMPORT_CONNECTION','La conexión no admite archivos');}
  else {
    connectionId=sourceEntityId(ctx.organizationId,'manual','connections',request.entityKind);
    if(!await store.get('connections',connectionId))await store.create('connections',{provider:'file',name:`Importación ${request.entityKind}`,status:'active',entities:[request.entityKind],sourceAcl:'Política local de Bird View',readOnly:true},{id:connectionId,ownerId:ctx.userId});
  }
  const result:ImportCommitResult={created:0,updated:0,unchanged:0,invalid:preview.invalidCount,errors:preview.errors,connectionId};
  const now=new Date().toISOString();
  for(const row of preview.rows){
    const recordId=sourceEntityId(ctx.organizationId,connectionId,request.entityKind,row.externalId);
    const existing=await store.get(request.entityKind,recordId);
    const source={provider:'file',connectionId,externalId:row.externalId,observedAt:now,schemaVersion:'1',quality:'validated',deleted:false};
    const data={...row.data,source};
    if(existing){const previous={...existing.data};delete previous.source;if(JSON.stringify(Object.entries(previous).sort(([a],[b])=>a.localeCompare(b)))===JSON.stringify(Object.entries(row.data).sort(([a],[b])=>a.localeCompare(b)))){result.unchanged++;continue;}await store.update(request.entityKind,recordId,data,existing.version);result.updated++;}
    else{await store.create(request.entityKind,data,{id:recordId,departmentId:row.departmentId||({accounts:'sales',contacts:'sales',opportunities:'sales',invoices:'finance',payments:'finance',employees:'people',teams:'people',products:'inventory',orders:'operations'} as Record<string,string>)[request.entityKind]||null});result.created++;}
  }
  await store.create('sync_runs',{connectionId,provider:'file',entityKind:request.entityKind,status:result.invalid?'degraded':'succeeded',created:result.created,updated:result.updated,unchanged:result.unchanged,invalid:result.invalid,startedAt:now,completedAt:new Date().toISOString()},{ownerId:ctx.userId});
  await store.audit('import.commit',request.entityKind,null,'succeeded',{created:result.created,updated:result.updated,invalid:result.invalid});
  return result;
}
