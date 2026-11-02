import { createHash } from 'node:crypto';
import type { Job } from 'bullmq';
import { DomainError, type DataPort, type Entity, type RequestContext, type QueryFilters } from '@birdview/contracts';
import { reportSnapshot, analyze, type ReportSnapshot } from '@birdview/analytics';
import { aggregateOnlySnapshot, createArtifactStore, renderReportHtml, renderReportCsv, renderPdf, renderPresentationHtml, renderChartSvg } from '@birdview/reporting';
import { isCancelled, enqueue, type JobPayload } from '@birdview/jobs';

export interface ProcessorDependencies { dataPort:DataPort; context:RequestContext; assertCurrent:() => Promise<RequestContext>; }
const formats = {html:{extension:'html',mime:'text/html; charset=utf-8'},pdf:{extension:'pdf',mime:'application/pdf'},csv:{extension:'csv',mime:'text/csv; charset=utf-8'}};
function artifactId(kind:string,id:string):string { return `artifact-${createHash('sha256').update(`${kind}\0${id}`).digest('hex').slice(0,48)}`; }
async function assertNotCancelled(job:Job<JobPayload>, entity:Entity):Promise<void> {
  if (entity.data.status === 'cancelled' || await isCancelled(String(job.id))) throw new DomainError('JOB_CANCELLED','El trabajo se ha cancelado.',409);
}
function filters(value:unknown):QueryFilters|undefined { return value && typeof value === 'object' ? value as QueryFilters : undefined; }
function expires():string { return new Date(Date.now()+90*86400_000).toISOString(); }
async function updateFailure(dataPort:DataPort,ctx:RequestContext,kind:'report_runs'|'media_jobs',id:string,error:unknown):Promise<void> {
  const code = error instanceof DomainError ? error.code : 'GENERATION_FAILED';
  await dataPort.withTenant(ctx,async store => {
    const record = await store.get(kind,id);
    if (record) await store.update(kind,id,{status:code === 'JOB_CANCELLED' ? 'cancelled' : 'failed',errorCode:code,error:'El trabajo no se completó. Revisa permisos y configuración antes de reintentar.',completedAt:new Date().toISOString()});
  }).catch(() => {});
}
export async function processReport(job:Job<JobPayload>,deps:ProcessorDependencies):Promise<void> {
  const {dataPort,context:ctx} = deps;
  const storage = createArtifactStore();
  let uploaded:{storageKey:string}|undefined;
  try {
    await job.updateProgress({phase:'validating',percent:5});
    const prepared = await dataPort.withTenant(ctx,async store => {
      const run = await store.get('report_runs',job.data.entityId);
      if (!run) throw new DomainError('NOT_FOUND','Informe no disponible.',404);
      await assertNotCancelled(job,run);
      if (run.data.status === 'ready' && typeof run.data.artifactId === 'string' && await store.get('artifacts',run.data.artifactId)) return null;
      const format = String(run.data.format || 'pdf') as keyof typeof formats;
      if (!(format in formats)) throw new DomainError('INVALID_FORMAT','Formato de informe no disponible.');
      const savedSnapshot = run.data.snapshot && typeof run.data.snapshot === 'object' ? run.data.snapshot as ReportSnapshot : null;
      const computed = savedSnapshot || await reportSnapshot(store,ctx,String(run.data.template || 'executive'),filters(run.data.filters));
      const snapshot = ctx.principalType === 'api_key' ? aggregateOnlySnapshot(computed) : computed;
      await store.update('report_runs',run.id,{status:'generating',progress:10,startedAt:new Date().toISOString(),snapshot});
      const presentation = typeof run.data.presentationId === 'string' ? await store.get('presentation_documents',run.data.presentationId) : null;
      if (run.data.presentationId && !presentation) throw new DomainError('NOT_FOUND','Presentación no disponible.',404);
      return {run,format,snapshot,presentation};
    });
    if (!prepared) return;
    await job.updateProgress({phase:'rendering',percent:35});
    const {run,format,snapshot,presentation} = prepared;
    let html = renderReportHtml(snapshot);
    if (presentation) {
      if (ctx.principalType === 'api_key') throw new DomainError('FORBIDDEN','Las presentaciones no están habilitadas para salida externa.',403);
      const slides = Array.isArray(presentation.data.slides) ? presentation.data.slides as {title:string;text:string;kind?:string}[] : [];
      html = renderPresentationHtml({title:String(presentation.data.title || 'Presentación'),slides});
    }
    const bytes = format === 'csv' ? renderReportCsv(snapshot) : format === 'html' ? Buffer.from(html,'utf8') : await renderPdf(html);
    const current = await deps.assertCurrent();
    if (current.authorizationVersion !== ctx.authorizationVersion) throw new DomainError('ACCESS_REVOKED','El acceso ha cambiado.',403);
    await assertNotCancelled(job,run);
    await job.updateProgress({phase:'storing',percent:85});
    const id = artifactId('report',run.id), details = formats[format];
    uploaded = await storage.put(ctx.organizationId,id,details.extension,bytes,details.mime);
    await dataPort.withTenant(current,async store => {
      const latest = await store.get('report_runs',run.id);
      if (!latest) throw new DomainError('NOT_FOUND','Informe no disponible.',404);
      await assertNotCancelled(job,latest);
      const data = {...uploaded,mimeType:details.mime,filename:`informe-${run.id.slice(0,12)}.${details.extension}`,expiresAt:expires(),authorizationVersion:current.authorizationVersion,requiredPermissions:[...new Set(snapshot.sources.map(source => `read:${source.entityKind}`))],departmentIds:[...current.departmentIds],reportRunId:run.id,privacyMode:ctx.principalType === 'api_key' ? 'aggregate' : 'internal',kind:presentation ? 'presentation' : 'report'};
      const existing = await store.get('artifacts',id);
      if (!existing) await store.create('artifacts',data,{id,ownerId:ctx.userId,departmentId:run.departmentId});
      else await store.update('artifacts',id,data);
      await store.update('report_runs',run.id,{status:'ready',progress:100,artifactId:id,completedAt:new Date().toISOString(),dataAsOf:snapshot.asOf,coverage:snapshot.coverage});
      if (typeof run.data.routineRunId === 'string' && await store.get('routine_runs',run.data.routineRunId)) await store.update('routine_runs',run.data.routineRunId,{status:'succeeded',artifactId:id,completedAt:new Date().toISOString()});
      await store.audit('report.generated','report_runs',run.id,'succeeded',{format,size:bytes.byteLength,privacyMode:ctx.principalType === 'api_key' ? 'aggregate' : 'internal'});
    });
    uploaded = undefined;
    await job.updateProgress({phase:'ready',percent:100});
  } catch (error) {
    if (uploaded) await storage.remove(ctx.organizationId,uploaded.storageKey).catch(() => {});
    await updateFailure(dataPort,ctx,'report_runs',job.data.entityId,error);
    throw error;
  }
}
export async function processStudio(job:Job<JobPayload>,deps:ProcessorDependencies):Promise<void> {
  const {dataPort,context:ctx} = deps;
  const prepared = await dataPort.withTenant(ctx,async store => {
    const record = await store.get('media_jobs',job.data.entityId);
    if (!record) throw new DomainError('NOT_FOUND','Trabajo no disponible.',404);
    await assertNotCancelled(job,record);
    if (record.data.status === 'ready' && record.data.artifactId) return null;
    if (record.data.kind !== 'chart') {
      await store.update('media_jobs',record.id,{status:'blocked',errorCode:'PROVIDER_REQUIRED',error:'La generación de imágenes o vídeo requiere un proveedor autorizado y una implementación verificada. No se ha enviado contenido externo.'});
      return null;
    }
    if (ctx.principalType === 'api_key') throw new DomainError('FORBIDDEN','Studio no está habilitado para claves externas.',403);
    await store.update('media_jobs',record.id,{status:'generating',progress:20});
    return {record,snapshot:await reportSnapshot(store,ctx,'executive',filters(record.data.filters))};
  });
  if (!prepared) return;
  const bytes = renderChartSvg(prepared.snapshot), current = await deps.assertCurrent();
  await assertNotCancelled(job,prepared.record);
  const id = artifactId('studio',prepared.record.id), storage = createArtifactStore();
  const uploaded = await storage.put(ctx.organizationId,id,'svg',bytes,'image/svg+xml');
  try {
    await dataPort.withTenant(current,async store => {
      const latest = await store.get('media_jobs',prepared.record.id);
      if (!latest) throw new DomainError('NOT_FOUND','Trabajo no disponible.',404);
      await assertNotCancelled(job,latest);
      if (!await store.get('artifacts',id)) await store.create('artifacts',{...uploaded,mimeType:'image/svg+xml',filename:`grafico-${prepared.record.id.slice(0,12)}.svg`,expiresAt:expires(),authorizationVersion:ctx.authorizationVersion,requiredPermissions:[...new Set(prepared.snapshot.sources.map(source => `read:${source.entityKind}`))],departmentIds:[...ctx.departmentIds],kind:'chart'},{id,ownerId:ctx.userId});
      await store.update('media_jobs',prepared.record.id,{status:'ready',progress:100,artifactId:id,completedAt:new Date().toISOString()});
    });
  } catch(error) { await storage.remove(ctx.organizationId,uploaded.storageKey).catch(() => {}); throw error; }
}
export async function processRoutine(job:Job<JobPayload>,deps:ProcessorDependencies):Promise<void> {
  const {dataPort,context:ctx} = deps;
  const pending = await dataPort.withTenant(ctx,async store => {
    const existingRun = await store.get('routine_runs',job.data.entityId);
    const routineId = String(existingRun?.data.routineId || job.data.entityId);
    const routine = await store.get('routines',routineId);
    if (!routine || routine.data.status !== 'active') throw new DomainError('ROUTINE_INACTIVE','La rutina no está activa.',409);
    if (existingRun?.data.status === 'succeeded' || existingRun?.data.status === 'waiting_report') return null;
    const run = existingRun || await store.create('routine_runs',{routineId,status:'running',occurrenceKey:`manual/${String(job.id)}`,scheduledAt:new Date().toISOString()},{id:`run-${String(job.id).slice(0,48)}`,ownerId:ctx.userId});
    const taskId = `task-${createHash('sha256').update(run.id).digest('hex').slice(0,48)}`;
    if (routine.data.schedule === 'weekly_report') {
      const reportId = `report-${createHash('sha256').update(run.id).digest('hex').slice(0,48)}`;
      if (!await store.get('report_runs',reportId)) await store.create('report_runs',{template:'executive',format:'pdf',status:'queued',routineRunId:run.id},{id:reportId,ownerId:ctx.userId});
      await store.update('routine_runs',run.id,{status:'scheduling',reportRunId:reportId});
      return {reportId,runId:run.id,routineId:routine.id};
    } else {
      const result = await analyze(store,ctx,{intent:routine.data.schedule === 'receivables' ? 'receivables' : 'executive'});
      if (!await store.get('tasks',taskId)) await store.create('tasks',{title:String(routine.data.title || 'Resultado de rutina'),description:'Resultado calculado por una rutina de lectura. No ejecuta escrituras externas.',status:'completed',result,routineRunId:run.id,completedAt:new Date().toISOString()},{id:taskId,ownerId:ctx.userId});
      await store.update('routine_runs',run.id,{status:'succeeded',taskId,completedAt:new Date().toISOString()});
    }
    await store.update('routines',routine.id,{lastRunAt:new Date().toISOString(),lastRunId:run.id});
    await store.audit('routine.executed','routines',routine.id,'succeeded');
    return null;
  });
  if (pending) {
    const enqueued = await enqueue('report',{...job.data,entityId:pending.reportId});
    await dataPort.withTenant(await deps.assertCurrent(),async store => {
      await store.update('report_runs',pending.reportId,{jobId:enqueued.jobId});
      const currentRun = await store.get('routine_runs',pending.runId);
      if (currentRun && currentRun.data.status !== 'succeeded') await store.update('routine_runs',pending.runId,{status:'waiting_report'});
      await store.update('routines',pending.routineId,{lastRunAt:new Date().toISOString(),lastRunId:pending.runId});
      await store.audit('routine.executed','routines',pending.routineId,'queued');
    });
  }
}
