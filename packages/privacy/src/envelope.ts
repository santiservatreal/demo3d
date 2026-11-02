import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DomainError, intentSchema, type AnalysisResult, type RequestContext } from '@birdview/contracts';
import { ScopedIdentityVault } from './vault.js';
import { assertStrictQuestion, DEFAULT_PRIVACY_POLICY } from './policy.js';
import type { OutputSegment, PreparedEnvelope, PreparedMetadata, PrepareInput, PrivacyEntity, PrivacyEnvelope, PrivacyPolicy } from './types.js';

const inputParameters=z.object({from:z.string().date().optional(),to:z.string().date().optional(),currency:z.string().regex(/^[A-Z]{3}$/).optional(),limit:z.number().int().min(1).max(100).optional()}).strict();
const templates:Record<Exclude<AnalysisResult['intent'],'unknown'>,string>={
  receivables:'Explica los indicadores verificados de cuentas pendientes y vencimientos.',
  payments:'Explica los indicadores verificados de cobros del período.',
  pipeline:'Explica los indicadores verificados del pipeline comercial.',
  win_rate:'Explica la tasa de cierre verificada y su definición.',
  tickets:'Explica los indicadores verificados de soporte.',
  team:'Explica los indicadores agregados verificados del equipo.',
  inventory:'Explica los indicadores verificados de inventario.',
  orders:'Explica los indicadores verificados de pedidos.',
  executive:'Explica el resumen verificado del negocio.',
  account:'Explica los indicadores autorizados de las entidades seleccionadas.',
  history:'Explica la cobertura temporal y los indicadores históricos verificados.',
  report:'Explica los indicadores verificados del informe solicitado.',
  knowledge:'Explica el resultado autorizado de búsqueda de conocimiento.',
  task:'Explica el borrador autorizado de una tarea sin ejecutarla.',
};
const metadata=new WeakMap<object,PreparedMetadata & {verifiedDigest:string;policyVersion:string}>();
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uniqueRef=(prefix:string)=>`${prefix}_${randomBytes(9).toString('base64url')}`;
function freeze<T>(value:T):T {if (value&&typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const plainLiteral=(value:string)=>value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/[\\`*_{}\[\]()<>!&]/g,character=>`\\${character}`);

export class PrivacyEngine {
  readonly policy:Readonly<PrivacyPolicy>;
  constructor(private readonly options:{
    vault:ScopedIdentityVault;
    authorizeEntity:(ctx:RequestContext,entity:Pick<PrivacyEntity,'kind'|'id'>)=>Promise<boolean>;
    resolveDisplayName?:(ctx:RequestContext,entity:Pick<PrivacyEntity,'kind'|'id'>)=>Promise<string|null>;
    policy?:Partial<PrivacyPolicy>;
  }) {
    this.policy=Object.freeze({...DEFAULT_PRIVACY_POLICY,...options.policy});
    if (this.policy.mode!=='strict' || this.policy.minimumGroupSize<2 || this.policy.maxScopeHours<=0 || this.policy.maxScopeHours>2160 || !Number.isSafeInteger(this.policy.roundMoneyMinorTo) || this.policy.roundMoneyMinorTo<1) throw new DomainError('PRIVACY_POLICY_INVALID','La política de privacidad no es válida.',500);
  }
  async prepare(input:PrepareInput):Promise<PreparedEnvelope> {
    const intent=intentSchema.parse(input.intent);
    if (intent==='unknown' || input.verified.intent!==intent) throw new DomainError('PRIVACY_UNSUPPORTED_INTENT','Selecciona una consulta guiada antes de usar un proveedor externo.');
    const parameters=inputParameters.parse(input.parameters||{});
    if (parameters.from&&parameters.to&&parameters.from>parameters.to) throw new DomainError('PRIVACY_PARAMETERS_INVALID','El período no es válido.');
    const entities=[...new Map((input.entities||[]).map(entity=>[`${entity.type}:${entity.id}`,entity])).values()];
    if (entities.length>100) throw new DomainError('PRIVACY_INPUT_LIMIT','La consulta contiene demasiadas referencias.');
    assertStrictQuestion(input.question,entities,Object.values(parameters).map(String));
    const personEntities=entities.some(entity=>entity.type==='PERSON');
    if ((!this.policy.allowEntityLevel || personEntities) && (input.groupSize===undefined || input.groupSize<this.policy.minimumGroupSize)) throw new DomainError('PRIVACY_SMALL_GROUP','La salida externa requiere un agregado con suficiente cobertura.');
    for (const entity of entities) {
      if (!entity.id || !entity.kind || entity.displayName.length>1000 || !await this.options.authorizeEntity(input.ctx,entity)) throw new DomainError('PRIVACY_ENTITY_DENIED','La consulta incluye una entidad no autorizada.',403);
    }
    const expiresAt=input.expiresAt||new Date(Date.now()+this.policy.maxScopeHours*3600000).toISOString();
    if (Date.parse(expiresAt)<=Date.now() || Date.parse(expiresAt)>Date.now()+this.policy.maxScopeHours*3600000+1000) throw new DomainError('PRIVACY_SCOPE_INVALID','La caducidad del ámbito no es válida.');
    const references=[];const entityMap=new Map<string,PrivacyEntity>();
    for (const entity of entities) {
      const reference=await this.options.vault.issue(input.ctx,input.scopeId,entity,expiresAt);
      references.push(reference);entityMap.set(reference.token,entity);
    }
    const metricMap:PreparedMetadata['metrics']=new Map();
    const safeMetrics:PrivacyEnvelope['metrics']=[];
    for (const block of input.verified.blocks) if (block.type==='metric') {
      if (safeMetrics.length>=50 || block.value!==null&&(!Number.isFinite(block.value)||block.format==='money'&&!Number.isSafeInteger(block.value))) throw new DomainError('PRIVACY_METRIC_INVALID','Los indicadores no cumplen el contrato de salida.');
      const ref=uniqueRef('m');metricMap.set(ref,block);
      const value=block.value===null?null:block.format==='money'?Math.round(block.value/this.policy.roundMoneyMinorTo)*this.policy.roundMoneyMinorTo:block.value;
      safeMetrics.push({ref,value,format:block.format,...(block.currency&&/^[A-Z]{3}$/.test(block.currency)?{currency:block.currency}:{})});
    }
    const evidenceMap=new Map<string,string>();
    const evidence=input.verified.evidence.slice(0,100).map(item=>{
      const ref=uniqueRef('s');evidenceMap.set(ref,item.id);
      return {ref,observedMonth:/^\d{4}-\d{2}/.exec(item.observedAt)?.[0]||'unknown'};
    });
    const envelope:PrivacyEnvelope={schemaVersion:'birdview.privacy.v1',intent,question:templates[intent],parameters,references:references.map(item=>({ref:item.token,type:item.type})),metrics:safeMetrics,evidence,rules:{identities:'opaque',numericNarrative:'metric_reference_only',output:'typed_segments_only'}};
    const decision={id:randomUUID(),policyVersion:this.policy.version,allowed:true,rule:'positive_structured_envelope',tokenCount:references.length,metricCount:safeMetrics.length,omittedBlocks:input.verified.blocks.filter(block=>block.type!=='metric').length};
    const prepared=freeze({envelope,privacyDecisionId:decision.id,decision});
    metadata.set(prepared,{organizationId:input.ctx.organizationId,scopeId:input.scopeId,expiresAt,entities:entityMap,references,metrics:metricMap,evidence:evidenceMap,verifiedDigest:digest(input.verified),policyVersion:this.policy.version});
    return prepared;
  }
  private getMetadata(ctx:RequestContext, prepared:PreparedEnvelope):PreparedMetadata & {verifiedDigest:string;policyVersion:string} {
    const local=metadata.get(prepared);
    if (!local || local.organizationId!==ctx.organizationId || Date.parse(local.expiresAt)<=Date.now() || local.policyVersion!==this.policy.version) throw new DomainError('PRIVACY_ENVELOPE_INVALID','La solicitud de privacidad no está autorizada o ha caducado.',403);
    return local;
  }
  async recheck(ctx:RequestContext,prepared:PreparedEnvelope):Promise<void> {
    const local=this.getMetadata(ctx,prepared);
    for (const reference of local.references) await this.options.vault.resolve(ctx,local.scopeId,reference.token,local.references,entity=>this.options.authorizeEntity(ctx,entity));
  }
  assertVerified(ctx:RequestContext,prepared:PreparedEnvelope,verified:AnalysisResult):void {
    if (this.getMetadata(ctx,prepared).verifiedDigest!==digest(verified)) throw new DomainError('PRIVACY_FACTS_CHANGED','Los datos verificados cambiaron; vuelve a preparar la consulta.',409);
  }
  assertSerializedBody(ctx:RequestContext,prepared:PreparedEnvelope,body:string):void {
    const local=this.getMetadata(ctx,prepared);
    const normalized=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('es');
    const text=normalized(body);
    for (const entity of local.entities.values()) for (const raw of [entity.displayName,...entity.aliases||[]]) {
      const alias=normalized(raw).trim();if (alias.length<3) continue;
      let offset=0,index:number;
      while ((index=text.indexOf(alias,offset))>=0) {
        offset=index+alias.length;
        if (!/[\p{L}\p{N}_]/u.test(text[index-1]||'')&&!/[\p{L}\p{N}_]/u.test(text[index+alias.length]||'')) throw new DomainError('PRIVACY_SERIALIZATION_BLOCKED','La solicitud serializada contiene una identidad local.',403);
      }
    }
  }
  async renderSegments(ctx:RequestContext,prepared:PreparedEnvelope,segments:readonly OutputSegment[]):Promise<{text:string;evidenceIds:string[];metricRefs:string[]}> {
    const local=this.getMetadata(ctx,prepared);const parts:string[]=[],evidenceIds:string[]=[],metricRefs:string[]=[];
    if (segments.length>100) throw new DomainError('AI_OUTPUT_INVALID','La respuesta excede el contrato permitido.');
    await this.recheck(ctx,prepared);
    for (const segment of segments) {
      if (segment.type==='entity') {
        const entity=await this.options.vault.resolve(ctx,local.scopeId,segment.value,local.references,item=>this.options.authorizeEntity(ctx,item));
        const label=this.options.resolveDisplayName?await this.options.resolveDisplayName(ctx,entity):local.entities.get(segment.value)?.displayName||entity.displayName;
        if (!label) throw new DomainError('IDENTITY_ACCESS_REVOKED','No se puede reconstruir esta identidad.',403);
        parts.push(plainLiteral(label));
      } else if (segment.type==='metric') {
        const metric=local.metrics.get(segment.value);
        if (!metric) throw new DomainError('AI_METRIC_INVENTED','La respuesta contiene un indicador no verificado.');
        metricRefs.push(metric.metricRef);
        const value=metric.value;
        parts.push(value===null?'N/A':metric.format==='money'?new Intl.NumberFormat('es-ES',{style:'currency',currency:metric.currency||'EUR'}).format(value/100):metric.format==='percent'?`${new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(value)} %`:new Intl.NumberFormat('es-ES').format(value));
      } else if (segment.type==='evidence') {
        const evidence=local.evidence.get(segment.value);
        if (!evidence) throw new DomainError('AI_SOURCE_INVENTED','La respuesta contiene una fuente no verificada.');
        evidenceIds.push(evidence);
      } else {
        if (segment.value.length>3000 || /[\p{N}<>]|https?:|www\.|\[\[BV_|!\[|mailto:|javascript:/iu.test(segment.value)) throw new DomainError('AI_NARRATIVE_UNVERIFIED','La respuesta incluye cifras o contenido no verificable.');
        parts.push(plainLiteral(segment.value));
      }
    }
    return {text:parts.join(''),evidenceIds:[...new Set(evidenceIds)],metricRefs:[...new Set(metricRefs)]};
  }
  async revokeScope(ctx:RequestContext,scopeId:string):Promise<void> {await this.options.vault.revokeScope(ctx,scopeId);}
}
