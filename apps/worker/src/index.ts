import { Worker, type Job } from 'bullmq';
import { writeFile,unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDataPort,resolveJobPrincipal,listScheduledPrincipals,createVaultStorage,closeDirectoryPool,closeVaultPool,closeBudgetPool,expireRetainedData,acknowledgeObject } from '@birdview/db';
import { DomainError,type EntityKind } from '@birdview/contracts';
import { hasPermission } from '@birdview/authz';
import { queueName,redisConnection,enqueue,closeQueues,jobPayloadSchema,type JobPayload } from '@birdview/jobs';
import { dueOccurrences,routineRunId,type ScheduleConfig } from '../../../packages/jobs/src/schedule.js';
import { LocalArtifactStore,S3ArtifactStore } from '@birdview/reporting';
import { runSync } from '@birdview/connectors';
import { openSecret } from '../../api/src/credentials.js';
import { processOrganizationExport } from './organization-export.js';
import { processChat } from './chat.js';
import { processReport,processStudio,processRoutine,type ProcessorDependencies } from './processors.js';
export async function startWorker(){
 const port=createDataPort();
 const processSync=async(job:Job<JobPayload>,deps:ProcessorDependencies)=>{
  const c=deps.context;const run=await port.withTenant(c,s=>s.get('sync_runs',job.data.entityId));if(!run)throw new DomainError('NOT_FOUND','Sincronización no disponible.',404);if(run.data.status==='ready')return;
  try{
   const connection=await port.withTenant(c,s=>s.get('connections',String(run.data.connectionId)));if(!connection||!connection.data.policyApproved||connection.data.status==='revoked')throw new DomainError('POLICY_REQUIRED','La conexión no está autorizada.',403);
   await port.withTenant(c,s=>s.update('sync_runs',run.id,{status:'running'}));
   // Each committed page is a separate RLS transaction. The outer store performs only scoped cursor reads.
   const result=await port.withTenant(c,s=>runSync(c,connection,s,async id=>{const rows=await port.withTenant(c,s=>s.list('encrypted_credentials',{limit:100}));const secret=rows.find(r=>r.data.connectionId===id);if(!secret)throw new DomainError('CREDENTIAL_REQUIRED','No hay una credencial disponible.',409);return JSON.parse(openSecret(String(secret.data.encrypted),`${c.organizationId}:${id}`));},{pageTransaction:async work=>port.withTenant(await deps.assertCurrent(),work)}));
   await port.withTenant(await deps.assertCurrent(),async s=>{await s.update('sync_runs',run.id,{status:'ready',summary:result,completedAt:new Date().toISOString()});await s.update('connections',connection.id,{status:result.status,lastSyncAt:new Date().toISOString(),summary:result});});
  }catch(e){await port.withTenant(c,s=>s.update('sync_runs',run.id,{status:'failed',errorCode:e instanceof DomainError?e.code:'SYNC_FAILED'})).catch(()=>{});throw e;}
 };
 const worker=new Worker<JobPayload>(queueName,async job=>{
  const payload=jobPayloadSchema.parse(job.data),context=await resolveJobPrincipal(payload);
  const deps={dataPort:port,context,assertCurrent:()=>resolveJobPrincipal(payload)};
  if(job.name==='chat')return processChat(job,deps);if(job.name==='report'){const run=await port.withTenant(context,s=>s.get('report_runs',payload.entityId));return run?.data.template==='data_export'?processOrganizationExport(job,deps):processReport(job,deps);}if(job.name==='studio')return processStudio(job,deps);if(job.name==='routine')return processRoutine(job,deps);if(job.name==='sync')return processSync(job,deps);
  throw new DomainError('UNKNOWN_JOB','Trabajo no disponible.',400);
 },{connection:redisConnection(),concurrency:3,lockDuration:60000,stalledInterval:30000});
 worker.on('failed',(job,error)=>console.warn(JSON.stringify({event:'job.failed',jobId:job?.id,kind:job?.name,code:error instanceof DomainError?error.code:'WORKER_ERROR'})));
 worker.on('error',()=>console.warn(JSON.stringify({event:'worker.connection_error'})));
 let ticking=false;
 const tick=async()=>{if(ticking)return;ticking=true;try{
  const contexts=await listScheduledPrincipals();
  for(const ctx of contexts){
   await port.withTenant(ctx,async s=>{
    for(const [kind,jobKind] of [['query_executions','chat'],['report_runs','report'],['media_jobs','studio'],['sync_runs','sync'],['routine_runs','routine']] as const){if(!hasPermission(ctx,`read:${kind}`))continue;for(const row of await s.list(kind,{ownerId:ctx.userId,limit:1000}))if(row.data.status==='queued')await enqueue(jobKind,{organizationId:ctx.organizationId,userId:ctx.userId,entityId:row.id,authorizationVersion:ctx.authorizationVersion,principalType:'user'});}
    if(hasPermission(ctx,'read:routines'))for(const routine of await s.list('routines',{ownerId:ctx.userId,limit:1000})){
     if(routine.data.status!=='active')continue;const config={schedule:routine.data.schedule,timezone:routine.data.timezone} as ScheduleConfig;
     for(const occurrence of dueOccurrences(config,new Date(),routine.data.lastCheckedAt?new Date(String(routine.data.lastCheckedAt)):undefined)){
      const id=routineRunId(ctx.organizationId,routine.id,occurrence.occurrenceKey);if(!await s.get('routine_runs',id))await s.create('routine_runs',{routineId:routine.id,status:'queued',...occurrence},{id});
      await enqueue('routine',{organizationId:ctx.organizationId,userId:ctx.userId,entityId:id,authorizationVersion:ctx.authorizationVersion});
     }
     await s.update('routines',routine.id,{lastCheckedAt:new Date().toISOString()});
    }
   }).catch(()=>{});
  }
  await createVaultStorage().purgeExpired(new Date());for(const object of await expireRetainedData()){const storage=object.backend==='s3'?new S3ArtifactStore():new LocalArtifactStore();await storage.remove(object.organization_id,object.storage_key);await acknowledgeObject(object.organization_id,object.storage_key);}
  await writeFile(process.env.WORKER_HEARTBEAT_FILE||'.local/worker-heartbeat',new Date().toISOString(),{mode:0o600});
 }catch{console.warn(JSON.stringify({event:'scheduler.tick_failed'}));}finally{ticking=false;}};
 const timer=setInterval(()=>void tick(),30000);timer.unref();await tick();
 return {worker,close:async(options:{closeShared?:boolean}={})=>{clearInterval(timer);await worker.close();await closeQueues();await port.close();if(options.closeShared!==false){await closeDirectoryPool();await closeVaultPool();await closeBudgetPool();}await unlink(process.env.WORKER_HEARTBEAT_FILE||'.local/worker-heartbeat').catch(()=>{});}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const runtime=await startWorker();console.log('Bird View worker ready.');for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void runtime.close().then(()=>process.exit(0)));}
