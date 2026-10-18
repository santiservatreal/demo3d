import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState } from "../src/city/model.js";
import { createIndustryState, createIndustryProvider } from "../src/city/industry-model.js";
import { getPresentationFrame } from "../src/demo/presentation-state.js";

const snapshot = () => ({ crm: createDemoState(), industry: createIndustryState() });
const numericValue = (value) => Number(value.replace(/[^\d,-]/g, "").replace(",", "."));
const targetFrame = (data, kind, id) => getPresentationFrame(data, { target: { kind, id } });
const kpi = (frame, label) => frame.kpis.find((entry) => entry.label === label);
const stageValues = (frame) => frame.stages.map((entry) => numericValue(entry.value));

test("overview shows independent CRM pipeline, recorded wins and ERP transit without inventing revenue", () => {
  const frame = getPresentationFrame(snapshot());
  assert.equal(frame.section, "all");
  assert.equal(frame.kpis.length, 3);
  assert.equal(numericValue(kpi(frame, "Pipeline abierto").value), 120000);
  assert.equal(numericValue(kpi(frame, "Ganadas este mes").value), 30000);
  assert.equal(kpi(frame, "En reparto").value, "160 ud.");
  assert.match(kpi(frame, "Ganadas este mes").note, /no equivale a dinero cobrado/);
  assert.equal(frame.kpis.some((entry) => /facturaci[oó]n|beneficio|presupuesto|cobros/i.test(entry.label)), false);
  assert.deepEqual(frame.stages, []);
  assert.equal(frame.activeStage, null);
});

test("monthly wins exclude older wins while the current won-stage count still includes those buildings", () => {
  const data = snapshot();
  const previousWin = structuredClone(data.crm.deals.find((deal) => deal.stageId === "won"));
  previousWin.id = "old-closed-deal";
  previousWin.amount = 99000;
  previousWin.history = [{ stageId: "won", type: "deal.won", timestamp: "2026-09-10T09:00:00+02:00" }];
  data.crm.deals.push(previousWin);
  const overview = getPresentationFrame(data);
  const sales = targetFrame(data, "district", "sales");
  assert.equal(numericValue(kpi(overview, "Ganadas este mes").value), 30000);
  assert.equal(sales.stages.find((stage) => stage.id === "won").value, "5");
  assert.equal(numericValue(kpi(sales, "Pipeline abierto").value), 120000);
});

test("deal and sales-stage frames show actual names, active stage and exact decimal amounts", () => {
  const data = snapshot();
  data.crm.deals[0].amount = 1500.25;
  const deal = targetFrame(data, "deal", "deal-001");
  assert.equal(deal.section, "sales");
  assert.equal(deal.title, "Nueva sede");
  assert.match(deal.description, /Norte Studio/);
  assert.equal(deal.activeStage, "lead");
  assert.equal(numericValue(kpi(deal, "Importe de la oportunidad").value), 1500.25);
  assert.equal(kpi(deal, "Comercial").value, "Ana Torres");
  assert.deepEqual(stageValues(deal), [7, 5, 6, 6, 4]);
  const stage = targetFrame(data, "sales-stage", "lead");
  assert.equal(stage.title, "Nuevos leads");
  assert.equal(stage.activeStage, "lead");
  assert.equal(kpi(stage, "Oportunidades en esta etapa").value, "7");
  assert.equal(numericValue(kpi(stage, "Valor en esta etapa").value), 31500.25);
});

test("owner and client frames scope their pipeline to the selected relationship", () => {
  const data = snapshot();
  const owner = targetFrame(data, "owner", "owner-lucia");
  assert.equal(owner.title, "Lucía Ferrer");
  assert.match(owner.description, /ilustrativa/);
  assert.equal(kpi(owner, "Oportunidades abiertas").value, "6");
  assert.equal(numericValue(kpi(owner, "Pipeline asignado").value), 31000);
  assert.equal(numericValue(kpi(owner, "Ganadas este mes").value), 8500);
  assert.deepEqual(stageValues(owner), [2, 1, 1, 2, 1]);
  const account = targetFrame(data, "account", "account-001");
  assert.equal(account.title, "Norte Studio");
  assert.equal(kpi(account, "Oportunidades abiertas").value, "2");
  assert.equal(numericValue(kpi(account, "Pipeline abierto").value), 3500);
  assert.deepEqual(stageValues(account), [1, 0, 0, 1, 0]);
});

test("the industrial pipeline conserves 1320 units and never adds truck cargo a second time", () => {
  const data = snapshot();
  const industry = targetFrame(data, "district", "industry");
  assert.equal(industry.section, "industry");
  assert.deepEqual(stageValues(industry), [240, 120, 480, 160, 320]);
  assert.equal(stageValues(industry).reduce((sum, value) => sum + value, 0), 1320);
  assert.equal(data.industry.vehicles.filter((vehicle) => vehicle.cargoBatchId).length, 2);
  const manufacturing = targetFrame(data, "industry-stage", "manufacturing");
  assert.equal(manufacturing.title, "Fabricación");
  assert.equal(manufacturing.activeStage, "manufacturing");
  assert.equal(kpi(manufacturing, "Unidades en esta etapa").value, "240 ud.");
  assert.equal(kpi(manufacturing, "Lotes en esta etapa").value, "2");
  assert.equal(kpi(manufacturing, "Total trazado").value, "1320 ud.");
});

test("an actual ERP handoff changes exactly two stage totals while keeping CRM financials unchanged", () => {
  const data = snapshot();
  const crmBefore = JSON.stringify(data.crm);
  const provider = createIndustryProvider(data.industry);
  assert.equal(provider.advanceBatch("batch-001"), true);
  data.industry = provider.getState();
  const frame = targetFrame(data, "district", "industry");
  assert.deepEqual(stageValues(frame), [120, 240, 480, 160, 320]);
  assert.equal(stageValues(frame).reduce((sum, value) => sum + value, 0), 1320);
  const batch = targetFrame(data, "batch", "batch-001");
  assert.equal(batch.activeStage, "packing");
  assert.equal(kpi(batch, "Unidades del lote").value, "120 ud.");
  assert.equal(kpi(batch, "Etapa actual").value, "Empacado");
  assert.equal(JSON.stringify(data.crm), crmBefore);
  assert.equal(numericValue(kpi(getPresentationFrame(data), "Ganadas este mes").value), 30000);
});

test("vehicle frames identify the driver, recorded cargo and estimated route rather than live GPS", () => {
  const data = snapshot();
  const truck = targetFrame(data, "vehicle", "truck-01");
  assert.equal(truck.title, "Camión 01 · Felipe Martín");
  assert.match(truck.description, /sin GPS/);
  assert.equal(truck.activeStage, "transit");
  assert.equal(kpi(truck, "Carga registrada").value, "80 ud.");
  assert.equal(kpi(truck, "Trayecto estimado").value, "180 min");
  assert.match(kpi(truck, "Trayecto estimado").note, /Lumen Labs/);
  const empty = targetFrame(data, "vehicle", "truck-03");
  assert.equal(kpi(empty, "Carga registrada").value, "0 ud.");
  assert.equal(kpi(empty, "Trayecto estimado").value, "No disponible");
  assert.equal(empty.activeStage, null);
});

test("communications use completed activities and the CRM clock, excluding future completions", () => {
  const data = snapshot();
  data.crm.activities.push({ id: "future-email", type: "email", status: "done", occurredAt: "2026-10-17T09:00:00+02:00" });
  const section = targetFrame(data, "district", "communications");
  assert.equal(section.section, "communications");
  assert.equal(kpi(section, "Correos completados hoy").value, "6");
  assert.equal(kpi(section, "Llamadas completadas hoy").value, "12");
  assert.equal(kpi(section, "Reuniones completadas hoy").value, "1");
  const messages = targetFrame(data, "communication", "messages");
  assert.equal(messages.title, "Casa de mensajes");
  assert.equal(kpi(messages, "Completadas hoy").value, "6");
  assert.equal(kpi(messages, "Pendientes").value, "11");
  assert.equal(kpi(messages, "Total registrado").value, "17");
  assert.deepEqual(section.stages, []);
});

test("missing, partial or invalid inventories remain unavailable rather than displaying fabricated zeroes", () => {
  const empty = getPresentationFrame({});
  assert.deepEqual(empty.kpis.map((entry) => entry.value), ["No disponible", "No disponible", "No disponible"]);
  const data = snapshot();
  data.industry.coverage.batchesComplete = false;
  const partial = targetFrame(data, "district", "industry");
  assert.ok(partial.kpis.every((entry) => entry.value === "No disponible"));
  assert.ok(partial.stages.every((entry) => entry.value === "No disponible"));
  const duplicate = snapshot();
  duplicate.industry.batches.push(structuredClone(duplicate.industry.batches[0]));
  assert.ok(targetFrame(duplicate, "district", "industry").stages.every((entry) => entry.value === "No disponible"));
  const missingMoney = snapshot();
  missingMoney.crm.deals[0].amount = null;
  assert.equal(kpi(getPresentationFrame(missingMoney), "Pipeline abierto").value, "No disponible");
});

test("unknown targets never fall back to invented entity data and overview can explicitly reset the frame", () => {
  const data = snapshot();
  for (const target of [
    { kind: "district", id: "invented" }, { kind: "deal", id: "missing" },
    { kind: "owner", id: "Lucía" }, { kind: "communication", id: "phone-invented" },
    { kind: "vehicle", id: "unknown-truck" }, { kind: "industry-stage", id: "invented" },
    { kind: "write-crm", id: "deal-001" }, { kind: "deal" }, "deal-001",
  ]) {
    const frame = getPresentationFrame(data, { target });
    assert.equal(frame.section, "all");
    assert.equal(frame.title, "No encontramos este elemento");
    assert.deepEqual(frame.kpis, []);
    assert.deepEqual(frame.stages, []);
    assert.equal(frame.activeStage, null);
  }
  assert.equal(getPresentationFrame(data, { target: { kind: "vehicle", id: "missing" }, overview: true }).title, "Tu empresa, de un vistazo");
});

test("the presentation contract is stable, bounded to three KPIs and read-only across all target families", () => {
  const data = snapshot();
  const before = JSON.stringify(data);
  for (const target of [null, { kind: "district", id: "sales" }, { kind: "district", id: "industry" },
    { kind: "deal", id: "deal-001" }, { kind: "account", id: "account-001" }, { kind: "owner", id: "owner-lucia" },
    { kind: "sales-stage", id: "proposal" }, { kind: "communication", id: "email" },
    { kind: "industry-stage", id: "warehouse" }, { kind: "batch", id: "batch-007" }, { kind: "vehicle", id: "truck-01" }]) {
    const frame = getPresentationFrame(data, { target });
    assert.deepEqual(Object.keys(frame), ["section", "eyebrow", "title", "description", "kpis", "stages", "activeStage"]);
    assert.ok(frame.kpis.length <= 3);
    assert.ok(frame.kpis.every((entry) => typeof entry.label === "string" && typeof entry.value === "string"));
    assert.ok(frame.stages.every((entry) => typeof entry.id === "string" && typeof entry.label === "string" && typeof entry.value === "string" && typeof entry.color === "string"));
    frame.kpis[0].value = "external presentation edit";
  }
  assert.equal(JSON.stringify(data), before);
});
