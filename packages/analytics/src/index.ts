import { answerBlockSchema, dateFilterSchema, DomainError, type AnalysisResult, type AnswerBlock, type CityDistrict, type CityViewModel, type Entity, type EntityKind, type Evidence, type OrganizationSummary, type QueryFilters, type QueryIntent, type RequestContext, type TenantStore } from '@birdview/contracts';
import { accountingDate, canRead, coverageFromEvidence, dataAsOf, inPeriod, integer, invoiceBalance, isoDate, minor, money, number, Reader, referenceFilters, selectedCurrency, sourceEvidence, string, sum } from './data.js';
import { detectIntent, isRestrictedQuestion, normalizeText } from './intent.js';
export { detectIntent, normalizeText } from './intent.js';

export type MetricBlock = Extract<AnswerBlock,{type:'metric'}>;
export type TableBlock = Extract<AnswerBlock,{type:'table'}>;
export type ChartBlock = Extract<AnswerBlock,{type:'chart'}>;
export interface AnalysisRequest { question?:string; intent?:QueryIntent; filters?:Partial<QueryFilters>; accountId?:string; organization?:OrganizationSummary; }
export interface ReportSnapshot { template:string; title:string; asOf:string; currency:string; filters:QueryFilters; coverage:AnalysisResult['coverage']; kpis:MetricBlock[]; tables:TableBlock[]; charts:ChartBlock[]; sources:Evidence[]; findings:string[]; methodology:string[]; blocks:AnswerBlock[]; analysis:AnalysisResult; }
export interface Briefing { items:{title:string;description:string;value?:number;metricRef?:string;districtId?:string}[]; questions:string[]; asOf:string; warnings:string[]; }

const supportedQuestions = ['¿Qué facturas están vencidas?','¿Cómo está el pipeline?','¿Cuánto hemos cobrado este mes?','Dame un resumen ejecutivo','¿Qué tickets necesitan atención?','¿Cuál es la disponibilidad de los equipos?'];
const humanKinds: Partial<Record<EntityKind,string>> = { invoices:'Facturas',payments:'Cobros',opportunities:'Oportunidades',tickets:'Soporte',employees:'Personas',products:'Inventario',orders:'Pedidos' };
const moduleGroups: Record<string,string[]> = { sales:['sales','ventas','commercial','comercial'],finance:['finance','finanzas','billing','facturacion'],people:['people','personas','hr','rrhh','teams'],support:['support','soporte','tickets'],inventory:['inventory','inventario','stock','logistics','logistica'],operations:['operations','operaciones','production','produccion','industrial','orders'] };
const hasModule = (org: OrganizationSummary | undefined, module:string): boolean => !org || (moduleGroups[module] || [module]).some(value=>org.modules.includes(value));
const daysBetween = (a:string,b:string):number => Math.floor((Date.parse(`${a}T00:00:00Z`)-Date.parse(`${b}T00:00:00Z`))/86_400_000);
const labelFor = (row:Entity|undefined, fallback='Sin correspondencia'):string => row ? string(row.data.name,fallback) : fallback;
const privateAccountName = (id:unknown, accounts:Entity[]):string => labelFor(accounts.find(row=>row.id===id),'Cuenta no disponible en tu alcance');
const status = (row:Entity):string => string(row.data.status).toLowerCase();
const boundedRows = (rows:Record<string,string|number|boolean|null>[]):Record<string,string|number|boolean|null>[] => rows.slice(0,50);
const metric = (label:string,value:number|null,format:MetricBlock['format'],metricRef:string,currency?:string,detail?:string):MetricBlock => ({type:'metric',label,value,format,metricRef,...(currency?{currency}:{}),...(detail?{detail}:{})});
const table = (title:string,columns:[string,string][],rows:Record<string,string|number|boolean|null>[],metricRef?:string):TableBlock => ({type:'table',title,columns:columns.map(([key,label])=>({key,label})),rows:boundedRows(rows),...(metricRef?{metricRef}:{})});

class AnalysisBuilder {
  readonly blocks:AnswerBlock[]=[];
  readonly evidence=new Map<string,Evidence>();
  readonly warnings:string[]=[];
  readonly reader:Reader;
  constructor(readonly store:TenantStore, readonly ctx:RequestContext, readonly filters:QueryFilters,readonly cutoff:string,readonly now:string) { this.reader=new Reader(store,ctx,filters); }
  use(rows:Entity[],fields:string[]):void { for (const row of rows) this.evidence.set(`${row.kind}/${row.id}`,sourceEvidence(row,fields)); }
  text(text:string,verification: 'verified'|'partial'|'inferred'|'no_evidence'='verified'):void { this.blocks.push({type:'text',text,verification}); }
  require(kind:EntityKind):void { if (!canRead(this.ctx,kind)) throw new DomainError('FORBIDDEN_RESOURCE','No tienes permiso para consultar este módulo.',403); }
  result(intent:QueryIntent,questions=supportedQuestions):AnalysisResult {
    const evidence=[...this.evidence.values()];
    const warnings=[...new Set([...this.warnings,...this.reader.warnings])];
    const sourceBlocks:AnswerBlock[] = evidence.length ? [{type:'sourceList',sources:evidence.slice(0,20).map(({id,label,provider,observedAt})=>({id,label,provider,observedAt}))}] : [];
    if (evidence.length>20) warnings.push(`Se muestran 20 de ${evidence.length} fuentes utilizadas; el resultado conserva todas sus referencias.`);
    const blocks=[...this.blocks,...warnings.map(text=>({type:'warning' as const,text})),...sourceBlocks].map(block=>answerBlockSchema.parse(block));
    return {intent,blocks,evidence,dataAsOf:dataAsOf(evidence,this.now),coverage:coverageFromEvidence(evidence,this.filters,warnings),suggestedQuestions:questions};
  }
}

function selected(rows:Entity[],filters:QueryFilters,dateField?:string):Entity[] {
  return rows.filter(row=>(!filters.accountId || row.data.accountId===filters.accountId || row.id===filters.accountId) && (!filters.ownerId || row.data.ownerId===filters.ownerId || row.ownerId===filters.ownerId) && (!dateField || inPeriod(row.data[dateField],filters)));
}

async function receivables(b:AnalysisBuilder, includeTable=true):Promise<{outstanding:number;overdue:number;overdueCount:number;rows:Entity[]}> {
  b.require('invoices');
  const invoices=selected(await b.reader.get('invoices'),b.filters,'issuedDate');
  const valid=selectedCurrency(invoices,b.filters.currency,b.warnings,'totalMinor').filter(row=>status(row)!=='void');
  const accounts=await b.reader.get('accounts');
  b.use(accounts.filter(account=>valid.some(row=>row.data.accountId===account.id)),['name']);
  const balances=valid.map(row=>({row,balance:invoiceBalance(row)}));
  const invalid=balances.filter(item=>item.balance===null).length;
  if (invalid) b.warnings.push(`${invalid} facturas se excluyeron por pagos o abonos no válidos.`);
  const pending=balances.filter((item):item is {row:Entity;balance:number}=>item.balance!==null && item.balance>0);
  const overdue=pending.filter(item=>{const due=isoDate(item.row.data.dueDate);return due!==null && due<b.cutoff;});
  const outstanding=sum(pending.map(item=>item.balance));
  const overdueAmount=sum(overdue.map(item=>item.balance));
  b.use(valid,['accountId','totalMinor','paidMinor','creditMinor','currency','issuedDate','dueDate','status']);
  const noDue=pending.filter(item=>!isoDate(item.row.data.dueDate)).length;
  if (noDue) b.warnings.push(`${noDue} facturas pendientes no tienen vencimiento válido; no se clasifican como vencidas.`);
  if (b.filters.to && b.filters.to<b.cutoff) b.warnings.push('El período selecciona facturas por emisión. Los saldos son actuales, no una reconstrucción del saldo a una fecha pasada.');
  b.blocks.push(metric('Saldo pendiente',outstanding,'money','bv.receivables.current_minor.v1',b.filters.currency,'Total menos pagos y abonos; excluye facturas anuladas.'),metric('Saldo vencido',overdueAmount,'money','bv.receivables.overdue_minor.v1',b.filters.currency,`Saldo positivo y vencimiento anterior a ${b.cutoff}.`),metric('Facturas vencidas',overdue.length,'number','bv.receivables.overdue_count.v1'));
  if (includeTable) {
    const aging=[{label:'Sin vencer',min:-Infinity,max:0},{label:'1–30 días',min:1,max:30},{label:'31–60 días',min:31,max:60},{label:'61–90 días',min:61,max:90},{label:'Más de 90 días',min:91,max:Infinity}].map(bucket=>({tramo:bucket.label,saldoMinor:sum(pending.filter(item=>{const due=isoDate(item.row.data.dueDate);if(!due)return false;const days=daysBetween(b.cutoff,due);return days>=bucket.min&&days<=bucket.max;}).map(item=>item.balance))}));
    b.blocks.push({type:'chart',title:`Antigüedad de saldos (${b.filters.currency}, unidades menores)`,chartType:'bar',xKey:'tramo',series:[{key:'saldoMinor',label:'Saldo pendiente'}],data:aging,metricRef:'bv.receivables.aging_minor.v1'});
    const sorted=[...pending].sort((a,c)=>c.balance-a.balance);
    b.blocks.push(table('Facturas pendientes', [['invoice','Factura'],['account','Cuenta'],['due','Vencimiento'],['balance','Saldo actual'],['state','Estado']],sorted.map(({row,balance})=>({invoice:string(row.data.number,row.id.slice(-8)),account:privateAccountName(row.data.accountId,accounts),due:string(row.data.dueDate,'No disponible'),balance:money(balance,b.filters.currency),state:isoDate(row.data.dueDate)&&String(row.data.dueDate)<b.cutoff?'Vencida':'Pendiente'})),'bv.receivables.current_minor.v1'));
    if (pending.length>50) b.warnings.push(`La tabla muestra las 50 facturas con mayor saldo de ${pending.length}; los totales incluyen todas las facturas autorizadas de la consulta.`);
  }
  return {outstanding,overdue:overdueAmount,overdueCount:overdue.length,rows:valid};
}

async function payments(b:AnalysisBuilder, includeTable=true):Promise<number> {
  b.require('payments');
  const all=await b.reader.get('payments');
  const period=selected(all,b.filters,'paidDate');
  const rows=selectedCurrency(period,b.filters.currency,b.warnings,'amountMinor').filter(row=>(minor(row.data.amountMinor)??-1)>=0);
  const total=sum(rows.map(row=>minor(row.data.amountMinor)!));
  b.use(rows,['amountMinor','currency','paidDate','accountId','invoiceId']);
  b.blocks.push(metric('Cobros registrados',total,'money','bv.payments.received_minor.v1',b.filters.currency,'Pagos registrados por fecha de cobro; no equivale a facturación ni a ventas ganadas.'));
  if (includeTable) {
    const accounts=await b.reader.get('accounts');
    b.use(accounts.filter(account=>rows.some(row=>row.data.accountId===account.id)),['name']);
    b.blocks.push(table('Cobros recientes',[['date','Fecha'],['account','Cuenta'],['amount','Importe']], [...rows].sort((a,c)=>string(c.data.paidDate).localeCompare(string(a.data.paidDate))).map(row=>({date:string(row.data.paidDate),account:privateAccountName(row.data.accountId,accounts),amount:money(minor(row.data.amountMinor)!,b.filters.currency)})),'bv.payments.received_minor.v1'));
    const series=new Map<string,number>();
    for(const row of rows){const date=isoDate(row.data.paidDate);if(date)series.set(date,(series.get(date)||0)+minor(row.data.amountMinor)!);}
    if(series.size)b.blocks.push({type:'chart',title:`Cobros por fecha (${b.filters.currency}, unidades menores)`,chartType:'line',xKey:'date',series:[{key:'amountMinor',label:'Cobros'}],data:[...series].sort(([a],[c])=>a.localeCompare(c)).map(([date,amountMinor])=>({date,amountMinor})),metricRef:'bv.payments.series_minor.v1'});
    if(b.filters.from&&b.filters.to){
      const duration=daysBetween(b.filters.to,b.filters.from)+1;
      const previousTo=new Date(Date.parse(`${b.filters.from}T00:00:00Z`)-86_400_000).toISOString().slice(0,10);
      const previousFrom=new Date(Date.parse(`${b.filters.from}T00:00:00Z`)-duration*86_400_000).toISOString().slice(0,10);
      const declaredCoverage=all.every(row=>{const source=row.data.source&&typeof row.data.source==='object'?row.data.source as Record<string,unknown>:{};const from=isoDate(source.coverageFrom),to=isoDate(source.coverageTo);return from!==null&&to!==null&&from<=previousFrom&&to>=b.filters.to!;});
      if(!all.length||!declaredCoverage)b.warnings.push(`Comparación anterior no disponible: no se confirma cobertura completa entre ${previousFrom} y ${previousTo}.`);
      else{
        const previous=selectedCurrency(selected(all,{...b.filters,from:previousFrom,to:previousTo},'paidDate'),b.filters.currency,b.warnings,'amountMinor').filter(row=>(minor(row.data.amountMinor)??-1)>=0);
        const previousTotal=sum(previous.map(row=>minor(row.data.amountMinor)!));
        b.use(previous,['amountMinor','currency','paidDate']);
        b.blocks.push(metric('Cobros del período anterior',previousTotal,'money','bv.payments.previous_minor.v1',b.filters.currency,`${previousFrom} a ${previousTo}.`),metric('Variación de cobros',previousTotal===0?null:Math.round((total-previousTotal)/previousTotal*10000)/100,'percent','bv.payments.change_percent.v1',undefined,previousTotal===0?'N/A: el período anterior no tiene denominador.':'Comparación entre períodos de igual duración.'));
      }
    }
  }
  return total;
}

async function pipeline(b:AnalysisBuilder, includeTable=true):Promise<{open:number;won:number;lost:number;winRate:number|null;count:number}> {
  b.require('opportunities');
  const all=selected(await b.reader.get('opportunities'),{...b.filters,from:undefined,to:undefined});
  const openRows=selectedCurrency(all.filter(row=>status(row)==='open'&&inPeriod(row.data.expectedCloseDate,b.filters)),b.filters.currency,b.warnings,'valueMinor');
  const closedRows=selectedCurrency(all.filter(row=>['won','lost'].includes(status(row))&&inPeriod(row.data.closedDate,b.filters)),b.filters.currency,b.warnings,'valueMinor');
  const won=closedRows.filter(row=>status(row)==='won'),lost=closedRows.filter(row=>status(row)==='lost');
  const open=sum(openRows.map(row=>minor(row.data.valueMinor)!));
  const wonValue=sum(won.map(row=>minor(row.data.valueMinor)!));
  const rate=won.length+lost.length?Math.round(won.length/(won.length+lost.length)*10000)/100:null;
  b.use([...openRows,...closedRows],['status','stageId','ownerId','accountId','valueMinor','currency','probability','expectedCloseDate','closedDate']);
  const missingCloseDates=all.filter(row=>['won','lost'].includes(status(row))&&!isoDate(row.data.closedDate)).length;
  if(missingCloseDates&&(b.filters.from||b.filters.to))b.warnings.push(`${missingCloseDates} cierres no tienen fecha válida y se excluyen de la cohorte temporal.`);
  const unknown=all.filter(row=>!['open','won','lost'].includes(status(row))).length;
  if(unknown)b.warnings.push(`${unknown} oportunidades con estado no reconocido se excluyeron de los indicadores.`);
  b.blocks.push(metric('Pipeline abierto',open,'money','bv.pipeline.open_minor.v1',b.filters.currency,'Oportunidades abiertas; filtro temporal por cierre previsto.'),metric('Ventas ganadas',wonValue,'money','bv.pipeline.won_minor.v1',b.filters.currency,'Acuerdos ganados por fecha de cierre; no equivale a facturas ni cobros.'),metric('Tasa de cierre',rate,'percent','bv.pipeline.win_rate.v1',undefined,`Ganadas / (ganadas + perdidas): ${won.length} / ${won.length+lost.length}. Cohorte por fecha de cierre.`));
  if(includeTable){
    const stages=await b.reader.get('stages'), accounts=await b.reader.get('accounts'),employees=await b.reader.get('employees');
    b.use(accounts.filter(account=>openRows.some(row=>row.data.accountId===account.id)),['name']);
    b.use(employees.filter(employee=>openRows.some(row=>row.data.ownerId===employee.id)),['name']);
    b.use(stages.filter(stage=>[...openRows,...won].some(row=>row.data.stageId===stage.id)),['name','probability']);
    let completeProbabilities=true;
    const weighted=openRows.map(row=>{
      const stage=stages.find(s=>s.id===row.data.stageId);
      const p=number(row.data.probability)??number(stage?.data.probability);
      if(p===null||p<0||p>1){completeProbabilities=false;return 0;}
      return Math.round(minor(row.data.valueMinor)!*p);
    });
    b.blocks.push(metric('Pipeline ponderado',completeProbabilities?sum(weighted):null,'money','bv.pipeline.weighted_minor.v1',b.filters.currency,completeProbabilities?'Probabilidades configuradas; redondeo por oportunidad a unidades menores.':'N/A: faltan probabilidades configuradas.'));
    const stageGroups=new Map<string,{phase:string;count:number;valueMinor:number}>();
    for(const row of [...openRows,...won]){
      const id=string(row.data.stageId,'unmapped'),stage=stages.find(item=>item.id===id);
      const entry=stageGroups.get(id)||{phase:labelFor(stage,'Fase sin correspondencia'),count:0,valueMinor:0};
      entry.count++;entry.valueMinor+=minor(row.data.valueMinor)!;stageGroups.set(id,entry);
    }
    if(stageGroups.size)b.blocks.push({type:'chart',title:`Valor por fase (${b.filters.currency}, unidades menores)`,chartType:'bar',xKey:'phase',series:[{key:'valueMinor',label:'Valor'}],data:[...stageGroups.values()].map(row=>({...row})),metricRef:'bv.pipeline.phase_minor.v1'});
    b.blocks.push(table('Oportunidades abiertas',[['name','Oportunidad'],['account','Cuenta'],['stage','Fase'],['owner','Responsable'],['value','Valor'],['expected','Cierre previsto']], [...openRows].sort((a,c)=>minor(c.data.valueMinor)!-minor(a.data.valueMinor)!).map(row=>({name:string(row.data.name,'Oportunidad'),account:privateAccountName(row.data.accountId,accounts),stage:labelFor(stages.find(s=>s.id===row.data.stageId),'Fase sin correspondencia'),owner:labelFor(employees.find(e=>e.id===row.data.ownerId),'Responsable no disponible en tu alcance'),value:money(minor(row.data.valueMinor)!,b.filters.currency),expected:string(row.data.expectedCloseDate,'No disponible')})),'bv.pipeline.open_minor.v1'));
  }
  return {open,won:wonValue,lost:lost.length,winRate:rate,count:openRows.length};
}

async function tickets(b:AnalysisBuilder, includeTable=true):Promise<{open:number;critical:number}> {
  b.require('tickets');
  const rows=selected(await b.reader.get('tickets'),b.filters,'openedDate');
  const open=rows.filter(row=>!['closed','resolved','cancelled'].includes(status(row)));
  const critical=open.filter(row=>['urgent','critical','high'].includes(string(row.data.priority).toLowerCase()));
  b.use(rows,['accountId','status','priority','openedDate']);
  b.blocks.push(metric('Tickets abiertos',open.length,'number','bv.support.open_count.v1'),metric('Prioridad alta o crítica',critical.length,'number','bv.support.critical_count.v1'));
  if(includeTable){const accounts=await b.reader.get('accounts');b.blocks.push(table('Soporte pendiente',[['subject','Asunto'],['account','Cuenta'],['priority','Prioridad'],['age','Antigüedad (días)']], [...open].sort((a,c)=>string(a.data.openedDate).localeCompare(string(c.data.openedDate))).map(row=>({subject:string(row.data.subject,'Ticket'),account:privateAccountName(row.data.accountId,accounts),priority:string(row.data.priority,'No disponible'),age:isoDate(row.data.openedDate)?Math.max(0,daysBetween(b.cutoff,isoDate(row.data.openedDate)!)):null})),'bv.support.open_count.v1'));b.text('Los tickets y saldos de una cuenta se muestran como hechos independientes. Un ticket abierto no demuestra la causa de un impago.');}
  return {open:open.length,critical:critical.length};
}

async function team(b:AnalysisBuilder, includeTable=true):Promise<{active:number;available:number|null;groups:{name:string;count:number;availability:number|null;id:string}[]}> {
  b.require('employees');
  const rows=await b.reader.get('employees');
  const active=rows.filter(row=>row.data.active!==false);
  const teams=await b.reader.get('teams');
  const grouped=new Map<string,Entity[]>();
  for(const row of active){const key=string(row.data.teamId,'unassigned');const group=grouped.get(key)||[];group.push(row);grouped.set(key,group);}
  const groups=[...grouped].map(([id,employees])=>{
    const valid=employees.map(row=>number(row.data.availabilityPercent)).filter((n):n is number=>n!==null&&n>=0&&n<=100);
    return {id,name:labelFor(teams.find(row=>row.id===id),'Equipo sin correspondencia'),count:employees.length,availability:employees.length>=3&&valid.length===employees.length?Math.round(valid.reduce((a,c)=>a+c,0)/valid.length*100)/100:null};
  });
  const availability=active.map(row=>number(row.data.availabilityPercent));
  const available=active.length>=3&&availability.every((n):n is number=>n!==null&&n>=0&&n<=100)?Math.round(availability.reduce((a,c)=>a+c,0)/availability.length*100)/100:null;
  b.use(rows,['teamId','active','availabilityPercent']);
  b.use(teams.filter(row=>active.some(employee=>employee.data.teamId===row.id)),['name']);
  b.blocks.push(metric('Personas activas',active.length,'number','bv.people.active_count.v1'),metric('Disponibilidad agregada',available,'percent','bv.people.availability_percent.v1',undefined,'Media declarada de disponibilidad; grupos menores de tres no se muestran. Sin salud, salarios ni decisiones laborales.'));
  if(includeTable)b.blocks.push(table('Capacidad por equipo',[['team','Equipo'],['count','Personas'],['availability','Disponibilidad media']],groups.map(row=>({team:row.name,count:row.count,availability:row.availability===null?'No disponible / grupo pequeño':`${row.availability} %`})),'bv.people.availability_percent.v1'));
  if(groups.some(row=>row.availability===null))b.warnings.push('La disponibilidad se omite en grupos menores de tres o con datos incompletos. Este umbral no garantiza anonimato.');
  return {active:active.length,available,groups};
}

async function inventory(b:AnalysisBuilder,includeTable=true):Promise<{low:Entity[];products:Entity[]}> {
  b.require('products');
  const products=await b.reader.get('products');
  const valid=products.filter(row=>number(row.data.stock)!==null&&number(row.data.minimumStock)!==null);
  const low=valid.filter(row=>number(row.data.stock)!<number(row.data.minimumStock)!);
  b.use(products,['name','sku','stock','minimumStock']);
  b.blocks.push(metric('Referencias bajo mínimo',low.length,'number','bv.inventory.below_minimum_count.v1'));
  if(includeTable)b.blocks.push(table('Stock bajo mínimo',[['product','Producto'],['sku','SKU'],['stock','Existencias'],['minimum','Mínimo'],['gap','Faltan']],low.map(row=>({product:string(row.data.name,'Producto'),sku:string(row.data.sku),stock:number(row.data.stock),minimum:number(row.data.minimumStock),gap:number(row.data.minimumStock)!-number(row.data.stock)!})),'bv.inventory.below_minimum_count.v1'));
  if(valid.length<products.length)b.warnings.push(`${products.length-valid.length} productos no tienen stock y mínimo comparables.`);
  return {low,products};
}

async function orders(b:AnalysisBuilder,includeTable=true):Promise<{late:Entity[];open:Entity[];delivered:Entity[]}> {
  b.require('orders');
  const rows=selected(await b.reader.get('orders'),b.filters,'expectedDate');
  const open=rows.filter(row=>!['delivered','completed','cancelled'].includes(status(row)));
  const late=open.filter(row=>{const date=isoDate(row.data.expectedDate);return date!==null&&date<b.cutoff;});
  const delivered=rows.filter(row=>['delivered','completed'].includes(status(row)));
  b.use(rows,['accountId','productId','quantity','status','expectedDate','deliveredDate']);
  b.blocks.push(metric('Pedidos en curso',open.length,'number','bv.orders.open_count.v1'),metric('Pedidos retrasados',late.length,'number','bv.orders.late_count.v1'),metric('Pedidos entregados',delivered.length,'number','bv.orders.delivered_count.v1'));
  if(includeTable){const accounts=await b.reader.get('accounts'),products=await b.reader.get('products');b.blocks.push(table('Pedidos retrasados',[['account','Cuenta'],['product','Producto'],['quantity','Cantidad'],['expected','Fecha prevista'],['state','Estado']],late.map(row=>({account:privateAccountName(row.data.accountId,accounts),product:labelFor(products.find(p=>p.id===row.data.productId),'Producto no disponible'),quantity:number(row.data.quantity),expected:string(row.data.expectedDate),state:string(row.data.status)})),'bv.orders.late_count.v1'));}
  return {late,open,delivered};
}

async function executive(b:AnalysisBuilder,org?:OrganizationSummary):Promise<void> {
  b.text('Resumen calculado sobre los registros y módulos que tu usuario puede consultar. Ventas ganadas, facturación y cobros son indicadores distintos.');
  let available=0;
  if(canRead(b.ctx,'invoices')&&hasModule(org,'finance')){
    const result=await receivables(b,false);
    const net=sum(result.rows.filter(row=>status(row)!=='credited'&&minor(row.data.totalMinor)!>=0&&minor(row.data.creditMinor??0)!==null&&(minor(row.data.creditMinor??0)??-1)>=0).map(row=>Math.max(0,minor(row.data.totalMinor)!-(minor(row.data.creditMinor??0)??0))));
    b.blocks.unshift(metric('Facturación neta de abonos',net,'money','bv.invoices.net_issued_minor.v1',b.filters.currency,'Cohorte por fecha de emisión; excluye anuladas. No equivale a cobros.'));
    if(result.overdueCount)b.text(`${integer(result.overdueCount)} facturas conservan saldo vencido por ${money(result.overdue,b.filters.currency)}. Es un dato contable actual; su causa requiere revisión.`);
    available++;
  }
  if(canRead(b.ctx,'payments')&&hasModule(org,'finance')){await payments(b,false);available++;}
  if(canRead(b.ctx,'opportunities')&&hasModule(org,'sales')){await pipeline(b,false);available++;}
  if(canRead(b.ctx,'tickets')&&hasModule(org,'support')){await tickets(b,false);available++;}
  if(canRead(b.ctx,'employees')&&hasModule(org,'people')){await team(b,false);available++;}
  if(canRead(b.ctx,'products')&&hasModule(org,'inventory')){await inventory(b,false);available++;}
  if(canRead(b.ctx,'orders')&&hasModule(org,'operations')){await orders(b,false);available++;}
  if(!available)b.text('No hay módulos de negocio disponibles dentro de tu alcance. Conecta o importa datos y revisa tus permisos con un administrador.','no_evidence');
}

function matchingAccounts(question:string,accounts:Entity[]):Entity[] {
  const q=` ${normalizeText(question)} `;
  const matches=accounts.map(row=>{
    const aliases=[string(row.data.name),...(Array.isArray(row.data.aliases)?row.data.aliases.filter((v):v is string=>typeof v==='string'):[])].map(normalizeText).filter(Boolean);
    return {row,score:Math.max(0,...aliases.filter(alias=>new RegExp(`(?<![\\p{L}\\p{N}])${alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\p{L}\\p{N}])`,'u').test(q)).map(alias=>alias.length))};
  });
  const score=Math.max(0,...matches.map(item=>item.score));
  return score?matches.filter(item=>item.score===score).map(item=>item.row):[];
}

async function accountSummary(b:AnalysisBuilder,request:AnalysisRequest):Promise<void> {
  b.require('accounts');
  const accounts=await b.reader.get('accounts');
  const chosen=request.accountId||b.filters.accountId;
  let matches=chosen?accounts.filter(row=>row.id===chosen):matchingAccounts(request.question||'',accounts);
  if(chosen&&!matches.length)throw new DomainError('NOT_FOUND','La cuenta no está disponible.',404);
  if(matches.length!==1){const options=matches.length?matches:accounts.slice(0,8);b.blocks.push({type:'clarification',question:matches.length>1?'Hay varias cuentas con esa referencia. Selecciona una para evitar mezclar identidades.':'Selecciona la cuenta que quieres consultar.',options:options.map(row=>({id:row.id,label:`${labelFor(row)} · ${row.id.slice(-6)}`}))});return;}
  const account=matches[0];
  b.use([account],['name']);b.text(`Ficha de ${labelFor(account)}. Se incluyen únicamente los recursos autorizados; la coincidencia de nombres no fusiona identidades.`);
  const scopedFilters={...b.filters,accountId:account.id};
  const scoped=new AnalysisBuilder(b.store,b.ctx,scopedFilters,b.cutoff,b.now);
  if(canRead(b.ctx,'invoices'))await receivables(scoped,true);
  if(canRead(b.ctx,'opportunities'))await pipeline(scoped,true);
  if(canRead(b.ctx,'tickets'))await tickets(scoped,true);
  b.blocks.push(...scoped.blocks,{type:'cityFocus',districtId:'sales',entityId:account.id,label:labelFor(account)});
  for(const [key,value]of scoped.evidence)b.evidence.set(key,value);
  b.warnings.push(...scoped.warnings,...scoped.reader.warnings);
}

async function history(b:AnalysisBuilder,question:string):Promise<void> {
  b.require('entity_events');
  const events=await b.reader.get('entity_events');
  const dates=events.map(row=>isoDate(row.data.occurredAt)).filter((d):d is string=>Boolean(d)).sort();
  const requested=detectIntent(question).requestedDate||b.filters.to||new Date(Date.parse(`${b.cutoff}T00:00:00Z`)-7*86_400_000).toISOString().slice(0,10);
  if(requested>b.cutoff){b.text('No hay hechos futuros observados. Esta consulta no genera una predicción ni reconstruye un estado futuro.','no_evidence');return;}
  if(!dates.length||requested<dates[0]){b.text(`Histórico no disponible para ${requested}. El estado actual no permite reconstruirlo sin eventos o snapshots anteriores.`, 'no_evidence');b.warnings.push(dates.length?`La cobertura de eventos empieza en ${dates[0]}.`:'No hay eventos históricos autorizados.');return;}
  const rows=events.filter(row=>{const d=isoDate(row.data.occurredAt);return d!==null&&d<=requested&&inPeriod(d,{...b.filters,to:requested});});
  b.use(rows,['entityKind','entityId','eventType','occurredAt','sourceUpdatedAt','observedAt']);
  b.text(`Hay ${rows.length} eventos registrados hasta ${requested}. Esta lista acredita esos hechos, pero no reconstruye un estado completo si faltan snapshots.`, 'partial');
  b.blocks.push(table('Eventos históricos',[['date','Fecha del hecho'],['kind','Tipo de entidad'],['event','Evento'],['observed','Observado']],rows.slice().sort((a,c)=>string(c.data.occurredAt).localeCompare(string(a.data.occurredAt))).map(row=>({date:string(row.data.occurredAt),kind:string(row.data.entityKind),event:string(row.data.eventType),observed:string(row.data.observedAt,row.updatedAt)}))));
  b.warnings.push('Se distinguen fecha del hecho y fecha de observación. No se infieren estados o evolución entre eventos.');
}

function makeFilters(request:AnalysisRequest,cutoff:string):QueryFilters {
  const inferred=referenceFilters(detectIntent(request.question||'').period,cutoff);
  const filters=dateFilterSchema.parse({...inferred,...request.filters,currency:(request.filters?.currency||request.organization?.currency||'EUR').toUpperCase(),...(request.accountId?{accountId:request.accountId}:{})});
  if(!/^[A-Z]{3}$/.test(filters.currency)||!Intl.supportedValuesOf('currency').includes(filters.currency))throw new DomainError('INVALID_CURRENCY','La divisa no es un código ISO admitido.',422);
  if(filters.from&&filters.to&&filters.from>filters.to)throw new DomainError('INVALID_PERIOD','La fecha inicial debe ser anterior o igual a la final.',422);
  return filters;
}

/** All values come from the authorized persistent store; the demo is deterministic. */
export async function analyze(store:TenantStore,ctx:RequestContext,request:AnalysisRequest={}):Promise<AnalysisResult> {
  if(request.question&&isRestrictedQuestion(request.question))throw new DomainError('FORBIDDEN_TOPIC','Esta consulta incluye datos personales restringidos que no están disponibles en este módulo.',403);
  const now=new Date().toISOString(),cutoff=accountingDate(new Date(now),request.organization?.timezone);
  const filters=makeFilters(request,cutoff);
  const intent=request.intent||detectIntent(request.question||'').intent;
  const b=new AnalysisBuilder(store,ctx,filters,cutoff,now);
  const requiredModule:Partial<Record<QueryIntent,string>>={receivables:'finance',payments:'finance',pipeline:'sales',win_rate:'sales',tickets:'support',team:'people',inventory:'inventory',orders:'operations'};
  const module=requiredModule[intent];
  if(module&&!hasModule(request.organization,module))throw new DomainError('MODULE_NOT_ENABLED','Este módulo no está activado en la organización.',422);
  switch(intent){
    case 'receivables':await receivables(b);b.blocks.push({type:'cityFocus',districtId:'finance',label:'Facturas y cobros'});break;
    case 'payments':await payments(b);b.blocks.push({type:'cityFocus',districtId:'finance',label:'Cobros registrados'});break;
    case 'pipeline':await pipeline(b);b.blocks.push({type:'cityFocus',districtId:'sales',label:'Pipeline comercial'});break;
    case 'win_rate':await pipeline(b,false);break;
    case 'tickets':await tickets(b);b.blocks.push({type:'cityFocus',districtId:'support',label:'Soporte'});break;
    case 'team':await team(b);b.blocks.push({type:'cityFocus',districtId:'people',label:'Equipos'});break;
    case 'inventory':await inventory(b);b.blocks.push({type:'cityFocus',districtId:'inventory',label:'Inventario'});break;
    case 'orders':await orders(b);b.blocks.push({type:'cityFocus',districtId:'operations',label:'Operaciones'});break;
    case 'executive':case 'report':await executive(b,request.organization);break;
    case 'account':await accountSummary(b,request);break;
    case 'history':await history(b,request.question||'');break;
    case 'knowledge':{b.require('knowledge_items');const rows=(await b.reader.get('knowledge_items')).filter(row=>!['forgotten','archived','conflict_pending'].includes(status(row))&&(!row.data.validUntil||String(row.data.validUntil)>=cutoff));b.use(rows,['title','type','status','validUntil']);b.blocks.push(table('Conocimiento vigente',[['title','Título'],['type','Tipo'],['validUntil','Vigencia']],rows.map(row=>({title:string(row.data.title),type:string(row.data.type,'declaración de usuario'),validUntil:string(row.data.validUntil,'Sin caducidad declarada')}))));if(!rows.length)b.text('No hay conocimiento vigente disponible en tu alcance.','no_evidence');break;}
    case 'task':b.text('Puedo preparar una tarea persistente. Indica objetivo y fecha en la pantalla Tareas; la creación necesita una confirmación explícita. No he programado ningún trabajo.','partial');break;
    default:b.blocks.push({type:'clarification',question:'El asistente demo admite consultas guiadas sobre datos de la empresa. Elige una de estas preguntas o reformúlala.',options:supportedQuestions.map((label,id)=>({id:String(id),label}))});break;
  }
  return b.result(intent);
}

export async function getCityView(store:TenantStore,ctx:RequestContext,filters?:Partial<QueryFilters>,organization?:OrganizationSummary):Promise<CityViewModel>{
  const now=new Date().toISOString(),cutoff=accountingDate(new Date(now),organization?.timezone),parsed=makeFilters({filters,organization},cutoff);
  const b=new AnalysisBuilder(store,ctx,parsed,cutoff,now),districts:CityDistrict[]=[];
  if(hasModule(organization,'sales')&&canRead(ctx,'opportunities')){
    const values=await pipeline(b,false),rows=selectedCurrency(selected(await b.reader.get('opportunities'),parsed,'expectedCloseDate').filter(row=>status(row)==='open'),parsed.currency,b.warnings,'valueMinor');
    if(rows.length)districts.push({id:'sales',name:'Ventas',module:'sales',metricLabel:'Pipeline abierto',value:values.open,formatted:money(values.open,parsed.currency),alertCount:rows.filter(row=>{const date=isoDate(row.data.expectedCloseDate);return date!==null&&date<cutoff;}).length,entities:rows.slice(0,30).map(row=>({id:row.id,name:string(row.data.name,'Oportunidad'),label:money(minor(row.data.valueMinor)??0,parsed.currency),status:status(row),valueMinor:minor(row.data.valueMinor)??undefined}))});
  }
  if(hasModule(organization,'finance')&&canRead(ctx,'invoices')){
    const values=await receivables(b,false);
    if(values.rows.length)districts.push({id:'finance',name:'Finanzas',module:'finance',metricLabel:'Saldo pendiente',value:values.outstanding,formatted:money(values.outstanding,parsed.currency),alertCount:values.overdueCount,entities:values.rows.filter(row=>(invoiceBalance(row)??0)>0).slice(0,30).map(row=>({id:row.id,name:string(row.data.number,'Factura'),label:money(invoiceBalance(row)??0,parsed.currency),status:isoDate(row.data.dueDate)&&String(row.data.dueDate)<cutoff?'overdue':'pending',valueMinor:invoiceBalance(row)??0}))});
  }
  if(hasModule(organization,'people')&&canRead(ctx,'employees')){const values=await team(b,false);if(values.active)districts.push({id:'people',name:'Personas',module:'people',metricLabel:'Personas activas',value:values.active,formatted:integer(values.active),alertCount:0,entities:values.groups.slice(0,20).map(row=>({id:row.id,name:row.name,label:`${row.count} personas`,status:'active'}))});}
  if(hasModule(organization,'support')&&canRead(ctx,'tickets')){const values=await tickets(b,false),rows=selected(await b.reader.get('tickets'),parsed,'openedDate').filter(row=>!['closed','resolved','cancelled'].includes(status(row)));if(rows.length)districts.push({id:'support',name:'Soporte',module:'support',metricLabel:'Tickets abiertos',value:values.open,formatted:integer(values.open),alertCount:values.critical,entities:rows.slice(0,25).map(row=>({id:row.id,name:string(row.data.subject,'Ticket'),label:string(row.data.priority),status:status(row)}))});}
  if(hasModule(organization,'inventory')&&canRead(ctx,'products')){const values=await inventory(b,false);if(values.products.length)districts.push({id:'inventory',name:'Inventario',module:'inventory',metricLabel:'Referencias bajo mínimo',value:values.low.length,formatted:integer(values.low.length),alertCount:values.low.length,entities:values.products.slice(0,25).map(row=>({id:row.id,name:string(row.data.name,'Producto'),label:number(row.data.stock)===null?'Stock no disponible':`${row.data.stock} unidades`,status:values.low.some(p=>p.id===row.id)?'attention':'available'}))});}
  if(hasModule(organization,'operations')&&canRead(ctx,'orders')){const values=await orders(b,false);if(values.open.length||values.delivered.length)districts.push({id:'operations',name:'Operaciones',module:'operations',metricLabel:'Pedidos en curso',value:values.open.length,formatted:integer(values.open.length),alertCount:values.late.length,entities:values.open.slice(0,25).map(row=>({id:row.id,name:`Pedido ${row.id.slice(-6)}`,label:string(row.data.expectedDate,'Sin fecha prevista'),status:values.late.some(o=>o.id===row.id)?'late':status(row)}))});}
  return {organizationId:ctx.organizationId,asOf:dataAsOf([...b.evidence.values()],now),seed:ctx.organizationId,currency:parsed.currency,districts,warnings:[...new Set([...b.warnings,...b.reader.warnings])]};
}

export async function getBriefing(store:TenantStore,ctx:RequestContext,filters?:Partial<QueryFilters>,organization?:OrganizationSummary):Promise<Briefing>{
  const city=await getCityView(store,ctx,filters,organization),items:Briefing['items']=[];
  for(const district of city.districts){
    if(district.id==='finance'&&district.alertCount)items.push({title:`${district.alertCount} facturas necesitan revisión`,description:`Saldo pendiente actual: ${district.formatted}. Revisa el vencimiento y los cobros registrados; no se presume su causa.`,value:district.value,metricRef:'bv.receivables.current_minor.v1',districtId:district.id});
    else if(district.id==='sales')items.push({title:'El pipeline, a la vista',description:`${district.formatted} en oportunidades abiertas autorizadas.`,value:district.value,metricRef:'bv.pipeline.open_minor.v1',districtId:district.id});
    else if(district.alertCount)items.push({title:`${district.alertCount} avisos en ${district.name.toLowerCase()}`,description:`${district.metricLabel}: ${district.formatted}.`,value:district.value,districtId:district.id});
    else if(district.id==='people')items.push({title:'Una visión del equipo',description:`${district.formatted} personas activas dentro de tu alcance.`,value:district.value,districtId:district.id});
  }
  const questions:string[]=[];
  if(city.districts.some(row=>row.id==='finance'))questions.push('¿Qué facturas están vencidas?','¿Cuánto hemos cobrado este mes?');
  if(city.districts.some(row=>row.id==='sales'))questions.push('¿Cómo está el pipeline?');
  if(city.districts.some(row=>row.id==='support'))questions.push('¿Qué tickets necesitan atención?');
  if(city.districts.some(row=>row.id==='inventory'))questions.push('¿Qué productos están bajo mínimo?');
  if(city.districts.some(row=>row.id==='operations'))questions.push('¿Qué pedidos están retrasados?');
  if(city.districts.some(row=>row.id==='people'))questions.push('¿Cuál es la disponibilidad de los equipos?');
  if(!items.length)items.push({title:'Empieza con datos de tu empresa',description:'Conecta una herramienta o importa un CSV para construir un briefing con evidencia.'});
  return {items:items.slice(0,3),questions:questions.length?questions.slice(0,5):['Dame un resumen ejecutivo'],asOf:city.asOf,warnings:city.warnings};
}

export async function reportSnapshot(store:TenantStore,ctx:RequestContext,template:string,filters?:Partial<QueryFilters>,organization?:OrganizationSummary):Promise<ReportSnapshot>{
  const definitions:Record<string,{intent:QueryIntent;title:string}>={executive:{intent:'executive',title:'Informe ejecutivo'},sales:{intent:'pipeline',title:'Informe de ventas y pipeline'},receivables:{intent:'receivables',title:'Informe de cobros y vencidos'},operations:{intent:'orders',title:'Informe de operaciones'},people:{intent:'team',title:'Informe agregado de personas'}};
  const definition=definitions[template];
  if(!definition)throw new DomainError('UNKNOWN_REPORT_TEMPLATE','La plantilla de informe no está disponible.',422);
  const analysis=await analyze(store,ctx,{intent:definition.intent,filters,organization});
  const parsed=makeFilters({filters,organization},accountingDate(new Date(),organization?.timezone));
  return {template,title:definition.title,asOf:analysis.dataAsOf,currency:parsed.currency,filters:parsed,coverage:analysis.coverage,kpis:analysis.blocks.filter((block):block is MetricBlock=>block.type==='metric'),tables:analysis.blocks.filter((block):block is TableBlock=>block.type==='table'),charts:analysis.blocks.filter((block):block is ChartBlock=>block.type==='chart'),sources:analysis.evidence,findings:analysis.blocks.filter((block):block is Extract<AnswerBlock,{type:'text'}>=>block.type==='text').map(block=>block.text),methodology:['Definiciones de KPI versionadas bv.*.v1; mismas funciones que chat, ciudad y API.','Importes enteros en unidades menores, agrupados en la divisa seleccionada; sin conversión implícita.','Saldos actuales; los filtros de facturas seleccionan fecha de emisión. No se reconstruye un saldo histórico sin evidencia.','Tasa de cierre: ganadas / (ganadas + perdidas), cohorte por fecha de cierre.','Fuentes y fechas corresponden a registros autorizados. Los datos ausentes no se completan con supuestos.'],blocks:analysis.blocks,analysis};
}
