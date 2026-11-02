import { z } from 'zod';

export const entityKinds = ['accounts','contacts','employees','teams','opportunities','pipelines','stages','invoices','payments','tickets','products','inventory_movements','orders','projects','connections','sync_runs','cursors','source_records','source_entity_links','schema_mappings','metric_definitions','metric_snapshots','entity_events','evidence_records','data_quality_issues','conversations','messages','answer_blocks','query_executions','evidence_links','knowledge_items','knowledge_versions','knowledge_sources','knowledge_conflicts','action_proposals','approvals','execution_attempts','tasks','task_steps','routines','routine_runs','report_templates','report_runs','artifacts','presentation_documents','media_jobs','ai_provider_configs','model_capabilities','privacy_policies','budget_limits','usage_ledger','api_keys','published_queries','webhook_subscriptions','privacy_decisions','encrypted_credentials'] as const;
export type EntityKind = typeof entityKinds[number] | 'encrypted_credentials';
export type Role = 'owner' | 'admin' | 'manager' | 'analyst' | 'reader';
export interface RequestContext {
  userId: string; organizationId: string; role: Role; departmentIds: string[];
  permissions: string[]; authorizationVersion: number; principalType: 'user' | 'api_key';
}
export interface Entity<T extends Record<string, unknown> = Record<string, unknown>> {
  id: string; organizationId: string; kind: EntityKind; departmentId: string | null;
  ownerId: string | null; classification: 'internal' | 'restricted'; data: T;
  version: number; createdAt: string; updatedAt: string;
}
export interface ListOptions { limit?: number; offset?: number; search?: string; newestFirst?: boolean; departmentId?: string; ownerId?: string; }
export interface EntityMeta { id?: string; departmentId?: string | null; ownerId?: string | null; classification?: 'internal' | 'restricted'; }
export interface TenantStore {
  list<T extends Record<string, unknown> = Record<string, unknown>>(kind: EntityKind, options?: ListOptions): Promise<Entity<T>[]>;
  get<T extends Record<string, unknown> = Record<string, unknown>>(kind: EntityKind, id: string): Promise<Entity<T> | null>;
  create<T extends Record<string, unknown> = Record<string, unknown>>(kind: EntityKind, data: T, meta?: EntityMeta): Promise<Entity<T>>;
  update<T extends Record<string, unknown> = Record<string, unknown>>(kind: EntityKind, id: string, patch: Partial<T>, expectedVersion?: number): Promise<Entity<T>>;
  remove(kind: EntityKind, id: string): Promise<void>;
  forgetKnowledge(id:string):Promise<Entity>;
  audit(action: string, resource: string, resourceId: string | null, outcome: string, metadata?: Record<string, string | number | boolean | null>): Promise<void>;
}
export interface DataPort { withTenant<T>(ctx: RequestContext, work: (store: TenantStore) => Promise<T>): Promise<T>; }
export class DomainError extends Error {
  constructor(public code: string, message: string, public statusCode = 400) { super(message); this.name = 'DomainError'; }
}
export const dateFilterSchema = z.object({ from: z.string().date().optional(), to: z.string().date().optional(), departmentId: z.string().max(100).optional(), ownerId: z.string().max(100).optional(), accountId: z.string().max(100).optional(), currency: z.string().length(3).default('EUR') }).strict();
export type QueryFilters = z.infer<typeof dateFilterSchema>;
export const intentSchema = z.enum(['receivables','payments','pipeline','win_rate','tickets','team','inventory','orders','executive','account','history','report','knowledge','task','unknown']);
export type QueryIntent = z.infer<typeof intentSchema>;
export interface Evidence { id: string; provider: string; entityKind: string; entityId?: string; fields: string[]; observedAt: string; from?: string; to?: string; label: string; }
const verification = z.enum(['verified','partial','inferred','no_evidence']);
const cell = z.union([z.string(),z.number().finite(),z.boolean(),z.null()]);
export const answerBlockSchema = z.discriminatedUnion('type', [
  z.object({ type:z.literal('text'), text:z.string().max(20000), verification:verification.default('verified') }).strict(),
  z.object({ type:z.literal('metric'), label:z.string(), value:z.number().finite().nullable(), format:z.enum(['money','number','percent']), currency:z.string().length(3).optional(), metricRef:z.string(), detail:z.string().optional() }).strict(),
  z.object({ type:z.literal('table'), title:z.string(), columns:z.array(z.object({key:z.string(),label:z.string()})), rows:z.array(z.record(z.string(),cell)), metricRef:z.string().optional() }).strict(),
  z.object({ type:z.literal('chart'), title:z.string(), chartType:z.enum(['bar','line','pie']), xKey:z.string(), series:z.array(z.object({key:z.string(),label:z.string()})), data:z.array(z.record(z.string(),cell)), metricRef:z.string() }).strict(),
  z.object({ type:z.literal('sourceList'), sources:z.array(z.object({id:z.string(),label:z.string(),provider:z.string(),observedAt:z.string()})) }).strict(),
  z.object({ type:z.literal('warning'), text:z.string() }).strict(),
  z.object({ type:z.literal('actionProposal'), proposalId:z.string(), title:z.string() }).strict(),
  z.object({ type:z.literal('reportLink'), reportId:z.string(), title:z.string(), status:z.string() }).strict(),
  z.object({ type:z.literal('cityFocus'), districtId:z.string(), entityId:z.string().optional(), label:z.string() }).strict(),
  z.object({ type:z.literal('clarification'), question:z.string(), options:z.array(z.object({id:z.string(),label:z.string()})) }).strict(),
]);
export type AnswerBlock = z.infer<typeof answerBlockSchema>;
export const answerSchema = z.object({ id:z.string(), mode:z.enum(['demo','external_llm','self_hosted_llm']), blocks:z.array(answerBlockSchema), evidenceIds:z.array(z.string()), dataAsOf:z.string(), coverage:z.object({from:z.string().optional(),to:z.string().optional(),warnings:z.array(z.string())}), proposedActionIds:z.array(z.string()), privacyDecisionId:z.string() }).strict();
export type Answer = z.infer<typeof answerSchema>;
export interface AnalysisResult { intent: QueryIntent; blocks: AnswerBlock[]; evidence: Evidence[]; dataAsOf: string; coverage: {from?:string;to?:string;warnings:string[]}; suggestedQuestions: string[]; }
export interface CityNode { id:string; name:string; label:string; status:string; valueMinor?:number; }
export interface CityDistrict { id:string; name:string; module:string; metricLabel:string; value:number; formatted:string; alertCount:number; entities:CityNode[]; }
export interface CityViewModel { organizationId:string; asOf:string; seed:string; currency:string; districts:CityDistrict[]; warnings:string[]; }
export interface OrganizationSummary { id:string; name:string; template:string; currency:string; timezone:string; modules:string[]; demo:boolean; }
export interface Bootstrap { user:{id:string;name:string;email:string}; organization:OrganizationSummary; organizations:OrganizationSummary[]; context:RequestContext; csrfToken:string; }
export const safeId = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);
