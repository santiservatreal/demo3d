import type { AnswerBlock, RequestContext } from '@birdview/contracts';
import type { PrivacyEnvelope } from '@birdview/privacy';

export interface ModelCapabilities { structuredOutput:boolean; }
export interface ProviderReview {status:'pending'|'approved';region:string;retentionDays:number;training:'disabled'|'unknown'|'enabled';reviewedAt:string;}
export interface ProviderPricing {
  version:string;currency:string;inputMinorPerMillion:number;outputMinorPerMillion:number;
  maxInputTokens:number;maxOutputTokens:number;
}
export interface ProviderConfig {
  id:string;kind:'external'|'self_hosted';model:string;endpoint:string;apiKey?:string;
  capabilities:ModelCapabilities;review:ProviderReview;pricing:ProviderPricing;
}
export interface ApprovedEndpoint {url:string;allowPrivateNetwork?:boolean;models?:string[];}
export interface GatewayPolicy {allowExternal:boolean;allowedRegions:string[];maxRetentionDays:number;monthlyLimitMinor:number;currency:string;maxAttempts?:number;}
export interface BudgetStore {
  reserve(ctx:RequestContext,input:{reservationId:string;amountMinor:number;limitMinor?:number;currency?:string}):Promise<unknown>;
  reconcile(ctx:RequestContext,input:{reservationId:string;actualMinor:number;estimated?:boolean}):Promise<unknown>;
  release(ctx:RequestContext,reservationId:string):Promise<unknown>;
}
export interface HttpRequest {
  url:string;method:'POST';headers:Record<string,string>;body:string;signal?:AbortSignal;
  timeoutMs:number;pinnedAddresses:Array<{address:string;family:4|6}>;
}
export interface HttpResponse {status:number;headers:Record<string,string>;body:string;}
export type HttpTransport=(request:HttpRequest)=>Promise<HttpResponse>;
export type DNSResolver=(hostname:string)=>Promise<Array<{address:string;family:4|6}>>;
export interface ProviderReply {segments:Array<{type:'text'|'entity'|'metric'|'evidence';value:string}>;}
export interface ProviderResult {reply:ProviderReply;usage:{inputTokens:number|null;outputTokens:number|null;estimated:boolean};}
export interface AIProvider {
  readonly config:ProviderConfig;
  serialize(envelope:Readonly<PrivacyEnvelope>):string;
  parse(response:HttpResponse):ProviderResult;
}
export interface GatewayResult {blocks:AnswerBlock[];mode:'external_llm'|'self_hosted_llm';usage:{inputTokens:number|null;outputTokens:number|null;estimated:boolean;costMinor:number;currency:string;priceVersion:string};privacyDecisionId:string;warnings:string[];}
