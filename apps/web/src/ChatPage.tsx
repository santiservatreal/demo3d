import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpRight, CalendarDays, CheckCheck, CircleHelp, Command, FileText, LoaderCircle, Mic, Paperclip, Plus, ShieldCheck, Sparkles, Square, X } from 'lucide-react';
import { answerSchema, type Answer, type Entity } from '@birdview/contracts';
import type { CitySelection } from '@birdview/city';
import { api, currency, quantity, recordData, rows, text } from './api';
import { AnswerBlocks } from './Answers';
import { Button, ErrorState, FormError, Loading, Status, useCollection, useWorkspace } from './ui';

interface Briefing {items:Array<{title:string;description:string;value?:number;metricRef?:string;districtId?:string;severity?:string}>;questions:string[];asOf:string;warnings?:string[];}
export interface ChatDraft { text:string; context?:CitySelection; revision:number; }
const pendingStates=['queued','running','validating','consulting','preparing','generating','cancelling'];
export function ChatPage({incoming,onConsumed}:{incoming:ChatDraft|null;onConsumed:()=>void}) {
  const{id}=useParams();const navigate=useNavigate();const client=useQueryClient();const{session,notify,ask}=useWorkspace();
  const[draft,setDraft]=useState('');const[context,setContext]=useState<CitySelection|undefined>();const[sending,setSending]=useState(false);const[error,setError]=useState<unknown>(null);const[queryId,setQueryId]=useState<string|null>(null);const[progress,setProgress]=useState('');const[from,setFrom]=useState('');const[to,setTo]=useState('');const[filtersOpen,setFiltersOpen]=useState(false);
  const textarea=useRef<HTMLTextAreaElement>(null);const end=useRef<HTMLDivElement>(null);const activeStream=useRef<EventSource|null>(null);const lastSubmitted=useRef('');
  const briefing=useQuery({queryKey:[session.organization.id,'/briefing'],queryFn:({signal})=>api<Briefing>('/briefing',{signal}),enabled:!id});
  const messages=useQuery({queryKey:[session.organization.id,'messages',id],queryFn:({signal})=>api<{items:Entity[]}>(`/conversations/${id}/messages`,{signal}),enabled:Boolean(id),refetchInterval:q=>rows<Entity>(q.state.data).some(row=>pendingStates.includes(text(recordData(row).status)))?900:false});
  const records=rows<Entity>(messages.data);const pending=records.findLast(row=>pendingStates.includes(text(recordData(row).status)));const running=sending||Boolean(pending)||Boolean(queryId);
  useEffect(()=>{if(incoming){setDraft(incoming.text);setContext(incoming.context);textarea.current?.focus();onConsumed();}},[incoming?.revision]);
  useEffect(()=>{setError(null);setQueryId(null);setProgress('');activeStream.current?.close();},[id]);
  useEffect(()=>()=>activeStream.current?.close(),[]);
  useEffect(()=>{end.current?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'end'});},[records.length]);
  useEffect(()=>{
    if(queryId&&records.some(row=>recordData(row).role==='assistant'&&text(recordData(row).queryId)===queryId&&!pendingStates.includes(text(recordData(row).status)))){setQueryId(null);setProgress('');activeStream.current?.close();void client.invalidateQueries({queryKey:[session.organization.id,'/city']});void client.invalidateQueries({queryKey:[session.organization.id,'/briefing']});}
  },[records,queryId]);
  function openStream(path:string,currentId:string,conversationId:string) {
    activeStream.current?.close();
    if(!path.startsWith('/api/'))return;
    const stream=new EventSource(path,{withCredentials:true});activeStream.current=stream;
    const handle=(event:MessageEvent)=>{
      try{const payload=JSON.parse(event.data);const status=text(payload.status||payload.phase||payload.stage);if(status)setProgress(status);if(['ready','completed','succeeded','failed','cancelled'].includes(status)){stream.close();setQueryId(null);setProgress('');void client.invalidateQueries({queryKey:[session.organization.id,'messages',conversationId]});void client.invalidateQueries({queryKey:[session.organization.id,'/city']});}}catch{/* only structured progress is accepted */}
    };
    stream.onmessage=handle;for(const type of['progress','status','complete','done','error'])stream.addEventListener(type,handle as EventListener);
    stream.onerror=()=>{stream.close();void client.invalidateQueries({queryKey:[session.organization.id,'messages',conversationId]});};
    setQueryId(currentId);
  }
  useEffect(()=>{const pendingId=text(recordData(pending).queryId);if(id&&pendingId&&!queryId)openStream(`/api/v1/events/${pendingId}`,pendingId,id);},[pending?.id,id]);
  async function send(value=draft) {
    if(!value.trim()||sending)return;setSending(true);setError(null);lastSubmitted.current=value;
    try{
      let conversationId=id;
      if(!conversationId){const created=await api<Entity|{item:Entity}>('/conversations',{method:'POST',body:{title:value.slice(0,100)}});conversationId='item'in created?created.item.id:created.id;}
      const reply=await api<{messageId:string;queryId:string;status:string;streamUrl:string}>(`/conversations/${conversationId}/messages`,{method:'POST',body:{content:value,...((from||to)?{filters:{...(from?{from}:{}),...(to?{to}:{})}}:{}),...(context?.entityId?{contextEntityId:context.entityId}:{})}});
      setDraft('');setContext(undefined);navigate(`/chat/${conversationId}`,{replace:!id});
      void client.invalidateQueries({queryKey:[session.organization.id,'messages',conversationId]});void client.invalidateQueries({queryKey:[session.organization.id,'/conversations']});
      if(reply.queryId)openStream(reply.streamUrl,reply.queryId,conversationId);
    }catch(e){setError(e);}finally{setSending(false);}
  }
  async function cancel(){const target=queryId||text(recordData(pending).queryId);if(!target)return;try{await api(`/queries/${target}/cancel`,{method:'POST',body:{}});setQueryId(null);activeStream.current?.close();setProgress('');void messages.refetch();notify('Solicitud de cancelación registrada.');}catch(e){setError(e);}}
  const unsupportedWarnings=briefing.data?.warnings||[];
  return <div className={`bv-chat-page ${id?'has-conversation':'is-home'}`}>
    <div className="bv-chat-scroll">
      {!id?<section className="bv-home-welcome"><div className="bv-home-date"><span className="bv-live-dot"/>{session.organization.demo?'Tu espacio de demostración':'Tu espacio de trabajo'}<span>·</span>{new Date().toLocaleDateString('es-ES',{day:'numeric',month:'long'})}</div><h1>Hola, {session.user.name.split(' ')[0] || session.user.name}.<br/><span>¿Qué quieres entender hoy?</span></h1><p className="bv-home-subtitle">Todo el contexto de {session.organization.name},<br className="bv-desktop-only"/> preparado para tu siguiente decisión.</p>
        {briefing.isLoading?<div className="bv-briefing-grid" aria-label="Cargando briefing">{[0,1,2].map(i=><div key={i} className="bv-briefing-skeleton"/>)}</div>:briefing.error?<ErrorState error={briefing.error} retry={()=>void briefing.refetch()}/>:<>
          <div className="bv-briefing-header"><span><Sparkles size={14}/> Tu briefing</span><small>Datos observados {briefing.data?.asOf?new Date(briefing.data.asOf).toLocaleDateString('es-ES'):'—'}</small></div>
          <div className="bv-briefing-grid">{(briefing.data?.items||[]).slice(0,3).map((item,i)=><button key={i} className={`bv-briefing-card severity-${item.severity||'info'}`} onClick={()=>ask(({finance:'¿Qué facturas están vencidas?',sales:'¿Cómo está el pipeline?',people:'¿Cuál es la disponibilidad de los equipos?',support:'¿Qué tickets necesitan atención?'} as Record<string,string>)[item.districtId||'']||item.title)}><span className="bv-briefing-index">{String(i+1).padStart(2,'0')}<ArrowUpRight size={14}/></span><strong>{item.title}</strong><p>{item.description}</p>{item.value!==undefined&&<b>{item.metricRef?.includes('minor')?currency(item.value,session.organization.currency):quantity(item.value)}</b>}</button>)}</div>
          {unsupportedWarnings.map((warning,i)=><p className="bv-home-warning" key={i}>{warning}</p>)}
          <div className="bv-suggested"><span>Empieza por aquí</span><div>{(briefing.data?.questions||[]).slice(0,4).map(question=><button key={question} onClick={()=>ask(question)}><CircleHelp size={14}/>{question}<ArrowUpRight size={13}/></button>)}</div></div>
        </>}
      </section>:<section className="bv-conversation" aria-label="Conversación persistida">
        {messages.isLoading?<Loading label="Abriendo conversación…"/>:messages.error?<ErrorState error={messages.error} retry={()=>void messages.refetch()}/>:records.map(row=>{
          const d=recordData(row);const role=text(d.role);let answer:Answer|null=null;
          if(d.answer){const checked=answerSchema.safeParse(d.answer);if(checked.success)answer=checked.data;}
          return <article className={`bv-message ${role==='user'?'bv-message-user':'bv-message-assistant'}`} key={row.id}><div className="bv-message-avatar">{role==='user'?session.user.name.slice(0,1):<BirdMark/>}</div><div className="bv-message-body"><div className="bv-message-author"><strong>{role==='user'?session.user.name:'Bird View'}</strong>{role!=='user'&&<span>{answer?.mode==='demo'?'Consultas guiadas':answer?.mode==='external_llm'?'Proveedor configurado':'Asistente'}</span>}<time>{new Date(row.createdAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</time></div>
            {role==='user'?<p className="bv-user-content">{text(d.content)}</p>:answer?<><AnswerBlocks blocks={answer.blocks}/><div className="bv-answer-footnote"><CheckCheck size={13}/> {answer.mode==='demo'?'Calculado sobre datos persistidos · Sin IA externa':'Respuesta validada'} · {new Date(answer.dataAsOf).toLocaleDateString('es-ES')}{answer.coverage.warnings.map((w,i)=><span key={i}>{w}</span>)}</div></>:pendingStates.includes(text(d.status))?<div className="bv-message-progress" role="status"><LoaderCircle size={16} className="bv-spin"/><Status value={progress||d.status}/></div>:d.status==='failed'?<div className="bv-message-failed"><p>{text(d.error||d.content,'No se pudo generar la respuesta.')}</p><Button variant="secondary" onClick={()=>void send(lastSubmitted.current||text(d.content))}>Reintentar</Button></div>:<p className="bv-user-content">{text(d.content,'La solicitud se ha registrado.')}</p>}
          </div></article>;
        })}
        {sending&&<div className="bv-composer-sending" role="status"><LoaderCircle size={16} className="bv-spin"/>Guardando y preparando consulta…</div>}
      </section>}
      <div ref={end}/>
    </div>
    <div className="bv-composer-area"><div className="bv-composer-topline"><span><ShieldCheck size={13}/>{session.organization.demo?'Datos de demostración · Asistente de consultas guiadas':'Permisos y política de datos activos'}</span><button onClick={()=>setFiltersOpen(v=>!v)} aria-expanded={filtersOpen}><CalendarDays size={13}/>{from||to?'Período seleccionado':'Todo el período disponible'}</button></div>{filtersOpen&&<div className="bv-composer-filters"><label>Desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Hasta<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><button onClick={()=>{setFrom('');setTo('');}}>Limpiar</button></div>}
      <form className={`bv-composer ${running?'is-working':''}`} onSubmit={e=>{e.preventDefault();void send();}}>
        {context&&<div className="bv-context-chip"><span>Contexto: {context.label}</span><button type="button" aria-label="Quitar contexto" onClick={()=>setContext(undefined)}><X size={12}/></button></div>}
        <textarea ref={textarea} aria-label="Pregunta sobre tu empresa" placeholder={id?'Continúa la conversación…':`Pregunta sobre ${session.organization.name}…`} value={draft} onChange={e=>setDraft(e.target.value)} rows={2} maxLength={10000} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!running)void send();}}}/>
        <div className="bv-composer-controls"><div><button type="button" disabled aria-label="Adjuntos no disponibles" title="Los adjuntos requieren un parser local y revisión de privacidad."><Paperclip size={17}/></button><button type="button" disabled aria-label="Voz desactivada" title="La voz está desactivada hasta configurar un proveedor y su política de datos."><Mic size={17}/></button><span className="bv-composer-model"><span className="bv-live-dot"/>{session.organization.demo?'Demo · consultas guiadas':'Proveedor según política'}</span></div>{running?<button type="button" className="bv-send is-cancel" aria-label="Cancelar consulta" onClick={()=>void cancel()}><Square size={14}/></button>:<button type="submit" className="bv-send" disabled={!draft.trim()} aria-label="Enviar pregunta"><ArrowUp size={19}/></button>}</div>
      </form><FormError error={error}/><p className="bv-composer-note">Comprueba las fuentes antes de decidir. Enter para enviar · Shift + Enter para una nueva línea.</p>
    </div>
  </div>;
}
export function BirdMark(){return <svg viewBox="0 0 30 30" fill="none" aria-hidden="true"><path d="M5 24V11l7-4v17M12 24V4l12 6v14M3 24h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 11h3m-3 5h3" stroke="currentColor" strokeWidth="1.5"/></svg>;}
