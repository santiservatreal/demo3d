import { z } from 'zod';
import { DomainError, type EntityKind, type RequestContext, type TenantStore } from '@birdview/contracts';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 10_000;
const MAX_COLUMNS = 64;
const MAX_ERRORS = 200;
const text = z.string().trim().min(1).max(4000).refine(s => !s.includes('\0'), 'Texto no válido');
const short = text.max(250);
const id = short.regex(/^[a-zA-Z0-9_:.@/-]+$/);
const minor = z.number().int().safe().min(0);
const currency = z.string().regex(/^[A-Z]{3}$/);
const date = z.string().date();
const timestamp = z.string().datetime({offset:true});
const optionalText = short.optional();
const schemas:Partial<Record<EntityKind,z.ZodType<Record<string,unknown>>>> = {
  accounts:z.object({name:short,taxId:optionalText,email:z.email().optional(),domain:optionalText,aliases:z.array(short).max(20).default([])}).strict(),
  contacts:z.object({name:short,email:z.email().optional(),phone:optionalText,accountId:id.optional()}).strict(),
  employees:z.object({name:short,email:z.email(),teamId:id.optional(),active:z.boolean().default(true),availabilityPercent:z.number().min(0).max(100).optional()}).strict(),
  teams:z.object({name:short}).strict(),
  opportunities:z.object({name:short,accountId:id,ownerId:id.optional(),pipelineId:id.optional(),stageId:id.optional(),valueMinor:minor,currency:currency.default('EUR'),status:z.enum(['open','won','lost']).default('open'),probability:z.number().min(0).max(1).optional(),expectedCloseDate:date.optional(),closedDate:date.optional()}).strict(),
  pipelines:z.object({name:short,stageIds:z.array(id).max(50).default([])}).strict(),
  stages:z.object({name:short,position:z.number().int().min(0).max(100),probability:z.number().min(0).max(1).optional(),status:z.enum(['open','won','lost']).default('open')}).strict(),
  invoices:z.object({number:short,accountId:id,totalMinor:minor,paidMinor:minor.default(0),creditMinor:minor.default(0),currency:currency.default('EUR'),issuedDate:date,dueDate:date,status:z.enum(['open','paid','void','credited']).default('open')}).strict().superRefine((v,ctx)=>{
    if(v.paidMinor+v.creditMinor>v.totalMinor)ctx.addIssue({code:'custom',path:['paidMinor'],message:'Pagos y abonos superan el total'});
    if(v.status==='paid'&&v.paidMinor+v.creditMinor!==v.totalMinor)ctx.addIssue({code:'custom',path:['status'],message:'Una factura pagada debe tener saldo cero'});
  }),
  payments:z.object({invoiceId:id,accountId:id.optional(),amountMinor:minor,currency:currency.default('EUR'),paidDate:date}).strict(),
  tickets:z.object({subject:short,description:text.optional(),accountId:id.optional(),priority:z.enum(['low','normal','high','urgent']).default('normal'),status:z.enum(['open','pending','closed']).default('open'),openedDate:date}).strict(),
  products:z.object({name:short,sku:short,stock:z.number().int().min(0),minimumStock:z.number().int().min(0)}).strict(),
  inventory_movements:z.object({productId:id,delta:z.number().int().safe(),occurredAt:timestamp}).strict(),
  orders:z.object({accountId:id,productId:id.optional(),quantity:z.number().int().positive(),status:z.enum(['pending','production','packed','stored','in_transit','delivered','cancelled']).default('pending'),expectedDate:date,deliveredDate:date.optional(),valueMinor:minor.optional(),currency:currency.default('EUR')}).strict(),
  projects:z.object({name:short,accountId:id.optional(),status:z.enum(['planned','active','completed','cancelled']).default('active')}).strict(),
};
const fields:Record<string,string[]> = {
  accounts:['name','taxId','email','domain','aliases'],contacts:['name','email','phone','accountId'],employees:['name','email','teamId','active','availabilityPercent'],teams:['name'],
  opportunities:['name','accountId','ownerId','pipelineId','stageId','valueMinor','currency','status','probability','expectedCloseDate','closedDate'],pipelines:['name','stageIds'],stages:['name','position','probability','status'],
  invoices:['number','accountId','totalMinor','paidMinor','creditMinor','currency','issuedDate','dueDate','status'],payments:['invoiceId','accountId','amountMinor','currency','paidDate'],tickets:['subject','description','accountId','priority','status','openedDate'],
  products:['name','sku','stock','minimumStock'],inventory_movements:['productId','delta','occurredAt'],orders:['accountId','productId','quantity','status','expectedDate','deliveredDate','valueMinor','currency'],projects:['name','accountId','status'],
};
const numeric = new Set(['valueMinor','totalMinor','paidMinor','creditMinor','amountMinor','availabilityPercent','probability','position','stock','minimumStock','delta','quantity']);
const arrayFields = new Set(['aliases','stageIds']);
const reserved = new Set(['__proto__','prototype','constructor']);
const sensitive = /salary|salario|nomina|n[oó]mina|payroll|medical|health|salud|diagnos|iban|bankaccount|ssn|socialsecurity|password|secret|apikey|access.token/i;
export interface ImportMappingRule {target:string;transform?:'identity'|'trim'|'decimal_to_minor';}
export interface ImportRequest {format:'csv'|'json';content:string;entityKind:EntityKind;mapping?:Record<string,string|ImportMappingRule>;connectionId?:string;skipInvalid?:boolean;}
export interface ImportIssue {row:number;column?:string;code:string;message:string;}
export interface ImportRow {row:number;externalId:string;departmentId?:string;data:Record<string,unknown>;}
export interface ImportPreview {entityKind:EntityKind;columns:string[];rows:ImportRow[];errors:ImportIssue[];excludedColumns:string[];validCount:number;invalidCount:number;errorsTruncated:boolean;}
export interface ImportCommitResult {created:number;updated:number;unchanged:number;invalid:number;errors:ImportIssue[];connectionId:string;}

function fail(code:string,message:string):never {throw new DomainError(code,message,400);}
function fold(s:string):string {return s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'');}
export function exactDecimalToMinor(value:unknown):number {
  const input=String(value).trim();
  if(!/^-?\d+(?:[.,]\d{1,2})?$/.test(input))return fail('IMPORT_MONEY','El importe decimal debe tener como máximo dos decimales, sin separadores de miles');
  const negative=input.startsWith('-');const [whole,fraction='']=input.replace('-','').split(/[.,]/);
  const result=BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0'));
  if(result>BigInt(Number.MAX_SAFE_INTEGER))return fail('IMPORT_MONEY','Importe fuera de rango');
  return Number(negative?-result:result);
}
function selectDelimiter(content:string):string {
  let quoted=false;const totals=new Map([[',',0],[';',0],['\t',0]]);
  for(let i=0;i<content.length;i++){const c=content[i]!;if(c==='"'){if(quoted&&content[i+1]==='"'){i++;continue;}quoted=!quoted;}else if(!quoted&&(c==='\n'||c==='\r'))break;else if(!quoted&&totals.has(c))totals.set(c,totals.get(c)!+1);}
  return [...totals.entries()].sort((a,b)=>b[1]-a[1])[0]![0];
}
export function parseCsv(content:string):string[][] {
  const input=content.replace(/^\uFEFF/,'');const delimiter=selectDelimiter(input);const rows:string[][]=[];let row:string[]=[];let cell='';let quoted=false;let closed=false;
  const pushCell=()=>{row.push(cell);cell='';closed=false;if(row.length>MAX_COLUMNS)fail('IMPORT_COLUMNS','Demasiadas columnas');};
  const pushRow=()=>{pushCell();if(row.some(v=>v.trim()!==''))rows.push(row);row=[];if(rows.length>MAX_IMPORT_ROWS+1)fail('IMPORT_ROWS','Máximo 10.000 filas por importación');};
  for(let i=0;i<input.length;i++){
    const c=input[i]!;
    if(quoted){if(c==='"'){if(input[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
    else if(c==='"'){if(cell.length||closed)fail('IMPORT_CSV','Comillas fuera de posición');quoted=true;}
    else if(c===delimiter)pushCell();
    else if(c==='\n'||c==='\r'){if(c==='\r'&&input[i+1]==='\n')i++;pushRow();}
    else {if(closed&&!/\s/.test(c))fail('IMPORT_CSV','Contenido después de cerrar comillas');if(!closed)cell+=c;}
    if(cell.length>16000)fail('IMPORT_CELL','Una celda supera el tamaño permitido');
  }
  if(quoted)fail('IMPORT_CSV','Comillas sin cerrar');
  if(cell.length||row.length||closed)pushRow();
  return rows;
}
function inputRows(request:ImportRequest):{columns:string[];rows:Record<string,unknown>[]} {
  if(typeof request.content!=='string'||new TextEncoder().encode(request.content).byteLength>MAX_IMPORT_BYTES)fail('IMPORT_SIZE','Máximo 5 MiB por importación');
  if(request.content.includes('\0'))fail('IMPORT_CONTENT','El archivo contiene bytes no permitidos');
  if(request.format==='csv'){
    const parsed=parseCsv(request.content);if(!parsed.length)fail('IMPORT_EMPTY','El archivo está vacío');
    const columns=parsed[0]!.map(v=>v.trim());
    if(columns.some(v=>!v)||new Set(columns).size!==columns.length||columns.some(v=>reserved.has(v)))fail('IMPORT_HEADER','Cabeceras vacías, repetidas o no permitidas');
    const rows=parsed.slice(1).map(values=>{if(values.length!==columns.length)return Object.assign(Object.create(null),{'__row_error':'Número de columnas distinto de la cabecera'});const r:Record<string,unknown>=Object.create(null);columns.forEach((column,i)=>r[column]=values[i]);return r;});
    return {columns,rows};
  }
  if(request.format!=='json')return fail('IMPORT_FORMAT','Formato permitido: CSV o JSON');
  let parsed:unknown;try{parsed=JSON.parse(request.content);}catch{return fail('IMPORT_JSON','JSON no válido');}
  if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&Object.keys(parsed).length===1&&'records' in parsed)parsed=(parsed as {records:unknown}).records;
  if(!Array.isArray(parsed))fail('IMPORT_JSON','Se espera una lista de objetos');
  if(parsed.length>MAX_IMPORT_ROWS)fail('IMPORT_ROWS','Máximo 10.000 filas por importación');
  const columns=new Set<string>();
  for(const row of parsed){if(!row||typeof row!=='object'||Array.isArray(row))fail('IMPORT_JSON','Cada fila debe ser un objeto');for(const key of Object.keys(row)){if(reserved.has(key))fail('IMPORT_FIELD','Propiedad reservada no permitida');columns.add(key);}}
  if(columns.size>MAX_COLUMNS)fail('IMPORT_COLUMNS','Demasiadas columnas');
  return {columns:[...columns],rows:parsed as Record<string,unknown>[]};
}
function coerce(field:string,value:unknown,transform:string):unknown {
  if(typeof value==='string')value=value.normalize('NFC').trim();
  if(value==='')return undefined;
  if(transform==='decimal_to_minor')return exactDecimalToMinor(value);
  if(numeric.has(field)){
    if(typeof value==='string'&&!/^-?\d+(?:\.\d+)?$/.test(value))throw new Error('Número no válido');
    const n=typeof value==='number'?value:Number(value);if(!Number.isFinite(n))throw new Error('Número no válido');return n;
  }
  if(field==='active'){if(value===true||value==='true'||value==='1'||value===1)return true;if(value===false||value==='false'||value==='0'||value===0)return false;throw new Error('Booleano no válido');}
  if(arrayFields.has(field)){if(Array.isArray(value))return value;if(typeof value==='string')return value.split('|').map(v=>v.trim()).filter(Boolean);}
  if(typeof value==='string'&&/^[=+@]/.test(value))throw new Error('No se admiten fórmulas en campos de texto');
  return value;
}
function stableExternalId(kind:EntityKind,data:Record<string,unknown>,explicit:unknown):string {
  if(typeof explicit==='string'&&explicit.trim()){if(explicit.length>200)throw new Error('Identificador externo demasiado largo');return explicit.trim();}
  const natural=kind==='accounts'?data.taxId:kind==='contacts'||kind==='employees'?data.email:kind==='invoices'?data.number:kind==='products'?data.sku:undefined;
  if(typeof natural==='string'&&natural)return `key:${natural.toLocaleLowerCase('en')}`;
  throw new Error('Se necesita externalId; no se fusionan registros por nombre');
}
export function importableFields(kind:EntityKind):string[]{return [...(fields[kind]||[]),'externalId','departmentId'];}
export function normalizeImportData(kind:EntityKind,data:Record<string,unknown>):Record<string,unknown> {
  const schema=schemas[kind];if(!schema)fail('IMPORT_KIND','Esta entidad no se puede importar');
  return schema.parse(data);
}
export function importPreview(request:ImportRequest):ImportPreview {
  const schema=schemas[request.entityKind];if(!schema)fail('IMPORT_KIND','Esta entidad no se puede importar');
  const {columns,rows}=inputRows(request);const allowed=new Set(importableFields(request.entityKind));
  const mapping=request.mapping&&Object.keys(request.mapping).length?request.mapping:undefined;const rules:Record<string,ImportMappingRule>=Object.create(null);
  if(mapping){if(typeof mapping!=='object'||Array.isArray(mapping)||Object.keys(mapping).length>MAX_COLUMNS)fail('IMPORT_MAPPING','Mapeo no válido');for(const [from,rule] of Object.entries(mapping)){
    if(!columns.includes(from)||reserved.has(from))fail('IMPORT_MAPPING','Columna de origen no válida');
    const r=typeof rule==='string'?{target:rule,transform:'identity' as const}:rule;
    if(!r||typeof r!=='object'||!allowed.has(r.target)||!['identity','trim','decimal_to_minor'].includes(r.transform||'identity')||Object.keys(r).some(k=>!['target','transform'].includes(k)))fail('IMPORT_MAPPING','Destino o transformación no permitidos');
    if(sensitive.test(fold(from)))fail('IMPORT_SENSITIVE','Los campos sensibles no se pueden importar');
    rules[from]={target:r.target,transform:r.transform||'identity'};
  }}else for(const column of columns){if(!allowed.has(column))fail(sensitive.test(fold(column))?'IMPORT_SENSITIVE':'IMPORT_FIELD','Hay columnas sin clasificación; utiliza un mapeo explícito');rules[column]={target:column,transform:'identity'};}
  const targets=Object.values(rules).map(r=>r.target);if(new Set(targets).size!==targets.length)fail('IMPORT_MAPPING','Dos columnas no pueden escribir el mismo campo');
  const errors:ImportIssue[]=[];const valid:ImportRow[]=[];let invalidCount=0;const seen=new Set<string>();
  const issue=(row:number,column:string|undefined,code:string,message:string)=>{if(errors.length<MAX_ERRORS)errors.push({row,...(column?{column}:{}),code,message});};
  rows.forEach((row,index)=>{
    const number=index+2;let invalid=false;const candidate:Record<string,unknown>=Object.create(null);let external:unknown;let departmentId:string|undefined;
    if('__row_error' in row){issue(number,undefined,'columns','Número de columnas distinto de la cabecera');invalidCount++;return;}
    for(const [from,rule] of Object.entries(rules))try{const value=coerce(rule.target,row[from],rule.transform||'identity');if(value===undefined)continue;if(rule.target==='externalId')external=value;else if(rule.target==='departmentId'){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(value))throw new Error();departmentId=value;}else candidate[rule.target]=value;}catch{invalid=true;issue(number,from,'value','Valor o transformación no válidos');}
    const parsed=schema.safeParse(candidate);
    if(!parsed.success){invalid=true;for(const error of parsed.error.issues)issue(number,String(error.path[0]||''),'validation',error.code==='unrecognized_keys'?'Campo no permitido':'Valor requerido o no válido');}
    let externalId='';if(parsed.success)try{externalId=stableExternalId(request.entityKind,parsed.data,external);if(seen.has(externalId))throw new Error();seen.add(externalId);}catch{invalid=true;issue(number,'externalId','identity','Falta un identificador estable o está repetido');}
    if(invalid||!parsed.success){invalidCount++;return;}valid.push({row:number,externalId,...(departmentId?{departmentId}:{}),data:parsed.data});
  });
  return {entityKind:request.entityKind,columns,rows:valid,errors,excludedColumns:columns.filter(c=>!Object.hasOwn(rules,c)),validCount:valid.length,invalidCount,errorsTruncated:errors.length===MAX_ERRORS};
}
