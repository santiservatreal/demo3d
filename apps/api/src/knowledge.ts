import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DomainError,safeId } from '@birdview/contracts';
import { body,ctx,withStore } from './runtime.js';
const normalized=(s:unknown)=>String(s).normalize('NFKD').replace(/\p{M}/gu,'').trim().toLowerCase();
export async function knowledgeRoutes(app:FastifyInstance){
 app.post('/api/v1/knowledge',async req=>{
  const v=body(req,z.object({title:z.string().min(1).max(160),content:z.string().min(1).max(12000),type:z.enum(['confirmed_rule','user_statement','pending_inference']).default('user_statement'),departmentId:safeId.optional(),validUntil:z.string().optional()}).strict());
  if(v.validUntil&&!Number.isFinite(Date.parse(v.validUntil)))throw new DomainError('VALIDATION','Fecha de vigencia no válida.');
  return withStore(req,async s=>{
   const existing=(await s.list('knowledge_items',{limit:1000,search:v.title})).find(r=>normalized(r.data.title)===normalized(v.title)&&r.data.status==='active');
   if(existing?.data.content===v.content)return existing;
   const row=await s.create('knowledge_items',{...v,status:existing?'conflict_pending':'active',authorId:ctx(req).userId,source:'user',validUntil:v.validUntil||null,...(existing?{conflictsWith:existing.id,conflictingVersion:existing.version}:{})},{departmentId:v.departmentId??(ctx(req).departmentIds.includes('*')?'sales':ctx(req).departmentIds[0])});
   await s.create('knowledge_versions',{knowledgeItemId:row.id,...row.data,version:1,authorId:ctx(req).userId},{departmentId:row.departmentId});
   if(existing)await s.create('knowledge_conflicts',{knowledgeItemId:row.id,conflictsWith:existing.id,sourceVersion:existing.version,status:'pending',reason:'same_title_different_content'},{departmentId:row.departmentId});
   return row;
  });
 });
 app.patch('/api/v1/knowledge/:id',async req=>{
  const id=safeId.parse((req.params as{id:string}).id),patch=body(req,z.object({title:z.string().min(1).max(160).optional(),content:z.string().max(12000).optional(),status:z.enum(['active','archived','forgotten']).optional()}).strict());
  return withStore(req,async s=>{
   const row=await s.get('knowledge_items',id);if(!row)throw new DomainError('NOT_FOUND','Conocimiento no disponible.',404);
   if(patch.status==='forgotten')return s.forgetKnowledge(id);
   if(row.data.type==='source_fact')throw new DomainError('SOURCE_READONLY','Los hechos de origen se corrigen en su fuente.',409);
   if(row.data.status==='forgotten')throw new DomainError('KNOWLEDGE_FORGOTTEN','El contenido olvidado no se puede reactivar.',409);
   if(row.data.status==='conflict_pending'&&patch.status==='active')throw new DomainError('CONFIRMATION_REQUIRED','Revisa y confirma el conflicto antes de activar esta regla.',409);
   await s.create('knowledge_versions',{knowledgeItemId:id,...row.data,...patch,version:row.version+1,authorId:ctx(req).userId},{departmentId:row.departmentId});
   return s.update('knowledge_items',id,patch,row.version);
  });
 });
 app.post('/api/v1/knowledge/:id/confirm',async req=>{
  if(!['owner','manager'].includes(ctx(req).role))throw new DomainError('FORBIDDEN','La propiedad o un responsable debe confirmar la regla.',403);
  body(req,z.object({confirm:z.literal(true)}).strict());
  return withStore(req,async s=>{
   const row=await s.get('knowledge_items',safeId.parse((req.params as{id:string}).id));if(!row||row.data.status==='forgotten')throw new DomainError('NOT_FOUND','Conocimiento no disponible.',404);
   if(row.data.type==='confirmed_rule'&&row.data.status==='active')return row;
   if(typeof row.data.conflictsWith==='string'){
    const prior=await s.get('knowledge_items',row.data.conflictsWith);if(!prior)throw new DomainError('SOURCE_CHANGED','La regla original ya no está disponible; revisa una nueva propuesta.',409);
    if(prior.data.type==='source_fact')throw new DomainError('SOURCE_FACT_CONFLICT','Un hecho de origen requiere corregir o revisar su fuente, no sobrescribirla con una declaración.',409);
    if(prior.version!==row.data.conflictingVersion)throw new DomainError('VERSION_CONFLICT','La regla original ha cambiado. Revisa una nueva versión.',409);
    await s.update('knowledge_items',prior.id,{status:'archived'},prior.version);
    for(const conflict of(await s.list('knowledge_conflicts',{limit:1000})).filter(r=>r.data.knowledgeItemId===row.id))await s.update('knowledge_conflicts',conflict.id,{status:'resolved',resolvedBy:ctx(req).userId});
   }
   const patch={type:'confirmed_rule',status:'active',confirmedBy:ctx(req).userId,confirmedAt:new Date().toISOString()};
   await s.create('knowledge_versions',{knowledgeItemId:row.id,...row.data,...patch,version:row.version+1},{departmentId:row.departmentId});
   return s.update('knowledge_items',row.id,patch,row.version);
  });
 });
}
