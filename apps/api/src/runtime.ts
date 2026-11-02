import { createHmac,createCipheriv,createDecipheriv,randomBytes,hkdfSync,timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAuth } from '@birdview/auth';
import { createDataPort,getOrganization,listOrganizations,resolvePrincipal } from '@birdview/db';
import { DomainError,type Bootstrap,type RequestContext,type TenantStore } from '@birdview/contracts';
export const auth=createAuth(),dataPort=createDataPort();
type SessionResult=NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
declare module 'fastify' {interface FastifyRequest {bird?:SessionResult & {context?:RequestContext};}}
export const origin=process.env.APP_ORIGIN||'http://127.0.0.1:5174';
export const demoEnabled=process.env.APP_PROFILE==='demo'&&process.env.NODE_ENV!=='production';
export function requestHeaders(req:FastifyRequest){const h=new Headers();for(const key of ['cookie','origin','user-agent','content-type']){const v=req.headers[key];if(typeof v==='string')h.set(key,v);}return h;}
export function csrf(sessionId:string){return createHmac('sha256',process.env.CSRF_SECRET||process.env.BETTER_AUTH_SECRET!).update(`csrf:${sessionId}`).digest('base64url');}
export function checkOrigin(req:FastifyRequest){if(req.headers.origin!==origin&&req.headers.origin!==(process.env.BETTER_AUTH_URL||'http://127.0.0.1:3001'))throw new DomainError('ORIGIN_DENIED','El origen de la solicitud no está permitido.',403);}
export function checkCsrf(req:FastifyRequest){checkOrigin(req);const expected=Buffer.from(csrf(req.bird!.session.id)),received=Buffer.from(String(req.headers['x-csrf-token']||''));if(received.length!==expected.length||!timingSafeEqual(received,expected))throw new DomainError('CSRF','Actualiza la sesión antes de continuar.',403);}
export function ctx(req:FastifyRequest):RequestContext{if(!req.bird?.context)throw new DomainError('ORGANIZATION_REQUIRED','Selecciona o crea una organización.',409);return req.bird.context;}
export function body<T>(req:FastifyRequest,schema:z.ZodType<T>):T{return schema.parse(req.body??{});}
export function withStore<T>(req:FastifyRequest,work:(s:TenantStore)=>Promise<T>){return dataPort.withTenant(ctx(req),work);}
export function jobFor(context:RequestContext,entityId:string){return{organizationId:context.organizationId,userId:context.userId,authorizationVersion:context.authorizationVersion,principalType:context.principalType,entityId};}
export async function bootstrap(req:FastifyRequest){const identity=req.bird!;const organizations=await listOrganizations(identity.user.id);let organization=organizations.find(o=>o.id===(identity.session as typeof identity.session & {activeOrganizationId?:string}).activeOrganizationId)||organizations[0];if(!organization)return {user:identity.user,organizations:[],organization:null,onboardingRequired:true,csrfToken:csrf(identity.session.id)};const context=await resolvePrincipal(identity.user.id,organization.id);req.bird!.context=context;return {user:{id:identity.user.id,name:identity.user.name,email:identity.user.email},organization,organizations,context,csrfToken:csrf(identity.session.id)} satisfies Bootstrap;}
export async function currentOrganization(req:FastifyRequest){const result=await getOrganization(ctx(req).organizationId);if(!result)throw new DomainError('NOT_FOUND','Organización no disponible.',404);return result;}
export async function required<T>(value:T|null):Promise<T>{if(!value)throw new DomainError('NOT_FOUND','El registro no está disponible.',404);return value;}
export {sealSecret,openSecret} from './credentials.js';
