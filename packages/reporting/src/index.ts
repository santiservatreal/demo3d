import { chromium } from '@playwright/test';
import type { AnswerBlock } from '@birdview/contracts';
import type { ReportSnapshot } from '@birdview/analytics';
export * from './storage.js';

export function escapeHtml(value:unknown):string {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
}
function metricValue(block:Extract<AnswerBlock,{type:'metric'}>):string {
  if (block.value === null) return 'N/A';
  if (block.format === 'money') return new Intl.NumberFormat('es-ES',{style:'currency',currency:block.currency || 'EUR',maximumFractionDigits:2}).format(block.value / 100);
  if (block.format === 'percent') return `${new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(block.value)} %`;
  return new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(block.value);
}
function safeNumber(value:unknown):number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function chartSvg(chart:Extract<AnswerBlock,{type:'chart'}>):string {
  const rows = chart.data.slice(0,16), key = chart.series[0]?.key;
  if (!key || !rows.length) return '<p>No hay datos para representar en este período.</p>';
  const largest = Math.max(...rows.map(row => Math.abs(safeNumber(row[key]))),1);
  const width = 680, height = 260, left = 45, bottom = 53, plot = height-bottom-15;
  const step = (width-left-15) / rows.length;
  const bars = rows.map((row,index) => {
    const value = safeNumber(row[key]), bar = Math.max(0,value/largest*plot), x = left+index*step;
    return `<rect x="${x.toFixed(2)}" y="${(height-bottom-bar).toFixed(2)}" width="${Math.max(2,step-12).toFixed(2)}" height="${bar.toFixed(2)}" fill="#4f6fd0"/><text x="${(x+step/2-6).toFixed(2)}" y="${height-bottom+17}" text-anchor="middle" font-size="9" fill="#667085">${escapeHtml(String(row[chart.xKey] ?? '').slice(0,16))}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(chart.title)}"><rect width="${width}" height="${height}" fill="#fff"/><line x1="${left}" y1="${height-bottom}" x2="${width-10}" y2="${height-bottom}" stroke="#d9dee8"/>${bars}</svg>`;
}
function tableHtml(block:Extract<AnswerBlock,{type:'table'}>):string {
  return `<section><h2>${escapeHtml(block.title)}</h2><table><thead><tr>${block.columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead><tbody>${block.rows.slice(0,500).map(row => `<tr>${block.columns.map(column => `<td>${escapeHtml(row[column.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>${block.rows.length > 500 ? '<p class="muted">Tabla limitada a 500 filas en este documento.</p>' : ''}</section>`;
}
const reportCss = `
*{box-sizing:border-box}html{font-family:Arial,Helvetica,sans-serif;color:#17212f;background:white;font-size:11px;line-height:1.55}body{margin:0;padding:30px}.brand{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #4f6fd0;padding-bottom:14px}.brand b{font-size:18px}.tag{color:#667085;font-size:10px}h1{font-size:27px;line-height:1.2;margin:24px 0 9px}h2{font-size:15px;margin:24px 0 12px}p{margin:7px 0}.muted{color:#667085}.kpis{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0}.kpi{flex:1 1 140px;border:1px solid #e4e7ec;border-radius:8px;padding:13px}.kpi strong{display:block;font-size:22px;margin:5px 0}.ref{font-size:9px;color:#667085;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin-bottom:15px}thead{display:table-header-group}th{background:#f2f4f8;color:#475467;text-align:left}th,td{padding:8px;border-bottom:1px solid #e4e7ec;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid}section{margin-bottom:15px}.chart{break-inside:avoid;border:1px solid #e4e7ec;padding:12px}svg{width:100%;height:auto}.sources{font-size:10px}.warning{padding:10px 13px;background:#fff8e8;border-left:3px solid #d9a44a;margin:12px 0}.page-footer{margin-top:25px;padding-top:12px;border-top:1px solid #e4e7ec;color:#667085;font-size:9px}@page{size:A4;margin:16mm}@media print{body{padding:0}.kpi{break-inside:avoid}a{color:inherit;text-decoration:none}}
`;
export function renderReportHtml(snapshot:ReportSnapshot, options:{organizationName?:string} = {}):string {
  const coverage = snapshot.coverage;
  const sources = snapshot.sources.map(source => `<li><b>${escapeHtml(source.provider)}</b> · ${escapeHtml(source.label)} · observado ${escapeHtml(source.observedAt)}${source.from ? ` · período ${escapeHtml(source.from)} a ${escapeHtml(source.to || snapshot.asOf)}` : ''} <span class="ref">[${escapeHtml(source.id)}]</span></li>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(snapshot.title)}</title><style>${reportCss}</style></head><body><header class="brand"><b>Bird View</b><span class="tag">${escapeHtml(options.organizationName || 'Informe autorizado')}</span></header><h1>${escapeHtml(snapshot.title)}</h1><p class="muted">Fecha de corte: ${escapeHtml(snapshot.asOf)} · Divisa: ${escapeHtml(snapshot.currency)}</p><p class="muted">Cobertura: ${escapeHtml(coverage.from || 'inicio disponible')} — ${escapeHtml(coverage.to || snapshot.asOf)}</p>${coverage.warnings.map(warning => `<div class="warning">${escapeHtml(warning)}</div>`).join('')}<div class="kpis">${snapshot.kpis.map(block => `<div class="kpi"><span>${escapeHtml(block.label)}</span><strong>${escapeHtml(metricValue(block))}</strong><span class="ref">${escapeHtml(block.metricRef)}</span>${block.detail ? `<p class="muted">${escapeHtml(block.detail)}</p>` : ''}</div>`).join('')}</div><section><h2>Resumen y hallazgos</h2>${snapshot.findings.map(finding => `<p>${escapeHtml(finding)}</p>`).join('') || '<p>No hay hallazgos adicionales para el período autorizado.</p>'}</section>${snapshot.charts.map(chart => `<section class="chart"><h2>${escapeHtml(chart.title)}</h2>${chartSvg(chart)}<p class="ref">${escapeHtml(chart.metricRef)}</p></section>`).join('')}${snapshot.tables.map(tableHtml).join('')}<section><h2>Metodología</h2><ul>${snapshot.methodology.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section><section class="sources"><h2>Fuentes utilizadas</h2><ul>${sources || '<li>Sin fuentes disponibles para este período.</li>'}</ul></section><footer class="page-footer">Generado por Bird View. Este documento refleja los datos y permisos vigentes en su generación; su descarga requiere autorización actual. Las recomendaciones no ejecutan acciones.</footer></body></html>`;
}
/** RFC 4180 output; numbers stay numeric, while untrusted spreadsheet formulas are text. */
export function csvCell(value:unknown):string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = typeof value === 'boolean' ? String(value) : String(value);
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text;
}
export function renderReportCsv(snapshot:ReportSnapshot):Buffer {
  const lines:unknown[][] = [
    ['Bird View',snapshot.title],['Fecha de corte',snapshot.asOf],['Desde',snapshot.coverage.from || ''],['Hasta',snapshot.coverage.to || snapshot.asOf],['Divisa',snapshot.currency],
    [],['Indicador','Valor','Unidad','Divisa','Definición'],
    ...snapshot.kpis.map(metric => [metric.label,metric.value,metric.format === 'money' ? 'unidades menores' : metric.format,metric.currency || '',metric.metricRef]),
  ];
  for (const table of snapshot.tables) {
    lines.push([],['Tabla',table.title],table.columns.map(column => column.label));
    for (const row of table.rows) lines.push(table.columns.map(column => row[column.key]));
  }
  lines.push([],['Fuentes','Proveedor','Observado','Referencia']);
  for (const source of snapshot.sources) lines.push([source.label,source.provider,source.observedAt,source.id]);
  for (const warning of snapshot.coverage.warnings) lines.push(['Límite de cobertura',warning]);
  return Buffer.from('\uFEFF' + lines.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n','utf8');
}
export async function renderPdf(html:string):Promise<Buffer> {
  if (html.length > 5_000_000) throw new Error('Report size limit exceeded');
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const context = await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block'});
    await context.route('**/*',route => route.abort('blockedbyclient'));
    const page = await context.newPage();
    await page.setContent(html,{waitUntil:'load',timeout:10_000});
    return await page.pdf({format:'A4',printBackground:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font:9px Arial;width:100%;text-align:center;color:#667085">Bird View · Página <span class="pageNumber"></span> / <span class="totalPages"></span></div>',margin:{top:'16mm',bottom:'20mm',left:'16mm',right:'16mm'}});
  } finally { await browser.close(); }
}
export function renderPresentationHtml(document:{title:string;slides:{title:string;text:string;kind?:string}[]}, options:{organizationName?:string} = {}):string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(document.title)}</title><style>${reportCss}.slide{min-height:210mm;break-after:page;display:flex;flex-direction:column;justify-content:center;padding:25px}.slide:last-child{break-after:auto}.slide h2{font-size:35px;line-height:1.2}.slide p{font-size:18px;white-space:pre-wrap}.slide small{margin-top:40px;color:#667085}</style></head><body>${document.slides.slice(0,40).map((slide,index) => `<section class="slide"><span class="tag">Bird View · ${escapeHtml(options.organizationName || document.title)}</span><h2>${escapeHtml(slide.title)}</h2><p>${escapeHtml(slide.text)}</p><small>${index+1} / ${Math.min(document.slides.length,40)}</small></section>`).join('')}</body></html>`;
}
export function renderChartSvg(snapshot:ReportSnapshot):Buffer {
  const chart = snapshot.charts[0] || {type:'chart' as const,title:snapshot.title,chartType:'bar' as const,xKey:'label',series:[{key:'value',label:'Valor'}],data:snapshot.kpis.filter(metric => metric.value !== null).map(metric => ({label:metric.label,value:metric.value})),metricRef:'report.metrics.v1'};
  return Buffer.from(chartSvg(chart),'utf8');
}
/** API-key exports are aggregate-only, with no named rows, evidence IDs or free text. */
export function aggregateOnlySnapshot(snapshot:ReportSnapshot):ReportSnapshot {
  const labels = new Set(['Saldo pendiente','Saldo vencido','Facturas pendientes','Facturas vencidas','Pipeline abierto','Ventas ganadas','Tasa de cierre','Tickets abiertos','Empleados activos','Stock bajo mínimo','Pedidos retrasados','Cobros del período']);
  const kpis = snapshot.kpis.map((metric,index) => ({...metric,label:labels.has(metric.label) ? metric.label : `Indicador ${index+1}`,metricRef:`aggregate.metric.${index+1}`,detail:undefined}));
  const coverage = {from:snapshot.coverage.from,to:snapshot.coverage.to,warnings:['Salida agregada: se omiten identidades, filas y referencias internas.']};
  return {...snapshot,title:'Informe agregado',filters:{currency:snapshot.currency},coverage,kpis,tables:[],charts:[],sources:[],findings:['Salida agregada autorizada para API externa. No incluye identidades ni filas de clientes.'],methodology:['Valores calculados sobre el alcance autorizado. Las referencias internas y los datos identificativos se omiten.'],blocks:kpis,analysis:{...snapshot.analysis,coverage,blocks:kpis,evidence:[],suggestedQuestions:[]}};
}
