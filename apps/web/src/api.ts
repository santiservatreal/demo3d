import type { Bootstrap, Entity } from '@birdview/contracts';

let csrfToken = '';
export function configureSession(session: Bootstrap | null) { csrfToken = session?.csrfToken || ''; }
export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string, public requestId?: string) { super(message); }
}
export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = options.method || 'GET';
  const response = await fetch(path.startsWith('/api/') ? path : `/api/v1${path}`, {
    method, credentials: 'same-origin', signal: options.signal,
    headers: { ...(options.body === undefined ? {} : { 'content-type': 'application/json' }), ...(method === 'GET' ? {} : { 'x-csrf-token': csrfToken }) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload.error || payload;
    throw new ApiError(error.message || 'No se pudo completar la solicitud.', response.status, error.code || 'REQUEST_FAILED', error.requestId || payload.requestId);
  }
  return payload as T;
}
export function rows<T = Entity>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== 'object') return [];
  const items = (payload as { items?: unknown }).items;
  return Array.isArray(items) ? items as T[] : [];
}
export function recordData(record: unknown): Record<string, unknown> {
  if (!record || typeof record !== 'object') return {};
  const value = record as Record<string, unknown>;
  return value.data && typeof value.data === 'object' ? value.data as Record<string, unknown> : value;
}
export const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback;
export const currency = (minor: number, code = 'EUR') => new Intl.NumberFormat('es-ES', { style: 'currency', currency: code }).format(minor / 100);
export const quantity = (value: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value);
export const date = (value: unknown) => {
  if (typeof value !== 'string') return '—';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : value;
};
export const statusLabels: Record<string, string> = {
  conflict_pending:'Conflicto pendiente',active:'Activo',paused:'En pausa',cancelled:'Cancelado',completed:'Completado',pending:'Pendiente',queued:'En cola',running:'En curso',ready:'Disponible',succeeded:'Completado',failed:'Error',blocked:'Bloqueado',unknown:'Pendiente de comprobar',approved:'Aprobada',rejected:'Rechazada',draft:'Borrador',executing:'Ejecutando',expired:'Caducado',archived:'Archivado',forgotten:'Olvidado',revoked:'Revocado',configured:'Configurado',not_configured:'Sin configurar',pending_integration:'Pendiente de integración',available:'Disponible',open:'Abierto',closed:'Cerrado',won:'Ganada',lost:'Perdida',paid:'Pagada',degraded:'Degradado',error:'Error',syncing:'Sincronizando',initial_sync:'Sincronización inicial',pending_authorization:'Pendiente de autorización',pending_validation:'Pendiente de validación',done:'Completado',validating:'Validando',consulting:'Consultando datos',preparing:'Preparando respuesta',generating:'Generando',
};
