import { it,expect,vi } from 'vitest';
import { Readable,Writable } from 'node:stream';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { createBirdviewProxy } from '../../server/birdview-proxy.js';
import { api,ApiError } from '../../apps/web/src/api.js';

class Output extends Writable{
 statusCode=200;headersSent=false;headers:Record<string,string|number|string[]>={};parts:Buffer[]=[];
 setHeader(name:string,value:string|number|string[]){this.headers[name.toLowerCase()]=value;return this;}
 _write(chunk:Buffer,_encoding:string,done:()=>void){this.headersSent=true;this.parts.push(Buffer.from(chunk));done();}
 get text(){return Buffer.concat(this.parts).toString('utf8');}
}
function incoming(url='/api/v1/config',method='GET',body?:unknown){const req=Readable.from([]) as unknown as IncomingMessage&{body?:unknown};req.url=url;req.method=method;req.headers={};if(body!==undefined)req.body=body;return req;}
async function call(options:Parameters<typeof createBirdviewProxy>[0],req=incoming()){
 const out=new Output();await createBirdviewProxy(options)(req,out as unknown as ServerResponse);return out;
}
it('Vercel without a backend reports configuration missing and performs no external request',async()=>{
 const request=vi.fn<typeof fetch>();const response=await call({origin:()=>undefined,request});
 expect(response.statusCode).toBe(503);expect(JSON.parse(response.text).error.code).toBe('BACKEND_NOT_CONFIGURED');expect(request).not.toHaveBeenCalled();expect(response.headers['cache-control']).toBe('no-store');
});
it('the destination cannot come from a request path, host or query parameter',async()=>{
 const request=vi.fn<typeof fetch>(async()=>Response.json({version:'1.0.0',demoEnabled:true}));const req=incoming('/api/v1/sources/accounts%2Ffixture?destination=https%3A%2F%2Fevil.example.com');req.headers={host:'evil.example.com'};
 const response=await call({origin:()=>'https://birdview-api.example.com',request},req);
 expect(response.statusCode).toBe(200);expect(request.mock.calls[0][0]).toBe('https://birdview-api.example.com/api/v1/sources/accounts%2Ffixture?destination=https%3A%2F%2Fevil.example.com');expect((request.mock.calls[0][1]?.headers as Headers).get('host')).toBeNull();
});
it('session cookies, origin and CSRF pass through while private responses are never cached',async()=>{
 let captured:RequestInit|undefined;const request:typeof fetch=async(_url,init)=>{captured=init;return new Response('{"ok":true}',{headers:[['content-type','application/json'],['set-cookie','birdview.session_token=fixture; HttpOnly; SameSite=Lax'],['set-cookie','birdview.session_data=fixture; HttpOnly; SameSite=Lax']]});};
 const req=incoming('/api/auth/sign-in/email','POST',{email:'demo@example.com',password:'test-fixture-only'});req.headers={cookie:'birdview.session_token=fixture',origin:'https://frontend.example.com','x-csrf-token':'fixture-csrf','content-type':'application/json'};
 const response=await call({origin:()=>'https://birdview-api.example.com',request},req);const headers=captured?.headers as Headers;
 expect(headers.get('cookie')).toBe(req.headers.cookie);expect(headers.get('origin')).toBe(req.headers.origin);expect(headers.get('x-csrf-token')).toBe('fixture-csrf');expect(JSON.parse(Buffer.from(captured?.body as Uint8Array).toString()).email).toBe('demo@example.com');expect(response.headers['set-cookie']).toHaveLength(2);expect(response.headers['cache-control']).toBe('no-store');
});
it('backend redirects and invalid origin configuration are blocked without revealing secrets',async()=>{
 const request=vi.fn<typeof fetch>(async()=>new Response(null,{status:302,headers:{location:'https://elsewhere.example.com'}}));const redirected=await call({origin:()=>'https://birdview-api.example.com',request});expect(redirected.statusCode).toBe(502);expect(JSON.parse(redirected.text).error.code).toBe('BACKEND_REDIRECT_BLOCKED');
 request.mockClear();for(const value of ['http://backend.example.com','https://user:fixture-secret@backend.example.com','https://backend.example.com/api']){const response=await call({origin:()=>value,request});expect(response.statusCode).toBe(503);expect(response.text).not.toContain('fixture-secret');}expect(request).not.toHaveBeenCalled();
});
it('foreign routes, oversized requests and transport failures fail explicitly',async()=>{
 const request=vi.fn<typeof fetch>(async()=>{throw new Error('sensitive transport details');});const foreign=await call({origin:()=>'https://birdview-api.example.com',request},incoming('/private'));expect(foreign.statusCode).toBe(404);expect(request).not.toHaveBeenCalled();
 const oversized=await call({origin:()=>'https://birdview-api.example.com',request},incoming('/api/v1/imports/preview','POST','x'.repeat(4*1024*1024+1)));expect(oversized.statusCode).toBe(413);expect(request).not.toHaveBeenCalled();
 const failed=await call({origin:()=>'https://birdview-api.example.com',request});expect(failed.statusCode).toBe(502);expect(failed.text).not.toContain('sensitive transport details');
});
it('SSE and report downloads preserve content and security headers',async()=>{
 const sse=await call({origin:()=>'https://birdview-api.example.com',request:async()=>new Response('data: {"status":"ready"}\n\n',{headers:{'content-type':'text/event-stream','x-accel-buffering':'no'}})},incoming('/api/v1/events/fixture'));expect(sse.headers['content-type']).toContain('text/event-stream');expect(sse.text).toContain('data:');
 const pdf=await call({origin:()=>'https://birdview-api.example.com',request:async()=>new Response('%PDF-fixture',{headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="report.pdf"','content-security-policy':"default-src 'none'"}})},incoming('/api/v1/artifacts/fixture/download'));expect(pdf.text).toBe('%PDF-fixture');expect(pdf.headers['content-disposition']).toContain('report.pdf');expect(pdf.headers['content-security-policy']).toBe("default-src 'none'");
});
it('a static HTML fallback is identified as missing API, not denied account access',async()=>{
 const previous=globalThis.fetch;try{globalThis.fetch=async()=>new Response('<html>Static page</html>',{status:404,headers:{'content-type':'text/html'}});await expect(api('/config')).rejects.toMatchObject({code:'API_UNAVAILABLE',status:404});globalThis.fetch=async()=>Response.json({error:{code:'FORBIDDEN',message:'Sin permiso.'}},{status:403});await expect(api('/accounts')).rejects.toMatchObject({code:'FORBIDDEN',status:403});}finally{globalThis.fetch=previous;}
});
