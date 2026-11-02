# Connector package integration

Exports (from `@birdview/connectors`):

- `connectorCatalog`: public manifests, no credentials. HubSpot read adapter verified against official SDK14.1.3; Holded/Factorial mappings and interfaces are present but live transport remains unavailable until official schemas/auth can be verified. Their documentation was blocked by CONNECT403 in this environment.
- `getConnector(provider)`: typed `Connector` or DomainError.
- `importPreview({format:'csv'|'json',content,entityKind,mapping?,connectionId?})`: returns `{entityKind,columns,rows,errors,excludedColumns,validCount,invalidCount}`. Mapping is source-column -> target-field, or `{target,transform:'identity'|'trim'|'decimal_to_minor'}`. Special columns externalId/departmentId are not domain payload fields. Raw unknown fields are denied unless an explicit mapping excludes them. Max5MiB/10,000rows. Money amounts in Minor fields must be integer; decimal conversion is explicit and exact.
- `commitImport(store,ctx,args)`: revalidates input (never trusts client preview), returns `{created,updated,unchanged,invalid,errors,connectionId}`. Caller uses `withTenant`; import errors roll back via caller transaction. IDs deduplicate within org+connection+kind+externalID. `connectionId` must belong to the caller organization when supplied; absent uses a managed manual-import connection.
- `runSync(ctx,connection,store,secretReader,options?)`: real read pagination, bounded retry, idempotent upserts/tombstones and cursor updates atomically in the supplied TenantStore. `secretReader(connection.id)` returns `{token:string}` only server-side. Returns `{status,created,updated,deleted,unchanged,pages,records,warnings}`.
- `options.pageTransaction?: <T>(fn:(pageStore:TenantStore)=>Promise<T>)=>Promise<T>` permits per-page transactions. If used, do not wrap all runSync in another tenant transaction. Otherwise the complete sync is one atomic transaction and partial failures roll back to the previous cursor. Options can inject `fetch`, `sleep`, `signal`, `now` for tests, never from a tenant request.

Worker integration: retrieve connection under verified membership; require connection.status not revoked; read encrypted credentials by connection ID in server adapter; no credentials in BullMQ data. For a single transaction call `withTenant(ctx,store => runSync(ctx,connection,store,secretReader))`. Do not catch a failure inside that transaction and commit partial results; record sanitized failure status in a separate transaction.

More details and credential-validation gaps: `docs/connectors/PLATFORM.md`.
