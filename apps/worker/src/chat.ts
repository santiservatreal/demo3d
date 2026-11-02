import { createHash } from 'node:crypto';
import type { Job } from 'bullmq';
import { answerSchema, DomainError, type Answer, type EntityKind, type QueryFilters,type QueryIntent,type AnswerBlock } from '@birdview/contracts';
import { analyze, detectIntent } from '@birdview/analytics';
import { hasPermission } from '@birdview/authz';
import { getOrganization, createVaultStorage, createBudgetStore,runtimeAIConfiguration } from '@birdview/db';
import { ScopedIdentityVault, PrivacyEngine, type PrivacyEntity } from '@birdview/privacy';
import { PrivacyGateway, OpenAIHTTPProvider, SelfHostedHTTPProvider, type ProviderConfig } from '@birdview/ai';
import { enqueue, isCancelled, type JobPayload } from '@birdview/jobs';
import { openSecret } from '../../api/src/credentials.js';
import type { ProcessorDependencies } from './processors.js';
const stable=(kind:string,id:string)=>`${kind}-${createHash('sha256').update(id).digest('hex').slice(0,48)}`;
export async function processChat(job:Job<JobPayload>,deps:ProcessorDependencies){
 const {context:ctx,dataPort}=deps;
 const check=async()=>{await deps.assertCurrent();if(await isCancelled(String(job.id)))throw new DomainError('JOB_CANCELLED','Consulta cancelada.',409);};
 try{
  await check();
  const query=await dataPort.withTenant(ctx,async s=>{const q=await s.get('query_executions',job.data.entityId);if(!q)throw new DomainError('NOT_FOUND','Consulta no disponible.',404);if(['ready','cancelled'].includes(String(q.data.status)))return null;await s.update('query_executions',q.id,{status:'consulting',startedAt:new Date().toISOString()});return q;});
  if(!query)return;
  await job.updateProgress({phase:'consulting',percent:20});
  const organization=await getOrganization(ctx.organizationId);if(!organization)throw new DomainError('NOT_FOUND','Organización no disponible.',404);
  const question=String(query.data.content),detected=detectIntent(question);
  const selection=await dataPort.withTenant(ctx,async s=>{
   const id=query.data.contextEntityId;if(typeof id!=='string')return undefined;
   const intents:Partial<Record<EntityKind,QueryIntent>>={accounts:'account',opportunities:'account',invoices:'receivables',teams:'team',employees:'team',tickets:'tickets',products:'inventory',orders:'orders'};
   for(const [kind,intent]of Object.entries(intents))if(hasPermission(ctx,`read:${kind}`)){
    const row=await s.get(kind as EntityKind,id);if(!row)continue;
    const accountId=kind==='accounts'?id:typeof row.data.accountId==='string'?row.data.accountId:undefined;
    const fields=['name','number','subject','status','sku','stock','minimumStock','quantity','totalMinor','paidMinor','creditMinor','valueMinor','currency','dueDate','expectedDate'].filter(key=>row.data[key]!==undefined);
    const detail:AnswerBlock={type:'table',title:'Elemento seleccionado',columns:[{key:'field',label:'Campo'},{key:'value',label:'Valor registrado'}],rows:fields.map(key=>({field:key,value:typeof row.data[key]==='number'&&key.endsWith('Minor')?new Intl.NumberFormat('es-ES',{style:'currency',currency:String(row.data.currency||organization.currency)}).format(Number(row.data[key])/100):String(row.data[key])}))};
    return{accountId,intent:intent as QueryIntent,row,fields,detail};
   }
   throw new DomainError('NOT_FOUND','El elemento seleccionado no está disponible.',404);
  });
  const accountId=selection?.accountId;
  const analysis=await dataPort.withTenant(ctx,s=>analyze(s,ctx,{question,filters:query.data.filters as QueryFilters,...(accountId?{accountId}:{}),...(selection?{intent:selection.intent}:{}),organization}));
  if(selection){const e={id:`${selection.row.kind}/${selection.row.id}`,provider:String((selection.row.data.source as Record<string,unknown>)?.provider||'local'),entityKind:selection.row.kind,entityId:selection.row.id,fields:selection.fields,observedAt:selection.row.updatedAt,label:'Elemento seleccionado'};if(!analysis.evidence.some(row=>row.id===e.id))analysis.evidence.push(e);analysis.blocks.push(selection.detail,{type:'warning',text:accountId?'Los indicadores están acotados a la cuenta del elemento seleccionado.':'Los indicadores resumen la zona autorizada; la tabla muestra el elemento seleccionado.'},{type:'sourceList',sources:[{id:e.id,label:e.label,provider:e.provider,observedAt:e.observedAt}]});}
  let blocks=analysis.blocks,mode:Answer['mode']='demo',privacyDecisionId=stable('local',query.id);
  if(!organization.demo){
   const service=await runtimeAIConfiguration(ctx);const selected=service.provider;
   if(selected){
    const entities:PrivacyEntity[]=[];
    for(const kind of ['accounts','employees'] as const)if(hasPermission(ctx,`read:${kind}`))for(const row of await dataPort.withTenant(ctx,s=>s.list(kind,{limit:1000})))entities.push({id:row.id,kind,type:kind==='accounts'?'ORG':'PERSON',displayName:String(row.data.name||''),aliases:Array.isArray(row.data.aliases)?row.data.aliases as string[]:[]});
    const relevant=entities.filter(e=>question.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().includes(e.displayName.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()));
    const vault=new ScopedIdentityVault({storage:createVaultStorage(),keys:process.env.VAULT_KEYS_JSON?JSON.parse(process.env.VAULT_KEYS_JSON):{v1:process.env.VAULT_ENCRYPTION_KEY!},activeKeyVersion:process.env.VAULT_KEY_VERSION||'v1',lookupKey:process.env.VAULT_LOOKUP_KEY!});
    const privacy=new PrivacyEngine({vault,policy:{minimumGroupSize:Number(service.privacy?.smallGroupThreshold||5)},authorizeEntity:async(current,e)=>Boolean(await dataPort.withTenant(current,s=>s.get(e.kind as EntityKind,e.id)))});
    const prepared=await privacy.prepare({ctx,scopeId:String(query.data.conversationId),intent:analysis.intent,verified:analysis,question,entities:relevant,groupSize:accountId?1:new Set(analysis.evidence.filter(e=>['accounts','employees','products'].includes(e.entityKind)).map(e=>e.id)).size,parameters:{currency:organization.currency}});
    const c=selected.data;
    const config={...c,id:selected.id,kind:c.provider==='self_hosted'?'self_hosted':'external',apiKey:typeof c.encrypted==='string'?openSecret(c.encrypted,`${ctx.organizationId}:${selected.id}`):undefined} as unknown as ProviderConfig;
    const provider=c.provider==='self_hosted'?new SelfHostedHTTPProvider(config):new OpenAIHTTPProvider(config);
    const gateway=new PrivacyGateway({privacy,budget:createBudgetStore(),approvedEndpoints:(process.env.AI_ALLOWED_ENDPOINTS||'').split(',').filter(Boolean).map(url=>({url})),policy:{allowExternal:true,allowedRegions:[config.review.region],maxRetentionDays:config.review.retentionDays,monthlyLimitMinor:0,currency:config.pricing.currency,maxAttempts:1}});
    const generated=await gateway.generate({ctx,prepared,verified:analysis,provider});blocks=generated.blocks;mode=generated.mode;privacyDecisionId=generated.privacyDecisionId;
   }else blocks=[...blocks,{type:'warning',text:'Resultado calculado localmente mediante consultas guiadas. No hay un proveedor de IA revisado y activo; no se ha realizado ninguna llamada externa.'}];
  }
  await check();
  const reportId=detected.intent==='report'?stable('report',query.id):null;
  await dataPort.withTenant(ctx,async s=>{
   const latest=await s.get('query_executions',query.id);if(!latest||latest.data.status==='cancelled')throw new DomainError('JOB_CANCELLED','Consulta cancelada.',409);
   if(detected.intent==='task'){
    const due=new Date();if(/mes/i.test(question))due.setMonth(due.getMonth()+1);else due.setDate(due.getDate()+(/semana/i.test(question)?7:1));
    const taskId=stable('task',query.id);if(!await s.get('tasks',taskId))await s.create('tasks',{title:question.slice(0,160),description:'Seguimiento solicitado desde el chat. No se enviarán mensajes externos.',status:'pending',dueAt:due.toISOString(),conversationId:query.data.conversationId},{id:taskId});
    blocks=[{type:'text',text:`He guardado el seguimiento para ${due.toLocaleDateString('es-ES')}. Puedes consultarlo en Tareas.`,verification:'verified'}];
   }
   if(reportId){if(!hasPermission(ctx,'export:reports'))throw new DomainError('FORBIDDEN','No puedes exportar informes.',403);if(!await s.get('report_runs',reportId))await s.create('report_runs',{template:'executive',format:/csv/i.test(question)?'csv':/html/i.test(question)?'html':'pdf',status:'queued',filters:query.data.filters??{}},{id:reportId});blocks=[...blocks,{type:'reportLink',reportId,title:'Informe ejecutivo solicitado',status:'queued'}];}
   const answer=answerSchema.parse({id:stable('answer',query.id),mode,blocks,evidenceIds:analysis.evidence.map(e=>e.id),dataAsOf:analysis.dataAsOf,coverage:analysis.coverage,proposedActionIds:[],privacyDecisionId});
   await s.update('messages',String(query.data.messageId),{answer,status:'ready'});await s.update('query_executions',query.id,{status:'ready',completedAt:new Date().toISOString(),privacyDecisionId});await s.audit('chat.completed','query_executions',query.id,'succeeded',{count:analysis.evidence.length});
  });
  if(reportId)await enqueue('report',{...job.data,entityId:reportId});
  await job.updateProgress({phase:'ready',percent:100});
 }catch(error){const code=error instanceof DomainError?error.code:'QUERY_FAILED';await dataPort.withTenant(ctx,async s=>{const q=await s.get('query_executions',job.data.entityId);if(!q)return;const status=code==='JOB_CANCELLED'?'cancelled':'failed';await s.update('query_executions',q.id,{status,errorCode:code});await s.audit('privacy.query_blocked','query_executions',q.id,'denied',{reasonCode:code});if(q.data.messageId)await s.update('messages',String(q.data.messageId),{status,errorCode:code,content:error instanceof DomainError?error.message:'No se pudo completar la consulta. Puedes reintentar.'});}).catch(()=>{});throw error;}
}
