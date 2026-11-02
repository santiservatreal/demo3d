import type { Entity, EntityKind, RequestContext, TenantStore } from '@birdview/contracts';

export type ConnectorStatus = 'implemented_pending_account_validation' | 'documentation_required' | 'pending_integration';
export interface ConnectorManifest {
  id:string; name:string; version:string; status:ConnectorStatus;
  auth:{ type:'bearer'|'api_key'|'oauth'|'none'; scopes:string[]; note:string };
  entities:EntityKind[];
  capabilities:{read:boolean;pagination:boolean;incremental:boolean;deletions:boolean;history:boolean;webhooks:boolean;sourceAcl:boolean;write:false};
  sensitiveFields:string[]; documentation:string[]; limitation:string;
}
export interface ConnectorSecret { token:string; }
export interface TransportOptions { fetch?:typeof fetch; sleep?:(milliseconds:number)=>Promise<void>; signal?:AbortSignal; now?:()=>Date; }
export interface ConnectorContext extends TransportOptions { organizationId:string; connectionId:string; secret:ConnectorSecret; }
export interface ConnectionCheck { status:'reachable'|'unavailable'; message:string; verifiedAt:string; }
export interface SourceSchema { provider:string; version:string; entities:Array<{kind:EntityKind;fields:string[]}>; sourceAcl:'not_available'; }
export interface RecordReference { field:string; kind:EntityKind; externalId:string; }
export interface NormalizedRecord { entityKind:EntityKind; externalId:string; data:Record<string,unknown>; updatedAt?:string; deleted?:boolean; references?:RecordReference[]; }
export interface SyncRequest { entityKind:EntityKind; cursor?:string; since?:string; limit?:number; archived?:boolean; }
export interface SyncPage { records:NormalizedRecord[]; nextCursor?:string; hasMore:boolean; warnings:string[]; }
export interface Connector {
  manifest:ConnectorManifest;
  testConnection(ctx:ConnectorContext):Promise<ConnectionCheck>;
  discoverSchema(ctx:ConnectorContext):Promise<SourceSchema>;
  syncPage(ctx:ConnectorContext,request:SyncRequest):Promise<SyncPage>;
}
export interface SyncOptions extends TransportOptions {
  maxPages?:number;
  pageTransaction?:<T>(work:(store:TenantStore)=>Promise<T>)=>Promise<T>;
}
export interface SyncSummary { status:'active'|'degraded';created:number;updated:number;deleted:number;unchanged:number;pages:number;records:number;warnings:string[]; }
export type SecretReader = (connectionId:string)=>Promise<ConnectorSecret>;
export type ConnectionEntity = Entity & {data:Record<string,unknown> & {provider?:string;entities?:unknown;status?:string}};
export type VerifiedSyncContext = RequestContext;
