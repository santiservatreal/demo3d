import { DomainError, type Entity, type EntityKind, type Evidence, type QueryFilters, type RequestContext, type TenantStore } from '@birdview/contracts';

export const MAX_ROWS = 10_000;
export const PAGE_SIZE = 100;
export type Dataset = Partial<Record<EntityKind, Entity[]>>;
export const canRead = (ctx: RequestContext, kind: EntityKind): boolean => ctx.permissions.includes('*') || ctx.permissions.includes(`read:${kind}`);

/** A request-local reader: no cache can survive a principal or organization change. */
export class Reader {
  private loaded = new Map<EntityKind, Promise<Entity[]>>();
  readonly warnings: string[] = [];
  constructor(readonly store: TenantStore, readonly ctx: RequestContext, readonly filters: QueryFilters) {}
  get(kind: EntityKind): Promise<Entity[]> {
    if (!canRead(this.ctx, kind)) return Promise.resolve([]);
    let loaded = this.loaded.get(kind);
    if (!loaded) { loaded = this.read(kind); this.loaded.set(kind, loaded); }
    return loaded;
  }
  private async read(kind: EntityKind): Promise<Entity[]> {
    const result: Entity[] = [];
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
      const page = await this.store.list(kind, { limit: PAGE_SIZE, offset, ...(this.filters.departmentId ? { departmentId: this.filters.departmentId } : {}) });
      for (const row of page) {
        if (row.organizationId !== this.ctx.organizationId) throw new DomainError('TENANT_CONTEXT_MISMATCH', 'El contexto de los datos no es válido.', 500);
        if (this.filters.departmentId && row.departmentId !== this.filters.departmentId) continue;
        if((row.data.source as {deleted?:boolean}|undefined)?.deleted!==true)result.push(row);
      }
      if (page.length < PAGE_SIZE) return result;
    }
    this.warnings.push(`Cobertura parcial de ${kind}: se alcanzó el límite de ${MAX_ROWS.toLocaleString('es-ES')} registros autorizados.`);
    return result;
  }
}

export function string(value: unknown, fallback = ''): string { return typeof value === 'string' ? value : fallback; }
export function number(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
export function minor(value: unknown): number | null { return typeof value === 'number' && Number.isSafeInteger(value) ? value : null; }
export function money(value: number, currency: string): string { return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(value / 100); }
export function integer(value: number): string { return new Intl.NumberFormat('es-ES').format(value); }
export function sum(values: number[]): number {
  const total = values.reduce((a,b) => a+b,0);
  if (!Number.isSafeInteger(total)) throw new DomainError('AMOUNT_LIMIT', 'El importe supera el rango contable admitido.', 422);
  return total;
}
export function accountingDate(now: Date, timezone = 'Europe/Madrid'): string {
  try { return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit' }).format(now); }
  catch { throw new DomainError('INVALID_TIMEZONE','La zona horaria de la organización no es válida.',422); }
}
export function isoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const d = value.slice(0,10);
  return Number.isFinite(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0,10) === d ? d : null;
}
export function inPeriod(value: unknown, filters: QueryFilters): boolean {
  if (!filters.from && !filters.to) return true;
  const date = isoDate(value);
  return Boolean(date && (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to));
}
export function referenceFilters(period: string | undefined, cutoff: string): Partial<QueryFilters> {
  if (!period) return {};
  const day = new Date(`${cutoff}T00:00:00Z`);
  if (period === 'previous_month') return { from:new Date(Date.UTC(day.getUTCFullYear(),day.getUTCMonth()-1,1)).toISOString().slice(0,10), to:new Date(Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),0)).toISOString().slice(0,10) };
  if (period === 'current_month') return { from:`${cutoff.slice(0,7)}-01`,to:cutoff };
  if (period === 'current_week') { const offset = (day.getUTCDay()+6)%7; return { from:new Date(day.getTime()-offset*86_400_000).toISOString().slice(0,10),to:cutoff }; }
  return { from:new Date(day.getTime()-29*86_400_000).toISOString().slice(0,10),to:cutoff };
}
export function selectedCurrency(rows: Entity[], currency: string, warnings: string[], valueField: string): Entity[] {
  const others = new Set<string>(); let invalid = 0;
  const result = rows.filter(row => {
    const code = string(row.data.currency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(code) || minor(row.data[valueField]) === null) { invalid++; return false; }
    if (code !== currency) { others.add(code); return false; }
    return true;
  });
  if (others.size) warnings.push(`Los importes en ${[...others].sort().join(', ')} se excluyen del total en ${currency}; no se aplicaron tipos de cambio.`);
  if (invalid) warnings.push(`${invalid} registros monetarios se excluyeron por importe o divisa ausentes o no válidos.`);
  return result;
}
export function invoiceBalance(row: Entity): number | null {
  const {data} = row;
  if (data.status === 'void' || data.status === 'credited') return 0;
  const total=minor(data.totalMinor), paid=minor(data.paidMinor ?? 0), credits=minor(data.creditMinor ?? 0);
  if (total===null || paid===null || credits===null || total<0 || paid<0 || credits<0) return null;
  return Math.max(0,total-paid-credits);
}
export function sourceEvidence(row: Entity, fields: string[]): Evidence {
  const source = row.data.source && typeof row.data.source === 'object' ? row.data.source as Record<string,unknown> : {};
  return { id:`${row.kind}/${row.id}`, provider:string(source.provider,'manual'),entityKind:row.kind,entityId:row.id,fields,observedAt:string(source.observedAt,row.updatedAt),label:string(row.data.name,string(row.data.number,`${row.kind} · ${row.id.slice(-8)}`)) };
}
export function coverageFromEvidence(evidence: Evidence[], filters: QueryFilters, warnings: string[]): {from?:string;to?:string;warnings:string[]} {
  const dates = evidence.map(row=>isoDate(row.observedAt)).filter((d):d is string=>Boolean(d)).sort();
  return { ...(filters.from ? {from:filters.from} : dates[0] ? {from:dates[0]} : {}), ...(filters.to ? {to:filters.to} : dates.at(-1) ? {to:dates.at(-1)} : {}), warnings:[...new Set(warnings)] };
}
export function dataAsOf(evidence: Evidence[], fallback: string): string {
  if (!evidence.length) return fallback;
  const newest = new Map<string,string>();
  for (const row of evidence) { const key=`${row.provider}/${row.entityKind}`; const last=newest.get(key); if (!last || row.observedAt>last) newest.set(key,row.observedAt); }
  return [...newest.values()].sort()[0] || fallback;
}
