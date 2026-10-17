import test from "node:test";
import assert from "node:assert/strict";
import {
  createIndustryProvider,
  industryMetrics,
} from "../src/city/industry-model.js";
import { nextProductionAction } from "../src/city/production-demo.js";

test("demo commands finish every existing batch without creating units or financial records", () => {
  const provider = createIndustryProvider();
  let preferred = null,
    steps = 0;
  while (++steps < 100) {
    const before = JSON.stringify(provider.getState());
    const action = nextProductionAction(provider.getState(), preferred);
    assert.equal(JSON.stringify(provider.getState()), before);
    if (action.type === "complete") break;
    preferred = action.batchId;
    const method = {
      advance: "advanceBatch",
      return: "returnVehicle",
      arrive: "arriveVehicle",
    }[action.type];
    assert.ok(method);
    assert.equal(provider[method](action.id), true);
    assert.equal(industryMetrics(provider.getState()).totalUnits, 1320);
  }
  assert.ok(steps < 100);
  assert.equal(industryMetrics(provider.getState()).delivered, 1320);
  assert.equal(provider.getState().batches.length, 10);
  assert.equal("cash" in provider.getState(), false);
});
test("full fleet is explicitly unloaded and returned before another stock batch is dispatched", () => {
  const provider = createIndustryProvider();
  assert.equal(provider.advanceBatch("batch-004"), true);
  let action = nextProductionAction(provider.getState(), "batch-005");
  assert.equal(action.type, "advance");
  assert.equal(
    provider.getState().batches.find((b) => b.id === action.id).stageId,
    "transit",
  );
  provider.advanceBatch(action.id);
  action = nextProductionAction(provider.getState(), "batch-005");
  assert.equal(action.type, "return");
  provider.returnVehicle(action.id);
  action = nextProductionAction(provider.getState(), "batch-005");
  assert.equal(action.type, "arrive");
  provider.arriveVehicle(action.id);
  assert.deepEqual(nextProductionAction(provider.getState(), "batch-005"), {
    type: "advance",
    id: "batch-005",
    batchId: "batch-005",
  });
});
test("no eligible stock vehicle or shipment produces a waiting command without mutation", () => {
  const state = {
    batches: [{ id: "b", stageId: "warehouse", quantity: 240 }],
    vehicles: [],
  };
  assert.deepEqual(nextProductionAction(state), {
    type: "waiting",
    batchId: "b",
  });
  assert.equal(state.batches[0].stageId, "warehouse");
});
