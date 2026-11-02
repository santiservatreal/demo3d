import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { answerSchema,dateFilterSchema } from '@birdview/contracts';
// Public documentation uses the same value restrictions as runtime Zod contracts.
const s=z.string().max(12000),id=z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),name=z.string().min(1).max(160),choice=(...v:[string,...string[]])=>z.enum(v);
const report=z.object({template:choice('executive','sales','receivables','operations','people'),format:choice('html','pdf','csv'),filters:dateFilterSchema.optional()}).strict();
const create:Record<string,z.ZodType>={
 '/auth/demo':z.object({role:choice('owner','admin','manager','analyst','reader').optional()}).strict(),
 '/organizations/select':z.object({organizationId:id}).strict(),'/organizations/export':z.object({confirmation:name}).strict(),'/organizations/delete':z.object({confirmation:name}).strict(),'/organizations/restore':z.object({organizationId:id}).strict(),
 '/onboarding':z.object({name,template:choice('services','commercial','industrial'),currency:z.string().length(3),timezone:s,modules:z.array(s).max(10),mode:choice('empty','demo').optional()}).strict(),
 '/conversations':z.object({title:name}).strict(),'/conversations/:id/messages':z.object({content:s.min(1),filters:dateFilterSchema.optional(),contextEntityId:id.optional()}).strict(),
 '/reports':report,'/public/reports':report.omit({filters:true}),
 '/tasks':z.object({title:name,description:s.optional(),dueAt:s.optional(),departmentId:id.optional()}).strict(),
 '/routines':z.object({title:name,schedule:choice('daily_briefing','weekly_report','receivables'),timezone:s.optional()}).strict(),
 '/knowledge':z.object({title:name,content:s,type:choice('confirmed_rule','user_statement','pending_inference').optional(),departmentId:id.optional(),validUntil:s.optional()}).strict(),
 '/presentations':z.object({title:name}).strict(),'/studio':z.object({title:name,kind:choice('chart','image','video'),prompt:s.optional()}).strict(),
 '/api-keys':z.object({name,queries:z.array(choice('receivables','payments','pipeline','win_rate','tickets','team','inventory','orders','executive')),expiresAt:s.optional()}).strict(),
 '/published-queries':z.object({name,intent:choice('receivables','payments','pipeline','win_rate','tickets','team','inventory','orders','executive'),parameters:dateFilterSchema.partial().optional()}).strict(),
 '/connections':z.object({name,provider:choice('hubspot','holded','factorial'),token:s,entities:z.array(s).optional()}).strict(),
 '/ai/providers':z.object({provider:choice('openai','self_hosted'),model:s,endpoint:s.optional(),apiKey:s.optional()}).strict(),
 '/ai/budget':z.object({limitMinor:z.number().int().nonnegative(),currency:z.literal('EUR')}).strict(),
 '/members':z.object({email:z.email(),role:choice('owner','admin','manager','analyst','reader'),departmentIds:z.array(id).optional()}).strict(),
 '/invitations/accept':z.object({token:s}).strict(),
};
export function installOpenApiContracts(app:FastifyInstance){
 app.addHook('onRoute',route=>{if(!route.url.startsWith('/api/v1/'))return;const path=route.url.slice(7),methods=Array.isArray(route.method)?route.method:[route.method];const known=methods.includes('POST')?create[path]:undefined;
  const params=[...route.url.matchAll(/:([A-Za-z]+)/g)].map(m=>m[1]);
  route.schema={...route.schema,tags:[path.split('/')[1]||'platform'],summary:path,security:[path.startsWith('/public/')?{apiKey:[]}:{session:[]}],...(params.length?{params:{type:'object',required:params,properties:Object.fromEntries(params.map(key=>[key,{type:'string',maxLength:240}]))}}:{}),...(known?{body:z.toJSONSchema(known,{target:'draft-7'})}:{}),response:{...(route.schema?.response as Record<string,unknown>||{}),'4xx':{description:'Error de validación o autorización. Sin contenido sensible.',type:'object',properties:{error:{type:'object',properties:{code:{type:'string'},message:{type:'string'},requestId:{type:'string'}}}}}}};
 });
 app.get('/api/v1/contracts/answer',async()=>z.toJSONSchema(answerSchema,{target:'draft-7'}));
}
