import { DomainError } from '@birdview/contracts';
import type { FieldRule, PrivacyEntity, PrivacyPolicy } from './types.js';

export const DEFAULT_PRIVACY_POLICY: Readonly<PrivacyPolicy> = Object.freeze({version:'strict-aggregate-v1',mode:'strict',minimumGroupSize:5,allowEntityLevel:false,roundMoneyMinorTo:100,maxScopeHours:24});
const normalized=(text:string)=>text.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('es');
const blocked=/salary|payroll|nomina|salario|health|salud|medical|medic|secret|password|token|credential|apikey|api_key|bank|iban|bankaccount/;
const identities=/^(name|firstname|lastname|displayname|legalname|companyname|organizationname|alias|aliases|email|phone|telephone|taxid|vat|address|domain|url|externalid|sourceid|filename|subject|description|note|notes|title)$/;
const allowed=/^(count|quantity|stock|minimumstock|active|status|currency|amountminor|totalminor|paidminor|creditminor|valueminor|probability|availabilitypercent)$/;
export function classifyField(field: string): FieldRule {
  const name=normalized(field).replace(/[_\s.-]/g,'');
  if (blocked.test(name)) return {action:'BLOCK',reason:'sensitive_or_secret'};
  if (identities.test(name)) return {action:'TOKENIZE',reason:'identity_or_free_text'};
  if (/date|at$|location|position|role|jobtitle/.test(name)) return {action:'GENERALIZE',reason:'quasi_identifier'};
  if (allowed.test(name)) return {action:'ALLOW',reason:'classified_structured_field'};
  return {action:'BLOCK',reason:'unknown_field'};
}
export interface AliasMatch { start:number; end:number; entityIds:string[]; }
function mappedNormalize(text:string): {text:string;starts:number[];ends:number[]} {
  let result='';const starts:number[]=[],ends:number[]=[];
  const segments=new Intl.Segmenter('es',{granularity:'grapheme'}).segment(text);
  for (const segment of segments) {
    const part=normalized(segment.segment);result+=part;
    for (let index=0;index<part.length;index++) {starts.push(segment.index);ends.push(segment.index+segment.segment.length);}
  }
  return {text:result,starts,ends};
}
export function findKnownAliases(text: string, entities: readonly PrivacyEntity[]): AliasMatch[] {
  const input=mappedNormalize(text), byAlias=new Map<string,Set<string>>();
  for (const entity of entities) for (const raw of [entity.displayName,...entity.aliases||[]]) {
    const alias=normalized(raw).trim(); if (!alias) continue;
    const ids=byAlias.get(alias)||new Set<string>();ids.add(entity.id);byAlias.set(alias,ids);
  }
  const matches:Array<AliasMatch & {length:number}>=[];
  for (const [alias,ids] of [...byAlias].sort((a,b)=>b[0].length-a[0].length)) {
    let from=0,index:number;
    while ((index=input.text.indexOf(alias,from))>=0) {
      from=index+alias.length;
      const before=input.text[index-1]||'',after=input.text[index+alias.length]||'';
      if (/[\p{L}\p{N}_]/u.test(before) || /[\p{L}\p{N}_]/u.test(after)) continue;
      const start=input.starts[index]!,end=input.ends[index+alias.length-1]!;
      if (matches.some(item=>start<item.end&&end>item.start)) continue;
      matches.push({start,end,entityIds:[...ids],length:alias.length});
    }
  }
  return matches.sort((a,b)=>a.start-b.start).map(({start,end,entityIds})=>({start,end,entityIds}));
}
const vocabulary=new Set(normalized('a al algo antes ayer balance buscar busca buscarme cartera cliente clientes cobrado cobradas cobrados cobranza cobro cobros comercial comerciales como comparacion compara comparar comparado con contra cual cuales cuanto cuanta cuantos cuantas cuenta cuentas dame de del deuda deben debe disponible disponibilidad donde durante el ellas ellos empleados empleado empresa en entre equipo equipos es esta estan estado estas este esto estos euro euros evolucion facturacion facturado facturados facturada facturadas factura facturas fase fases fecha fin financiera financiero ganado ganadas ganados ganada generacion genera generar haz historial historico hoy importe impagado impagadas impagados informe informes inventario las la les lo los mes meses mi mis mostrar muestra muestrame minimo necesidad necesito nombre nombres nos nuestro nuestra nuevas nuevos nueva nuevo oportunidades oportunidad operacion operaciones orden ordenes o para pago pagos parcial parciales pasado pendientes pendiente pedido pedidos periodo periodos persona personas plantilla por propietario proxima proximas proximos propuesta propuestas proyecto proyectos primer primeros prioridad prioridades que quien quienes recibido recibidos reciente recientes resumen saldo saldos se semana semanas sin sobre son soporte stock tasa temporal ticket tickets tiempo tiene tienen todas todos total totales trimestre ultimo ultima ultimas ultimos una un unas unos valor vencido vencida vencidos vencidas vencimiento vencimientos venta ventas ver vendido vendido versus vez y yo EUR enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre desde hasta cualificado cualificados negociacion negociaciones abierta abiertas abierto abiertos cerrada cerradas cerrado cerrados perdida perdidas perdidos perdido capacidad bajo atrasado atrasados atrasadas retraso retrasado retrasados retrasadas').split(/\s+/));
export function assertStrictQuestion(question: string | undefined, entities: readonly PrivacyEntity[], allowedNumbers: readonly string[] = []): void {
  if (!question) return;
  if (question.length>12000 || /\[\[\s*BV_/iu.test(question)) throw new DomainError('PRIVACY_RESERVED_INPUT','Reformula la pregunta sin referencias reservadas.');
  if (/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b[A-Z]{2}\d{2}[A-Z0-9]{10,}\b|\+\d[\d\s().-]{7,})/iu.test(question)) throw new DomainError('PRIVACY_UNSUPPORTED_TEXT','Usa una consulta guiada y selecciona la cuenta sin incluir enlaces o datos de contacto.');
  const matches=findKnownAliases(question,entities);
  if (matches.some(item=>item.entityIds.length>1)) throw new DomainError('PRIVACY_AMBIGUOUS_REFERENCE','Hay nombres coincidentes. Selecciona una entidad antes de continuar.');
  let safe='',offset=0;
  for (const match of matches) {safe+=question.slice(offset,match.start)+' ';offset=match.end;}
  safe+=question.slice(offset);
  for (const literal of [...allowedNumbers].sort((a,b)=>b.length-a.length)) if (literal) safe=safe.split(literal).join(' ');
  const words=normalized(safe).match(/[\p{L}\p{N}_]+/gu)||[];
  if (words.some(word=>!vocabulary.has(word))) throw new DomainError('PRIVACY_UNSUPPORTED_TEXT','La salida externa admite consultas guiadas. Reformula o selecciona una entidad conocida.');
}

/** Validates schema-known structured input; unknown/nested fields are denied. */
export function auditStructuredFields(input:unknown, schema:Record<string,FieldRule|Record<string,unknown>>, depth=0): {allowed:number;blocked:number;tokenized:number} {
  if (depth>8 || !input || typeof input!=='object' || Array.isArray(input)) throw new DomainError('PRIVACY_SCHEMA_INVALID','El contenido estructurado no tiene un esquema permitido.');
  const result={allowed:0,blocked:0,tokenized:0};
  for (const [field,value] of Object.entries(input)) {
    const rule=schema[field];
    if (!rule) throw new DomainError('PRIVACY_FIELD_UNKNOWN','El contenido contiene un campo sin clasificar.');
    if ('action' in rule) {
      const action=rule.action;
      if (action==='BLOCK') throw new DomainError('PRIVACY_FIELD_BLOCKED','El contenido contiene datos no permitidos para salida externa.');
      if (action==='ALLOW' && value!==null && typeof value==='object') throw new DomainError('PRIVACY_FIELD_BLOCKED','Un campo permitido no puede ocultar un objeto sin esquema.');
      if (action==='ALLOW') result.allowed++; else if (action==='TOKENIZE') result.tokenized++; else result.blocked++;
    } else {
      const values=Array.isArray(value)?value:[value];
      if (values.length>1000) throw new DomainError('PRIVACY_INPUT_LIMIT','El contenido excede el límite permitido.');
      for (const item of values) {const nested=auditStructuredFields(item,rule as Record<string,FieldRule|Record<string,unknown>>,depth+1);result.allowed+=nested.allowed;result.blocked+=nested.blocked;result.tokenized+=nested.tokenized;}
    }
  }
  return result;
}
