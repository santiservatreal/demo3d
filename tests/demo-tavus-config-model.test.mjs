import test from "node:test";
import assert from "node:assert/strict";
import { createTavusConfigHandler } from "../api/tavus-config.js";
import { TAVUS_TOOL_NAMES } from "../src/demo/tool-contracts.js";

function invoke(env = {}, method = "GET") {
  const res = { headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    end(raw) { this.body = JSON.parse(raw); } };
  createTavusConfigHandler({ env })({ method }, res);
  return res;
}

test("public config does not infer a deployment from a PAL ID or a secret API key", () => {
  const response = invoke({ TAVUS_PAL_ID: "p5695fb057e5", TAVUS_API_KEY: "private-key" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.configured, false);
  assert.equal(response.body.deploymentId, null);
  assert.equal(response.body.palId, "p5695fb057e5");
  assert.equal(response.body.contracts.code, "TOOL_SCHEMA_UNAVAILABLE");
  assert.equal(JSON.stringify(response.body).includes("private-key"), false);
});

test("only an explicit deployment variable enables the widget", () => {
  assert.equal(invoke({ TAVUS_DEPLOYMENT_ID: " deployment-public " }).body.deploymentId, "deployment-public");
  assert.equal(invoke({ VITE_TAVUS_DEPLOYMENT_ID: "deployment-vite" }).body.deploymentId, "deployment-vite");
  assert.equal(invoke({ TAVUS_DEPLOYMENT_ID: "preferred", VITE_TAVUS_DEPLOYMENT_ID: "fallback" }).body.deploymentId, "preferred");
  assert.equal(invoke({ TAVUS_DEPLOYMENT_ID: "https://not-an-id.test" }).body.configured, false);
});

test("the endpoint never sends arbitrary environment values, persona secrets, API credentials or malformed exports", () => {
  const response = invoke({ TAVUS_DEPLOYMENT_ID: "public-id", TAVUS_API_KEY: "secret-api",
    OPENAI_API_KEY: "secret-openai", TAVUS_PERSONA_SECRET: "secret-persona",
    TAVUS_TOOL_CONTRACTS_JSON: '{"private":"raw-secret"}' });
  const text = JSON.stringify(response.body);
  for (const secret of ["secret-api", "secret-openai", "secret-persona", "raw-secret"]) assert.equal(text.includes(secret), false);
  assert.equal(response.body.contracts.ready, false);
  assert.equal(response.body.contracts.code, "TOOL_SCHEMA_INVALID");
  assert.equal(response.headers["cache-control"], "no-store");
});

test("the endpoint is GET-only and needs no network, key or conversation creation", () => {
  for (const method of ["POST", "DELETE", "PUT"]) {
    const response = invoke({}, method);
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, "GET");
    assert.deepEqual(response.body, { code: "METHOD_NOT_ALLOWED" });
  }
});

test("a valid exported manifest is returned as public configuration without changing its schemas", () => {
  // SYNTHETIC TEST FIXTURE: deliberately empty arguments, not the real agent.
  const manifest = {
    version: 1, source: "exported-from-existing-tavus-agent",
    tools: TAVUS_TOOL_NAMES.map((name) => ({ type: "function", function: {
      name, parameters: { type: "object", additionalProperties: false, properties: {} },
    } })),
    bindings: Object.fromEntries(TAVUS_TOOL_NAMES.map((name) => [name, { action: { value: "overview" } }])),
  };
  const result = invoke({ TAVUS_DEPLOYMENT_ID: "public-deployment", TAVUS_TOOL_CONTRACTS_JSON: JSON.stringify(manifest) });
  assert.equal(result.body.configured, true);
  assert.equal(result.body.contracts.ready, true);
  assert.deepEqual(result.body.contracts.tools, manifest.tools);
  assert.deepEqual(result.body.contracts.bindings, manifest.bindings);
});
