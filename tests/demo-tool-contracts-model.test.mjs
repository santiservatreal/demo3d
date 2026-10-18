import test from "node:test";
import assert from "node:assert/strict";
import { createTavusToolBridge, loadTavusToolContracts, TAVUS_TOOL_NAMES } from "../src/demo/tool-contracts.js";

// SYNTHETIC TEST FIXTURE ONLY. These fields do not describe the user's agent.
const fixture = () => ({
  version: 1,
  source: "exported-from-existing-tavus-agent",
  tools: TAVUS_TOOL_NAMES.map((name) => ({
    type: "function",
    function: { name, description: "Synthetic test fixture", parameters: {
      type: "object", additionalProperties: false, required: ["record", "seconds"],
      properties: {
        record: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string", enum: ["owner-lucia", "deal-001"] } } },
        seconds: { type: "number", minimum: 0.15, maximum: 12 },
      },
    } },
  })),
  bindings: Object.fromEntries(TAVUS_TOOL_NAMES.map((name, index) => [name, {
    action: { value: index === 2 ? "animation" : index === 1 ? "highlight" : "focus" },
    target: { kind: { value: "owner" }, id: { pointer: "/record/id" } },
    duration: { pointer: "/seconds" },
    ...(index === 2 ? { animation: { value: "pulse" } } : {}),
  }])),
});
const detail = (argumentsValue = { record: { id: "owner-lucia" }, seconds: 1.5 }, name = TAVUS_TOOL_NAMES[0]) => ({ name, arguments: argumentsValue, tool_call_id: "actual-test-call" });
function harness(contracts = fixture()) {
  const commands = [];
  return { commands, bridge: createTavusToolBridge({ contracts, controller: { executeInternalCommand: async (command) => {
    commands.push(command); return { ok: true, code: "focused" };
  } } }) };
}

test("missing actual schemas fail closed without guessing arguments or issuing a command", async () => {
  const missing = createTavusToolBridge({ controller: { executeInternalCommand() { throw new Error("must not run"); } } });
  assert.equal(loadTavusToolContracts().code, "TOOL_SCHEMA_UNAVAILABLE");
  assert.deepEqual(await missing.handle(detail()), {
    ok: false, code: "TOOL_SCHEMA_UNAVAILABLE", businessMutation: false,
    message: "Falta el esquema exportado de las herramientas del agente existente. No se ha ejecutado ninguna acción.",
  });
  assert.equal(missing.getStatus().ready, false);
});

test("the three exported schemas and explicit bindings survive loading without modification", () => {
  const source = fixture();
  const loaded = loadTavusToolContracts(JSON.stringify(source));
  assert.equal(loaded.ready, true);
  assert.deepEqual(loaded.tools, source.tools);
  assert.deepEqual(loaded.bindings, source.bindings);
  source.tools[0].function.name = "changed";
  assert.equal(loaded.tools[0].function.name, TAVUS_TOOL_NAMES[0]);
});

test("only a complete export from the existing agent with exact tool names is accepted", () => {
  for (const mutate of [
    (m) => { m.source = "generated"; },
    (m) => { m.tools.pop(); },
    (m) => { m.tools[0].function.name = "create_customer"; },
    (m) => { m.tools[1].function.name = m.tools[0].function.name; },
    (m) => { delete m.bindings[TAVUS_TOOL_NAMES[0]]; },
    (m) => { m.bindings[TAVUS_TOOL_NAMES[0]].callback = "eval"; },
    (m) => { m.extra = true; },
  ]) {
    const manifest = fixture(); mutate(manifest);
    assert.equal(loadTavusToolContracts(manifest).ready, false);
  }
});

test("unsupported schemas and remote references never become executable or fetch resources", () => {
  for (const schema of [
    { $ref: "https://example.test/schema.json" },
    { $ref: "file:///etc/passwd" },
    { $dynamicRef: "#root" },
    { type: "object", unknownValidationKeyword: true },
    { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" },
  ]) {
    const manifest = fixture(); manifest.tools[0].function.parameters = schema;
    const loaded = loadTavusToolContracts(manifest);
    assert.equal(loaded.code, "TOOL_SCHEMA_INVALID");
    assert.deepEqual(loaded.tools, []);
  }
});

test("the official SDK event detail maps only after exact argument validation", async () => {
  const { bridge, commands } = harness(loadTavusToolContracts(fixture()));
  const result = await bridge.handle(detail(JSON.stringify({ record: { id: "owner-lucia" }, seconds: 2 })));
  assert.equal(result.ok, true);
  assert.equal(result.businessMutation, false);
  assert.deepEqual(commands, [{ action: "focus", target: { kind: "owner", id: "owner-lucia" }, duration: 2 }]);
});

test("validation does not coerce, insert defaults, remove extras or accept unknown IDs", async () => {
  const { bridge, commands } = harness();
  for (const args of [
    { record: { id: "owner-lucia" }, seconds: "2" },
    { record: { id: "owner-lucia" } },
    { record: { id: "unknown" }, seconds: 2 },
    { record: { id: "owner-lucia" }, seconds: 2, extra: true },
    { record: { id: "owner-lucia" }, seconds: 99 },
    "{bad json", null, [],
  ]) assert.equal((await bridge.handle(detail(args))).code, "TOOL_ARGUMENTS_INVALID");
  assert.equal(commands.length, 0);
});

test("schema defaults remain annotations and never supply absent arguments", async () => {
  const manifest = fixture();
  manifest.tools[0].function.parameters.properties.seconds.default = 2;
  const { bridge, commands } = harness(manifest);
  assert.equal((await bridge.handle(detail({ record: { id: "owner-lucia" } }))).code, "TOOL_ARGUMENTS_INVALID");
  assert.equal(commands.length, 0);
});

test("explicit enum maps and escaped JSON pointers translate without name heuristics", async () => {
  const manifest = fixture();
  manifest.tools[0].function.parameters = {
    type: "object", additionalProperties: false, required: ["a/b", "area"],
    properties: { "a/b": { type: "string" }, area: { type: "string", enum: ["representative"] } },
  };
  manifest.bindings[TAVUS_TOOL_NAMES[0]] = {
    action: { value: "focus" },
    target: { kind: { pointer: "/area", map: { representative: "owner" } }, id: { pointer: "/a~1b" } },
  };
  const { bridge, commands } = harness(manifest);
  assert.equal((await bridge.handle(detail({ "a/b": "owner-lucia", area: "representative" }))).ok, true);
  assert.deepEqual(commands[0], { action: "focus", target: { kind: "owner", id: "owner-lucia" } });
});

test("unresolved bindings, illegal presentation actions and unsupported animations never reach the controller", async () => {
  for (const mutate of [
    (binding) => { binding.target.id.pointer = "/absent"; },
    (binding) => { binding.action.value = "close_deal"; },
    (binding) => { binding.target.kind.value = "crm-write"; },
    (binding) => { binding.duration = { value: "2" }; },
    (binding) => { binding.action.value = "animation"; binding.animation = { value: "change_inventory" }; },
  ]) {
    const manifest = fixture(); mutate(manifest.bindings[TAVUS_TOOL_NAMES[0]]);
    const { bridge, commands } = harness(manifest);
    assert.equal((await bridge.handle(detail())).code, "TOOL_BINDING_UNRESOLVED");
    assert.equal(commands.length, 0);
  }
});

test("unknown tool events are rejected and limits apply before schema evaluation", async () => {
  const { bridge, commands } = harness();
  assert.equal((await bridge.handle(detail({}, "delete_customer"))).code, "TOOL_NOT_ALLOWED");
  assert.equal((await bridge.handle(detail(" ".repeat(16 * 1024 + 1)))).code, "TOOL_ARGUMENTS_INVALID");
  assert.equal(loadTavusToolContracts(" ".repeat(128 * 1024 + 1)).issues[0], "SIZE_LIMIT");
  const cyclic = {}; cyclic.self = cyclic;
  assert.equal((await bridge.handle(detail(cyclic))).code, "TOOL_ARGUMENTS_INVALID");
  assert.equal(commands.length, 0);
});

test("local schema references are validated without networking", async () => {
  const manifest = fixture();
  manifest.tools[0].function.parameters = {
    type: "object", additionalProperties: false, required: ["record", "seconds"],
    definitions: { record: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
    properties: { record: { $ref: "#/definitions/record" }, seconds: { type: "number" } },
  };
  const { bridge } = harness(manifest);
  assert.equal((await bridge.handle(detail())).ok, true);
});

test("controller errors and snapshot-rejected IDs return structured failure without raw exception data", async () => {
  const controller = { executeInternalCommand: async () => ({ ok: false, code: "target_unavailable", secret: "not-public" }) };
  const bridge = createTavusToolBridge({ contracts: fixture(), controller });
  const rejected = await bridge.handle(detail());
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "target_unavailable");
  assert.equal(JSON.stringify(rejected).includes("not-public"), false);
  controller.executeInternalCommand = async () => { throw new Error("private exception"); };
  assert.equal((await bridge.handle(detail())).code, "PRESENTATION_FAILED");
});

test("reset and dispose invalidate a pending reply and disposed bridges execute nothing else", async () => {
  let resolve;
  let calls = 0;
  const bridge = createTavusToolBridge({ contracts: fixture(), controller: {
    executeInternalCommand: () => { calls++; return new Promise((done) => { resolve = done; }); },
  } });
  const pending = bridge.handle(detail());
  bridge.reset(); resolve({ ok: true });
  assert.equal((await pending).code, "TOOL_SESSION_ENDED");
  bridge.dispose();
  assert.equal((await bridge.handle(detail())).code, "TOOL_BRIDGE_DISPOSED");
  assert.equal(bridge.getStatus().ready, false);
  assert.equal(calls, 1);
});
