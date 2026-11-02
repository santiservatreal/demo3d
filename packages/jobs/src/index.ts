import { createHash } from 'node:crypto';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { z } from 'zod';

export const jobKinds = ['chat','report','sync','routine','studio','retention'] as const;
export type JobKind = typeof jobKinds[number];
export const jobPayloadSchema = z.object({
  organizationId:z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/),
  userId:z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/),
  entityId:z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/),
  authorizationVersion:z.number().int().nonnegative(),
  principalType:z.enum(['user','api_key']).optional(),
}).strict();
export type JobPayload = z.infer<typeof jobPayloadSchema>;
export const queueName = process.env.BIRDVIEW_QUEUE_NAME || 'birdview-jobs';
let redis: IORedis | undefined;
let queue: Queue<JobPayload> | undefined;

export function redisConnection(): IORedis {
  if (!redis) redis = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:63799', { maxRetriesPerRequest:null, lazyConnect:true, enableReadyCheck:true });
  return redis;
}
export function jobIdentity(kind: JobKind, payload: JobPayload, occurrence = ''): string {
  return createHash('sha256').update([kind,payload.organizationId,payload.userId,payload.entityId,String(payload.authorizationVersion),occurrence].join('\0')).digest('hex');
}
export function getQueue(): Queue<JobPayload> {
  if (!queue) queue = new Queue<JobPayload>(queueName, {
    connection:redisConnection(),
    defaultJobOptions:{ attempts:3, backoff:{type:'exponential',delay:1500}, removeOnComplete:{age:86400,count:5000}, removeOnFail:{age:7*86400,count:5000} },
  });
  return queue;
}
export async function enqueue(kind: JobKind, input: JobPayload, options: {jobId?:string} = {}): Promise<{jobId:string;kind:JobKind}> {
  z.enum(jobKinds).parse(kind);
  const payload = jobPayloadSchema.parse(input);
  const id = options.jobId ? createHash('sha256').update(`${payload.organizationId}\0${options.jobId}`).digest('hex') : jobIdentity(kind,payload);
  const job = await getQueue().add(kind,payload,{jobId:id});
  return {jobId:String(job.id),kind};
}
export async function requestCancellation(jobId: string): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(jobId)) throw new Error('Invalid job reference');
  await redisConnection().set(`birdview:cancel:${jobId}`,'1','EX',86400);
}
export async function isCancelled(jobId: string): Promise<boolean> {
  return (await redisConnection().get(`birdview:cancel:${jobId}`)) === '1';
}
export async function getQueueHealth(): Promise<{redis:boolean;waiting:number;active:number;failed:number}> {
  await redisConnection().ping();
  const counts = await getQueue().getJobCounts('waiting','active','failed');
  return {redis:true,waiting:counts.waiting || 0,active:counts.active || 0,failed:counts.failed || 0};
}
export async function closeQueues(): Promise<void> {
  if (queue) await queue.close();
  queue = undefined;
  if (redis) await redis.quit();
  redis = undefined;
}
