import type { QueryIntent } from '@birdview/contracts';

export function normalizeText(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
}

export interface DetectedIntent {
  intent: QueryIntent;
  supported: boolean;
  period?: 'current_month' | 'previous_month' | 'last_30_days' | 'current_week';
  requestedDate?: string;
}

/** Local recognition of a closed vocabulary, never a general-purpose AI. */
export function detectIntent(question: string): DetectedIntent {
  const q = normalizeText(question);
  let intent: QueryIntent = 'unknown';
  if (/\b(informe|report(e)?|pdf|csv)\b/.test(q)) intent = 'report';
  else if (/\b(historic[oa]|hace una semana|estado anterior|a fecha de|como estaba|evolucion historica)\b/.test(q)) intent = 'history';
  else if (/\b(ficha|detalle de (la )?cuenta|resumen del? cliente|informacion del? cliente)\b/.test(q)) intent = 'account';
  else if (/\b(tasa de (cierre|conversion)|ratio de (cierre|conversion)|win rate|porcentaje de (cierre|ganadas))\b/.test(q)) intent = 'win_rate';
  else if (/\b(vencid[ao]s?|pendientes? de (cobro|pago)|por cobrar|saldo pendiente|aging|deuda|deudores|impagad[ao]s?)\b/.test(q)) intent = 'receivables';
  else if (/\b(cobros?|cobrado|pagos? recibidos|ingresos? recibidos)\b/.test(q)) intent = 'payments';
  else if (/\b(pipeline|oportunidades?|negociacion|propuestas?|ventas?|comercial|leads?)\b/.test(q)) intent = 'pipeline';
  else if (/\b(tickets?|soporte|incidencias?)\b/.test(q)) intent = 'tickets';
  else if (/\b(plantilla|equipos?|personas|disponibilidad|empleados?|capacidad)\b/.test(q)) intent = 'team';
  else if (/\b(stock|inventario|existencias?|minimo|almacen)\b/.test(q)) intent = 'inventory';
  else if (/\b(pedidos?|entregas?|retrasados?|reparto|logistica|transporte|produccion|operaciones)\b/.test(q)) intent = 'orders';
  else if (/\b(conocimiento|reglas? de (la )?empresa|politicas? (internas?|de empresa))\b/.test(q)) intent = 'knowledge';
  else if (/\b(tarea|recuerda|recordatorio|revisalo|revisar en|dentro de un mes)\b/.test(q)) intent = 'task';
  else if (/\b(resumen|briefing|ejecutivo|facturacion|negocio|como vamos|situacion|empresa)\b/.test(q)) intent = 'executive';
  let period: DetectedIntent['period'];
  if (/\b(mes pasado|mes anterior|ultimo mes cerrado)\b/.test(q)) period = 'previous_month';
  else if (/\b(ultimos? 30 dias|ultimo mes)\b/.test(q)) period = 'last_30_days';
  else if (/\b(este mes|mes actual)\b/.test(q)) period = 'current_month';
  else if (/\b(esta semana|semana actual)\b/.test(q)) period = 'current_week';
  const requestedDate = question.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  return { intent, supported: intent !== 'unknown', ...(period ? { period } : {}), ...(requestedDate ? { requestedDate } : {}) };
}

export function isRestrictedQuestion(question: string): boolean {
  return /\b(salarios?|nominas?|sueldos?|diagnostic[oa]s?|enfermedad|salud|baja medica|documento personal|cuenta bancaria|iban|contrasenas?|passwords?)\b/.test(normalizeText(question));
}
