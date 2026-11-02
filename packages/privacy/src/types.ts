import type { AnalysisResult, QueryIntent, RequestContext } from '@birdview/contracts';

export type IdentityType = 'ORG' | 'PERSON' | 'ENTITY';
export interface PrivacyEntity {
  id: string;
  type: IdentityType;
  kind: string;
  displayName: string;
  aliases?: string[];
  fields?: Record<string, unknown>;
}
export interface VaultRecord {
  organizationId: string; scopeId: string; canonicalKey: string; token: string;
  ciphertext: string; expiresAt: string; keyVersion: string;
}
export interface VaultStorage {
  put(ctx: RequestContext, record: Omit<VaultRecord, 'organizationId'>): Promise<void>;
  getByCanonical(ctx: RequestContext, scopeId: string, canonicalKey: string): Promise<VaultRecord | null>;
  getByTokens(ctx: RequestContext, scopeId: string, tokens: string[]): Promise<VaultRecord[]>;
  revokeScope(ctx: RequestContext, scopeId: string): Promise<void>;
  purgeExpired(now: Date): Promise<number>;
}
export interface IdentityReference { readonly token: string; readonly type: IdentityType; }
export type FieldAction = 'ALLOW' | 'TOKENIZE' | 'REDACT' | 'AGGREGATE' | 'GENERALIZE' | 'DROP' | 'BLOCK';
export interface FieldRule { action: FieldAction; reason: string; }
export interface PrivacyPolicy {
  version: string;
  mode: 'strict';
  minimumGroupSize: number;
  allowEntityLevel: boolean;
  roundMoneyMinorTo: number;
  maxScopeHours: number;
}
export interface SafeParameters { from?: string; to?: string; currency?: string; limit?: number; }
export interface PrivacyEnvelope {
  schemaVersion: 'birdview.privacy.v1';
  intent: QueryIntent;
  question: string;
  parameters: SafeParameters;
  references: Array<{ ref: string; type: IdentityType }>;
  metrics: Array<{ ref: string; value: number | null; format: 'money' | 'number' | 'percent'; currency?: string }>;
  evidence: Array<{ ref: string; observedMonth: string }>;
  rules: { identities: 'opaque'; numericNarrative: 'metric_reference_only'; output: 'typed_segments_only' };
}
export interface PrivacyDecision {
  id: string; policyVersion: string; allowed: boolean; rule: string;
  tokenCount: number; metricCount: number; omittedBlocks: number;
}
export interface PreparedEnvelope {
  readonly envelope: Readonly<PrivacyEnvelope>;
  readonly privacyDecisionId: string;
  readonly decision: Readonly<PrivacyDecision>;
}
export interface PrepareInput {
  ctx: RequestContext; scopeId: string; intent: QueryIntent; parameters?: SafeParameters;
  entities?: PrivacyEntity[]; verified: AnalysisResult; question?: string;
  groupSize?: number; expiresAt?: string;
}
export interface OutputSegment { type: 'text' | 'entity' | 'metric' | 'evidence'; value: string; }
export interface PreparedMetadata {
  organizationId: string; scopeId: string; expiresAt: string;
  entities: Map<string, PrivacyEntity>;
  references: IdentityReference[];
  metrics: Map<string, Extract<AnalysisResult['blocks'][number], {type:'metric'}>>;
  evidence: Map<string, string>;
}
