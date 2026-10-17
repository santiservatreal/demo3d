import test from "node:test";
import assert from "node:assert/strict";
import {
  INDUSTRY_STAGES,
  createIndustryState,
  industryMetrics,
  assertIndustryConservation,
  applyIndustryEvent,
  getVehicleProgress,
  createIndustryProvider,
} from "../src/city/industry-model.js";

const nextTime = (state, minutes = 1) =>
  new Date(Date.parse(state.now) + minutes * 60_000).toISOString();
let serial = 0;
const event = (state, entityId, stageId, extra = {}) => ({
  id: `test-industry-${++serial}`,
  entityId,
  type: "batch.stage_changed",
  timestamp: nextTime(state),
  payload: { stageId, ...extra },
  source: "test-erp",
});

test("industrial snapshot has one SKU and five exclusive, conserved stage quantities", () => {
  const state = createIndustryState(),
    metrics = industryMetrics(state);
  assert.deepEqual(
    INDUSTRY_STAGES.map(({ id }) => id),
    ["manufacturing", "packing", "warehouse", "transit", "delivered"],
  );
  assert.deepEqual(metrics.byStage, {
    manufacturing: 240,
    packing: 120,
    warehouse: 480,
    transit: 160,
    delivered: 320,
  });
  assert.equal(metrics.totalUnits, 1320);
  assert.equal(metrics.availableTrucks, 1);
  assert.equal(metrics.activeTrucks, 2);
  assert.equal(state.products.length, 1);
  assert.equal(new Set(state.batches.map(({ id }) => id)).size, 10);
  assert.equal(assertIndustryConservation(state), true);
});

test("advancing a lot through all stages transfers units rather than duplicating stock", () => {
  const provider = createIndustryProvider();
  const initial = industryMetrics(provider.getState());
  const notifications = [];
  const unsubscribe = provider.subscribe((_state, incoming) =>
    notifications.push(incoming),
  );
  for (const stage of ["packing", "warehouse", "transit", "delivered"]) {
    assert.equal(provider.advanceBatch("batch-001"), true);
    const state = provider.getState();
    assert.equal(
      state.batches.find(({ id }) => id === "batch-001").stageId,
      stage,
    );
    assert.equal(industryMetrics(state).totalUnits, initial.totalUnits);
    assert.equal(assertIndustryConservation(state), true);
  }
  const metrics = industryMetrics(provider.getState());
  assert.equal(metrics.inProduction, 120);
  assert.equal(metrics.packed, 120);
  assert.equal(metrics.stock, 480);
  assert.equal(metrics.inTransit, 160);
  assert.equal(metrics.delivered, 440);
  assert.equal(
    provider.getState().vehicles.find(({ id }) => id === "truck-03").status,
    "at_customer",
  );
  assert.equal(notifications.length, 4);
  assert.equal(provider.advanceBatch("batch-001"), false);
  unsubscribe();
});

test("duplicate and stale ERP events are rejected atomically", () => {
  const state = createIndustryState();
  const accepted = event(state, "batch-001", "packing", {
    fromStageId: "manufacturing",
  });
  assert.equal(applyIndustryEvent(state, accepted), true);
  const snapshot = structuredClone(state);
  assert.equal(applyIndustryEvent(state, accepted), false);
  assert.deepEqual(state, snapshot);
  const stale = event(state, "batch-001", "warehouse");
  stale.timestamp = accepted.timestamp;
  assert.equal(applyIndustryEvent(state, stale), false);
  assert.deepEqual(state, snapshot);
  assert.equal(
    applyIndustryEvent(
      state,
      event(state, "batch-001", "warehouse", { fromStageId: "manufacturing" }),
    ),
    false,
  );
  assert.deepEqual(state, snapshot);
});

test("stage skips, backwards steps, negative units and product replacement cannot alter a lot", () => {
  const state = createIndustryState(),
    snapshot = structuredClone(state);
  for (const incoming of [
    event(state, "batch-001", "warehouse"),
    event(state, "batch-003", "manufacturing"),
    event(state, "batch-001", "packing", { quantity: -12 }),
    event(state, "batch-001", "packing", { quantity: 240 }),
    event(state, "batch-001", "packing", { productId: "invented-sku" }),
    event(state, "batch-010", undefined),
  ])
    assert.equal(applyIndustryEvent(state, incoming), false);
  assert.deepEqual(state, snapshot);
});

test("dispatch needs an available warehouse truck and respects vehicle capacity", () => {
  const state = createIndustryState(),
    before = structuredClone(state);
  for (const truckId of [null, "unknown", "truck-01", "truck-02"]) {
    assert.equal(
      applyIndustryEvent(
        state,
        event(state, "batch-004", "transit", { truckId }),
      ),
      false,
    );
  }
  assert.deepEqual(state, before);
  state.vehicles.find(({ id }) => id === "truck-03").capacity = 100;
  const capacitySnapshot = structuredClone(state);
  assert.equal(
    applyIndustryEvent(
      state,
      event(state, "batch-004", "transit", { truckId: "truck-03" }),
    ),
    false,
  );
  assert.deepEqual(state, capacitySnapshot);
  state.vehicles.find(({ id }) => id === "truck-03").capacity = 200;
  assert.equal(
    applyIndustryEvent(
      state,
      event(state, "batch-004", "transit", { truckId: "truck-03" }),
    ),
    true,
  );
  assert.equal(industryMetrics(state).stock, 320);
  assert.equal(industryMetrics(state).inTransit, 320);
  assert.equal(
    applyIndustryEvent(
      state,
      event(state, "batch-005", "transit", { truckId: "truck-03" }),
    ),
    false,
  );
});

test("delivery is recorded once, empties cargo and leaves financial CRM data untouched", () => {
  const state = createIndustryState();
  state.finance = { sales: 150000, cash: 72500, invoiced: 18000 };
  state.crm = { wonDealIds: ["deal-025"], expectedRevenue: 31000 };
  const finance = structuredClone(state.finance),
    crm = structuredClone(state.crm);
  const incoming = event(state, "batch-007", "delivered", {
    deliveryId: "proof-007",
  });
  assert.equal(applyIndustryEvent(state, incoming), true);
  const batch = state.batches.find(({ id }) => id === "batch-007");
  const vehicle = state.vehicles.find(({ id }) => id === "truck-01");
  assert.equal(batch.delivery.id, "proof-007");
  assert.equal(batch.delivery.quantity, 80);
  assert.equal(batch.assignedTruckId, null);
  assert.equal(vehicle.cargoBatchId, null);
  assert.equal(vehicle.status, "at_customer");
  assert.equal(industryMetrics(state).delivered, 400);
  assert.deepEqual(state.finance, finance);
  assert.deepEqual(state.crm, crm);
  assert.equal(applyIndustryEvent(state, incoming), false);
  assert.equal(
    applyIndustryEvent(state, event(state, "batch-007", "delivered")),
    false,
  );
  assert.equal(industryMetrics(state).delivered, 400);
});

test("an ERP delivery proof cannot be reused for another lot", () => {
  const state = createIndustryState();
  assert.equal(
    applyIndustryEvent(
      state,
      event(state, "batch-007", "delivered", { deliveryId: "proof-shared" }),
    ),
    true,
  );
  const snapshot = structuredClone(state);
  assert.equal(
    applyIndustryEvent(
      state,
      event(state, "batch-008", "delivered", { deliveryId: "proof-shared" }),
    ),
    false,
  );
  assert.deepEqual(state, snapshot);
});

test("estimated route progress is bounded and never delivers, returns or changes stock", () => {
  const state = createIndustryState(),
    snapshot = structuredClone(state);
  const start = Date.parse(state.vehicles[0].route.startedAt);
  assert.equal(
    getVehicleProgress(state, "truck-01", start - 10_000).progress,
    0,
  );
  assert.equal(
    getVehicleProgress(state, "truck-01", start + 90 * 60_000).progress,
    0.5,
  );
  assert.equal(
    getVehicleProgress(state, "truck-01", start + 48 * 60 * 60_000).progress,
    1,
  );
  assert.equal(
    getVehicleProgress(state, "truck-01", start + 48 * 60 * 60_000)
      .estimateElapsed,
    true,
  );
  assert.equal(
    getVehicleProgress(state, "truck-01", "not-a-date").progress,
    null,
  );
  assert.equal(getVehicleProgress(state, "truck-03").progress, null);
  assert.equal(getVehicleProgress(state, "missing").progress, null);
  assert.deepEqual(state, snapshot);
});

test("empty return and warehouse arrival each require a separate explicit vehicle event", () => {
  const provider = createIndustryProvider();
  assert.equal(provider.returnVehicle("truck-01"), false);
  assert.equal(provider.arriveVehicle("truck-01"), false);
  assert.equal(provider.advanceBatch("batch-007"), true);
  assert.equal(provider.arriveVehicle("truck-01"), false);
  assert.equal(provider.returnVehicle("truck-01"), true);
  let state = provider.getState();
  assert.equal(state.vehicles[0].status, "returning");
  assert.equal(state.vehicles[0].cargoBatchId, null);
  const quantities = industryMetrics(state).byStage;
  assert.equal(
    getVehicleProgress(state, "truck-01", Date.parse(state.now) + 86_400_000)
      .progress,
    1,
  );
  assert.equal(state.vehicles[0].status, "returning");
  assert.equal(provider.arriveVehicle("truck-01"), true);
  state = provider.getState();
  assert.equal(state.vehicles[0].status, "available");
  assert.equal(state.vehicles[0].location, "warehouse");
  assert.deepEqual(industryMetrics(state).byStage, quantities);
  assert.equal(provider.arriveVehicle("truck-01"), false);
});

test("missing source, incomplete coverage and invalid records stay unavailable", () => {
  assert.equal(industryMetrics({}).totalUnits, null);
  for (const mutate of [
    (state) => {
      delete state.source;
    },
    (state) => {
      state.coverage.batchesComplete = false;
    },
    (state) => {
      state.batches[0].quantity = -1;
    },
    (state) => {
      state.batches.push(structuredClone(state.batches[0]));
    },
    (state) => {
      state.batches[0].stageId = "unknown";
    },
    (state) => {
      state.vehicles[0].cargoBatchId = "batch-008";
    },
  ]) {
    const state = createIndustryState();
    mutate(state);
    const metrics = industryMetrics(state);
    assert.equal(metrics.complete, false);
    assert.equal(metrics.stock, null);
    assert.equal(metrics.delivered, null);
  }
});

test("provider reset restores a reproducible snapshot and notifies once", () => {
  const provider = createIndustryProvider(),
    calls = [];
  provider.subscribe((_state, incoming) => calls.push(incoming.type));
  provider.advanceBatch("batch-001");
  provider.reset();
  assert.deepEqual(provider.getState(), createIndustryState());
  assert.deepEqual(calls, ["batch.stage_changed", "industry.reset"]);
});
