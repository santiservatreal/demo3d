import { createContext, useContext, useState, type FormEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, CheckCircle2, ChevronRight, LoaderCircle, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Bootstrap, Entity } from '@birdview/contracts';
import { api, ApiError, recordData, rows, statusLabels, text } from './api';
import type { CitySelection } from '@birdview/city';

export interface WorkspaceContext { session:Bootstrap; ask:(question:string,context?:CitySelection)=>void; focusCity:(districtId:string)=>void; notify:(message:string)=>void; }
export const Workspace = createContext<WorkspaceContext | null>(null);
export function useWorkspace() { const value=useContext(Workspace);if(!value)throw new Error('Workspace provider is required');return value; }
export function useCollection(path:string, poll=false) {
  const {session}=useWorkspace();
  return useQuery({queryKey:[session.organization.id,path],queryFn:({signal})=>api<{items:Entity[];nextOffset?:number|null}>(path,{signal}),refetchInterval:poll?query=>rows<Entity>(query.state.data).some(row=>['queued','running','generating','consulting','validating','preparing','executing','syncing','pending'].includes(text(recordData(row).status)))?1500:false:false});
}
export function useRefreshWorkspace() {const client=useQueryClient();const{session}=useWorkspace();return()=>client.invalidateQueries({queryKey:[session.organization.id]});}
export function Status({value}: {value:unknown}) { const v=text(value,'pending');return <span className={`bv-status status-${v}`}>{statusLabels[v]||v.replaceAll('_',' ')}</span>; }
export function Button({children,onClick,disabled=false,loading=false,variant='primary',type='button',className='',title}: {children:ReactNode;onClick?:()=>void;disabled?:boolean;loading?:boolean;variant?:'primary'|'secondary'|'ghost'|'danger';type?:'button'|'submit';className?:string;title?:string}) {return <button type={type} className={`bv-btn bv-btn-${variant} ${className}`} onClick={onClick} disabled={disabled||loading} title={title}>{loading&&<LoaderCircle size={15} className="bv-spin"/>}{children}</button>;}
export function ErrorState({error,retry}: {error:unknown;retry?:()=>void}) {
  const denied=error instanceof ApiError&&[401,403,404].includes(error.status);
  return <div className="bv-state bv-state-error" role="alert"><AlertCircle size={23}/><h3>{denied?'Acceso no disponible':'No se pudo cargar esta información'}</h3><p>{error instanceof Error?error.message:'Comprueba tu conexión y vuelve a intentarlo.'}</p>{error instanceof ApiError&&error.requestId&&<small>Referencia: {error.requestId}</small>}{retry&&<Button variant="secondary" onClick={retry}><RefreshCw size={14}/> Volver a intentar</Button>}</div>;
}
export function Loading({label='Cargando información…'}: {label?:string}) {return <div className="bv-state" role="status"><LoaderCircle size={23} className="bv-spin"/><p>{label}</p></div>;}
export function Empty({title,description,children}: {title:string;description:string;children?:ReactNode}) {return <div className="bv-state bv-state-empty"><div className="bv-empty-mark"><Plus size={24}/></div><h3>{title}</h3><p>{description}</p>{children}</div>;}
export function PageHeading({eyebrow,title,description,action}: {eyebrow?:string;title:string;description:string;action?:ReactNode}) {return <header className="bv-page-heading"><div>{eyebrow&&<span className="bv-overline">{eyebrow}</span>}<h1>{title}</h1><p>{description}</p></div>{action}</header>;}
export function Modal({open,onOpenChange,title,description,children,wide=false}: {open:boolean;onOpenChange:(open:boolean)=>void;title:string;description?:string;children:ReactNode;wide?:boolean}) {return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="bv-modal-overlay"/><Dialog.Content className={`bv-modal ${wide?'bv-modal-wide':''}`}><Dialog.Title className="bv-modal-title">{title}</Dialog.Title>{description&&<Dialog.Description className="bv-modal-description">{description}</Dialog.Description>}<Dialog.Close className="bv-modal-close" aria-label="Cerrar"><X size={19}/></Dialog.Close>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;}
export function FormField({label,children,hint}: {label:string;children:ReactNode;hint?:string}) {return <label className="bv-field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
export function FormError({error}: {error:unknown}) {return error?<p className="bv-form-error" role="alert"><AlertCircle size={15}/>{error instanceof Error?error.message:String(error)}</p>:null;}
export function Confirm({title,description,confirmLabel='Confirmar',onConfirm,trigger,danger=false}: {title:string;description:string;confirmLabel?:string;onConfirm:()=>Promise<unknown>;trigger:ReactNode;danger?:boolean}) {
  const[open,setOpen]=useState(false);const[busy,setBusy]=useState(false);const[error,setError]=useState<unknown>(null);
  return <><span onClick={()=>setOpen(true)}>{trigger}</span><Modal open={open} onOpenChange={setOpen} title={title} description={description}><FormError error={error}/><div className="bv-form-actions"><Button variant="secondary" onClick={()=>setOpen(false)}>Cancelar</Button><Button variant={danger?'danger':'primary'} loading={busy} onClick={()=>{setBusy(true);setError(null);onConfirm().then(()=>setOpen(false)).catch(setError).finally(()=>setBusy(false));}}>{confirmLabel}</Button></div></Modal></>;
}
export function SearchField({value,onChange,placeholder='Buscar en esta lista'}:{value:string;onChange:(value:string)=>void;placeholder?:string}) {return <div className="bv-search-field"><Search size={15}/><input aria-label={placeholder} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/>{value&&<button aria-label="Limpiar búsqueda" onClick={()=>onChange('')}><X size={13}/></button>}</div>;}
export function JsonDetails({value}: {value:unknown}) {return <pre className="bv-json">{JSON.stringify(value,null,2)}</pre>;}
export function SuccessNote({children}:{children:ReactNode}) {return <p className="bv-success-note"><CheckCircle2 size={15}/>{children}</p>;}
export function ResourceCard({title,subtitle,children,status,icon,actions,recordId}: {title:string;subtitle?:string;children?:ReactNode;status?:unknown;icon?:ReactNode;actions?:ReactNode;recordId?:string}) {return <article className="bv-resource-card" data-record-id={recordId}><div className="bv-resource-card-head">{icon&&<span className="bv-resource-icon">{icon}</span>}<div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div>{status!==undefined&&<Status value={status}/>}</div>{children}{actions&&<div className="bv-resource-actions">{actions}</div>}</article>;}
export function SourceDetail({id,onClose}: {id:string;onClose:()=>void}) {
  const q=useQuery({queryKey:['source',id],queryFn:({signal})=>api(`/sources/${encodeURIComponent(id)}`,{signal})});
  return <Modal open onOpenChange={v=>{if(!v)onClose();}} title="Evidencia de la respuesta" description="La fuente se vuelve a comprobar con tus permisos actuales." wide>{q.isLoading?<Loading/>:q.error?<ErrorState error={q.error} retry={()=>void q.refetch()}/>:<JsonDetails value={q.data}/>}</Modal>;
}
export function SimpleForm({onSubmit,children,submitLabel='Guardar',busy=false,error}: {onSubmit:(data:FormData)=>void;children:ReactNode;submitLabel?:string;busy?:boolean;error?:unknown}) {function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();onSubmit(new FormData(e.currentTarget));}return <form className="bv-form" onSubmit={submit}>{children}<FormError error={error}/><div className="bv-form-actions"><Button type="submit" loading={busy}>{submitLabel}<ChevronRight size={15}/></Button></div></form>;}
