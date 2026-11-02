import { answerSchema,DomainError,type AnswerBlock,type Bootstrap,type Entity,type EntityKind,type EntityMeta,type ListOptions,type RequestContext,type TenantStore,type QueryFilters,type QueryIntent } from '@birdview/contracts';
import { analyze,getBriefing,getCityView,reportSnapshot,type ReportSnapshot } from '@birdview/analytics';
import { createDemoEntities } from '@birdview/fixtures/dataset';
import { importPreview,type ImportRequest } from '@birdview/connectors/validation';
import { renderReportHtml,renderReportCsvText,renderPresentationHtml,renderChartSvgText } from '@birdview/reporting/render';
import { ApiError,type DemoTransport } from '../api';
import type { DemoPersistence,DemoState } from './persistence';

const user={id:'browser-demo-owner',name:'Alex Demo',email:'demo@example.com'};
const collections:Record<string,EntityKind>={knowledge:'knowledge_items',tasks:'tasks',routines:'routines',reports:'report_runs',presentations:'presentation_documents',studio:'media_jobs',approvals:'action_proposals',conversations:'conversations',connections:'connections','api-keys':'api_keys','published-queries':'published_queries'};
const context=(state:DemoState):RequestContext=>({userId:user.id,organizationId:state.organizationId,role:'owner',departmentIds:['*'],permissions:['*'],authorizationVersion:1,principalType:'user'});
const fixtureKey=(value:string)=>`browser-${value.replace(/[^a-zA-Z0-9_-]/g,'-')}`;
export function initialDemoState(now=new Date()):DemoState{
 const organizations=[{id:'brisa-browser-demo',name:'Brisa Servicios Demo',template:'services',currency:'EUR',timezone:'Europe/Madrid',modules:['sales','finance','people','support'],demo:true},{id:'norte-browser-demo',name:'Norte Industrial Demo',template:'industrial',currency:'EUR',timezone:'Europe/Madrid',modules:['sales','finance','people','support','operations','inventory','logistics'],demo:true}];
 return{schemaVersion:1,revision:0,organizationId:organizations[0].id,signedIn:true,organizations,entities:organizations.flatMap(o=>createDemoEntities(o,user.id,now,fixtureKey)),artifacts:{}};
}
class BrowserStore implements TenantStore{
 constructor(readonly state:DemoState,readonly ctx:RequestContext){}
 async list<T extends Record<string,unknown>=Record<string,unknown>>(kind:EntityKind,options:ListOptions={}){
  let rows=this.state.entities.filter(r=>r.organizationId===this.ctx.organizationId&&r.kind===kind&&(!options.departmentId||r.departmentId===options.departmentId)&&(!options.ownerId||r.ownerId===options.ownerId));
  if(options.search){const q=options.search.toLocaleLowerCase('es');rows=rows.filter(r=>[r.data.title,r.data.name,r.data.subject].some(v=>typeof v==='string'&&v.toLocaleLowerCase('es').includes(q)));}
  rows=rows.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));if(options.newestFirst)rows.reverse();return structuredClone(rows.slice(options.offset||0,(options.offset||0)+(options.limit||200))) as Entity<T>[];
 }
 async get<T extends Record<string,unknown>=Record<string,unknown>>(kind:EntityKind,id:string){return structuredClone(this.state.entities.find(r=>r.kind===kind&&r.id===id&&r.organizationId===this.ctx.organizationId)||null) as Entity<T>|null;}
 async create<T extends Record<string,unknown>=Record<string,unknown>>(kind:EntityKind,data:T,meta:EntityMeta={}){
  const stamp=new Date().toISOString(),row:Entity<T>={id:meta.id||crypto.randomUUID(),organizationId:this.ctx.organizationId,kind,departmentId:meta.departmentId||null,ownerId:user.id,classification:'internal',version:1,createdAt:stamp,updatedAt:stamp,data:structuredClone(data)};
  if(this.state.entities.some(r=>r.organizationId===row.organizationId&&r.kind===kind&&r.id===row.id))throw new ApiError('El registro ya existe en esta prueba.',409,'CONFLICT');this.state.entities.push(row);return structuredClone(row);
 }
 async update<T extends Record<string,unknown>=Record<string,unknown>>(kind:EntityKind,id:string,patch:Partial<T>,expectedVersion?:number){const index=this.state.entities.findIndex(r=>r.kind===kind&&r.id===id&&r.organizationId===this.ctx.organizationId);if(index<0)throw new ApiError('Registro local no disponible.',404,'NOT_FOUND');const row=this.state.entities[index];if(expectedVersion!==undefined&&row.version!==expectedVersion)throw new ApiError('El registro ha cambiado. Actualiza la prueba.',409,'VERSION_CONFLICT');const updated={...row,data:{...row.data,...structuredClone(patch)},version:row.version+1,updatedAt:new Date().toISOString()};this.state.entities[index]=updated;return structuredClone(updated) as Entity<T>;}
 async remove(kind:EntityKind,id:string){if(!await this.get(kind,id))throw new ApiError('Registro local no disponible.',404,'NOT_FOUND');this.state.entities=this.state.entities.filter(r=>!(r.kind===kind&&r.id===id&&r.organizationId===this.ctx.organizationId));}
 async forgetKnowledge(id:string){if(!await this.get('knowledge_items',id))throw new ApiError('Registro local no disponible.',404,'NOT_FOUND');this.state.entities=this.state.entities.filter(r=>!(r.organizationId===this.ctx.organizationId&&r.kind==='knowledge_versions'&&r.data.knowledgeItemId===id));return this.update('knowledge_items',id,{title:'Contenido olvidado',content:'',status:'forgotten'});}
 async audit(){/* Browser tests have no server audit log or authorization claims. */}
}
const required=(row:Entity|null)=>{if(!row)throw new ApiError('Registro de prueba no disponible.',404,'NOT_FOUND');return row;};
const text=(v:unknown,fallback='')=>typeof v==='string'?v:fallback;
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))return{};return v as Record<string,unknown>;}
const unavailable=():never=>{throw new ApiError('Esta función necesita el servidor. La demo gratuita permite probar datos ficticios, sin conexiones ni usuarios reales.',409,'SERVER_REQUIRED');};
async function stableId(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return 'local-'+Array.from(new Uint8Array(bytes)).map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,40);}

export async function createBrowserDemo(persistence:DemoPersistence):Promise<DemoTransport>{
 let state=await persistence.read();if(!state){state=initialDemoState();await persistence.write(state,null);}
 let serial:Promise<unknown>=Promise.resolve();
 async function storeArtifact(s:DemoState,store:BrowserStore,run:Entity,snapshot:ReportSnapshot,presentation?:Entity){
  const format=text(run.data.format,'pdf'),slides=Array.isArray(presentation?.data.slides)?presentation!.data.slides as Array<{title:string;text:string}>:undefined;
  let bytes:BlobPart,mime:string;
  if(format==='html'){bytes=slides?renderPresentationHtml({title:text(presentation?.data.title),slides},{browserDemo:true,organizationName:'Demo local · Datos ficticios'}):renderReportHtml(snapshot,{browserDemo:true,organizationName:'Demo local · Datos ficticios'});mime='text/html;charset=utf-8';}
  else if(format==='csv'){bytes=renderReportCsvText(snapshot).replace('\uFEFF','\uFEFF"Demo local de pruebas · Datos ficticios"\r\n');mime='text/csv;charset=utf-8';}
  else if(format==='json'){bytes=JSON.stringify({mode:'browser_demo',exportedAt:new Date().toISOString(),organization:s.organizations.find(o=>o.id===s.organizationId),entities:s.entities.filter(r=>r.organizationId===s.organizationId)},null,2);mime='application/json';}
  else{const pdf=await import('./pdf');bytes=new Uint8Array(await pdf.renderBrowserPdf(snapshot,slides)).buffer;mime='application/pdf';}
  const id=`artifact-${run.id}`,filename=`birdview-demo-${run.id.slice(0,8)}.${format}`;s.artifacts[id]={blob:new Blob([bytes],{type:mime}),filename};
  await store.create('artifacts',{filename,mimeType:mime,storageBackend:'browser_demo',reportRunId:run.id},{id});return store.update('report_runs',run.id,{status:'ready',artifactId:id,completedAt:new Date().toISOString(),mode:'browser_demo'});
 }
 async function report(s:DemoState,store:BrowserStore,body:Record<string,unknown>,presentation?:Entity){const org=s.organizations.find(o=>o.id===s.organizationId)!;const run=await store.create('report_runs',{...body,status:'generating',mode:'browser_demo'});const snapshot=await reportSnapshot(store,context(s),text(body.template,'executive'),body.filters as QueryFilters,org);return storeArtifact(s,store,run,snapshot,presentation);}
 async function handle(s:DemoState,path:string,options:{method?:string;body?:unknown}){
  const url=new URL(path.startsWith('/api/')?path:`/api/v1${path}`,'https://browser-demo.invalid'),route=decodeURIComponent(url.pathname),method=options.method||'GET',body=object(options.body),ctx=context(s),store=new BrowserStore(s,ctx),org=s.organizations.find(o=>o.id===s.organizationId)!;
  if(route==='/api/v1/config')return{demoEnabled:true,signupEnabled:false,version:'browser-demo-1',mode:'browser_demo'};
  if(route==='/api/v1/auth/demo'&&method==='POST'){s.signedIn=true;return{ok:true};}
  if(route==='/api/auth/sign-out'){s.signedIn=false;return{ok:true};}
  if(route.startsWith('/api/auth/'))return unavailable();
  if(!s.signedIn)throw new ApiError('Entra en la demo de pruebas.',401,'UNAUTHENTICATED');
  if(route==='/api/v1/session')return{user,organization:org,organizations:s.organizations,context:ctx,csrfToken:'browser-demo-no-server-session'} satisfies Bootstrap;
  if(route==='/api/v1/organizations/select'&&method==='POST'){if(!s.organizations.some(o=>o.id===body.organizationId))throw new ApiError('Empresa de prueba no disponible.',404,'NOT_FOUND');s.organizationId=String(body.organizationId);return handle(s,'/session',{});}
  if(route==='/api/v1/briefing')return getBriefing(store,ctx,undefined,org);
  if(route==='/api/v1/city')return getCityView(store,ctx,undefined,org);
  if(route==='/api/v1/metrics')return analyze(store,ctx,{intent:'executive',organization:org});
  if(route==='/api/v1/ai/budget')return{limitMinor:0,spentMinor:0,reservedMinor:0,currency:'EUR',mode:'browser_demo'};
  if(route==='/api/v1/ai/providers'&&method==='GET')return{items:[]};
  if(route.startsWith('/api/v1/ai/')||route.startsWith('/api/v1/published-queries')||route.startsWith('/api/v1/api-keys')){if(method==='GET')return{items:[]};return unavailable();}
  if(route==='/api/v1/privacy'){if(method!=='GET')return unavailable();return{mode:'browser_demo',storage:'Este navegador',externalAI:false,serverAuthorization:false,policy:{status:'server_required'}};}
  if(route==='/api/v1/members'){if(method!=='GET')return unavailable();return{items:[{id:user.id,data:{name:user.name,email:user.email,role:'owner',status:'active',departmentIds:['*']}}]};}
  if(route.startsWith('/api/v1/members/'))return unavailable();
  if(route==='/api/v1/activity')return{items:[]};
  if(route==='/api/v1/connections'&&method==='GET')return{items:await store.list('connections'),catalog:[]};
  if(route.startsWith('/api/v1/connections')&&method!=='GET')return unavailable();
  if(route.startsWith('/api/v1/sources/')){const[, , , ,kind,id]=route.split('/');const row=required(await store.get(kind as EntityKind,id));if(row.data.status==='forgotten')throw new ApiError('Fuente local no disponible.',404,'NOT_FOUND');return{id:`${kind}/${id}`,provider:'browser_demo',entityKind:kind,fields:row.data,observedAt:row.updatedAt};}
  if(route.startsWith('/api/v1/entities/')){const kind=route.split('/')[4] as EntityKind;return{items:await store.list(kind,{limit:Number(url.searchParams.get('limit')||50),offset:Number(url.searchParams.get('offset')||0)})};}
  if(route==='/api/v1/imports/preview')return importPreview(body as unknown as ImportRequest);
  if(route==='/api/v1/imports/commit'){
   const input=body as unknown as ImportRequest,preview=importPreview(input);if(preview.invalidCount)throw new ApiError('Revisa las filas no válidas antes de importar.',400,'IMPORT_INVALID_ROWS');
   const connectionId=`local-file-${input.entityKind}`;if(!await store.get('connections',connectionId))await store.create('connections',{name:'Importación local de prueba',provider:'file',status:'active',mode:'browser_demo'},{id:connectionId});
   let created=0,updated=0,unchanged=0;for(const row of preview.rows){const id=await stableId(`${ctx.organizationId}/${connectionId}/${row.externalId}`),old=await store.get(input.entityKind,id),data={...row.data,source:{provider:'browser_demo',externalId:row.externalId,observedAt:new Date().toISOString()}};
    if(old){const{source,...previous}=old.data;if(JSON.stringify(Object.entries(previous).sort())===JSON.stringify(Object.entries(row.data).sort()))unchanged++;else{await store.update(input.entityKind,id,data,old.version);updated++;}}
    else{await store.create(input.entityKind,data,{id,departmentId:row.departmentId||({accounts:'sales',contacts:'sales',opportunities:'sales',invoices:'finance',payments:'finance',employees:'people',teams:'people',products:'inventory',orders:'operations'} as Record<string,string>)[input.entityKind]});created++;}}
   return{created,updated,unchanged,invalid:0,connectionId};
  }
  const messages=route.match(/^\/api\/v1\/conversations\/([^/]+)\/messages$/);
  if(messages){const id=messages[1];required(await store.get('conversations',id));if(method==='GET')return{items:(await store.list('messages',{limit:1000})).filter(r=>r.data.conversationId===id)};
   const question=text(body.content).trim();if(!question)throw new ApiError('Escribe una pregunta para probar.',400,'VALIDATION');const queryId=crypto.randomUUID();await store.create('messages',{conversationId:id,queryId,role:'user',content:question,status:'ready'});
   let accountId:string|undefined,selected:Entity|undefined,intent:QueryIntent|undefined;
   if(typeof body.contextEntityId==='string'){
    const intents:Partial<Record<EntityKind,QueryIntent>>={accounts:'account',opportunities:'account',invoices:'receivables',teams:'team',employees:'team',tickets:'tickets',products:'inventory',orders:'orders'};
    for(const[kind,selectionIntent]of Object.entries(intents)){const row=await store.get(kind as EntityKind,body.contextEntityId);if(row){selected=row;intent=selectionIntent;accountId=kind==='accounts'?row.id:typeof row.data.accountId==='string'?row.data.accountId:undefined;break;}}
    if(!selected)throw new ApiError('El elemento seleccionado no está disponible en esta empresa de prueba.',404,'NOT_FOUND');
   }
   const result=await analyze(store,ctx,{question,organization:org,filters:body.filters as QueryFilters,...(accountId?{accountId}:{}),...(intent?{intent}:{})});
   if(selected){const fields=['name','number','subject','status','sku','stock','minimumStock','quantity','totalMinor','paidMinor','creditMinor','valueMinor','currency','dueDate','expectedDate'].filter(key=>selected!.data[key]!==undefined),evidence={id:`${selected.kind}/${selected.id}`,provider:'browser_demo',entityKind:selected.kind,entityId:selected.id,fields,observedAt:selected.updatedAt,label:'Elemento seleccionado'};if(!result.evidence.some(e=>e.id===evidence.id))result.evidence.push(evidence);const detail:AnswerBlock={type:'table',title:'Elemento seleccionado',columns:[{key:'field',label:'Campo'},{key:'value',label:'Valor registrado'}],rows:fields.map(key=>({field:key,value:typeof selected!.data[key]==='number'&&key.endsWith('Minor')?new Intl.NumberFormat('es-ES',{style:'currency',currency:String(selected!.data.currency||org.currency)}).format(Number(selected!.data[key])/100):String(selected!.data[key])}))};result.blocks.push(detail,{type:'sourceList',sources:[{id:evidence.id,label:evidence.label,provider:evidence.provider,observedAt:evidence.observedAt}]});}
   if(result.intent==='report'){const run=await report(s,store,{template:'executive',format:/csv/i.test(question)?'csv':'pdf'});result.blocks.push({type:'reportLink',reportId:run.id,title:'Informe local de prueba',status:'ready'});}
   const answer=answerSchema.parse({id:crypto.randomUUID(),mode:'demo',blocks:result.blocks,evidenceIds:result.evidence.map(e=>e.id),dataAsOf:result.dataAsOf,coverage:result.coverage,proposedActionIds:[],privacyDecisionId:'browser-demo-no-external-ai'});
   const message=await store.create('messages',{conversationId:id,queryId,role:'assistant',answer,status:'ready'});return{messageId:message.id,queryId,status:'ready',streamUrl:''};
  }
  if(route==='/api/v1/reports'&&method==='POST')return report(s,store,body);
  if(route==='/api/v1/organizations/export'&&method==='POST'){if(body.confirmation!==org.name)throw new ApiError('Escribe el nombre de la empresa de prueba.',400,'VALIDATION');return report(s,store,{template:'executive',format:'json'});}
  if(route.startsWith('/api/v1/organizations/'))return unavailable();
  const presentationExport=route.match(/^\/api\/v1\/presentations\/([^/]+)\/export$/);if(presentationExport&&method==='POST')return report(s,store,{template:'executive',format:'pdf'},required(await store.get('presentation_documents',presentationExport[1])));
  if(route==='/api/v1/presentations'&&method==='POST'){const snapshot=await reportSnapshot(store,ctx,'executive',undefined,org);return store.create('presentation_documents',{title:text(body.title),status:'draft',slides:[{title:text(body.title),text:'Demo de pruebas · Datos ficticios',kind:'cover'},...snapshot.kpis.slice(0,5).map(k=>({title:k.label,text:k.value===null?'N/A':k.format==='money'?new Intl.NumberFormat('es-ES',{style:'currency',currency:k.currency||'EUR'}).format(k.value/100):String(k.value),kind:'metric'}))]});}
  if(route==='/api/v1/studio'&&method==='POST'){if(body.kind!=='chart')return store.create('media_jobs',{...body,status:'blocked',error:'La demo gratuita no conecta proveedores de imágenes ni vídeo.'});const row=await store.create('media_jobs',{...body,status:'generating'}),snapshot=await reportSnapshot(store,ctx,'executive',undefined,org),id=`artifact-${row.id}`;const svg=renderChartSvgText(snapshot).replace('</svg>','<text x="12" y="255" font-size="9" fill="#667085">Demo local · Datos ficticios</text></svg>');s.artifacts[id]={blob:new Blob([svg],{type:'image/svg+xml'}),filename:'birdview-demo-chart.svg'};await store.create('artifacts',{filename:'birdview-demo-chart.svg',mimeType:'image/svg+xml',storageBackend:'browser_demo'},{id});return store.update('media_jobs',row.id,{status:'ready',artifactId:id});}
  if(route==='/api/v1/knowledge'&&method==='POST'){const existing=(await store.list('knowledge_items',{limit:1000})).find(r=>r.data.title===body.title&&r.data.status==='active'&&r.data.content!==body.content);const row=await store.create('knowledge_items',{...body,status:existing?'conflict_pending':'active',source:'browser_demo',...(existing?{conflictsWith:existing.id}:{})},{departmentId:'sales'});await store.create('knowledge_versions',{knowledgeItemId:row.id,...row.data,version:1});return row;}
  const confirm=route.match(/^\/api\/v1\/knowledge\/([^/]+)\/confirm$/);if(confirm&&method==='POST'){const row=required(await store.get('knowledge_items',confirm[1]));if(typeof row.data.conflictsWith==='string')await store.update('knowledge_items',row.data.conflictsWith,{status:'archived'});return store.update('knowledge_items',row.id,{status:'active',type:'confirmed_rule'});}
  if(route==='/api/v1/approvals'&&method==='POST'){const kind=text(body.resourceKind) as EntityKind;if(!['accounts','opportunities','projects'].includes(kind))throw new ApiError('Recurso de prueba no disponible.',400,'VALIDATION');const target=required(await store.get(kind,text(body.resourceId)));if(target.version!==body.expectedVersion)throw new ApiError('El registro ha cambiado.',409,'VERSION_CONFLICT');return store.create('action_proposals',{...body,status:'pending',before:target.data,mode:'browser_demo'});}
  const action=route.match(/^\/api\/v1\/approvals\/([^/]+)\/(approve|reject|execute)$/);
  if(action&&method==='POST'){const row=required(await store.get('action_proposals',action[1]));if(action[2]==='reject')return store.update('action_proposals',row.id,{status:'rejected'});if(action[2]==='approve'){if(row.data.status!=='pending'&&row.data.status!=='approved')throw new ApiError('Revisa la propuesta local.',409,'PROPOSAL_STATE');return store.update('action_proposals',row.id,{status:'approved',approvedPatch:JSON.stringify(row.data.patch)});}if(row.data.status==='succeeded')return row;if(row.data.status!=='approved'||row.data.approvedPatch!==JSON.stringify(row.data.patch))throw new ApiError('Aprueba el cambio antes de ejecutarlo.',409,'PROPOSAL_STATE');await store.update(row.data.resourceKind as EntityKind,text(row.data.resourceId),object(row.data.patch),Number(row.data.expectedVersion));return store.update('action_proposals',row.id,{status:'succeeded',mode:'browser_demo'});}
  const collection=route.match(/^\/api\/v1\/([^/]+)(?:\/([^/]+))?$/);if(collection){const kind=collections[collection[1]],id=collection[2];if(!kind)return unavailable();
   if(method==='GET'){const limit=Number(url.searchParams.get('limit')||50),offset=Number(url.searchParams.get('offset')||0),items=(await store.list(kind,{limit,offset,search:url.searchParams.get('search')||undefined,newestFirst:kind!=='messages'&&kind!=='conversations'})).filter(r=>r.data.status!=='forgotten');return{items,nextOffset:items.length===limit?offset+limit:null};}
   if(method==='POST'&&!id){if(kind==='routines')return store.create(kind,{...body,status:'paused',reason:'La ejecución automática requiere el servidor; aquí solo se guarda la configuración de prueba.'});return store.create(kind,{...body,...(kind==='tasks'?{status:'pending'}:{})});}
   if(method==='PATCH'&&id){if(kind==='routines'&&body.status==='active')return unavailable();if(kind==='knowledge_items'&&body.status==='forgotten')return store.forgetKnowledge(id);if(kind==='knowledge_items')await store.create('knowledge_versions',{knowledgeItemId:id,...required(await store.get(kind,id)).data});if(kind==='action_proposals')return store.update(kind,id,{...body,status:'pending',approvedPatch:null});return store.update(kind,id,body);}
  }
  return unavailable();
 }
 return{
  request(path,options){const job=serial.then(async()=>{const fresh=await persistence.read();if(fresh)state=fresh;const before=structuredClone(state!);try{const result=await handle(state!,path,options);if(options.method&&options.method!=='GET'){state!.revision++;await persistence.write(state!,before.revision);}return structuredClone(result);}catch(error){state=before;if(error instanceof ApiError)throw error;if(error instanceof DomainError)throw new ApiError(error.message,error.statusCode,error.code);throw new ApiError(error instanceof Error?error.message:'No se pudo completar la prueba local.',400,'DEMO_ERROR');}});serial=job.then(()=>undefined,()=>undefined);return job;},
  async download(id){await serial;const fresh=await persistence.read(),artifact=fresh?.artifacts[id];if(!artifact)throw new ApiError('Archivo de prueba no disponible.',404,'NOT_FOUND');const url=URL.createObjectURL(artifact.blob),a=document.createElement('a');a.href=url;a.download=artifact.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);},
  async reset(){await serial;const fresh=await persistence.read(),replacement=initialDemoState();replacement.revision=(fresh?.revision||0)+1;await persistence.write(replacement,fresh?.revision??null);state=replacement;},
 };
}
