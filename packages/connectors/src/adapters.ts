import { DomainError, type EntityKind } from '@birdview/contracts';
import { exactDecimalToMinor, importableFields, normalizeImportData } from './import.js';
import { readJson } from './transport.js';
import type { Connector,ConnectorContext,ConnectorManifest,NormalizedRecord,SyncPage,SyncRequest } from './types.js';

const noWrites={read:false,pagination:false,incremental:false,deletions:false,history:false,webhooks:false,sourceAcl:false,write:false} as const;
const manifest=(id:string,name:string,entities:EntityKind[],auth:ConnectorManifest['auth'],documentation:string[],limitation:string,status:ConnectorManifest['status']='documentation_required'):ConnectorManifest=>({id,name,version:'1.0.0',status,auth,entities,capabilities:{...noWrites},sensitiveFields:['identities','emails','phones','externalIds'],documentation,limitation});
const hubspotManifest:ConnectorManifest={
  ...manifest('hubspot','HubSpot',['accounts','contacts','employees','pipelines','stages','opportunities'],{type:'bearer',scopes:['crm.objects.companies.read','crm.objects.contacts.read','crm.objects.deals.read','crm.objects.owners.read','crm.schemas.deals.read'],note:'Token de una aplicación autorizada; este MVP no implementa el flujo OAuth/refresh. Permisos empresariales amplios requieren política local restrictiva.'},['https://developers.hubspot.com/docs/api-reference/crm-companies-v3/basic/get-crm-v3-objects-companies','https://www.npmjs.com/package/@hubspot/api-client/v/14.1.3'],'Rutas GET verificadas en el SDK oficial 14.1.3. Contratos HTTP con fixtures; sin validación de cuenta real. Escaneo paginado completo y archivos archivados; no historial anterior ni ACL por empleado. Eliminación de pipelines requiere futura reconciliación.','implemented_pending_account_validation'),
  capabilities:{read:true,pagination:true,incremental:false,deletions:true,history:false,webhooks:false,sourceAcl:false,write:false},
};
export const connectorCatalog:ConnectorManifest[]=[
  hubspotManifest,
  manifest('holded','Holded',['accounts','invoices','payments'],{type:'api_key',scopes:[],note:'El método y los endpoints vigentes requieren revisar documentación y plan. No se acepta una credencial para un transporte no validado.'},['https://www.holded.com/developers','https://developers.holded.com/reference/get-contacts'],'Documentación oficial bloqueada por CONNECT 403 en este entorno. Mapeo de fixtures y contrato preparados; transporte desactivado hasta verificar esquema, autenticación y cobros disponibles.'),
  manifest('factorial','Factorial',['employees','teams'],{type:'oauth',scopes:[],note:'Hay diferencias entre OAuth y credenciales de empresa; configuración pendiente de verificar. No importar salarios, salud o documentos.'},['https://apidoc.factorialhr.com/docs/authentication','https://apidoc.factorialhr.com/docs/faqs'],'Documentación oficial bloqueada por CONNECT 403. Mapeo mínimo de fixtures preparado; transporte y disponibilidad desactivados hasta verificar versión, scopes y endpoints.'),
  ...['Pipedrive','Zendesk','Gmail','Drive','Slides','Salesforce','SAP','Marketing','Industrial gateway'].map(name=>manifest(name.toLowerCase().replace(/\s+/g,'-'),name,[],{type:'none',scopes:[],note:'Requiere implementación y configuración.'},[],'Pendiente de integración. No realiza llamadas ni simula resultados.','pending_integration')),
];
const obj=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const arr=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const str=(value:unknown):string=>typeof value==='string'?value:typeof value==='number'?String(value):'';
const safeDate=(value:unknown):string|undefined=>{const s=str(value);if(/^\d{4}-\d{2}-\d{2}/.test(s)&&Number.isFinite(Date.parse(s)))return s.slice(0,10);if(/^\d{10,13}$/.test(s)){const n=Number(s);const d=new Date(s.length===10?n*1000:n);if(Number.isFinite(d.getTime()))return d.toISOString().slice(0,10);}return undefined;};
function compact(data:Record<string,unknown>):Record<string,unknown>{return Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined&&v!==''));}
function token(ctx:ConnectorContext):string {const value=ctx.secret?.token;if(typeof value!=='string'||value.length<8||value.length>8192||/[\r\n]/.test(value))throw new DomainError('CONNECTOR_SECRET','Credencial del conector no válida',400);return value;}
interface HubCursor {after?:string;archived:boolean;}
function decodeCursor(value?:string):HubCursor {
  if(!value)return {archived:false};
  try{if(value.length>2000)throw new Error();const result=JSON.parse(Buffer.from(value,'base64url').toString('utf8')) as HubCursor;if(typeof result.archived!=='boolean'||(result.after!==undefined&&(typeof result.after!=='string'||result.after.length>500))||Object.keys(result).some(k=>!['after','archived'].includes(k)))throw new Error();return result;}catch{throw new DomainError('CONNECTOR_CURSOR','Cursor no válido',400);}
}
const encodeCursor=(cursor:HubCursor)=>Buffer.from(JSON.stringify(cursor)).toString('base64url');
function companyReference(raw:Record<string,unknown>):string|undefined {const associations=obj(raw.associations);const companies=obj(associations.companies);return str(obj(arr(companies.results)[0]).id)||undefined;}
export function normalizeHubSpot(kind:EntityKind,payload:unknown):NormalizedRecord[] {
  const raw=obj(payload);const externalId=str(raw.id);if(!externalId)throw new DomainError('CONNECTOR_SCHEMA','Registro sin identificador',502);
  const updatedAt=str(raw.updatedAt||raw.updated_at)||undefined;
  if(raw.archived===true)return [{entityKind:kind,externalId,data:{},deleted:true,updatedAt}];
  const p=obj(raw.properties);let data:Record<string,unknown>;const references:NormalizedRecord['references']=[];
  if(kind==='accounts')data=compact({name:str(p.name)||`Empresa ${externalId}`,domain:str(p.domain)||undefined,aliases:[]});
  else if(kind==='contacts'){
    data=compact({name:[str(p.firstname),str(p.lastname)].filter(Boolean).join(' ')||'Contacto sin nombre',email:str(p.email)||undefined,phone:str(p.phone)||undefined});
    const company=companyReference(raw);if(company)references.push({field:'accountId',kind:'accounts',externalId:company});
  }else if(kind==='employees')data=compact({name:[str(raw.firstName),str(raw.lastName)].filter(Boolean).join(' ')||'Responsable sin nombre',email:str(raw.email),active:true});
  else if(kind==='pipelines')data={name:str(raw.label)||externalId,stageIds:[]};
  else if(kind==='stages'){
    const metadata=obj(raw.metadata);const probability=Number(metadata.probability);const closed=metadata.isClosed===true||metadata.isClosed==='true';
    const status=closed?(probability===1?'won':probability===0?'lost':'open'):'open';
    if(closed&&probability!==0&&probability!==1)throw new DomainError('CONNECTOR_SCHEMA','Una fase cerrada requiere correspondencia de ganado/perdido',502);
    data=compact({name:str(raw.label)||externalId,position:Number(raw.displayOrder)||0,probability:Number.isFinite(probability)?probability:undefined,status});
  }else if(kind==='opportunities'){
    const stage=str(p.dealstage);const company=companyReference(raw);
    if(!company)throw new DomainError('CONNECTOR_ASSOCIATION','La oportunidad requiere una empresa asociada y permiso de lectura',502);
    const status=p.hs_is_closed_won==='true'?'won':p.hs_is_closed==='true'?'lost':'open';
    data=compact({name:str(p.dealname)||externalId,valueMinor:exactDecimalToMinor(p.amount||'0'),currency:str(p.deal_currency_code)||'EUR',status,expectedCloseDate:safeDate(p.closedate),closedDate:status!=='open'?safeDate(p.closedate):undefined});
    references.push({field:'accountId',kind:'accounts',externalId:company});
    if(stage)references.push({field:'stageId',kind:'stages',externalId:stage});
    if(str(p.pipeline))references.push({field:'pipelineId',kind:'pipelines',externalId:str(p.pipeline)});
    if(str(p.hubspot_owner_id))references.push({field:'ownerId',kind:'employees',externalId:str(p.hubspot_owner_id)});
  }else throw new DomainError('CONNECTOR_ENTITY','Entidad no admitida por HubSpot',400);
  return [{entityKind:kind,externalId,data,updatedAt,...(references.length?{references}:{})}];
}
const properties:Partial<Record<EntityKind,string[]>>={accounts:['name','domain'],contacts:['firstname','lastname','email','phone'],opportunities:['dealname','amount','dealstage','pipeline','closedate','hubspot_owner_id','deal_currency_code','hs_is_closed_won','hs_is_closed']};
const objectNames:Partial<Record<EntityKind,string>>={accounts:'companies',contacts:'contacts',opportunities:'deals'};
class HubSpotConnector implements Connector {
  manifest=hubspotManifest;
  async testConnection(ctx:ConnectorContext){await this.syncPage(ctx,{entityKind:'accounts',limit:1});return {status:'reachable' as const,message:'Lectura de empresas verificada con la credencial; el resto depende de sus scopes.',verifiedAt:(ctx.now?.()||new Date()).toISOString()};}
  async discoverSchema(_ctx:ConnectorContext){return {provider:'hubspot',version:'crm-v3-sdk14.1.3',entities:this.manifest.entities.map(kind=>({kind,fields:importableFields(kind).filter(f=>!['externalId','departmentId'].includes(f))})),sourceAcl:'not_available' as const};}
  async syncPage(ctx:ConnectorContext,request:SyncRequest):Promise<SyncPage>{
    if(!this.manifest.entities.includes(request.entityKind))throw new DomainError('CONNECTOR_ENTITY','Entidad no admitida por HubSpot',400);
    const cursor=decodeCursor(request.cursor);const kind=request.entityKind;const pipeline=kind==='pipelines'||kind==='stages';
    const path=pipeline?'/crm/v3/pipelines/deals':kind==='employees'?'/crm/v3/owners/':`/crm/v3/objects/${objectNames[kind]}`;
    const url=new URL(path,'https://api.hubapi.com');
    if(!pipeline){url.searchParams.set('limit',String(Math.max(1,Math.min(100,request.limit||100))));url.searchParams.set('archived',String(cursor.archived));if(cursor.after)url.searchParams.set('after',cursor.after);}
    if(properties[kind])url.searchParams.set('properties',properties[kind]!.join(','));
    if(kind==='contacts'||kind==='opportunities')url.searchParams.set('associations','companies');
    const payload=obj(await readJson(ctx,url,{Authorization:`Bearer ${token(ctx)}`,Accept:'application/json'}));
    if(!Array.isArray(payload.results))throw new DomainError('CONNECTOR_SCHEMA','Formato de respuesta del proveedor no reconocido',502);
    const sourceRows=kind==='stages'?arr(payload.results).flatMap(p=>arr(obj(p).stages)):arr(payload.results);
    const records:NormalizedRecord[]=[];const warnings:string[]=[];
    for(const raw of sourceRows)try{records.push(...normalizeHubSpot(kind,raw));}catch{warnings.push('Un registro se omitió por esquema, importe o asociación incompletos; revisa la calidad y los permisos del origen.');}
    const after=str(obj(obj(payload.paging).next).after);
    const nextCursor=pipeline?undefined:after?encodeCursor({after,archived:cursor.archived}):!cursor.archived?encodeCursor({archived:true}):undefined;
    if(request.since)warnings.push('Este adaptador realiza un escaneo completo paginado; la fecha de última sincronización no implica histórico disponible.');
    return {records,nextCursor,hasMore:Boolean(nextCursor),warnings:[...new Set(warnings)]};
  }
}
class UnavailableConnector implements Connector {
  constructor(public manifest:ConnectorManifest){}
  async testConnection(ctx:ConnectorContext){return {status:'unavailable' as const,message:this.manifest.limitation,verifiedAt:(ctx.now?.()||new Date()).toISOString()};}
  async discoverSchema(_ctx:ConnectorContext){return {provider:this.manifest.id,version:'contract-only',entities:this.manifest.entities.map(kind=>({kind,fields:importableFields(kind)})),sourceAcl:'not_available' as const};}
  async syncPage(_ctx:ConnectorContext,_request:SyncRequest):Promise<SyncPage>{throw new DomainError('CONNECTOR_NOT_AVAILABLE',this.manifest.limitation,503);}
}
const hubspot=new HubSpotConnector();
export function getConnector(provider:string):Connector {const m=connectorCatalog.find(row=>row.id===provider);if(!m)throw new DomainError('CONNECTOR_UNKNOWN','Conector no encontrado',404);return provider==='hubspot'?hubspot:new UnavailableConnector(m);}

/** Explicit local fixture mappings, not evidence of a live provider contract. */
export function normalizeHoldedFixture(kind:'accounts'|'invoices'|'payments',payload:unknown):Record<string,unknown> {
  const r=obj(payload);
  if(kind==='accounts')return normalizeImportData(kind,compact({name:r.name,taxId:r.code,email:r.email,aliases:[]}));
  if(kind==='invoices')return normalizeImportData(kind,compact({number:r.number,accountId:r.accountId,totalMinor:r.totalMinor,paidMinor:r.paidMinor||0,creditMinor:r.creditMinor||0,currency:r.currency||'EUR',issuedDate:r.issuedDate,dueDate:r.dueDate,status:r.status||'open'}));
  return normalizeImportData(kind,compact({invoiceId:r.invoiceId,accountId:r.accountId,amountMinor:r.amountMinor,currency:r.currency||'EUR',paidDate:r.paidDate}));
}
export function normalizeFactorialFixture(kind:'employees'|'teams',payload:unknown):Record<string,unknown> {
  const r=obj(payload);return kind==='teams'?normalizeImportData(kind,{name:r.name}):normalizeImportData(kind,compact({name:r.full_name||[r.first_name,r.last_name].filter(Boolean).join(' '),email:r.email,teamId:r.teamId,active:r.active??true,availabilityPercent:100}));
}
