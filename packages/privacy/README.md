# Local privacy boundary

```ts
const vault = new ScopedIdentityVault({
  storage: createVaultStorage(),
  keys: { v1: process.env.VAULT_ENCRYPTION_KEY! },
  activeKeyVersion: 'v1', lookupKey: process.env.VAULT_LOOKUP_KEY!,
});
const privacy = new PrivacyEngine({ vault, authorizeEntity });
const prepared = await privacy.prepare({
  ctx, scopeId: conversationId, intent: analysis.intent,
  parameters: { from, to, currency: 'EUR' }, entities,
  verified: analysis, question, groupSize: 40,
});
await privacy.recheck(ctx, prepared);
```

`authorizeEntity(ctx, { kind, id })` **must re-read current authorization and the entity**, returning false after revocation. `entities` are already authorized local `PrivacyEntity` values `{id,type:'ORG'|'PERSON'|'ENTITY',kind,displayName,aliases?,fields?}`. Only opaque references and allowed aggregate metrics leave; fields/aliases/names stay local. `question` is used only by the deterministic allowlist recognizer and is not transmitted.

`VaultStorage` is structurally implemented by `@birdview/db.createVaultStorage()`. It supplies bounded `put`, `getByCanonical`, `getByTokens`, `revokeScope` and `purgeExpired` with verified context. The vault role has function-only access; the application role cannot list mappings. Ciphertext is one AEAD JSON string, no names in keys or queue payloads.

`PreparedEnvelope` is a server-issued in-memory object, not request JSON. Do not persist it, expose it through API, accept it from clients, or log it. Reconstruct it on each job/retry path through `prepare`/`recheck`. The provider receives only `.envelope`; mappings and internal principal/source IDs are never serialized. Literal token syntax in input is rejected. A scope is stable for conversation/job turns and expires within the configured maximum.

`PrivacyPolicy` defaults to strict mode, known fields only, aggregated external metrics, minimum group size 5, and no uncontrolled free-text egress. A per-entity exception must be deliberately configured; health, payroll and secrets are always blocked. This is reversible pseudonymization, not anonymous data or a universal free-text detector.
