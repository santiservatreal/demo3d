import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState } from "../src/city/model.js";
import { createIndustryState } from "../src/city/industry-model.js";
import { createCityPresentationController, isPresentationTarget } from "../src/demo/city-controller.js";
import {
  createExistingAgentContracts,
  EXISTING_AGENT_TOOL_DEFINITIONS,
  getExistingAgentCatalogue,
} from "../src/demo/existing-agent-tools.js";
import { createTavusToolBridge, loadTavusToolContracts } from "../src/demo/tool-contracts.js";

const snapshot = () => ({ crm: createDemoState(), industry: createIndustryState() });
const call = (name, args) => ({ name, arguments: JSON.stringify(args), tool_call_id: "real-sdk-test-envelope" });

test("the three real exports retain their exact function names, descriptions and argument schemas", () => {
  const expected = [
    ["trigger_3d_camera_movement", "Triggers a predefined 3D camera movement within the Bird View application.", "movement_id", "The identifier of the predefined camera movement to execute."],
    ["highlight_building", "Highlights a specific building or business area in the 3D city.", "building_id", "The identifier of the building to highlight."],
    ["trigger_animation", "Triggers a predefined animation (e.g., vehicles moving) in the 3D city.", "animation_id", "The identifier of the animation to trigger."],
  ].map(([name, description, argument, argumentDescription]) => ({
    type: "function", function: { name, description, parameters: {
      type: "object", required: [argument], properties: { [argument]: { type: "string", description: argumentDescription } },
    } },
  }));
  assert.deepEqual(EXISTING_AGENT_TOOL_DEFINITIONS, expected);
  const manifest = createExistingAgentContracts(snapshot());
  assert.deepEqual(manifest.tools, expected);
  assert.equal(loadTavusToolContracts(manifest).ready, true);
  const serialized = JSON.stringify(manifest.tools);
  for (const forbidden of ["additionalProperties", '"enum"', "owner_id", "created_at", "updated_at", "tdd1a4aabe52b", "t9aa1838cd1c8", "t4faeee9a0f47"]) assert.equal(serialized.includes(forbidden), false);
  manifest.tools[0].function.description = "local change";
  assert.equal(EXISTING_AGENT_TOOL_DEFINITIONS[0].function.description, expected[0].function.description);
});

test("catalogues announce only existing targets with canonical IDs, real labels and no lost buildings", () => {
  const data = snapshot();
  const before = JSON.stringify(data);
  const catalogue = getExistingAgentCatalogue(data);
  assert.equal(catalogue.truncated, false);
  assert.equal(catalogue.movements[0].id, "overview");
  for (const entry of [...catalogue.movements, ...catalogue.buildings]) {
    assert.ok(entry.label.length > 0);
    if (entry.id === "overview") continue;
    assert.equal(entry.id, `${entry.target.kind}:${entry.target.id}`);
    assert.equal(isPresentationTarget(entry.target, data), true, entry.id);
  }
  const kinds = new Set(catalogue.buildings.map((entry) => entry.target.kind));
  assert.deepEqual(kinds, new Set(["communication", "industry-stage", "deal", "account"]));
  for (const lost of data.crm.deals.filter((deal) => deal.status === "lost"))
    assert.equal(catalogue.buildings.some((entry) => entry.target.id === lost.id), false);
  assert.match(catalogue.movements.find((entry) => entry.id === "owner:owner-lucia").label, /Lucía Ferrer/);
  assert.match(catalogue.movements.find((entry) => entry.id === "vehicle:truck-01").label, /Felipe Martín/);
  assert.equal(catalogue.buildings.some((entry) => entry.target.kind === "district" || entry.target.kind === "sales-stage"), false);
  for (const key of ["movements", "buildings", "animations"])
    assert.equal(new Set(catalogue[key].map((entry) => entry.id)).size, catalogue[key].length);
  assert.equal(JSON.stringify(data), before);
});

test("every advertised real-tool ID reaches the read-only controller and leaves CRM/ERP unchanged", async () => {
  const data = snapshot();
  const before = JSON.stringify(data);
  const calls = [];
  const outcome = (method) => (payload) => { calls.push({ method, payload }); return { ok: true, code: "completed" }; };
  const scene = { presentation: {
    captureView: () => ({ camera: "initial-view" }),
    restoreView: outcome("restore"),
    overview: outcome("overview"),
    focusTarget: outcome("focus"),
    highlightTarget: outcome("highlight"),
    playAnimation: outcome("animation"),
    cancel() {},
  } };
  const controller = createCityPresentationController({ getScene: () => scene, getSnapshot: () => data });
  controller.startSession();
  const bridge = createTavusToolBridge({ contracts: createExistingAgentContracts(data), controller });
  const catalogue = getExistingAgentCatalogue(data);
  for (const [name, key, entries] of [
    ["trigger_3d_camera_movement", "movement_id", catalogue.movements],
    ["highlight_building", "building_id", catalogue.buildings],
    ["trigger_animation", "animation_id", catalogue.animations],
  ]) {
    for (const entry of entries) {
      const result = await bridge.handle(call(name, { [key]: entry.id }));
      assert.equal(result.ok, true, `${name} ${entry.id}`);
      assert.equal(result.businessMutation, false);
    }
  }
  assert.equal(calls.length, catalogue.movements.length + catalogue.buildings.length + catalogue.animations.length);
  assert.equal(JSON.stringify(data), before);
  controller.dispose();
});

test("required/type errors and unknown IDs cannot become camera commands or business mutations", async () => {
  const data = snapshot();
  const before = JSON.stringify(data);
  let executed = 0;
  const bridge = createTavusToolBridge({ contracts: createExistingAgentContracts(data), controller: {
    executeInternalCommand: async () => { executed++; return { ok: true }; },
  } });
  for (const [name, key] of [["trigger_3d_camera_movement", "movement_id"], ["highlight_building", "building_id"], ["trigger_animation", "animation_id"]]) {
    for (const args of [{}, { [key]: 1 }, { [key]: null }, { [key]: {} }])
      assert.equal((await bridge.handle(call(name, args))).code, "TOOL_ARGUMENTS_INVALID");
    for (const id of ["invented", "__proto__", "toString", "", "close_deal", "deliver_batch", "tdd1a4aabe52b"])
      assert.equal((await bridge.handle(call(name, { [key]: id }))).code, "TOOL_BINDING_UNRESOLVED");
  }
  assert.equal((await bridge.handle(call("highlight_building", { building_id: "owner:owner-lucia" }))).code, "TOOL_BINDING_UNRESOLVED");
  assert.equal((await bridge.handle(call("highlight_building", { building_id: "district:sales" }))).code, "TOOL_BINDING_UNRESOLVED");
  assert.equal(executed, 0);
  assert.equal(JSON.stringify(data), before);
});

test("the real export permits extra arguments but the bridge ignores them instead of accepting commands", async () => {
  const executed = [];
  const bridge = createTavusToolBridge({ contracts: createExistingAgentContracts(snapshot()), controller: {
    executeInternalCommand: async (command) => { executed.push(command); return { ok: true }; },
  } });
  const result = await bridge.handle(call("trigger_3d_camera_movement", {
    movement_id: "overview", action: "close_deal", target: { kind: "deal", id: "invented" }, duration: 999,
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(executed, [{ action: "overview", duration: 2.8 }]);
});

test("an entity removed after catalogue creation is rejected by the current snapshot boundary", async () => {
  const data = snapshot();
  const contracts = createExistingAgentContracts(data);
  let called = false;
  const scene = { presentation: { captureView: () => ({}), restoreView: () => ({ ok: true }), cancel() {}, focusTarget() { called = true; return { ok: true }; } } };
  const controller = createCityPresentationController({ getScene: () => scene, getSnapshot: () => data });
  controller.startSession();
  const bridge = createTavusToolBridge({ contracts, controller });
  data.crm.owners = data.crm.owners.filter(({ id }) => id !== "owner-lucia");
  const result = await bridge.handle(call("trigger_3d_camera_movement", { movement_id: "owner:owner-lucia" }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "target_unavailable");
  assert.equal(called, false);
  controller.dispose();
});

test("large snapshots produce explicit bounded catalogues that still pass manifest validation", () => {
  const data = snapshot();
  for (const category of ["deals", "accounts", "owners"])
    data.crm[category] = Array.from({ length: 500 }, (_, index) => ({ ...data.crm[category][0], id: `${category}-${index}` }));
  for (const category of ["batches", "vehicles"])
    data.industry[category] = Array.from({ length: 500 }, (_, index) => ({ ...data.industry[category][0], id: `${category}-${index}` }));
  const catalogue = getExistingAgentCatalogue(data);
  assert.equal(catalogue.truncated, true);
  assert.ok(catalogue.movements.length <= 128);
  assert.ok(catalogue.buildings.length <= 64);
  assert.ok(catalogue.animations.length <= 66);
  const manifest = createExistingAgentContracts(data);
  assert.equal(loadTavusToolContracts(manifest).ready, true);
  for (const binding of Object.values(manifest.bindings)) assert.ok(Object.keys(binding.command.map).length <= 128);
});

test("an empty snapshot announces only overview and empty feature tables fail closed", async () => {
  const catalogue = getExistingAgentCatalogue({});
  assert.deepEqual(catalogue.movements.map(({ id }) => id), ["overview"]);
  assert.deepEqual(catalogue.buildings, []);
  assert.deepEqual(catalogue.animations, []);
  const contracts = createExistingAgentContracts({});
  assert.equal(loadTavusToolContracts(contracts).ready, true);
  const bridge = createTavusToolBridge({ contracts, controller: { executeInternalCommand: async () => ({ ok: true }) } });
  assert.equal((await bridge.handle(call("highlight_building", { building_id: "deal:deal-001" }))).code, "TOOL_BINDING_UNRESOLVED");
});
