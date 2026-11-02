# Jobs integration contract

Exports from `@birdview/jobs`:

```ts
type JobKind = 'chat' | 'report' | 'sync' | 'routine' | 'studio' | 'retention';
type JobPayload = {
  organizationId:string; userId:string; entityId:string;
  authorizationVersion:number; principalType?:'user'|'api_key';
};
enqueue(kind, payload, {jobId?}?) => Promise<{jobId:string;kind:JobKind}>
requestCancellation(jobId) => Promise<void>
isCancelled(jobId) => Promise<boolean>
getQueueHealth() => Promise<{redis:boolean;waiting:number;active:number;failed:number}>
closeQueues() => Promise<void>
```

Only IDs and the authorization version travel in Redis. Job IDs are organization-qualified SHA-256 digests, not raw names. Persist the returned `jobId` on the corresponding entity. Cancellation is cooperative and persisted with a bounded TTL. Worker re-resolves the principal, organization and current permissions on every attempt.

Reports are queued using `entityId=report_runs.id`. Report data must contain `template`, `format`, optional `filters`, and optional `presentationId`; output sets `status`, `progress`, `artifactId`, `completedAt`. Studio uses `media_jobs.id`; data has `kind=chart|image|video`, `title`, and optional `filters`. Non-chart jobs are blocked without a configured implementation; no media is fabricated.

Scheduled routines use `routine_runs.id`; manual runs may use `routines.id`. A routine has `title`, `schedule=daily_briefing|weekly_report|receivables`, `timezone`, `status=active|paused|cancelled`, optional `hour`, `minute`, `weekdays`. All scheduled instants have a deterministic durable `routine_run` ID and a stable local-wall-time occurrence key.

Root owns `apps/worker/src/chat.ts` with `processChat(payload, {dataPort,context})`. Other worker jobs share `JobPayload` and private persistence.
