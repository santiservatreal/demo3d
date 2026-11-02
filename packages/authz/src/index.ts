import { DomainError, type EntityKind, type RequestContext, type Role } from '@birdview/contracts';

const business = ['accounts','contacts','opportunities','pipelines','stages','invoices','payments','tickets','employees','teams','products','inventory_movements','orders','projects','metric_definitions','metric_snapshots','entity_events','evidence_records','data_quality_issues'];
const personal = ['conversations','messages','answer_blocks','query_executions','evidence_links','tasks','task_steps','routines','routine_runs','report_runs','artifacts','presentation_documents','media_jobs'];
export const privateKinds = new Set(['tasks','task_steps','routines','routine_runs','conversations','messages','answer_blocks','query_executions','evidence_links','report_runs','artifacts','presentation_documents','media_jobs']);
export const adminKinds = new Set(['encrypted_credentials','connections','sync_runs','cursors','source_records','source_entity_links','schema_mappings','ai_provider_configs','model_capabilities','privacy_policies','budget_limits','usage_ledger','api_keys','published_queries','webhook_subscriptions','privacy_decisions']);
export function rolePermissions(role: Role): string[] {
  if (role === 'owner') return ['*'];
  const own = personal.flatMap(k => [`read:${k}`, `write:${k}`]);
  const knowledge = ['read:knowledge_items','read:knowledge_versions','read:knowledge_sources','read:knowledge_conflicts'];
  if (role === 'admin') return [...own,...knowledge,...['encrypted_credentials','connections','sync_runs','cursors','source_records','source_entity_links','schema_mappings','ai_provider_configs','model_capabilities','privacy_policies','budget_limits','usage_ledger','api_keys','published_queries','webhook_subscriptions','privacy_decisions'].flatMap(k=>[`read:${k}`,`write:${k}`]),'admin:members','admin:connectors','admin:providers','admin:privacy','admin:api'];
  const read = business.map(k=>`read:${k}`);
  if (role === 'reader') return [...read,...knowledge,...own,'export:reports'];
  const edit = ['knowledge_items','knowledge_versions','knowledge_sources','knowledge_conflicts','action_proposals','approvals','execution_attempts'].flatMap(k=>[`read:${k}`,`write:${k}`]);
  if (role === 'manager') return [...read,...own,...edit,'write:opportunities','write:accounts','write:projects','export:reports','approve:actions','execute:actions'];
  return [...read,...own,...edit,'export:reports'];
}
export function hasPermission(ctx: RequestContext, permission: string): boolean { return ctx.permissions.includes('*') || ctx.permissions.includes(permission); }
export function assertPermission(ctx: RequestContext, permission: string): void {
  if (!hasPermission(ctx,permission)) throw new DomainError('FORBIDDEN','No tienes permiso para esta operación.',403);
}
export function canAccessDepartment(ctx: RequestContext, departmentId: string | null): boolean { return departmentId === null || ctx.departmentIds.includes('*') || ctx.departmentIds.includes(departmentId); }
export function assertDepartment(ctx: RequestContext, departmentId: string | null): void { if(!canAccessDepartment(ctx,departmentId)) throw new DomainError('FORBIDDEN','No tienes permiso para este departamento.',403); }
export function assertResource(ctx: RequestContext, action: 'read'|'write', kind: EntityKind): void { assertPermission(ctx,`${action}:${kind}`); }
export function assertRestricted(ctx: RequestContext): void { assertPermission(ctx,'read:restricted'); }
const resourceDepartments:Record<string,string>={accounts:'sales',contacts:'sales',opportunities:'sales',pipelines:'sales',stages:'sales',invoices:'finance',payments:'finance',employees:'people',teams:'people',tickets:'support',products:'inventory',inventory_movements:'inventory',orders:'operations',projects:'operations'};
export function scopedPermissions(role:Role,departments:string[]){const all=rolePermissions(role);if(departments.includes('*'))return all;return all.filter(permission=>{const resource=permission.split(':')[1];const department=resourceDepartments[resource];return !department||departments.includes(department);});}
