import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemoState,
  createDemoProvider,
  metrics,
  filterDeals,
  needsAttention,
  applyEvent,
  demoReplayEvents,
  createReplayState,
} from "../src/city/model.js";

const wonEvent = (overrides = {}) => ({
  id: "test-win-001",
  entityId: "deal-013",
  timestamp: "2026-10-16T10:16:00+02:00",
  type: "deal.won",
  source: "atlas-demo",
  payload: { stageId: "won", accountId: "account-001" },
  ...overrides,
});

test("demo dataset is reproducible and all required totals are exact", () => {
  const state = createDemoState();
  assert.deepEqual(state, createDemoState());
  const result = metrics(state);
  assert.equal(state.deals.length, 31);
  assert.equal(new Set(state.deals.map((deal) => deal.id)).size, 31);
  assert.equal(new Set(state.deals.map((deal) => deal.plotIndex)).size, 31);
  assert.deepEqual(result.stages.map(({ count }) => count), [7, 5, 6, 6, 4]);
  assert.deepEqual(result.stages.map(({ amount }) => amount), [31500, 25000, 33000, 30500, 30000]);
  assert.equal(result.openCount, 24);
  assert.equal(result.openAmount, 120000);
  assert.equal(result.wonCount, 4);
  assert.equal(result.wonAmount, 30000);
  assert.equal(result.lostCount, 3);
  assert.equal(result.winRate, 4 / 7);
  assert.equal(result.winRateHistoryComplete, true);
  assert.equal(result.activeClients, 18);
  assert.equal(result.pendingContacts, 7);
  assert.equal(result.pendingConversations, 9);
  assert.equal(result.callsToday, 12);
  assert.equal(result.overdueTasks, 5);
  assert.equal(result.attentionCount, 5);
  assert.equal(result.emailsToday, 6);
  assert.equal(result.meetingsToday, 3);
  assert.equal(state.source.type, "simulated");
  for (const deal of state.deals) {
    assert.ok(state.accounts.some((account) => account.id === deal.accountId));
    assert.ok(state.owners.some((owner) => owner.id === deal.ownerId));
    assert.equal(deal.products.reduce((sum, product) => sum + product.quantity * product.unitPrice, 0), deal.amount);
  }
});

test("win rate requires complete closure history, excludes open deals and previous months", () => {
  const state = createDemoState();
  assert.equal(metrics(state).winRate, 4 / 7);
  state.deals.find((deal) => deal.id === "deal-001").amount = 999999;
  assert.equal(metrics(state).winRate, 4 / 7);
  const oldWin = state.deals.find((deal) => deal.id === "deal-025");
  oldWin.history.at(-1).timestamp = "2026-09-30T10:00:00+02:00";
  assert.equal(metrics(state).wonCount, 3);
  assert.equal(metrics(state).wonAmount, 25500);
  assert.equal(metrics(state).winRate, 3 / 6);
  delete state.historyCoverage;
  assert.equal(metrics(state).winRate, null);
  assert.match(metrics(state).winRateBasis, /No disponible/);
});

test("missing amount is not silently replaced by zero", () => {
  const state = createDemoState();
  state.deals[0].amount = null;
  const result = metrics(state);
  assert.equal(result.openCount, 24);
  assert.equal(result.openAmount, null);
  assert.equal(result.stages[0].amount, null);
  assert.equal(result.wonAmount, 30000);
});

test("closure history supports the minimal CRM contract and coverage must include the whole month", () => {
  const state = createDemoState();
  for (const deal of state.deals) for (const entry of deal.history) delete entry.type;
  assert.equal(metrics(state).wonAmount, 30000);
  assert.equal(metrics(state).winRate, 4 / 7);
  state.historyCoverage.from = "2026-10-15T00:00:00+02:00";
  assert.equal(metrics(state).winRate, null);
  state.historyCoverage.from = "2026-10-01T00:01:00+02:00";
  assert.equal(metrics(state).winRate, null);
  state.historyCoverage.from = "2026-09-15T12:00:00+02:00";
  assert.equal(metrics(state).winRate, 4 / 7);
});

test("won and lost stage IDs can both be renamed by a CRM adapter", () => {
  const state = createDemoState();
  state.stages.find((stage) => stage.id === "won").id = "signed";
  state.stages.push({ id: "cancelled", name: "Cancelled", color: "#aa9999", order: 5, kind: "lost" });
  for (const deal of state.deals) {
    if (deal.stageId === "won") deal.stageId = "signed";
    else if (deal.stageId === "lost") deal.stageId = "cancelled";
    for (const entry of deal.history) {
      if (entry.stageId === "won") entry.stageId = "signed";
      else if (entry.stageId === "lost") entry.stageId = "cancelled";
    }
  }
  assert.equal(metrics(state).winRate, 4 / 7);
  assert.equal(filterDeals(state).length, 28);
  assert.equal(applyEvent(state, wonEvent({ payload: { accountId: "account-001" } })), true);
  assert.equal(state.deals.find((deal) => deal.id === "deal-013").stageId, "signed");
  assert.equal(applyEvent(state, wonEvent({ id: "custom-loss", entityId: "deal-014", type: "deal.lost", payload: {} })), true);
  assert.equal(state.deals.find((deal) => deal.id === "deal-014").stageId, "cancelled");
  assert.equal(metrics(state).wonCount, 5);
  assert.equal(metrics(state).lostCount, 4);
  assert.equal(metrics(state).winRate, 5 / 9);
  assert.equal(filterDeals(state, { stageId: "cancelled", includeLost: true }).length, 4);
});

test("filters combine account/name search, stage, owner and overdue attention without mutation", () => {
  const state = createDemoState();
  const before = structuredClone(state);
  assert.equal(filterDeals(state).length, 28);
  assert.equal(filterDeals(state, { includeLost: true }).length, 31);
  assert.equal(filterDeals(state, { stageId: "lost", includeLost: true }).length, 3);
  assert.equal(filterDeals(state, { stageId: "proposal" }).length, 6);
  assert.equal(filterDeals(state, { attentionOnly: true }).length, 5);
  assert.ok(filterDeals(state, { query: "lucia ferrer" }).every((deal) => deal.ownerId === "owner-lucia"));
  assert.ok(filterDeals(state, { query: "Norte Studio" }).every((deal) => deal.accountId === "account-001"));
  assert.deepEqual(filterDeals(state, { query: "deal-013" }).map((deal) => deal.id), ["deal-013"]);
  assert.deepEqual(filterDeals(state, { stageId: "lead", ownerId: "owner-lucia", attentionOnly: true }).map((deal) => deal.id), ["deal-003"]);
  assert.equal(needsAttention(state.deals.find((deal) => deal.id === "deal-003"), state), true);
  assert.deepEqual(state, before);
});

test("winning reuses an existing customer and preserves deal and parcel identity", () => {
  const state = createDemoState();
  const deal = state.deals.find((item) => item.id === "deal-013");
  const plotIndex = deal.plotIndex;
  const accountsBefore = state.accounts.map((account) => account.id);
  const eventsBefore = state.events.length;
  assert.equal(applyEvent(state, wonEvent()), true);
  assert.equal(state.deals.find((item) => item.id === deal.id), deal);
  assert.equal(deal.plotIndex, plotIndex);
  assert.equal(deal.stageId, "won");
  assert.equal(deal.accountId, "account-001");
  assert.equal(deal.probability, 100);
  assert.deepEqual(state.accounts.map((account) => account.id), accountsBefore);
  assert.equal(state.events.length, eventsBefore + 1);
  assert.equal(deal.history.at(-1).eventId, "test-win-001");
  assert.equal(metrics(state).openCount, 23);
  assert.equal(metrics(state).openAmount, 117000);
  assert.equal(metrics(state).wonCount, 5);
  assert.equal(metrics(state).wonAmount, 33000);
  assert.equal(metrics(state).winRate, 5 / 8);
  assert.equal(state.events.at(-1).payload.fromStageId, "proposal");
  assert.equal(state.now, wonEvent().timestamp);
  assert.equal("invoice" in deal, false);
  assert.equal("cashReceived" in deal, false);
  assert.equal("profit" in deal, false);
});

test("duplicate and malformed events have no side effects, including no additional notifications", () => {
  const provider = createDemoProvider();
  let notifications = 0;
  const unsubscribe = provider.subscribe(() => notifications++);
  assert.equal(provider.dispatch(wonEvent()), true);
  const snapshot = structuredClone(provider.getState());
  assert.equal(provider.dispatch(wonEvent()), false);
  assert.deepEqual(provider.getState(), snapshot);
  assert.equal(provider.dispatch(wonEvent({ id: "unknown", entityId: "deal-missing" })), false);
  assert.equal(provider.dispatch(wonEvent({ id: "bad-time", timestamp: "yesterday" })), false);
  assert.equal(provider.dispatch(wonEvent({ id: "bad-kind", type: "invoice.paid" })), false);
  assert.equal(provider.dispatch(wonEvent({ id: "no-source", source: null })), false);
  assert.deepEqual(provider.getState(), snapshot);
  assert.equal(notifications, 1);
  unsubscribe();
  provider.reset();
  assert.equal(notifications, 1);
  assert.equal(metrics(provider.getState()).openAmount, 120000);
});

test("a new account is created once, only when an explicit account association exists", () => {
  const state = createDemoState();
  const event = wonEvent({ payload: { stageId: "won", accountId: "account-new", accountName: "Nuevo cliente demo" } });
  assert.equal(applyEvent(state, event), true);
  assert.equal(state.accounts.length, 19);
  assert.equal(state.accounts.at(-1).name, "Nuevo cliente demo");
  assert.equal(state.accounts.at(-1).renewalDate, null);
  assert.equal(applyEvent(state, event), false);
  assert.equal(state.accounts.length, 19);
  assert.equal(applyEvent(state, wonEvent({ id: "win-without-account", entityId: "deal-014", payload: { stageId: "won" } })), true);
  assert.equal(state.accounts.length, 19);
});

test("CRM stages are configurable; a sixth neighborhood works without changing model code", () => {
  const state = createDemoState();
  state.stages.find((stage) => stage.id === "won").order = 5;
  state.stages.push({ id: "legal-review", name: "Legal review", color: "#aa8866", order: 4, kind: "open" });
  const before = metrics(state);
  const event = wonEvent({
    id: "legal-review-event", type: "deal.stage_changed",
    payload: { stageId: "legal-review" },
  });
  assert.equal(applyEvent(state, event), true);
  assert.equal(filterDeals(state, { stageId: "legal-review" }).length, 1);
  assert.equal(metrics(state).stages.find((stage) => stage.id === "legal-review").amount, 3000);
  assert.equal(metrics(state).openAmount, before.openAmount);
  assert.equal(metrics(state).openCount, before.openCount);
  assert.equal(state.deals.find((deal) => deal.id === "deal-013").probability, null);
  assert.equal(applyEvent(state, wonEvent({ id: "undefined-stage", type: "deal.stage_changed", payload: { stageId: "nonexistent" } })), false);
});

test("late stale events cannot rewind a current deal and loss closes without a client duplicate", () => {
  const state = createDemoState();
  assert.equal(applyEvent(state, wonEvent()), true);
  const current = structuredClone(state);
  assert.equal(applyEvent(state, wonEvent({
    id: "late-update", timestamp: "2026-10-10T10:00:00+02:00",
    type: "deal.stage_changed", payload: { stageId: "qualified" },
  })), false);
  assert.deepEqual(state, current);
  assert.equal(applyEvent(state, wonEvent({ id: "test-loss", entityId: "deal-014", type: "deal.lost", payload: {} })), true);
  assert.equal(metrics(state).lostCount, 4);
  assert.equal(state.accounts.length, 18);
  assert.equal(filterDeals(state).some((deal) => deal.id === "deal-014"), false);
});

test("completing an overdue task updates attention but never sales totals", () => {
  const state = createDemoState();
  const before = metrics(state);
  assert.equal(applyEvent(state, wonEvent({
    id: "complete-overdue", type: "activity.completed", entityId: "activity-task-01", payload: {},
  })), true);
  assert.equal(metrics(state).overdueTasks, 4);
  assert.equal(metrics(state).attentionCount, 4);
  assert.equal(metrics(state).openAmount, before.openAmount);
});

test("Replay reconstructs stages chronologically and returns to exact financial totals", () => {
  const base = createDemoState();
  const baseBefore = structuredClone(base);
  const replay = createReplayState(base);
  const events = demoReplayEvents(base);
  assert.equal(replay.deals.every((deal) => deal.stageId === "lead"), true);
  assert.equal(metrics(replay).wonCount, 0);
  assert.equal(metrics(replay).winRate, null);
  assert.ok(events.length > 40);
  let previous = 0;
  for (const event of events) {
    assert.ok(Date.parse(event.timestamp) >= previous);
    previous = Date.parse(event.timestamp);
    assert.equal(applyEvent(replay, event), true, event.id);
    assert.equal(applyEvent(replay, event), false, `duplicate ${event.id}`);
  }
  assert.deepEqual(replay.deals.map(({ id, stageId, amount, plotIndex }) => ({ id, stageId, amount, plotIndex })), base.deals.map(({ id, stageId, amount, plotIndex }) => ({ id, stageId, amount, plotIndex })));
  assert.equal(metrics(replay).openAmount, 120000);
  assert.equal(metrics(replay).wonAmount, 30000);
  assert.equal(metrics(replay).winRate, 4 / 7);
  assert.equal(replay.accounts.length, 18);
  assert.deepEqual(base, baseBefore);
  const provider = createDemoProvider();
  provider.reset(replay);
  provider.reset(base);
  assert.deepEqual(provider.getState(), base);
  provider.getState().deals[0].name = "Modified";
  assert.notEqual(base.deals[0].name, "Modified");
});
