import { lazy, Suspense, useState } from 'react';
import { BarChart3, Building2, CheckCheck, CircleAlert, ExternalLink, FileDown, Lightbulb, ShieldCheck, Sparkles } from 'lucide-react';
import type { AnswerBlock } from '@birdview/contracts';
import { currency, quantity } from './api';
import { SourceDetail, Status, useWorkspace } from './ui';
const DataChart=lazy(()=>import('./DataChart'));

export function PlainMarkdown({text}: {text:string}) {
  return <div className="bv-answer-prose">{text.split(/\n\s*\n/).map((paragraph,i)=><p key={i}>{paragraph.split(/(\*\*[^*]+\*\*)/g).map((part,j)=>part.startsWith('**')&&part.endsWith('**')?<strong key={j}>{part.slice(2,-2)}</strong>:<span key={j}>{part}</span>)}</p>)}</div>;
}
export function AnswerBlocks({blocks}: {blocks:AnswerBlock[]}) {
  const{focusCity,ask}=useWorkspace();const[source,setSource]=useState<string|null>(null);
  return <div className="bv-answer-blocks">{blocks.map((block,i)=>{
    if(block.type==='text')return <div key={i}><PlainMarkdown text={block.text}/>{block.verification!=='verified'&&<span className="bv-evidence-label">{block.verification==='partial'?'Evidencia parcial':block.verification==='inferred'?'Interpretación':'Sin evidencia suficiente'}</span>}</div>;
    if(block.type==='metric')return <div key={i} className="bv-answer-metric"><span>{block.label}</span><strong>{block.value===null?'N/A':block.format==='money'?currency(block.value,block.currency):block.format==='percent'?`${quantity(block.value)} %`:quantity(block.value)}</strong>{block.detail&&<p>{block.detail}</p>}<small><CheckCheck size={12}/> Definición: {block.metricRef}</small></div>;
    if(block.type==='table')return <section key={i} className="bv-answer-table"><h3>{block.title}</h3><div className="bv-table-wrap"><table className="bv-table"><thead><tr>{block.columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{block.rows.map((row,index)=><tr key={index}>{block.columns.map(c=><td key={c.key}>{row[c.key]===null?'—':String(row[c.key]??'—')}</td>)}</tr>)}</tbody></table></div>{!block.rows.length&&<p className="bv-muted">No hay registros autorizados para este período.</p>}</section>;
    if(block.type==='chart')return <section key={i} className="bv-answer-chart"><h3><BarChart3 size={15}/>{block.title}</h3><Suspense fallback={<div className="bv-chart-placeholder">Preparando gráfico…</div>}><DataChart block={block}/></Suspense><small>Definición: {block.metricRef}</small></section>;
    if(block.type==='sourceList')return <div key={i} className="bv-answer-sources"><span><ShieldCheck size={13}/> Basado en estas fuentes</span><div>{block.sources.map(s=><button key={s.id} onClick={()=>setSource(s.id)}><span className="bv-source-dot"/>{s.provider} · {s.label}<ExternalLink size={11}/></button>)}</div></div>;
    if(block.type==='warning')return <div key={i} className="bv-answer-warning"><CircleAlert size={16}/><span>{block.text}</span></div>;
    if(block.type==='cityFocus')return <button key={i} className="bv-city-focus-link" onClick={()=>focusCity(block.districtId)}><Building2 size={16}/>{block.label}<span>Mostrar en ciudad ↗</span></button>;
    if(block.type==='clarification')return <div key={i} className="bv-clarification"><p><Lightbulb size={16}/>{block.question}</p>{block.options.map(option=><button key={option.id} onClick={()=>option.id.length>=16?ask(`Ficha de ${option.label}`,{districtId:'sales',entityId:option.id,label:option.label}):ask(option.label)}>{option.label}</button>)}</div>;
    if(block.type==='actionProposal')return <a key={i} href={`/app/approvals?proposal=${encodeURIComponent(block.proposalId)}`} className="bv-answer-action"><Sparkles size={17}/><span>{block.title}<small>Propuesta pendiente de revisión humana</small></span><span>Revisar ↗</span></a>;
    if(block.type==='reportLink')return <a key={i} href={`/app/reports?report=${encodeURIComponent(block.reportId)}`} className="bv-answer-action"><FileDown size={17}/><span>{block.title}<small>Abrir el historial del informe</small></span><Status value={block.status}/></a>;
    return null;
  })}{source&&<SourceDetail id={source} onClose={()=>setSource(null)}/>}</div>;
}
