import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createAssistantHandler } from "../api/assistant.js";
import {
  buildCityAssistantContext,
  requestCityAnswer,
  validCityAssistantActions,
} from "../src/city/assistant-client.js";
import { createDemoState } from "../src/city/model.js";
import { createIndustryState } from "../src/city/industry-model.js";

const snapshots = () => ({
  state: createDemoState(),
  industryState: createIndustryState(),
  people: [
    {
      ownerId: "owner-lucia",
      activity: "Paseando por la ciudad",
      position: { x: 3, z: 6 },
    },
  ],
});
const payload = (question = "¿Dónde está Lucía?") => ({
  question,
  context: buildCityAssistantContext(snapshots()),
});
const upstreamAnswer = (text, actions = []) => ({
  ok: true,
  json: async () => ({
    output: [
      {
        type: "message",
        content: [
          { type: "output_text", text: JSON.stringify({ text, actions }) },
        ],
      },
    ],
  }),
});

async function invoke(
  handler,
  body,
  { method = "POST", headers = {}, stream } = {},
) {
  const req = stream || { method, headers, body };
  req.method = method;
  req.headers = headers;
  const res = {
    headers: {},
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(text) {
      this.body = JSON.parse(text);
    },
  };
  await handler(req, res);
  return res;
}

test("the optional API is disabled without a server key and never calls a service", async () => {
  let calls = 0;
  const handler = createAssistantHandler({
    env: {},
    fetchImpl: async () => {
      calls++;
      throw new Error("must not run");
    },
  });
  const result = await invoke(handler, payload());
  assert.equal(result.statusCode, 503);
  assert.deepEqual(result.body, { code: "AI_NOT_CONFIGURED" });
  assert.equal(result.headers["cache-control"], "no-store");
  assert.equal(calls, 0);
});

test("the API only accepts POST, bounded bodies and valid question/context inputs", async () => {
  let calls = 0;
  const handler = createAssistantHandler({
    env: { OPENAI_API_KEY: "test-secret" },
    fetchImpl: async () => {
      calls++;
    },
  });
  assert.equal(
    (await invoke(handler, null, { method: "GET" })).statusCode,
    405,
  );
  assert.equal(
    (
      await invoke(handler, payload(), {
        headers: { "content-length": String(128 * 1024 + 1) },
      })
    ).statusCode,
    413,
  );
  assert.equal(
    (await invoke(handler, "x".repeat(128 * 1024 + 1))).statusCode,
    413,
  );
  assert.equal((await invoke(handler, "{")).statusCode, 400);
  assert.equal(
    (await invoke(handler, { question: "q".repeat(1001), context: {} }))
      .statusCode,
    400,
  );
  assert.equal(
    (await invoke(handler, { question: "Hola", context: [] })).statusCode,
    400,
  );
  const stream = Readable.from([" ".repeat(128 * 1024), "!"]);
  assert.equal((await invoke(handler, null, { stream })).statusCode, 413);
  assert.equal(calls, 0);
});

test("the context includes snapshot totals and clocks while removing histories, URLs, coordinates and private fields", () => {
  const raw = snapshots();
  raw.state.apiKey = "never-send";
  raw.state.owners[0].email = "private@example.test";
  raw.state.deals[0].crmUrl = "https://private.example.test/deal";
  raw.state.deals[0].notes = "private-notes";
  raw.state.accounts[0].phone = "+34123456789";
  const context = buildCityAssistantContext(raw);
  const json = JSON.stringify(context);
  assert.equal(context.source.crm.now, raw.state.now);
  assert.equal(context.source.erp.now, raw.industryState.now);
  assert.equal(context.sales.metrics.wonAmount, 30000);
  assert.equal(context.sales.metrics.wonCount, 4);
  assert.equal(context.industry.metrics.totalUnits, 1320);
  assert.deepEqual(context.finance, {
    invoicesAvailable: false,
    paymentsAvailable: false,
    costsAvailable: false,
  });
  assert.equal(context.coverage.historicalPerformanceAvailable, false);
  assert.equal(context.coverage.liveGpsAvailable, false);
  for (const forbidden of [
    "never-send",
    "private@",
    "private.example",
    "private-notes",
    "+34123456789",
    '"history"',
    '"position"',
    '"events"',
  ])
    assert.equal(json.includes(forbidden), false, forbidden);
  assert.ok(Buffer.byteLength(json) < 128 * 1024);
});

test("large record sets are truncated explicitly while the metrics retain their snapshot totals", () => {
  const raw = snapshots();
  raw.state.deals = Array.from({ length: 500 }, (_, index) => ({
    ...raw.state.deals[0],
    id: `many-${index}`,
    name: "A".repeat(5000),
    nextStep: "B".repeat(5000),
  }));
  const context = buildCityAssistantContext(raw);
  assert.equal(context.sales.deals.length, 60);
  assert.equal(context.sales.metrics.openCount, 500);
  assert.equal(context.coverage.recordsMayBeTruncated, true);
  assert.equal(context.sales.deals[0].name.length, 180);
  assert.ok(Buffer.byteLength(JSON.stringify(context)) < 128 * 1024);
});

test("configured API uses Responses structured output with a server-only key and validated camera actions", async () => {
  const requests = [];
  const input = payload();
  input.context.injectedSecret = "do-not-send";
  input.context.sales.deals[0].history = Array(500).fill("do-not-send");
  const handler = createAssistantHandler({
    env: { OPENAI_API_KEY: "test-secret", OPENAI_MODEL: "test-model" },
    fetchImpl: async (url, init) => {
      requests.push({ url, ...init });
      return upstreamAnswer("Te muestro a Lucía.", [
        { type: "focus-owner", id: "owner-lucia" },
      ]);
    },
  });
  const result = await invoke(handler, input);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.mode, "ai");
  assert.deepEqual(result.body.actions, [
    { type: "focus-owner", id: "owner-lucia" },
  ]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.openai.com/v1/responses");
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].headers.Authorization, "Bearer test-secret");
  const sent = JSON.parse(requests[0].body);
  assert.equal(sent.model, "test-model");
  assert.equal(sent.store, false);
  assert.equal(sent.text.format.strict, true);
  assert.equal(sent.text.format.type, "json_schema");
  assert.equal(sent.input.includes("do-not-send"), false);
  assert.equal(JSON.stringify(result.body).includes("test-secret"), false);
  assert.equal(
    result.body.sourceLabel.includes(input.context.source.crm.now),
    true,
  );
});

test("the API rejects writes, unknown references, extra commands and unstructured responses", async () => {
  const actions = [
    [{ type: "deal.won", id: "deal-001" }],
    [{ type: "focus-owner", id: "owner-missing" }],
    [{ type: "focus-entity", id: "unknown-entity" }],
    [{ type: "district", id: "bank" }],
    [{ type: "focus-owner", id: "owner-lucia", command: "send-email" }],
    Array(4).fill({ type: "attention", id: null }),
  ];
  for (const action of actions) {
    const handler = createAssistantHandler({
      env: { OPENAI_API_KEY: "test-secret" },
      fetchImpl: async () => upstreamAnswer("Respuesta", action),
    });
    const result = await invoke(handler, payload());
    assert.equal(result.statusCode, 502);
    assert.deepEqual(result.body, { code: "AI_INVALID_RESPONSE" });
  }
  const handler = createAssistantHandler({
    env: { OPENAI_API_KEY: "test-secret" },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ output_text: "No es JSON" }),
    }),
  });
  assert.equal(
    (await invoke(handler, payload())).body.code,
    "AI_INVALID_RESPONSE",
  );
});

test("financial and comparative-performance questions keep their missing-data limits without a model call", async () => {
  let calls = 0;
  const handler = createAssistantHandler({
    env: { OPENAI_API_KEY: "test-secret" },
    fetchImpl: async () => {
      calls++;
    },
  });
  for (const question of [
    "¿Cuál es la facturación?",
    "¿Lucía ha bajado su rendimiento?",
  ]) {
    const result = await invoke(handler, payload(question));
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.mode, "local");
    assert.equal(result.body.text.includes("no incluye facturas"), true);
    assert.deepEqual(result.body.actions, []);
  }
  assert.equal(calls, 0);
});

test("API timeouts and upstream errors return bounded error codes without leaking service details", async () => {
  const timeout = createAssistantHandler({
    env: { OPENAI_API_KEY: "test-secret" },
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) =>
      new Promise((resolve, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted secret", "AbortError")),
          { once: true },
        ),
      ),
  });
  const expired = await invoke(timeout, payload());
  assert.equal(expired.statusCode, 504);
  assert.deepEqual(expired.body, { code: "AI_TIMEOUT" });
  const error = createAssistantHandler({
    env: { OPENAI_API_KEY: "test-secret" },
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: "test-secret" }),
    }),
  });
  assert.deepEqual((await invoke(error, payload())).body, {
    code: "AI_UPSTREAM_ERROR",
  });
});

test("the optional API limits each IP to twenty requests a minute without calling the model after the limit", async () => {
  let stamp = 1000,
    calls = 0;
  const body = payload("Ayúdame a explorar la ciudad");
  const headers = { "x-vercel-forwarded-for": "192.0.2.5" };
  const handler = createAssistantHandler({
    env: { OPENAI_API_KEY: "test-secret" },
    now: () => stamp,
    fetchImpl: async () => {
      calls++;
      return upstreamAnswer("Te muestro la empresa.", [
        { type: "district", id: "all" },
      ]);
    },
  });
  for (let index = 0; index < 20; index++)
    assert.equal((await invoke(handler, body, { headers })).statusCode, 200);
  const limited = await invoke(handler, body, { headers });
  assert.equal(limited.statusCode, 429);
  assert.deepEqual(limited.body, { code: "RATE_LIMITED" });
  assert.equal(limited.headers["retry-after"], "60");
  assert.equal(calls, 20);
  assert.equal(
    (
      await invoke(handler, body, {
        headers: { "x-vercel-forwarded-for": "192.0.2.6" },
      })
    ).statusCode,
    200,
  );
  stamp += 60_000;
  assert.equal((await invoke(handler, body, { headers })).statusCode, 200);
  assert.equal(calls, 22);
});

test("the passive IP map retains at most 256 entries instead of accumulating unique visitors", async () => {
  const body = payload("Ayúdame a explorar la ciudad");
  const handler = createAssistantHandler({
    env: { OPENAI_API_KEY: "test-secret" },
    now: () => 1000,
    fetchImpl: async () => upstreamAnswer("Vista general", []),
  });
  const first = { "x-vercel-forwarded-for": "192.0.2.1" };
  for (let index = 0; index < 20; index++)
    await invoke(handler, body, { headers: first });
  assert.equal(
    (await invoke(handler, body, { headers: first })).statusCode,
    429,
  );
  for (let index = 2; index <= 257; index++)
    await invoke(handler, body, {
      headers: { "x-vercel-forwarded-for": `visitor-${index}` },
    });
  // Oldest entry is evicted when the 257th distinct IP is observed.
  assert.equal(
    (await invoke(handler, body, { headers: first })).statusCode,
    200,
  );
});

test("client falls back explicitly to grounded local answers for missing deployment, invalid HTML, and network failures", async () => {
  const raw = snapshots();
  const before = JSON.stringify(raw);
  for (const fetchImpl of [
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: false, status: 404 }),
    async () => ({ ok: false, status: 429 }),
    async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("Vite HTML fallback");
      },
    }),
    async () => {
      throw new Error("offline");
    },
  ]) {
    const answer = await requestCityAnswer("¿Dónde está Lucía?", raw, {
      fetchImpl,
    });
    assert.equal(answer.mode, "local");
    assert.deepEqual(answer.actions, [
      { type: "focus-owner", id: "owner-lucia" },
    ]);
    assert.equal(answer.text.includes("Lucía Ferrer"), true);
  }
  assert.equal(JSON.stringify(raw), before);
});

test("client only accepts bounded, known visualization actions and sends no raw state", async () => {
  const raw = snapshots();
  let request;
  const answer = await requestCityAnswer("Muéstrame a Lucía", raw, {
    fetchImpl: async (url, init) => {
      request = { url, ...init };
      return {
        ok: true,
        json: async () => ({
          text: "Aquí está Lucía.",
          actions: [{ type: "focus-owner", id: "owner-lucia" }],
          sourceLabel: "CRM simulado",
          mode: "ai",
        }),
      };
    },
  });
  assert.equal(answer.mode, "ai");
  assert.equal(request.url, "/api/assistant");
  const body = JSON.parse(request.body);
  assert.equal(body.context.sales.metrics.openAmount, 120000);
  assert.equal(body.context.state, undefined);
  assert.equal(request.body.includes('"history"'), false);
  const fallback = await requestCityAnswer("Hola", raw, {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        text: "He cerrado la venta",
        actions: [{ type: "deal.won", id: "deal-001" }],
      }),
    }),
  });
  assert.equal(fallback.mode, "local");
  assert.deepEqual(fallback.actions, []);
});

test("client timeout and explicit cancellation preserve local read-only behavior", async () => {
  const fetchImpl = async (_url, { signal }) =>
    new Promise((resolve, reject) => {
      if (signal.aborted)
        return reject(new DOMException("Aborted", "AbortError"));
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
  const expired = await requestCityAnswer("¿Dónde está Lucía?", snapshots(), {
    fetchImpl,
    timeoutMs: 5,
  });
  assert.equal(expired.mode, "local");
  const controller = new AbortController();
  controller.abort();
  const aborted = await requestCityAnswer("¿Dónde está Lucía?", snapshots(), {
    fetchImpl,
    signal: controller.signal,
  });
  assert.equal(aborted.mode, "local");
});

test("client financial answers never relabel won sales as invoiced revenue, even with an available server", async () => {
  let calls = 0;
  const answer = await requestCityAnswer(
    "¿Cuál es la facturación total?",
    snapshots(),
    {
      fetchImpl: async () => {
        calls++;
      },
    },
  );
  assert.equal(answer.mode, "local");
  assert.match(answer.text, /No hay datos de facturas/);
  assert.equal(calls, 0);
  const context = buildCityAssistantContext(snapshots());
  assert.equal(
    validCityAssistantActions(
      [
        { type: "attention", id: null },
        { type: "focus-entity", id: "truck-01" },
      ],
      context,
    ),
    true,
  );
});
