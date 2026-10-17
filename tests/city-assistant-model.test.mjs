import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState, createDemoProvider } from "../src/city/model.js";
import {
  createIndustryState,
  createIndustryProvider,
} from "../src/city/industry-model.js";
import {
  answerCityQuestion,
  companyRecommendations,
} from "../src/city/assistant-model.js";

const context = () => ({
  state: createDemoState(),
  industryState: createIndustryState(),
});
const inactive = (tips) => tips.filter((tip) => tip.id.startsWith("inactive:"));

test("Lucía is resolved with accents, without accents and with one name typo", () => {
  const input = context();
  for (const query of [
    "¿Dónde está Lucía?",
    "localiza a lucia",
    "donde esta Lusia Ferrer",
  ]) {
    const answer = answerCityQuestion(query, input);
    assert.deepEqual(answer.actions, [
      { type: "focus-owner", id: "owner-lucia" },
    ]);
    assert.match(answer.text, /Lucía Ferrer/);
    assert.match(answer.text, /6 oportunidades abiertas/);
    assert.match(answer.text, /31\.000/);
    assert.match(answer.text, /ilustrativa/);
    assert.match(answer.sourceLabel, /CRM simulado.*16\/10\/26/);
  }
});

test("unknown and ambiguous people never point to an arbitrary owner", () => {
  const input = context();
  assert.deepEqual(answerCityQuestion("donde esta Marta", input).actions, []);
  input.state.owners.push({ id: "owner-other", name: "Lucía Ramos" });
  assert.deepEqual(answerCityQuestion("donde esta Lucia", input).actions, []);
  assert.deepEqual(
    answerCityQuestion("donde esta Lucia Ferrer", input).actions,
    [{ type: "focus-owner", id: "owner-lucia" }],
  );
});

test("person context describes illustrative activity without inventing a location", () => {
  const input = context();
  input.people = {
    owners: [
      {
        ownerId: "owner-lucia",
        attendingConstruction: true,
        targetEntityId: "deal-003",
      },
    ],
  };
  const answer = answerCityQuestion("donde esta Lucia", input);
  assert.match(answer.text, /construcción de Brisa Market/);
  assert.match(answer.text, /no es una geolocalización real/);
});

test("revenue, cash and profit are unavailable and are never equated to won sales", () => {
  for (const query of [
    "facturacion total",
    "cuanto hemos cobrado",
    "ingresos",
    "beneficio",
  ]) {
    const answer = answerCityQuestion(query, context());
    assert.match(answer.text, /No hay datos de facturas, cobros ni beneficios/);
    assert.match(answer.text, /4 ventas ganadas este mes por 30\.000/);
    assert.match(answer.text, /no acredita una factura ni un cobro/);
    assert.deepEqual(answer.actions, []);
  }
});

test("current sales answers follow CRM events and missing values stay unavailable", () => {
  const input = context();
  let answer = answerCityQuestion("muestra las ventas", input);
  assert.match(answer.text, /24 oportunidades abiertas por 120\.000/);
  const provider = createDemoProvider();
  assert.equal(
    provider.dispatch({
      id: "assistant-test-win",
      type: "deal.won",
      entityId: "deal-001",
      source: "atlas-demo",
      timestamp: "2026-10-16T10:16:00+02:00",
      payload: { stageId: "won" },
    }),
    true,
  );
  input.state = provider.getState();
  answer = answerCityQuestion("ventas ganadas", input);
  assert.match(answer.text, /5 ventas ganadas este mes por 31\.500/);
  input.state.deals.find((deal) => deal.stageId === "won").amount = null;
  assert.match(
    answerCityQuestion("ventas ganadas", input).text,
    /importe no disponible/,
  );
  assert.match(
    answerCityQuestion("ventas el mes pasado", input).text,
    /No hay cobertura histórica suficiente/,
  );
  input.state.deals.find((deal) => deal.stageId === "won").history = [];
  assert.match(
    answerCityQuestion("ventas", input).text,
    /Falta historial de cierres/,
  );
});

test("communications respect completed dates, source availability and channel deduplication", () => {
  const input = context();
  assert.match(
    answerCityQuestion("whatsapps", input).text,
    /8 WhatsApps registrados, 6 completados hoy y 2 pendientes/,
  );
  assert.match(
    answerCityQuestion("reuniones", input).text,
    /3 reuniones registradas, 1 completadas hoy y 2 pendientes/,
  );
  const whatsapp = input.state.activities.find(
    (activity) => activity.channel === "whatsapp",
  );
  input.state.activities.push({ ...whatsapp });
  assert.match(
    answerCityQuestion("whatsapps", input).text,
    /8 WhatsApps registrados/,
  );
  assert.match(
    answerCityQuestion("correos", {
      state: { now: input.state.now, activities: [] },
    }).text,
    /no proporciona registros/,
  );
  assert.match(
    answerCityQuestion("tareas pendientes", input).text,
    /5 tareas pendientes; 5 están vencidas/,
  );
});

test("inventory uses the ERP contract, follows real transitions and rejects incomplete totals", () => {
  const input = context();
  let answer = answerCityQuestion("stock", input);
  assert.match(
    answer.text,
    /240 unidades en fabricación, 120 en empacado, 480 en stock, 160 en transporte y 320/,
  );
  assert.match(answer.sourceLabel, /ERP industrial simulado/);
  const provider = createIndustryProvider(input.industryState);
  provider.advanceBatch("batch-001");
  input.industryState = provider.getState();
  answer = answerCityQuestion("inventario", input);
  assert.match(answer.text, /120 unidades en fabricación, 240 en empacado/);
  input.industryState.coverage.batchesComplete = false;
  assert.match(
    answerCityQuestion("stock", input).text,
    /completo no está disponible/,
  );
});

test("Felipe targets the registered truck without pretending route estimates are GPS", () => {
  const answer = answerCityQuestion("donde esta Felipe", context());
  assert.deepEqual(answer.actions, [{ type: "focus-entity", id: "truck-01" }]);
  assert.match(answer.text, /80 unidades para Lumen Labs/);
  assert.match(answer.text, /estimación del ERP, sin GPS/);
});

test("entity names must be grounded and CRM writes have no visual or data side effects", () => {
  const input = context();
  const before = structuredClone(input);
  assert.deepEqual(answerCityQuestion("muestra Lumen Labs", input).actions, [
    { type: "focus-entity", id: "account-004" },
  ]);
  assert.deepEqual(answerCityQuestion("donde esta Luma SL", input).actions, []);
  for (const query of [
    "envia un WhatsApp a Lucia",
    "borra Lumen Labs",
    "cierra la venta de Ana",
  ]) {
    assert.deepEqual(answerCityQuestion(query, input).actions, []);
    assert.match(answerCityQuestion(query, input).text, /no se ha ejecutado/);
  }
  assert.deepEqual(input, before);
});

test("missing snapshots produce no fabricated zeros, performance judgments or recommendations", () => {
  assert.match(
    answerCityQuestion("facturacion total").text,
    /Necesitaría el registro de facturas/,
  );
  assert.match(answerCityQuestion("ventas").text, /no está disponible/);
  assert.match(
    answerCityQuestion("Lucia ha bajado su rendimiento", context()).text,
    /no concluir/,
  );
  assert.match(
    answerCityQuestion("hola").text,
    /demostración interpreta consultas locales/,
  );
  assert.deepEqual(companyRecommendations(), []);
  assert.deepEqual(
    companyRecommendations({ state: { deals: [], now: "invalid" } }),
    [],
  );
});

test("seed recommendations have stable IDs and are independent from the wall clock", () => {
  const input = context();
  const before = structuredClone(input);
  const originalNow = Date.now;
  let tips;
  try {
    Date.now = () => {
      throw new Error("wall clock must not be read");
    };
    tips = companyRecommendations(input);
    assert.deepEqual(tips, companyRecommendations(input));
  } finally {
    Date.now = originalNow;
  }
  assert.equal(tips.filter((tip) => tip.id.startsWith("overdue:")).length, 5);
  assert.equal(tips[0].id, "overdue:deal-003");
  assert.equal(new Set(tips.map((tip) => tip.id)).size, tips.length);
  assert.ok(
    tips.some(
      (tip) =>
        tip.id === "communications:pending-messages" &&
        /11 mensajes/.test(tip.text),
    ),
  );
  assert.deepEqual(input, before);
});

test("overdue tips group an entity once, use last versions and exclude closed deals", () => {
  const input = context();
  const task = input.state.activities.find(
    (activity) => activity.dealId === "deal-003" && activity.type === "task",
  );
  input.state.activities.push({ ...task });
  let tips = companyRecommendations(input);
  assert.equal(tips.filter((tip) => tip.id === "overdue:deal-003").length, 1);
  assert.match(
    tips.find((tip) => tip.id === "overdue:deal-003").text,
    /1 tarea vencida/,
  );
  input.state.activities.push({ ...task, status: "done" });
  tips = companyRecommendations(input);
  assert.ok(!tips.some((tip) => tip.id === "overdue:deal-003"));
  input.state.deals.find((deal) => deal.id === "deal-008").stageId = "won";
  input.state.deals.find((deal) => deal.id === "deal-013").stageId = "lost";
  assert.ok(
    !companyRecommendations(input).some((tip) =>
      ["deal-008", "deal-013"].includes(tip.action?.id),
    ),
  );
});

test("inactivity needs a recorded timestamp and uses latest actual interaction", () => {
  const input = context();
  const deal = input.state.deals.find((entry) => entry.id === "deal-001");
  deal.lastActivityAt = "2026-10-10T08:15:00Z";
  input.state.activities = input.state.activities.filter(
    (activity) => activity.dealId !== deal.id,
  );
  let tips = companyRecommendations(input);
  assert.match(
    inactive(tips).find((tip) => tip.action.id === deal.id).text,
    /6 días desde la última actividad registrada/,
  );
  input.state.activities.push({
    id: "recent",
    dealId: deal.id,
    type: "call",
    status: "done",
    occurredAt: input.state.now,
  });
  assert.ok(
    !inactive(companyRecommendations(input)).some(
      (tip) => tip.action.id === deal.id,
    ),
  );
  input.state.activities = [];
  delete deal.lastActivityAt;
  assert.ok(
    !inactive(companyRecommendations(input)).some(
      (tip) => tip.action.id === deal.id,
    ),
  );
  deal.lastActivityAt = "2026-10-20T08:15:00Z";
  assert.ok(
    !inactive(companyRecommendations(input)).some(
      (tip) => tip.action.id === deal.id,
    ),
  );
});

test("recommendations expire after source corrections and ETA completion cannot infer delivery", () => {
  const input = context();
  input.state.activities = input.state.activities.map((activity) => ({
    ...activity,
    status: "done",
  }));
  input.state.deals = input.state.deals.map((deal) => ({
    ...deal,
    lastStageChangedAt: input.state.now,
    lastActivityAt: input.state.now,
  }));
  input.industryState.now = "2026-10-17T10:15:00+02:00";
  assert.deepEqual(companyRecommendations(input), []);
  const truck = input.industryState.vehicles[0];
  truck.status = "at_customer";
  truck.cargoBatchId = null;
  assert.equal(companyRecommendations(input)[0].id, "vehicle-empty:truck-01");
  truck.status = "returning";
  assert.deepEqual(companyRecommendations(input), []);
});
