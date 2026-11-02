import { ZodError } from 'zod';
import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DomainError,entityKinds,type DataPort,type Entity,type EntityKind,type EntityMeta,type ListOptions,type RequestContext,type TenantStore } from '@birdview/contracts';
import { assertDepartment,assertPermission,assertResource,hasPermission,privateKinds } from '@birdview/authz';
import { getDirectoryPool,resolveJobPrincipal } from './directory.js';
export * from './directory.js';
export * from './vault.js';
export * from './budget.js';
export * from './maintenance.js';
export { migrate } from './migrate.js';
export * as schema from './schema.js';
const kinds=new Set<string>(entityKinds);
export function dbError(error:unknown):never {if(error instanceof DomainError||error instanceof ZodError)throw error;const code=(error as {code?:string})?.code;if(code==='23503')throw new DomainError('INVALID_REFERENCE','La referencia no está disponible.',400);if(code==='23505')throw new DomainError('CONFLICT','Ya existe un registro con ese identificador.',409);if(code==='23514'||code==='22P02')throw new DomainError('VALIDATION','Los datos no cumplen el esquema.',400);if(code==='42501')throw new DomainError('FORBIDDEN','La operación no está permitida.',403);throw new DomainError('DATABASE_ERROR','No se pudo completar la operación de datos.',503);}
export async function setTenantContext(client:PoolClient,ctx:RequestContext){await client.query("SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true),set_config('app.authorization_version',$3,true),set_config('app.principal_type',$4,true),set_config('app.all_departments',$5,true),set_config('app.department_ids',$6,true),set_config('app.allow_restricted',$7,true)",[ctx.organizationId,ctx.userId,String(ctx.authorizationVersion),ctx.principalType,String(ctx.departmentIds.includes('*')),ctx.departmentIds.filter(d=>d!=='*').join(','),String(hasPermission(ctx,'read:restricted'))]);}
function table(kind:EntityKind):string {if(!kinds.has(kind))throw new DomainError('VALIDATION','Recurso desconocido.');return `public.${kind}`;}
function entity<T extends Record<string,unknown>>(kind:EntityKind,row:Record<string,unknown>):Entity<T>{return {id:String(row.id),organizationId:String(row.organization_id),kind,departmentId:row.department_id as string|null,ownerId:row.owner_id as string|null,classification:row.classification as 'internal'|'restricted',data:row.data as T,version:Number(row.version),createdAt:(row.created_at as Date).toISOString(),updatedAt:(row.updated_at as Date).toISOString()};}
const auditKeys=new Set(['requestId','entityKind','recordCount','status','rule','classification','count','permission','reasonCode','version','jobId','durationMs','provider','model','bytes']);
function safeAudit(metadata:Record<string,string|number|boolean|null>={}){return Object.fromEntries(Object.entries(metadata).filter(([k,v])=>auditKeys.has(k)&&(v===null||typeof v==='number'||typeof v==='boolean'||typeof v==='string'&&v.length<=128&&/^[a-zA-Z0-9_.:-]*$/.test(v))));}
function safeLabel(value:string){return /^[a-zA-Z0-9_.:-]{1,120}$/.test(value)?value:'redacted';}
class PgTenantStore implements TenantStore {
 constructor(private client:PoolClient,private ctx:RequestContext){}
 async audit(action:string,resource:string,resourceId:string|null,outcome:string,metadata:Record<string,string|number|boolean|null>={}){await this.client.query('INSERT INTO public.audit_events(organization_id,id,actor_id,action,resource,resource_id,outcome,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[this.ctx.organizationId,randomUUID(),this.ctx.userId,safeLabel(action),safeLabel(resource),resourceId?safeLabel(resourceId):null,safeLabel(outcome),JSON.stringify(safeAudit(metadata))]);}
 async list<T extends Record<string,unknown>=Record<string,unknown>>(kind:EntityKind,options:ListOptions={}):Promise<Entity<T>[]>{
  assertResource(this.ctx,'read',kind);if(options.departmentId)assertDepartment(this.ctx,options.departmentId);
  const limit=Math.max(1,Math.min(1000,Math.trunc(options.limit??200)));const offset=Math.max(0,Math.min(1000000,Math.trunc(options.offset??0)));
  const values:unknown[]=[this.ctx.organizationId];const clauses=['organization_id=$1'];
  if(options.departmentId){values.push(options.departmentId);clauses.push(`department_id=$${values.length}`);}
  if(options.ownerId){values.push(options.ownerId);clauses.push(`owner_id=$${values.length}`);}
  if(options.search){values.push('%'+options.search.slice(0,120).replace(/[%_\\]/g,'\\$&')+'%');clauses.push(`(data->>'name' ILIKE $${values.length} OR data->>'title' ILIKE $${values.length} OR data->>'subject' ILIKE $${values.length})`);}
  values.push(limit,offset);const result=await this.client.query(`SELECT * FROM ${table(kind)} WHERE ${clauses.join(' AND ')} ORDER BY created_at ${options.newestFirst?'DESC':'ASC'},id ${options.newestFirst?'DESC':'ASC'} LIMIT $${values.length-1} OFFSET $${values.length}`,values);
  await this.audit('read.list',kind,null,'allowed',{recordCount:result.rowCount??0});return result.rows.map(row=>entity<T>(kind,row));
 }
 async get<T extends Record<string,unknown>=Record<string,unknown>>(kind:EntityKind,id:string):Promise<Entity<T>|null>{assertResource(this.ctx,'read',kind);const result=await this.client.query(`SELECT * FROM ${table(kind)} WHERE organization_id=$1 AND id=$2`,[this.ctx.organizationId,id]);if(result.rows[0])await this.audit('read.detail',kind,id,'allowed');return result.rows[0]?entity<T>(kind,result.rows[0]):null;}
 async create<T extends Record<string,unknown>=Record<string,unknown>>(kind:EntityKind,data:T,meta:EntityMeta={}):Promise<Entity<T>>{
  assertResource(this.ctx,'write',kind);const departmentId=meta.departmentId??null;assertDepartment(this.ctx,departmentId);if(meta.classification==='restricted')assertPermission(this.ctx,'write:restricted');
  const ownerId=privateKinds.has(kind)?this.ctx.userId:(meta.ownerId??this.ctx.userId);const safeData=privateKinds.has(kind)?{...data,authorizationVersion:this.ctx.authorizationVersion}:data;
  const result=await this.client.query(`INSERT INTO ${table(kind)}(organization_id,id,department_id,owner_id,classification,data) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[this.ctx.organizationId,meta.id??randomUUID(),departmentId,ownerId,meta.classification??'internal',JSON.stringify(safeData)]);
  if(kind==='api_keys')await this.syncApiPrincipal(result.rows[0]);await this.audit('write.create',kind,String(result.rows[0].id),'allowed');return entity<T>(kind,result.rows[0]);
 }
 async update<T extends Record<string,unknown>=Record<string,unknown>>(kind:EntityKind,id:string,patch:Partial<T>,expectedVersion?:number):Promise<Entity<T>>{
  assertResource(this.ctx,'write',kind);const previous=await this.client.query(`SELECT * FROM ${table(kind)} WHERE organization_id=$1 AND id=$2 FOR UPDATE`,[this.ctx.organizationId,id]);const row=previous.rows[0];if(!row)throw new DomainError('NOT_FOUND','El registro no está disponible.',404);if(expectedVersion!==undefined&&Number(row.version)!==expectedVersion)throw new DomainError('VERSION_CONFLICT','El registro ha cambiado; revisa la versión actual.',409);
  const data={...row.data,...patch,...(privateKinds.has(kind)?{authorizationVersion:this.ctx.authorizationVersion}:{})};const result=await this.client.query(`UPDATE ${table(kind)} SET data=$3,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2 RETURNING *`,[this.ctx.organizationId,id,JSON.stringify(data)]);if(kind==='api_keys')await this.syncApiPrincipal(result.rows[0]);await this.audit('write.update',kind,id,'allowed',{version:Number(result.rows[0].version)});return entity<T>(kind,result.rows[0]);
 }
 async forgetKnowledge(id:string):Promise<Entity>{assertResource(this.ctx,'write','knowledge_items');assertResource(this.ctx,'write','knowledge_versions');const prior=await this.client.query('SELECT * FROM public.knowledge_items WHERE organization_id=$1 AND id=$2 FOR UPDATE',[this.ctx.organizationId,id]);if(!prior.rows[0])throw new DomainError('NOT_FOUND','Conocimiento no disponible.',404);await this.client.query('DELETE FROM public.knowledge_versions WHERE organization_id=$1 AND knowledge_item_ref=$2',[this.ctx.organizationId,id]);await this.client.query("DELETE FROM public.knowledge_sources WHERE organization_id=$1 AND data->>'knowledgeItemId'=$2",[this.ctx.organizationId,id]);return this.update('knowledge_items',id,{title:'Contenido olvidado',content:'',status:'forgotten',excludedFromSync:true},Number(prior.rows[0].version));}
 async remove(kind:EntityKind,id:string):Promise<void>{assertResource(this.ctx,'write',kind);const result=await this.client.query(`DELETE FROM ${table(kind)} WHERE organization_id=$1 AND id=$2 RETURNING id`,[this.ctx.organizationId,id]);if(!result.rowCount)throw new DomainError('NOT_FOUND','El registro no está disponible.',404);if(kind==='api_keys')await this.client.query('SELECT birdview_private.sync_api_principal($1)',[id]);await this.audit('write.delete',kind,id,'allowed');}
 private async syncApiPrincipal(row:Record<string,unknown>){await this.client.query('SELECT birdview_private.sync_api_principal($1)',[row.id]);}
}
export class PgDataPort implements DataPort {
 private roleCheck?:Promise<void>;
 readonly pool:Pool;readonly drizzle:ReturnType<typeof drizzle>;
 constructor(options:{connectionString?:string;max?:number}={}){const connectionString=options.connectionString??process.env.DATABASE_URL;if(!connectionString)throw new DomainError('CONFIGURATION','Falta DATABASE_URL.',503);this.pool=new Pool({connectionString,max:options.max??10});this.drizzle=drizzle(this.pool);}
 async assertRuntimeRole(){return this.roleCheck??=this.pool.query("SELECT r.rolsuper,r.rolbypassrls,EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND c.relname IN('accounts','invoices') AND c.relowner=r.oid) AS owns_business FROM pg_roles r WHERE r.rolname=current_user").then(result=>{const r=result.rows[0];if(!r||r.rolsuper||r.rolbypassrls||r.owns_business)throw new DomainError('UNSAFE_DATABASE_ROLE','El servidor requiere un rol de ejecución sin privilegios de migración.',503);});}
 async withTenant<T>(ctx:RequestContext,work:(store:TenantStore)=>Promise<T>):Promise<T>{
  await this.assertRuntimeRole();const fresh=await resolveJobPrincipal(ctx);if(fresh.organizationId!==ctx.organizationId||fresh.authorizationVersion!==ctx.authorizationVersion)throw new DomainError('AUTHORIZATION_CHANGED','El acceso ha cambiado.',403);
  const effective={...fresh,permissions:fresh.permissions.filter(p=>ctx.permissions.includes('*')||ctx.permissions.includes(p)),departmentIds:fresh.departmentIds.includes('*')?ctx.departmentIds:ctx.departmentIds.includes('*')?fresh.departmentIds:fresh.departmentIds.filter(d=>ctx.departmentIds.includes(d))};
  if(fresh.permissions.includes('*'))effective.permissions=ctx.permissions;
  const client=await this.pool.connect();try{await client.query('BEGIN');await setTenantContext(client,effective);const value=await work(new PgTenantStore(client,effective));await client.query('COMMIT');return value;}catch(error){await client.query('ROLLBACK');return dbError(error);}finally{client.release();}
 }
 async close(){await this.pool.end();}
}
export function createDataPort(options:{connectionString?:string;max?:number}={}){return new PgDataPort(options);}

export async function runtimeAIConfiguration(ctx:RequestContext){const port=createDataPort({max:2});try{return await port.withTenant(ctx,async()=>{const c=await port.pool.connect();try{await c.query('BEGIN');await setTenantContext(c,ctx);const r=await c.query('SELECT birdview_private.runtime_ai_configuration() AS config');await c.query('COMMIT');return r.rows[0].config as {provider:{id:string;data:Record<string,unknown>}|null;privacy:{smallGroupThreshold:number}|null};}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}});}finally{await port.close();}}
