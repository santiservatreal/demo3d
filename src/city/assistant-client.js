import { answerCityQuestion, companyRecommendations } from "./assistant-model.js";
import { metrics } from "./model.js";
import { communicationsSummary } from "./communications-model.js";
import { industryMetrics } from "./industry-model.js";

const LIMITS = { owners: 20, accounts: 60, deals: 60, stages: 12, tasks: 30, people: 20, batches: 60, vehicles: 20, products: 8, recommendations: 8 };
const list = (value) => Array.isArray(value) ? value : [];
const string = (value, limit = 180) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, limit) : null;
const number = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
const fields = (record, strings = [], numbers = []) => Object.fromEntries([
  ...strings.map((key) => [key, string(record?.[key])]),
  ...numbers.map((key) => [key, number(record?.[key])]),
]);
const records = (value, limit, strings, numbers) => list(value).slice(0, limit).map((record) => fields(record, strings, numbers));
const source = (snapshot) => ({
  type: string(snapshot?.source?.type, 30),
  label: string(snapshot?.source?.label || snapshot?.source?.name || snapshot?.source?.system, 100),
  now: string(snapshot?.now, 40),
  timeZone: string(snapshot?.timeZone, 60),
});
const salesNumbers = ["openCount", "openAmount", "wonCount", "wonAmount", "lostCount", "activeClients", "attentionCount", "overdueTasks"];
const industryNumbers = ["totalUnits", "inProduction", "packed", "stock", "inTransit", "delivered", "batchCount", "availableTrucks", "activeTrucks"];

/** Shared whitelist: never sends raw history, contact details, URLs or credentials. */
export function sanitizeCityAssistantContext(input = {}) {
  const cleanSource = (value) => fields(value, ["type", "label", "now", "timeZone"]);
  const validActions = new Set(["focus-owner", "focus-entity", "district", "attention"]);
  return {
    source: { crm: cleanSource(input.source?.crm), erp: cleanSource(input.source?.erp) },
    finance: { invoicesAvailable: false, paymentsAvailable: false, costsAvailable: false },
    sales: {
      metrics: fields(input.sales?.metrics, [], salesNumbers),
      stages: records(input.sales?.stages, LIMITS.stages, ["id", "name", "kind"], ["count", "amount"]),
      owners: records(input.sales?.owners, LIMITS.owners, ["id", "name", "initials"]),
      accounts: records(input.sales?.accounts, LIMITS.accounts, ["id", "name", "ownerId", "status"]),
      deals: records(input.sales?.deals, LIMITS.deals, ["id", "name", "accountId", "ownerId", "stageId", "nextStep", "lastActivityAt", "lastStageChangedAt"], ["amount"]),
      tasks: records(input.sales?.tasks, LIMITS.tasks, ["id", "dealId", "dueAt", "status"]),
    },
    communications: records(input.communications, 4, ["id", "name"], ["totalCount", "todayCompleted", "pendingCount"]).map((entry, index) => ({ ...entry, sourceAvailable: input.communications?.[index]?.sourceAvailable === true })),
    industry: {
      metrics: { ...fields(input.industry?.metrics, ["unit"], industryNumbers), complete: input.industry?.metrics?.complete === true, vehicleComplete: input.industry?.metrics?.vehicleComplete === true },
      products: records(input.industry?.products, LIMITS.products, ["id", "name", "sku", "unit"]),
      batches: records(input.industry?.batches, LIMITS.batches, ["id", "productId", "accountId", "accountName", "stageId", "assignedTruckId", "updatedAt"], ["quantity"]),
      vehicles: records(input.industry?.vehicles, LIMITS.vehicles, ["id", "name", "driverName", "cargoBatchId", "status", "location"]),
    },
    people: records(input.people, LIMITS.people, ["ownerId", "id", "activity", "targetEntityId", "dealId"]).map((entry, index) => ({ ...entry, attendingConstruction: input.people?.[index]?.attendingConstruction === true })),
    recommendations: list(input.recommendations).slice(0, LIMITS.recommendations).map((tip) => ({
      id: string(tip?.id), title: string(tip?.title), text: string(tip?.text, 500), sourceLabel: string(tip?.sourceLabel),
      action: validActions.has(tip?.action?.type) ? { type: tip.action.type, ...(typeof tip.action.id === "string" ? { id: string(tip.action.id) } : {}) } : null,
    })),
    coverage: {
      recordsMayBeTruncated: input.coverage?.recordsMayBeTruncated === true,
      historicalPerformanceAvailable: false,
      liveGpsAvailable: false,
    },
  };
}

/** Derives small, current summaries before crossing the optional server boundary. */
export function buildCityAssistantContext({ state, industryState, people = [] } = {}) {
  let totals = null, communications = [], industrial = null, recommendations = [];
  try { totals = metrics(state); } catch { /* Missing data stays null. */ }
  try { communications = communicationsSummary(state); } catch { /* No zero invented. */ }
  try { industrial = industryMetrics(industryState); } catch { /* Missing inventory. */ }
  try { recommendations = companyRecommendations({ state, industryState }); } catch { /* No inference without data. */ }
  const ownerPeople = Array.isArray(people) ? people : list(people?.owners);
  const sizes = { owners: list(state?.owners), accounts: list(state?.accounts), deals: list(state?.deals), stages: list(state?.stages), tasks: list(state?.activities).filter((entry) => entry.type === "task" && entry.status === "pending"), people: ownerPeople, batches: list(industryState?.batches), vehicles: list(industryState?.vehicles), products: list(industryState?.products), recommendations };
  return sanitizeCityAssistantContext({
    source: { crm: source(state), erp: source(industryState) },
    sales: { metrics: totals, stages: totals?.stages || state?.stages, owners: sizes.owners, accounts: sizes.accounts, deals: sizes.deals, tasks: sizes.tasks },
    communications,
    industry: { metrics: industrial, products: sizes.products, batches: sizes.batches, vehicles: sizes.vehicles },
    people: ownerPeople,
    recommendations,
    coverage: { recordsMayBeTruncated: Object.entries(sizes).some(([key, values]) => values.length > LIMITS[key]) },
  });
}

export function validCityAssistantActions(actions, context) {
  if (!Array.isArray(actions) || actions.length > 3) return false;
  const owners = new Set(list(context?.sales?.owners).map((entry) => entry.id));
  const entities = new Set([
    ...list(context?.sales?.deals), ...list(context?.sales?.accounts),
    ...list(context?.industry?.batches), ...list(context?.industry?.vehicles),
  ].map((entry) => entry.id));
  return actions.every((action) => {
    if (!action || typeof action !== "object" || Object.keys(action).some((key) => !["type", "id"].includes(key))) return false;
    if (action.type === "attention") return action.id == null;
    if (action.type === "focus-owner") return typeof action.id === "string" && owners.has(action.id);
    if (action.type === "focus-entity") return typeof action.id === "string" && entities.has(action.id);
    return action.type === "district" && ["all", "sales", "communications", "industry"].includes(action.id);
  });
}

const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// These answers require records absent from this demo. Keep their limits exact,
// even when a language model is configured.
export const needsUnavailableData = (question) => /\b(factur\w*|cobro\w*|cobrad\w*|ingres\w*|beneficio\w*|caja|costes?\b|gastos?\b|presupuesto\w*|rendimiento\w*|productividad|bajado|empeorado)\b/.test(normalize(question));

const unavailableEndpoints = new Set();

/** Optional AI, with the deterministic, read-only demo as the explicit fallback. */
export async function requestCityAnswer(question, context = {}, options = {}) {
  const local = () => ({ ...answerCityQuestion(question, context), mode: "local" });
  const endpoint = options.endpoint || "/api/assistant";
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (options.remote === false || needsUnavailableData(question) || typeof fetchImpl !== "function" || (!options.fetchImpl && unavailableEndpoints.has(endpoint))) return local();
  const controller = new AbortController();
  const externalAbort = () => controller.abort();
  options.signal?.addEventListener("abort", externalAbort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const snapshot = buildCityAssistantContext(context);
    const body = JSON.stringify({ question: String(question ?? "").slice(0, 1000), context: snapshot });
    if (new TextEncoder().encode(body).length > 128 * 1024) return local();
    const response = await fetchImpl(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal });
    if (!response.ok) {
      if (!options.fetchImpl && [404, 405, 503].includes(response.status)) unavailableEndpoints.add(endpoint);
      return local();
    }
    const answer = await response.json();
    if (typeof answer?.text !== "string" || !answer.text.trim() || answer.text.length > 6000 || !validCityAssistantActions(answer.actions, snapshot)) return local();
    return { text: answer.text, actions: answer.actions, sourceLabel: typeof answer.sourceLabel === "string" ? answer.sourceLabel.slice(0, 240) : local().sourceLabel, mode: answer.mode === "local" ? "local" : "ai" };
  } catch {
    return local();
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", externalAbort);
  }
}
