import { randomUUID,createHash } from 'node:crypto';
import { DomainError,type EntityKind,type RequestContext,type TenantStore } from '@birdview/contracts';
import { getConnector } from './adapters.js';
import { normalizeImportData } from './import.js';
import type { ConnectionEntity,SecretReader,SyncOptions,SyncSummary } from './types.js';
export * from './adapters.js';
export * from './import.js';
export * from './types.js';
export * from './transport.js';
const id=(connection:string,kind:string,external:string)=>createHash('sha256').update(`${connection}\0${kind}\0${external}`).digest('hex').slice(0,40);
export async function runSync(ctx:RequestContext,connection:ConnectionEntity,store:TenantStore,secretReader:SecretReader,options:SyncOptions={}):Promise<SyncSummary>{
 if(connection.organizationId!==ctx.organizationId||connection.data.status==='revoked')throw new DomainError('NOT_FOUND','Conexión no disponible.',404);
 const connector=getConnector(String(connection.data.provider));if(!connector.manifest.capabilities.read)throw new DomainError('CONNECTOR_UNAVAILABLE',connector.manifest.limitation,409);
 const secret=await secretReader(connection.id);const kinds=Array.isArray(connection.data.entities)?connection.data.entities as EntityKind[]:connector.manifest.entities;
 const summary:SyncSummary={status:'active',created:0,updated:0,deleted:0,unchanged:0,pages:0,records:0,warnings:[]};
 for(const kind of kinds){if(!connector.manifest.entities.includes(kind))throw new DomainError('CONNECTOR_ENTITY_DENIED','La entidad no está incluida en el conector.',403);
  let cursor:string|undefined;const cursorId=id(connection.id,'cursor',kind);const prior=await store.get('cursors',cursorId);if(prior?.data.completed!==true&&typeof prior?.data.cursor==='string')cursor=prior.data.cursor;
  for(let page=0;page<(options.maxPages??200);page++){
   const response=await connector.syncPage({organizationId:ctx.organizationId,connectionId:connection.id,secret,...options},{entityKind:kind,cursor,limit:100});
   const commit=async(s:TenantStore)=>{for(const record of response.records){const recordId=id(connection.id,kind,record.externalId),existing=await s.get(kind,recordId);if(record.deleted){if(existing&&!(existing.data.source as {deleted?:boolean})?.deleted){await s.update(kind,recordId,{source:{...(existing.data.source as object),deleted:true,tombstonedAt:new Date().toISOString()}});summary.deleted++;}continue;}
     const data={...record.data};for(const ref of record.references??[])data[ref.field]=id(connection.id,ref.kind,ref.externalId);
     const clean=normalizeImportData(kind,data);const normalized={...clean,source:{provider:connector.manifest.id,connectionId:connection.id,externalId:record.externalId,sourceUpdatedAt:record.updatedAt??null,observedAt:new Date().toISOString(),schemaVersion:connector.manifest.version}};
     if(existing){if(equivalent(existing.data,normalized))summary.unchanged++;else{await s.update(kind,recordId,normalized,existing.version);summary.updated++;}}else{await s.create(kind,normalized,{id:recordId,departmentId:kind==='invoices'||kind==='payments'?'finance':kind==='employees'||kind==='teams'?'people':'sales'});summary.created++;}}
    const saved=await s.get('cursors',cursorId);const state={connectionId:connection.id,entityKind:kind,cursor:response.nextCursor??null,completed:!response.hasMore,lastCommitAt:new Date().toISOString()};if(saved)await s.update('cursors',cursorId,state);else await s.create('cursors',state,{id:cursorId});};
   if(options.pageTransaction)await options.pageTransaction(commit);else await commit(store);summary.pages++;summary.records+=response.records.length;summary.warnings.push(...response.warnings);
   if(!response.hasMore)break;if(!response.nextCursor||response.nextCursor===cursor)throw new DomainError('CONNECTOR_CURSOR','El proveedor no avanzó la paginación.',502);cursor=response.nextCursor;if(page===(options.maxPages??200)-1)throw new DomainError('CONNECTOR_PAGE_LIMIT','La sincronización alcanzó su límite; puede reanudarse.',409);
  }
 }
 return {...summary,status:summary.warnings.length?'degraded':'active'};
}

function equivalent(a:Record<string,unknown>,b:Record<string,unknown>){const project=(v:Record<string,unknown>)=>({...v,source:Object.fromEntries(Object.entries((v.source||{}) as object).filter(([k])=>k!=='observedAt'))});return canonical(project(a))===canonical(project(b));}
function canonical(v:unknown):string{return JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical((v as Record<string,unknown>)[k]))])):v)??'null';}
