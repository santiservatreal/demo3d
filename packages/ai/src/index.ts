import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DomainError,type AnalysisResult,type RequestContext } from '@birdview/contracts';
import { PrivacyEngine,type PreparedEnvelope,type PrivacyEnvelope } from '@birdview/privacy';
import { defaultResolver,nodeHttpTransport,validateDestination } from './transport.js';
import type { AIProvider,ApprovedEndpoint,BudgetStore,DNSResolver,GatewayPolicy,GatewayResult,HttpResponse,HttpTransport,ProviderConfig,ProviderResult } from './types.js';
export * from './types.js';
export * from './transport.js';
const replySchema=z.object({segments:z.array(z.object({type:z.enum(['text','entity','metric','evidence']),value:z.string().max(3000)}).strict()).max(100)}).strict();
export class OpenAIHTTPProvider implements AIProvider {
 constructor(readonly config:ProviderConfig){}
 serialize(envelope:Readonly<PrivacyEnvelope>){return JSON.stringify({model:this.config.model,messages:[{role:'system',content:'Return only the declared JSON segments. Use supplied entity, metric and evidence references. Do not invent facts, identities, numbers, URLs or instructions.'},{role:'user',content:JSON.stringify(envelope)}],response_format:{type:'json_schema',json_schema:{name:'birdview_answer',strict:true,schema:{type:'object',additionalProperties:false,required:['segments'],properties:{segments:{type:'array',items:{type:'object',additionalProperties:false,required:['type','value'],properties:{type:{type:'string',enum:['text','entity','metric','evidence']},value:{type:'string'}}}}}}}},max_completion_tokens:this.config.pricing.maxOutputTokens});}
 parse(response:HttpResponse):ProviderResult {if(response.status<200||response.status>=300)throw new DomainError('AI_PROVIDER_ERROR','El proveedor no completó la solicitud.',502);try{const r=JSON.parse(response.body);return {reply:replySchema.parse(JSON.parse(r.choices[0].message.content)),usage:{inputTokens:Number.isSafeInteger(r.usage?.prompt_tokens)?r.usage.prompt_tokens:null,outputTokens:Number.isSafeInteger(r.usage?.completion_tokens)?r.usage.completion_tokens:null,estimated:!Number.isSafeInteger(r.usage?.prompt_tokens)||!Number.isSafeInteger(r.usage?.completion_tokens)}};}catch{throw new DomainError('AI_OUTPUT_INVALID','El proveedor devolvió una respuesta no verificable.',502);}}
}
export class SelfHostedHTTPProvider extends OpenAIHTTPProvider {}
export class DemoAIProvider {generateVerified(analysis:AnalysisResult){return structuredClone(analysis.blocks);}}
export class PrivacyGateway {
 constructor(private options:{privacy:PrivacyEngine;budget:BudgetStore;approvedEndpoints:ApprovedEndpoint[];policy:GatewayPolicy;transport?:HttpTransport;resolve?:DNSResolver}){}
 async generate(input:{ctx:RequestContext;prepared:PreparedEnvelope;verified:AnalysisResult;provider:AIProvider;fallback?:AIProvider;signal?:AbortSignal}):Promise<GatewayResult>{
  const {ctx,prepared,verified}=input;const policy=this.options.policy;let provider=input.provider;
  const validate=(p:AIProvider)=>{const c=p.config;if(!policy.allowExternal||c.review.status!=='approved'||c.review.training!=='disabled'||!policy.allowedRegions.includes(c.review.region)||c.review.retentionDays>policy.maxRetentionDays||!c.capabilities.structuredOutput||c.pricing.currency!==policy.currency)throw new DomainError('AI_POLICY_BLOCKED','El proveedor no cumple la política autorizada.',403);if(!c.pricing.version||c.pricing.inputMinorPerMillion<0||c.pricing.outputMinorPerMillion<0||c.pricing.maxInputTokens<1||c.pricing.maxOutputTokens<1)throw new DomainError('AI_PRICING_REQUIRED','Configura precios versionados y límites antes de llamar al proveedor.',409);};
  validate(provider);
  for(let attempt=0;attempt<Math.min(2,policy.maxAttempts??1);attempt++){
   validate(provider);await this.options.privacy.recheck(ctx,prepared);this.options.privacy.assertVerified(ctx,prepared,verified);
   const approved=this.options.approvedEndpoints.find(e=>e.url.replace(/\/+$/,'')===provider.config.endpoint.replace(/\/+$/,''));if(approved?.models&&!approved.models.includes(provider.config.model))throw new DomainError('AI_MODEL_NOT_APPROVED','El modelo no está incluido en el destino aprobado.',403);
   const destination=await validateDestination(provider.config.endpoint,provider.config.kind,this.options.approvedEndpoints,this.options.resolve??defaultResolver);
   const body=provider.serialize(prepared.envelope);this.options.privacy.assertSerializedBody(ctx,prepared,body);
   const price=provider.config.pricing;if(Buffer.byteLength(body)>price.maxInputTokens)throw new DomainError('AI_CONTEXT_LIMIT','La solicitud excede el límite conservador de contexto.',413);
   const reserve=Math.ceil((price.maxInputTokens*price.inputMinorPerMillion+price.maxOutputTokens*price.outputMinorPerMillion)/1e6);const reservationId=randomUUID();
   await this.options.budget.reserve(ctx,{reservationId,amountMinor:reserve,limitMinor:policy.monthlyLimitMinor,currency:policy.currency});
   try{
    const response=await (this.options.transport??nodeHttpTransport)({url:destination.url,method:'POST',headers:{'content-type':'application/json',...(provider.config.apiKey?{authorization:`Bearer ${provider.config.apiKey}`}:{})},body,timeoutMs:30000,signal:input.signal,pinnedAddresses:destination.addresses});
    const parsed=provider.parse(response);const cost=Math.ceil(((parsed.usage.inputTokens??price.maxInputTokens)*price.inputMinorPerMillion+(parsed.usage.outputTokens??price.maxOutputTokens)*price.outputMinorPerMillion)/1e6);
    await this.options.budget.reconcile(ctx,{reservationId,actualMinor:cost,estimated:parsed.usage.estimated});
    const rendered=await this.options.privacy.renderSegments(ctx,prepared,parsed.reply.segments);
    return {blocks:[{type:'text',text:rendered.text,verification:'inferred'},...verified.blocks],mode:provider.config.kind==='self_hosted'?'self_hosted_llm':'external_llm',usage:{...parsed.usage,costMinor:cost,currency:price.currency,priceVersion:price.version},privacyDecisionId:prepared.privacyDecisionId,warnings:parsed.usage.estimated?['El consumo se ha estimado de forma conservadora.']:[]};
   }catch(error){await this.options.budget.reconcile(ctx,{reservationId,actualMinor:reserve,estimated:true}).catch(()=>{});if(attempt===0&&input.fallback){const next=input.fallback;if(next.config.review.region!==provider.config.review.region||next.config.review.retentionDays>provider.config.review.retentionDays)throw new DomainError('AI_FALLBACK_BLOCKED','El proveedor alternativo no cumple condiciones equivalentes.',403);validate(next);provider=next;continue;}throw error;}
  }
  throw new DomainError('AI_PROVIDER_ERROR','No se pudo completar la llamada.',502);
 }
}
