import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DomainError, type Entity, type RequestContext } from '@birdview/contracts';

export interface StoredArtifact { storageKey:string; storageBackend:'local'|'s3'; size:number; sha256:string; }
export interface ArtifactStore {
  put(organizationId:string,artifactId:string,extension:string,bytes:Uint8Array,mimeType:string):Promise<StoredArtifact>;
  read(organizationId:string,key:string):Promise<Buffer>;
  remove(organizationId:string,key:string):Promise<void>;
}
const MAX_BYTES = 30 * 1024 * 1024;
const atom = /^[a-zA-Z0-9_-]{1,120}$/;
function keyFor(org:string,id:string,extension:string):string {
  if (!atom.test(org) || !atom.test(id) || !/^[a-z0-9]{1,8}$/.test(extension)) throw new DomainError('INVALID_ARTIFACT','Referencia de archivo no válida.');
  return `${org}/${id}.${extension}`;
}
function validKey(org:string,key:string):void {
  if (!atom.test(org) || !new RegExp(`^${org}/[a-zA-Z0-9_-]{1,120}\\.[a-z0-9]{1,8}$`).test(key)) throw new DomainError('NOT_FOUND','Archivo no disponible.',404);
}
function digest(bytes:Uint8Array):string { return createHash('sha256').update(bytes).digest('hex'); }

export class LocalArtifactStore implements ArtifactStore {
  readonly root:string;
  constructor(directory = process.env.ARTIFACT_DIR || '.local/artifacts') { this.root = resolve(directory); }
  private path(org:string,key:string):string {
    validKey(org,key);
    const path = resolve(this.root,key);
    if (!path.startsWith(this.root + sep)) throw new DomainError('NOT_FOUND','Archivo no disponible.',404);
    return path;
  }
  async put(org:string,id:string,extension:string,bytes:Uint8Array,_mimeType:string):Promise<StoredArtifact> {
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new DomainError('ARTIFACT_SIZE','El archivo supera el límite permitido.');
    const key = keyFor(org,id,extension), target = this.path(org,key);
    await mkdir(dirname(target),{recursive:true,mode:0o700});
    const temporary = `${target}.${randomUUID()}.tmp`;
    try { await writeFile(temporary,bytes,{mode:0o600,flag:'wx'}); await rename(temporary,target); }
    finally { await rm(temporary,{force:true}).catch(() => {}); }
    return {storageKey:key,storageBackend:'local',size:bytes.byteLength,sha256:digest(bytes)};
  }
  async read(org:string,key:string):Promise<Buffer> {
    try { const bytes = await readFile(this.path(org,key)); if (bytes.length > MAX_BYTES) throw new Error('size'); return bytes; }
    catch { throw new DomainError('NOT_FOUND','Archivo no disponible.',404); }
  }
  async remove(org:string,key:string):Promise<void> { await rm(this.path(org,key),{force:true}); }
}
export class S3ArtifactStore implements ArtifactStore {
  readonly client:S3Client;
  readonly bucket:string;
  constructor(options:{bucket?:string;region?:string;endpoint?:string;client?:S3Client} = {}) {
    this.bucket = options.bucket || process.env.S3_BUCKET || '';
    if (!this.bucket) throw new DomainError('STORAGE_NOT_CONFIGURED','El almacenamiento privado no está configurado.',503);
    this.client = options.client || new S3Client({region:options.region || process.env.S3_REGION || process.env.AWS_REGION,credentials:process.env.S3_ACCESS_KEY_ID&&process.env.S3_SECRET_ACCESS_KEY?{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}:undefined,endpoint:options.endpoint || process.env.S3_ENDPOINT,forcePathStyle:Boolean(options.endpoint || process.env.S3_ENDPOINT)});
  }
  async put(org:string,id:string,extension:string,bytes:Uint8Array,mimeType:string):Promise<StoredArtifact> {
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new DomainError('ARTIFACT_SIZE','El archivo supera el límite permitido.');
    const key = keyFor(org,id,extension);
    await this.client.send(new PutObjectCommand({Bucket:this.bucket,Key:key,Body:bytes,ContentType:mimeType,ServerSideEncryption:process.env.S3_KMS_KEY_ID ? 'aws:kms' : 'AES256',SSEKMSKeyId:process.env.S3_KMS_KEY_ID}));
    return {storageKey:key,storageBackend:'s3',size:bytes.byteLength,sha256:digest(bytes)};
  }
  async read(org:string,key:string):Promise<Buffer> {
    validKey(org,key);
    try {
      const response = await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:key}));
      if (!response.Body || (response.ContentLength || 0) > MAX_BYTES) throw new Error('size');
      const bytes = Buffer.from(await response.Body.transformToByteArray());
      if (bytes.length > MAX_BYTES) throw new Error('size');
      return bytes;
    } catch { throw new DomainError('NOT_FOUND','Archivo no disponible.',404); }
  }
  async remove(org:string,key:string):Promise<void> { validKey(org,key); await this.client.send(new DeleteObjectCommand({Bucket:this.bucket,Key:key})); }
}
export function createArtifactStore():ArtifactStore {
  return process.env.ARTIFACT_BACKEND === 's3' ? new S3ArtifactStore() : new LocalArtifactStore();
}
export function authorizeArtifact(ctx:RequestContext, artifact:Entity, now = new Date()):void {
  const d = artifact.data;
  const permissions = Array.isArray(d.requiredPermissions) ? d.requiredPermissions as string[] : [];
  const departments = Array.isArray(d.departmentIds) ? d.departmentIds as string[] : [];
  const allowed = artifact.organizationId === ctx.organizationId && artifact.ownerId === ctx.userId &&
    d.authorizationVersion === ctx.authorizationVersion && typeof d.expiresAt === 'string' && new Date(d.expiresAt).getTime() > now.getTime() &&
    permissions.every(permission => ctx.permissions.includes(permission) || ctx.permissions.includes('*')) &&
    departments.every(department => ctx.departmentIds.includes(department) || ctx.departmentIds.includes('*'));
  if (!allowed) throw new DomainError('NOT_FOUND','Archivo no disponible.',404);
}
export async function readArtifact(ctx:RequestContext,artifact:Entity):Promise<Buffer> {
  authorizeArtifact(ctx,artifact);
  const backend = artifact.data.storageBackend;
  const store = backend === 's3' ? new S3ArtifactStore() : new LocalArtifactStore();
  const bytes = await store.read(ctx.organizationId,String(artifact.data.storageKey || ''));
  if (typeof artifact.data.sha256 !== 'string' || digest(bytes) !== artifact.data.sha256) throw new DomainError('ARTIFACT_INTEGRITY','El archivo no está disponible; solicita una nueva versión.',409);
  return bytes;
}
