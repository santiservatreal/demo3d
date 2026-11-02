import { it,expect,vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { Answer,Entity,CityViewModel } from '@birdview/contracts';
import { createBrowserDemo,initialDemoState } from '../../apps/web/src/demo/runtime';
import type { DemoPersistence,DemoState } from '../../apps/web/src/demo/persistence';

function memory(){
 let state:DemoState|null=null;
 const persistence:DemoPersistence={read:async()=>structuredClone(state),write:async(value,expected)=>{if(expected!==null&&state?.revision!==expected)throw new Error('Concurrent change');state=structuredClone(value);}};
 return{persistence,state:()=>state!};
}
async function setup(){const disk=memory(),demo=await createBrowserDemo(disk.persistence);const request=<T=any>(path:string,body?:unknown,method=body===undefined?'GET':'POST')=>demo.request(path,{method,body}) as Promise<T>;return{disk,demo,request};}
const kindRows=(state:DemoState,kind:string)=>state.entities.filter(row=>row.organizationId===state.organizationId&&row.kind===kind);

it('free demo has portable, linked fixtures for two distinct companies',()=>{
 const s=initialDemoState(new Date('2026-11-02T10:00:00Z'));
 expect(kindRows(s,'accounts')).toHaveLength(40);expect(kindRows(s,'invoices')).toHaveLength(80);expect(kindRows(s,'opportunities')).toHaveLength(60);
 for(const company of s.organizations){const rows=s.entities.filter(row=>row.organizationId===company.id),ids=new Set(rows.map(row=>row.id));expect(ids.size).toBe(rows.length);for(const row of rows){for(const field of ['accountId','pipelineId','stageId','productId','teamId','invoiceId'])if(row.data[field])expect(ids.has(String(row.data[field]))).toBe(true);}}
 s.organizationId=s.organizations[1].id;expect(kindRows(s,'orders')).toHaveLength(45);expect(kindRows(s,'products')).toHaveLength(20);
});
it('local imports validate before committing, update calculations and persist without a network call',async()=>{
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Unexpected network call'));
 try{
  const{request,disk}=await setup();expect(await request('/config')).toMatchObject({mode:'browser_demo'});
  const before=await request<{blocks:Array<{metricRef?:string;value?:number}>}>('/metrics');
  const input={format:'json',entityKind:'invoices',content:JSON.stringify([{externalId:'test-invoice',number:'TEST-1',accountId:kindRows(disk.state(),'accounts')[0].id,totalMinor:123456,paidMinor:0,creditMinor:0,currency:'EUR',status:'open',issuedDate:'2026-10-01',dueDate:'2026-10-02'}])};
  expect(await request('/imports/preview',input)).toMatchObject({validCount:1,invalidCount:0});expect(await request('/imports/commit',input)).toMatchObject({created:1});expect(await request('/imports/commit',input)).toMatchObject({unchanged:1,created:0});
  const after=await request<typeof before>('/metrics'),metric=(data:typeof before)=>data.blocks.find(b=>b.metricRef==='bv.receivables.current_minor.v1')!.value!;expect(metric(after)-metric(before)).toBe(123456);
  const reloaded=await createBrowserDemo(disk.persistence);expect(await reloaded.request('/metrics',{})).toEqual(after);
  const revision=disk.state().revision;
  await expect(request('/imports/commit',{...input,content:JSON.stringify([{externalId:'bad',totalMinor:'not a number'}])})).rejects.toThrow();expect(disk.state().revision).toBe(revision);
  expect(network).not.toHaveBeenCalled();
 }finally{network.mockRestore();}
});
it('guided answers use persisted data and evidence, with no pretend streaming or background queue',async()=>{
 const{request,disk}=await setup();const conversation=await request<Entity>('/conversations',{title:'Prueba local'}),reply=await request(`/conversations/${conversation.id}/messages`,{content:'¿Qué facturas están vencidas?'});expect(reply).toMatchObject({status:'ready',streamUrl:''});
 const messages=await request<{items:Entity[]}>(`/conversations/${conversation.id}/messages`);expect(messages.items).toHaveLength(2);const answer=messages.items[1].data.answer as Answer;expect(answer.mode).toBe('demo');expect(answer.evidenceIds.length).toBeGreaterThan(0);expect(await request(`/sources/${encodeURIComponent(answer.evidenceIds[0])}`)).toMatchObject({provider:'browser_demo'});
 await request(`/conversations/${conversation.id}/messages`,{content:'Crea un recordatorio para la próxima semana'});expect(kindRows(disk.state(),'tasks')).toHaveLength(1);await request('/tasks',{title:'Revisar el pipeline',description:'Prueba confirmada',dueAt:'2026-12-01T10:00:00Z'});expect(kindRows(disk.state(),'tasks')).toHaveLength(2);
 await request('/organizations/select',{organizationId:'norte-browser-demo'});await expect(request(`/conversations/${conversation.id}/messages`)).rejects.toMatchObject({status:404});const city=await request<CityViewModel>('/city');expect(city.districts.some(d=>d.id==='inventory')).toBe(true);
});
it('reports, presentations and charts are actual local files containing calculated data',async()=>{
 const{request,disk}=await setup();for(const format of ['pdf','csv','html']){
  const run=await request<Entity>('/reports',{template:'receivables',format});expect(run.data.status).toBe('ready');const blob=disk.state().artifacts[String(run.data.artifactId)].blob;expect(blob.size).toBeGreaterThan(100);
  if(format==='pdf'){const bytes=await blob.arrayBuffer();expect(new TextDecoder().decode(bytes.slice(0,5))).toBe('%PDF-');expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);}
  else expect(await blob.text()).toMatch(/Datos ficticios|datos ficticios/);
 }
 const deck=await request<Entity>('/presentations',{title:'Dirección Demo'});expect(deck.data.slides).toBeInstanceOf(Array);const pdf=await request<Entity>(`/presentations/${deck.id}/export`,{format:'pdf'});expect(pdf.data.status).toBe('ready');
 const chart=await request<Entity>('/studio',{kind:'chart',title:'Resumen'});expect(await disk.state().artifacts[String(chart.data.artifactId)].blob.text()).toContain('<svg');
 const blocked=await request<Entity>('/studio',{kind:'video',title:'Vídeo'});expect(blocked.data.status).toBe('blocked');expect(blocked.data.artifactId).toBeUndefined();
});
it('city selections keep the selected domain and expose the actual selected record',async()=>{
 const{request,disk}=await setup();for(const[kind,metricRef]of [['invoices','bv.receivables.current_minor.v1'],['teams','bv.people.active_count.v1']] as const){const target=kindRows(disk.state(),kind)[0],conversation=await request<Entity>('/conversations',{title:'Selección local'});await request(`/conversations/${conversation.id}/messages`,{content:'Resumen del elemento seleccionado',contextEntityId:target.id});const messages=await request<{items:Entity[]}>(`/conversations/${conversation.id}/messages`),answer=messages.items[1].data.answer as Answer;expect(answer.blocks.some(block=>block.type==='metric'&&block.metricRef===metricRef)).toBe(true);expect(answer.blocks.some(block=>block.type==='table'&&block.title==='Elemento seleccionado')).toBe(true);expect(answer.evidenceIds).toContain(`${kind}/${target.id}`);}
});
it('approvals enforce review and stale versions for changes to fictitious records',async()=>{
 const{request,disk}=await setup();const target=kindRows(disk.state(),'accounts')[0],proposal=await request<Entity>('/approvals',{resourceKind:'accounts',resourceId:target.id,expectedVersion:target.version,patch:{name:'Nombre de prueba'}});
 await expect(request(`/approvals/${proposal.id}/execute`,{})).rejects.toMatchObject({code:'PROPOSAL_STATE'});await request(`/approvals/${proposal.id}/approve`,{});await request(`/approvals/${proposal.id}/execute`,{});await request(`/approvals/${proposal.id}/execute`,{});expect(kindRows(disk.state(),'accounts').find(r=>r.id===target.id)).toMatchObject({version:2,data:{name:'Nombre de prueba'}});
 await expect(request('/approvals',{resourceKind:'accounts',resourceId:target.id,expectedVersion:1,patch:{name:'Obsoleto'}})).rejects.toMatchObject({code:'VERSION_CONFLICT'});
});
it('knowledge conflicts and forgetting persist; resetting restores only the local test dataset',async()=>{
 const{request,disk,demo}=await setup();const first=await request<Entity>('/knowledge',{title:'Regla local',content:'Primera regla',type:'confirmed_rule'}),second=await request<Entity>('/knowledge',{title:'Regla local',content:'Segunda regla',type:'user_statement'});expect(second.data.status).toBe('conflict_pending');await request(`/knowledge/${second.id}/confirm`,{});expect(kindRows(disk.state(),'knowledge_items').find(r=>r.id===first.id)!.data.status).toBe('archived');await request(`/knowledge/${second.id}`,{status:'forgotten'},'PATCH');expect(kindRows(disk.state(),'knowledge_versions').some(r=>r.data.knowledgeItemId===second.id)).toBe(false);await expect(request(`/sources/knowledge_items/${second.id}`)).rejects.toMatchObject({status:404});
 await request('/reports',{template:'executive',format:'csv'});expect(Object.keys(disk.state().artifacts)).not.toHaveLength(0);await demo.reset();expect(Object.keys(disk.state().artifacts)).toHaveLength(0);expect(kindRows(disk.state(),'knowledge_items')).toHaveLength(1);
});
it('browser mode does not pretend to provide real authentication, integrations or automation',async()=>{
 const{request,disk}=await setup();for(const path of ['/ai/providers','/api-keys','/published-queries','/connections','/members','/privacy','/api/auth/sign-in/email'])await expect(request(path,{apiKey:'not-a-real-key'})).rejects.toMatchObject({code:'SERVER_REQUIRED'});
 const routine=await request<Entity>('/routines',{title:'Rutina de prueba',schedule:'daily_briefing'});expect(routine.data.status).toBe('paused');await expect(request(`/routines/${routine.id}`,{status:'active'},'PATCH')).rejects.toMatchObject({code:'SERVER_REQUIRED'});
 expect(JSON.stringify(disk.state())).not.toContain('not-a-real-key');await request('/api/auth/sign-out',{});await expect(request('/session')).rejects.toMatchObject({status:401});await request('/auth/demo',{});expect(await request('/session')).toMatchObject({user:{email:'demo@example.com'}});
});
