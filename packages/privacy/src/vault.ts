import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { DomainError, type RequestContext } from '@birdview/contracts';
import type { IdentityReference, PrivacyEntity, VaultRecord, VaultStorage } from './types.js';

const tokenPattern = /^\[\[BV_(ORG|PERSON|ENTITY)_[A-Za-z0-9_-]{24}\]\]$/;
const issued = new WeakSet<object>();
function keyBytes(value: string | Uint8Array): Buffer {
  const bytes = typeof value === 'string' ? Buffer.from(value, 'base64') : Buffer.from(value);
  if (bytes.length !== 32) throw new DomainError('VAULT_KEY_INVALID', 'La bóveda requiere una clave de 256 bits.', 500);
  return bytes;
}
function aad(ctx: RequestContext, scopeId: string, keyVersion: string): Buffer {
  return Buffer.from(JSON.stringify(['birdview-vault-v1',ctx.organizationId,scopeId,keyVersion]));
}
function assertRecord(ctx: RequestContext, scopeId: string, record: VaultRecord): void {
  if (record.organizationId !== ctx.organizationId || record.scopeId !== scopeId || !tokenPattern.test(record.token) || Date.parse(record.expiresAt) <= Date.now()) {
    throw new DomainError('IDENTITY_REFERENCE_INVALID', 'La referencia no está disponible para este ámbito.', 403);
  }
}

export class ScopedIdentityVault {
  private readonly keys: Map<string, Buffer>;
  private readonly lookupKey: Buffer;
  constructor(private readonly options: {
    storage: VaultStorage; keys: Record<string,string | Uint8Array>;
    activeKeyVersion: string; lookupKey: string | Uint8Array;
  }) {
    this.keys = new Map(Object.entries(options.keys).map(([version,key])=>[version,keyBytes(key)]));
    if (!this.keys.has(options.activeKeyVersion)) throw new DomainError('VAULT_KEY_INVALID','Falta la versión activa de la clave.',500);
    this.lookupKey = keyBytes(options.lookupKey);
  }
  private canonicalKey(ctx: RequestContext, entity: Pick<PrivacyEntity,'id'|'type'>): string {
    const tenantKey = createHmac('sha256',this.lookupKey).update(`birdview:lookup:${ctx.organizationId}`).digest();
    return createHmac('sha256',tenantKey).update(JSON.stringify([entity.type,entity.id])).digest('hex');
  }
  private encrypt(ctx: RequestContext, scopeId: string, entity: PrivacyEntity): string {
    const version=this.options.activeKeyVersion, nonce=randomBytes(12);
    const cipher=createCipheriv('aes-256-gcm',this.keys.get(version)!,nonce);
    cipher.setAAD(aad(ctx,scopeId,version));
    const plaintext=JSON.stringify({id:entity.id,type:entity.type,kind:entity.kind,displayName:entity.displayName});
    const encrypted=Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final()]);
    return JSON.stringify({v:1,n:nonce.toString('base64'),c:encrypted.toString('base64'),t:cipher.getAuthTag().toString('base64')});
  }
  private decrypt(ctx: RequestContext, scopeId: string, record: VaultRecord): PrivacyEntity {
    assertRecord(ctx,scopeId,record);
    try {
      const packed=JSON.parse(record.ciphertext) as {v:number;n:string;c:string;t:string};
      const key=this.keys.get(record.keyVersion);
      if (!key || packed.v !== 1) throw Error('unsupported key');
      const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(packed.n,'base64'));
      decipher.setAAD(aad(ctx,scopeId,record.keyVersion));
      decipher.setAuthTag(Buffer.from(packed.t,'base64'));
      const data=JSON.parse(Buffer.concat([decipher.update(Buffer.from(packed.c,'base64')),decipher.final()]).toString('utf8')) as PrivacyEntity;
      if (!data.id || !['ORG','PERSON','ENTITY'].includes(data.type) || typeof data.kind!=='string' || typeof data.displayName!=='string') throw Error('invalid identity');
      return data;
    } catch {
      throw new DomainError('VAULT_DECRYPTION_FAILED','La referencia no puede reconstruirse.',403);
    }
  }
  async issue(ctx: RequestContext, scopeId: string, entity: PrivacyEntity, expiresAt: string): Promise<IdentityReference> {
    if (!ctx.organizationId || !scopeId || !entity.id || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt)<=Date.now()) {
      throw new DomainError('IDENTITY_SCOPE_INVALID','El ámbito de identidad no es válido.');
    }
    const canonicalKey=this.canonicalKey(ctx,entity);
    let record=await this.options.storage.getByCanonical(ctx,scopeId,canonicalKey);
    if (record) {
      const original=this.decrypt(ctx,scopeId,record);
      if (original.id!==entity.id || original.type!==entity.type) throw new DomainError('IDENTITY_REFERENCE_INVALID','La referencia no coincide con la entidad autorizada.',403);
    } else {
      await this.options.storage.put(ctx,{scopeId,canonicalKey,token:`[[BV_${entity.type}_${randomBytes(18).toString('base64url')}]]`,ciphertext:this.encrypt(ctx,scopeId,entity),expiresAt,keyVersion:this.options.activeKeyVersion});
      // Read after upsert also gives concurrent callers the same scope token.
      record=await this.options.storage.getByCanonical(ctx,scopeId,canonicalKey);
      if (!record) throw new DomainError('VAULT_UNAVAILABLE','No se pudo conservar la referencia de forma segura.',503);
      this.decrypt(ctx,scopeId,record);
    }
    const reference=Object.freeze({token:record.token,type:entity.type});
    issued.add(reference);
    return reference;
  }
  async resolve(ctx: RequestContext, scopeId: string, token: string, allowlist: readonly IdentityReference[], authorize: (entity: PrivacyEntity)=>Promise<boolean>): Promise<PrivacyEntity> {
    const reference=allowlist.find(item=>item.token===token && issued.has(item));
    if (!reference || !tokenPattern.test(token)) throw new DomainError('IDENTITY_REFERENCE_INVALID','La respuesta contiene una referencia no autorizada.',403);
    const records=await this.options.storage.getByTokens(ctx,scopeId,[token]);
    if (records.length!==1) throw new DomainError('IDENTITY_REFERENCE_INVALID','La referencia ya no está disponible.',403);
    const entity=this.decrypt(ctx,scopeId,records[0]!);
    if (!await authorize(entity)) throw new DomainError('IDENTITY_ACCESS_REVOKED','El acceso a esta referencia ha cambiado.',403);
    return entity;
  }
  async revokeScope(ctx: RequestContext, scopeId: string): Promise<void> { await this.options.storage.revokeScope(ctx,scopeId); }
  async purgeExpired(now = new Date()): Promise<number> { return this.options.storage.purgeExpired(now); }
}

export function isOpaqueToken(value: string): boolean { return tokenPattern.test(value); }
