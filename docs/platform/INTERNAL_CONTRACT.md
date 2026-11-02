# Implementation coordination

This is a new full-stack product at `/app`. Existing `/`, `/demo`, `/page` and the old package scripts remain useful and preserved. No proprietary runtime from the HTML is used. Root owns workspace manifests, shared contracts, API routes, infrastructure and integration. Other agents own their assigned package trees only.

All packages import shared types from `@birdview/contracts`; exports point to src TypeScript and execution uses tsx. Strict TypeScript. Root supplies package manifests/dependencies and pnpm install. No agent edits root package.json, lockfiles, env, compose or another agent's files.

## Shared data contract

Read `packages/contracts/src/index.ts`. All persisted domain entities have a validated organization context and a JSON data field, a numeric version, owner and department. SQL also enforces organization-qualified relations and RLS. ListOptions use bounded limit/offset. Unknown request schemas must be rejected; no unrestricted client CRUD endpoint.

Business data names:
- accounts: name,taxId,email,domain,aliases.
- contacts: name,email,phone,accountId.
- employees: name,email,teamId,active,availabilityPercent (never salary/health).
- teams: name.
- opportunities: name,accountId,ownerId,pipelineId,stageId,valueMinor,currency,status(open/won/lost),probability,expectedCloseDate,closedDate.
- stages: name,position,probability,status; pipelines: name,stageIds.
- invoices: number,accountId,totalMinor,paidMinor,creditMinor,currency,issuedDate,dueDate,status(open/paid/void/credited).
- payments: invoiceId,accountId,amountMinor,currency,paidDate.
- tickets: subject,description,accountId,priority,status,openedDate.
- products: name,sku,stock,minimumStock.
- orders: accountId,productId,quantity,status,expectedDate,deliveredDate,valueMinor,currency.
- inventory_movements: productId,delta,occurredAt.
- projects: name,accountId,status.
- entity_events: entityKind,entityId,eventType,occurredAt,sourceUpdatedAt,observedAt.
Money is integer minor units. All dates ISO UTC/date-only as appropriate. Every imported record stores source provenance in authorized data.source object, no full provider payload.

## Package exports required

DB/auth owner defines and documents concrete factories quickly: `createDataPort()`, `resolvePrincipal(userId, organizationId)`, organization/membership lookup and auth handler. Shared RequestContext is never constructed from request bodies. Also expose bounded vault persistence and atomic budget reservation helpers. Root adapts factory names when notified.

Analytics: `analyze(store, ctx, {question?,intent?,filters?,accountId?}):Promise<AnalysisResult>`, `detectIntent(question)`, `getCityView(store,ctx,filters?)`, `getBriefing(store,ctx)`, `reportSnapshot(store,ctx,template,filters?)`. Only authorized store rows, actual sums, currencies, evidence, real temporal coverage. Demo replies use this analysis and no external call.

Privacy/AI: strict, positively constructed external envelopes, AES-GCM scoped opaque token vault and runtime response validation. No raw question leaves. Publish your exact integration API in your package README early. External provider transports are injected and spy-testable. Budget adapter has reserve/reconcile/release. Endpoints are operator allowlisted. Demo mode can return the verified analysis without a network call.

Worker/reporting: export queue producer `enqueue(kind, {organizationId,userId,entityId,authorizationVersion,principalType?})`, IDs only. Real BullMQ. Worker re-resolves current membership then uses withTenant. Kinds chat/report/sync/routine/studio/retention. Root owns apps/worker/src/chat.ts. Worker owner handles worker entry + report/sync/routine dispatch and calls processChat for chat. Reporting exports build HTML/CSV/PDF and private ArtifactStore. Follow contracts/analytics data; notify root of exact integration signatures. Never inline long jobs into API HTTP.

Connectors: HubSpot/Holded/Factorial manifests + actual documented read adapters/fixture contract tests; CSV/JSON preview/map/commit with row errors, strict field allowlist and provenance. Import operates with TenantStore and verified RequestContext. Sync credentials are server handles and never in queue payloads. Root adapts adapters to connection endpoints.

## Frontend API contract (root implements)

Base `/api/v1`. Every cookie-authenticated mutation includes `x-csrf-token` from GET /session; requests send same-origin cookies. Auth UI calls POST /auth/demo only in development demo profile, or BetterAuth POST /api/auth/sign-in/email and sign-up/email. Demo random credentials stay private server-side.

- GET /session -> Bootstrap (unauthenticated401). POST /organizations/select {organizationId} -> Bootstrap after membership validation.
- POST /onboarding {name,template,currency,timezone,modules,mode(empty/demo)}.
- GET /briefing -> {items:[{title,description,...}],questions:string[],asOf,warnings}.
- GET /city -> CityViewModel. GET /metrics -> AnalysisResult executive.
- GET /entities/:kind -> {items:Entity[],nextOffset:number|null}; only permitted resource kinds.
- GET /conversations -> {items:Entity[]}; POST {title} -> Entity.
- GET /conversations/:id/messages -> {items:Entity[]}, messages.data holds role,content,answer?,status,queryId.
- POST /conversations/:id/messages {content,filters?,contextEntityId?} -> {messageId,queryId,status,streamUrl}; worker persists Answer and statuses. GET /events/:queryId SSE real persisted progress only, authorized by owner.
- GET /knowledge, /tasks, /approvals, /routines, /reports, /presentations, /studio, /connections, /activity, /members, /ai/providers, /privacy, /api-keys -> {items:Entity[] or typed records}. POST variants validate feature-specific data; UI submits documented fields below, root adapts.
- knowledge POST {title,content,type?,departmentId?,validUntil?}; PATCH /knowledge/:id {title?,content?,status?(active/archived/forgotten)}.
- tasks POST {title,description?,dueAt?,departmentId?}; PATCH /tasks/:id {status?,title?}.
- routines POST {title,schedule(daily_briefing/weekly_report/receivables),timezone?}; PATCH {status(active/paused/cancelled)}.
- approvals POST {title,resourceKind,resourceId,operation,patch,expectedVersion}; POST /approvals/:id/approve, /reject and /execute with version/hash checks.
- reports POST {template(executive/sales/receivables/operations/people),format(html/pdf/csv),filters?} -> Entity queued. GET /artifacts/:id/download authenticated.
- presentations POST {title}; PATCH /presentations/:id {title?,slides:[{title,text,kind?}]}; POST /presentations/:id/export {format:pdf} -> report job. HTML preview functional.
- studio POST {kind(chart/image/video),title,prompt?}; charts generate local SVG, image/video stay blocked without provider. GET /studio library/jobs.
- connections GET includes provider manifest/catalog and runtime status. POST {provider,name,entities?,token?} token encrypted. POST /connections/:id/sync, /disconnect; import POST /imports/preview {format(csv/json),content,entityKind,mapping?} and /imports/commit {format,content,entityKind,mapping?}.
- ai/providers POST {provider,model,endpoint?,apiKey?} requires operator-approved endpoint; status configured/pending, never default fake success. Privacy GET policy/counters; PATCH strict safe policy fields. ai/budget GET/POST.
- API keys POST {name,queries:[intent],expiresAt?} -> one-time key; DELETE /api-keys/:id revoke. Published query POST {name,intent,parameters?}; external /public/queries/:id requires hashed key verification and separate aggregate/pseudonymous output policy.
- members POST {email,role,departmentIds?} creates one-use invite, no outbound email; server returns invitation link/token for manual delivery. PATCH /members/:id {role?,departmentIds?,active?} revokes/version invalidates.

No frontend fabricated answers/metrics. Render actual loading/empty/permission/error/pending states. City SVG from authorized CityViewModel, optional desktop side pane, mobile separate screen. Reuse visual reference but not runtime/compiled app.
