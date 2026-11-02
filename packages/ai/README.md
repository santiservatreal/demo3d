# AI gateway

```ts
const demo = new DemoAIProvider();
const answer = demo.generateVerified(analysis); // returns verified blocks, zero transport

const provider = new OpenAIHTTPProvider({
  id: 'approved-openai', kind: 'external', model: 'operator-configured-model',
  endpoint: 'https://api.openai.com/v1', apiKey: serverSecret,
  capabilities: { structuredOutput: true },
  review: { status: 'approved', region: 'operator-reviewed', retentionDays: 30,
    training: 'disabled', reviewedAt: new Date().toISOString() },
});
const gateway = new PrivacyGateway({
  privacy, budget: createBudgetStore(),
  approvedEndpoints: [{ url: 'https://api.openai.com/v1', allowPrivateNetwork: false }],
  policy: { allowExternal: true, allowedRegions: ['operator-reviewed'],
    maxRetentionDays: 30, monthlyLimitMinor: 1000, currency: 'EUR' },
});
const result = await gateway.generate({ ctx, prepared, verified: analysis, provider });
// { blocks, mode, usage, privacyDecisionId, warnings }
```

`AI_ALLOWED_ENDPOINTS` is an **operator** allowlist, not a tenant-controlled setting. A tenant endpoint must equal an approved base URL exactly. HTTPS is mandatory except an explicitly operator-approved private self-hosted destination. DNS is resolved and validated, then pinned into the actual Node HTTP request; redirects and large bodies are rejected. Tests inject a transport spy at the actual serialized HTTP boundary.

`BudgetStore.reserve(ctx,{reservationId,amountMinor,limitMinor,currency})`, `.reconcile(ctx,{reservationId,actualMinor})`, `.release(ctx,reservationId)` are structurally implemented by `@birdview/db.createBudgetStore()`. Reservations occur before transport; failed calls release them. Root must supply approved, versioned pricing through each provider's config; no fictitious cost/tokens are asserted.

The adapter targets the documented OpenAI Chat Completions HTTP structured-output contract. Self-hosted compatibility must be explicitly declared and contract-tested; it is not inferred from a URL. No keys/provider review means no external calls. A fallback must have an equally restrictive approved policy, the same reviewed region, and no longer retention. It passes privacy/authorization and reserves budget again.

Provider text never controls SQL, HTTP destinations, tools or writes. The structured response contains narrative segments referencing only issued identities/verified metrics/evidence. Unknown sources, tokens, numeric literals, executable HTML or URLs are rejected/corrected; the original verified metric/table/chart blocks remain authoritative. External output still requires a separate aggregate or pseudonymous policy; gateway rehydration is for the currently authorized internal user only.
