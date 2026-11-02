import { Pool } from 'pg';
import type { VaultRecord,VaultStorage } from '@birdview/privacy';
import type { RequestContext } from '@birdview/contracts';
import { setTenantContext } from './index.js';
import { resolveJobPrincipal } from './directory.js';
let pool:Pool|undefined;
function vaultPool(){return pool??=new Pool({connectionString:process.env.VAULT_DATABASE_URL,max:4});}
async function run<T>(ctx:RequestContext,fn:(query:(sql:string,args?:unknown[])=>Promise<import('pg').QueryResult>)=>Promise<T>):Promise<T>{const fresh=await resolveJobPrincipal(ctx);const c=await vaultPool().connect();try{await c.query('BEGIN');await setTenantContext(c,fresh);const value=await fn((sql,args)=>c.query(sql,args));await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
const map=(r:Record<string,unknown>):VaultRecord=>({organizationId:String(r.organization_id),scopeId:String(r.scope_id),canonicalKey:String(r.canonical_key),token:String(r.token),ciphertext:String(r.ciphertext),keyVersion:String(r.key_version),expiresAt:new Date(String(r.expires_at)).toISOString()});
export function createVaultStorage():VaultStorage{return {
 put:(ctx,r)=>run(ctx,async q=>{await q('SELECT vault.put_mapping($1,$2,$3,$4,$5,$6)',[r.scopeId,r.canonicalKey,r.token,r.ciphertext,r.expiresAt,r.keyVersion]);}),
 getByCanonical:(ctx,scope,key)=>run(ctx,async q=>{const r=await q('SELECT * FROM vault.find_mappings($1,$2,NULL)',[scope,key]);return r.rows[0]?map(r.rows[0]):null;}),
 getByTokens:(ctx,scope,tokens)=>run(ctx,async q=>{if(tokens.length>200)throw new Error('Too many references');return(await q('SELECT * FROM vault.find_mappings($1,NULL,$2)',[scope,tokens])).rows.map(map);}),
 revokeScope:(ctx,scope)=>run(ctx,async q=>{await q('SELECT vault.revoke_scope($1)',[scope]);}),
 purgeExpired:async()=>Number((await vaultPool().query('SELECT vault.purge_expired() AS n')).rows[0].n),
};}
export async function closeVaultPool(){if(pool){await pool.end();pool=undefined;}}

export async function expireRetainedData(){await vaultPool().query('SELECT vault.expire_data()');await vaultPool().query('SELECT vault.purge_deleted_organizations()');return (await vaultPool().query('SELECT * FROM vault.pending_objects()')).rows as {organization_id:string;storage_key:string;backend:string}[];}
export async function acknowledgeObject(org:string,key:string){await vaultPool().query('SELECT vault.ack_object($1,$2)',[org,key]);}
