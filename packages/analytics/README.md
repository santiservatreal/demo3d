# Analytics contract

All reads use an already-authorized `TenantStore` and its server-built `RequestContext`. There is no global response cache, SQL from a model, network request, hardcoded company, or client-side calculation.

Exports:

```ts
analyze(store, ctx, { question?, intent?, filters?, accountId?, organization? }): Promise<AnalysisResult>
detectIntent(question): { intent: QueryIntent; supported: boolean; period?: string; requestedDate?: string }
getCityView(store, ctx, filters?, organization?): Promise<CityViewModel>
getBriefing(store, ctx, filters?, organization?): Promise<Briefing>
reportSnapshot(store, ctx, template, filters?, organization?): Promise<ReportSnapshot>
```

`organization` is an optional verified `OrganizationSummary`, never arbitrary authorization supplied by the user. Without it, only nonempty authorized datasets appear in the city. `filters` use the shared strict schema. Dates are accounting dates; the current cutoff is computed in the organization time zone (Europe/Madrid by default).

`ReportSnapshot` has `{ template, title, asOf, currency, filters, coverage, kpis, tables, charts, sources, findings, methodology, blocks, analysis }`. Templates: executive, sales, receivables, operations, people. `kpis`, `tables`, `charts` and `blocks` are typed `AnswerBlock` variants; `sources` are `Evidence[]`; `findings`/`methodology` are strings. `analysis` is the same `AnalysisResult` used by the chat.

Money metric values and monetary chart series are integer **minor units**. Format them with `Intl.NumberFormat(...currency).format(value / 100)`. Percentage metrics use 0–100, and unavailable denominators return `null`. Monetary table cells are formatted for humans. Amounts from different currencies are never added; unselected currencies produce a coverage warning.

Definitions are versioned by `metricRef` (`bv.<definition>.v1`). Outstanding = max(0, total − credits − payments), excluding void/credited invoices. Overdue means positive outstanding and due date earlier than the current accounting cutoff. Issue-date filters select the invoice cohort; current balances are never presented as a reconstructed past balance. Win rate = won/(won+lost) within the explicit closed-date cohort. Weighted pipeline requires configured probabilities and rounds each deal to minor units. Historical answers require recorded events or snapshots covering the requested date; current state is never used to invent past state.

At most 10,000 authorized rows per entity kind are aggregated, with a visible partial-coverage warning at the limit. UI tables have bounded rows; evidence references only records actually used. A principal requesting a forbidden resource gets a 403 before retrieval. Executive summaries omit inaccessible modules. Salary, medical or health requests are rejected before reading any dataset. Team availability is suppressed for groups smaller than three people.
