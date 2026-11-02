# Reporting integration contract

Exports from `@birdview/reporting`:

```ts
renderReportHtml(snapshot: ReportSnapshot, options?: {organizationName?:string}): string
renderReportCsv(snapshot: ReportSnapshot): Buffer
renderPdf(html: string): Promise<Buffer>
renderPresentationHtml(document: {title:string;slides:{title:string;text:string;kind?:string}[]}, options?):string
renderChartSvg(snapshot: ReportSnapshot): Buffer
createArtifactStore(): ArtifactStore
authorizeArtifact(ctx:RequestContext, artifact:Entity): void
readArtifact(ctx:RequestContext, artifact:Entity): Promise<Buffer>
```

`ReportSnapshot` comes from `@birdview/analytics`. Monetary metric values are integer minor units. Formats do not recalculate analytics. Text is escaped, CSV formulas are neutralized for strings, and PDF rendering has JavaScript and all network requests disabled.

Worker writes `artifacts.data` with `storageKey`, `storageBackend`, `mimeType`, `size`, `sha256`, `filename`, `expiresAt`, `authorizationVersion`, `requiredPermissions`, `departmentIds`, `reportRunId`. The artifact entity `ownerId` is the requester. Download must first obtain that entity through the authenticated TenantStore and then call `readArtifact(ctx,artifact)`, which also validates organization, owner, authorization version, expiry, department and required permissions. Never serve the artifact directory directly or expose S3 presigned URLs.

Storage uses `ARTIFACT_DIR` (default `.local/artifacts`) and `ARTIFACT_BACKEND=local|s3`. S3 is an operator-controlled adapter using `S3_BUCKET`, `AWS_REGION`, optional `S3_ENDPOINT`, `S3_KMS_KEY_ID`, and the AWS SDK's credential chain. No credentials enter jobs or frontend payloads. SDK default paths remain private; API always revalidates authorization before reading bytes.
