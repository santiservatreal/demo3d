import { metrics, ownerPerformance } from "../city/model.js";
import { communicationsSummary } from "../city/communications-model.js";
import { industryMetrics } from "../city/industry-model.js";

const UNAVAILABLE = "No disponible";
const records = (value) => Array.isArray(value) ? value : [];
const number = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
const currency = new Intl.NumberFormat("es-ES", {
  style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const numeric = (value) => typeof value === "number" && Number.isFinite(value);
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? number.format(value) : UNAVAILABLE;
const money = (value) => numeric(value) ? currency.format(value) : UNAVAILABLE;
const units = (value) => Number.isSafeInteger(value) && value >= 0 ? `${number.format(value)} ud.` : UNAVAILABLE;
const text = (value, fallback = UNAVAILABLE) => typeof value === "string" && value.trim() ? value.trim() : fallback;
const find = (source, id) => records(source).find((entry) => entry?.id === id);
const color = (value) => typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value) ? value : "#7285a0";
const financialNote = "Oportunidades comerciales; no equivale a dinero cobrado";
const availableCrm = (crm) => [crm?.deals, crm?.stages, crm?.accounts, crm?.activities].every(Array.isArray) &&
  typeof crm?.now === "string" && Number.isFinite(Date.parse(crm.now));

function salesMetrics(crm) {
  if (!availableCrm(crm)) return null;
  try { return metrics(crm); } catch { return null; }
}

function salesStages(crm) {
  if (!Array.isArray(crm?.stages) || !Array.isArray(crm?.deals)) return [];
  return [...crm.stages].filter((stage) => stage?.id && stage.id !== "lost" && stage.kind !== "lost")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).slice(0, 5)
    .map((stage) => ({
      id: stage.id,
      label: text(stage.name, stage.id),
      value: count(crm.deals.filter((deal) => deal.stageId === stage.id).length),
      color: color(stage.color),
    }));
}

function industrialStages(industry, summary) {
  const allowed = new Set(["manufacturing", "packing", "warehouse", "transit", "delivered"]);
  return [...records(industry?.stages)].filter((stage) => allowed.has(stage?.id))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).slice(0, 5)
    .map((stage) => ({
      id: stage.id,
      label: text(stage.name, stage.id),
      value: units(summary.byStage[stage.id]),
      color: color(stage.color),
    }));
}

const frame = (section, eyebrow, title, description, kpis, stages = [], activeStage = null) => ({
  section, eyebrow, title, description, kpis, stages, activeStage,
});
const unavailableFrame = () => frame(
  "all", "VISTA NO DISPONIBLE", "No encontramos este elemento",
  "El objetivo no está disponible en la información actual de la empresa.", [],
);

function overviewFrame(crm, industry) {
  const sales = salesMetrics(crm);
  const operations = industryMetrics(industry);
  return frame("all", "VISTA GENERAL", "Tu empresa, de un vistazo",
    "Cartera comercial y operaciones en una sola ciudad. Cada zona representa una parte de la empresa.", [
      { label: "Pipeline abierto", value: money(sales?.openAmount), note: "Valor de las oportunidades abiertas" },
      { label: "Ganadas este mes", value: money(sales?.wonAmount), note: `Cierres registrados en el CRM; ${financialNote.toLowerCase()}` },
      { label: "En reparto", value: units(operations.inTransit), note: "Unidades del ERP; rutas estimadas, sin GPS" },
    ]);
}

function salesFrame(crm, target) {
  let scoped = crm;
  let title = "El pulso comercial";
  let eyebrow = "VENTAS Y CLIENTES";
  let description = "Del primer contacto a la venta ganada. Las oportunidades comerciales son independientes de las entregas y los cobros.";
  let activeStage = null;
  let specialKpis = null;
  if (target.kind === "deal") {
    const deal = find(crm.deals, target.id);
    if (!deal || deal.status === "lost") return unavailableFrame();
    const stage = find(crm.stages, deal.stageId);
    const owner = find(crm.owners, deal.ownerId);
    const account = find(crm.accounts, deal.accountId);
    title = text(deal.name, deal.id);
    eyebrow = "OPORTUNIDAD COMERCIAL";
    description = [text(account?.name, "Cliente sin identificar"), `Comercial: ${text(owner?.name)}`].join(" · ");
    activeStage = stage?.id ?? null;
    specialKpis = [
      { label: "Importe de la oportunidad", value: money(deal.amount), note: financialNote },
      { label: "Etapa actual", value: text(stage?.name) },
      { label: "Comercial", value: text(owner?.name) },
    ];
  } else if (target.kind === "account") {
    const account = find(crm.accounts, target.id);
    if (!account) return unavailableFrame();
    title = text(account.name, account.id);
    eyebrow = "RELACIÓN CON EL CLIENTE";
    description = `Oportunidades de este cliente · Comercial: ${text(find(crm.owners, account.ownerId)?.name)}`;
    scoped = { ...crm, deals: records(crm.deals).filter((deal) => deal.accountId === target.id) };
  } else if (target.kind === "owner") {
    const owner = find(crm.owners, target.id);
    if (!owner) return unavailableFrame();
    title = text(owner.name, owner.id);
    eyebrow = "EQUIPO COMERCIAL";
    description = "Su cartera de oportunidades. La posición del personaje es ilustrativa; no representa una ubicación GPS.";
    scoped = { ...crm, deals: records(crm.deals).filter((deal) => deal.ownerId === target.id) };
    let performance = null;
    if (availableCrm(crm)) {
      try { performance = ownerPerformance(crm).find((entry) => entry.id === target.id); } catch { /* Missing data stays unavailable. */ }
    }
    specialKpis = [
      { label: "Oportunidades abiertas", value: count(performance?.openCount) },
      { label: "Pipeline asignado", value: money(performance?.openAmount), note: "Valor de sus oportunidades abiertas" },
      { label: "Ganadas este mes", value: money(performance?.wonAmount), note: financialNote },
    ];
  } else if (target.kind === "sales-stage") {
    if (target.id === "clients") {
      if (!records(crm.accounts).length) return unavailableFrame();
      title = "Clientes activos";
      eyebrow = "CARTERA DE CLIENTES";
      description = "Relaciones registradas en el CRM. Una cuenta de cliente no equivale a una nueva venta.";
      const summary = salesMetrics(crm);
      specialKpis = [
        { label: "Clientes activos", value: count(summary?.activeClients) },
        { label: "Oportunidades abiertas", value: count(summary?.openCount) },
        { label: "Pipeline abierto", value: money(summary?.openAmount), note: "Cartera comercial de toda la empresa" },
      ];
    } else {
      const stage = find(crm.stages, target.id);
      if (!stage || stage.id === "lost" || stage.kind === "lost") return unavailableFrame();
      title = text(stage.name, stage.id);
      eyebrow = "ETAPA COMERCIAL";
      description = "Oportunidades que se encuentran ahora en esta etapa del CRM.";
      activeStage = stage.id;
      const stageDeals = records(crm.deals).filter((deal) => deal.stageId === target.id);
      const amount = stageDeals.every((deal) => numeric(deal.amount)) ? stageDeals.reduce((total, deal) => total + deal.amount, 0) : null;
      specialKpis = [
        { label: "Oportunidades en esta etapa", value: Array.isArray(crm.deals) ? count(stageDeals.length) : UNAVAILABLE },
        { label: "Valor en esta etapa", value: Array.isArray(crm.deals) ? money(amount) : UNAVAILABLE, note: financialNote },
      ];
    }
  }
  const summary = salesMetrics(scoped);
  const kpis = specialKpis || [
    { label: "Pipeline abierto", value: money(summary?.openAmount), note: "Valor de las oportunidades abiertas" },
    { label: "Ganadas este mes", value: money(summary?.wonAmount), note: financialNote },
    { label: "Oportunidades abiertas", value: count(summary?.openCount) },
  ];
  return frame("sales", eyebrow, title, description, kpis, salesStages(scoped), activeStage);
}

function communicationsFrame(crm, target) {
  const places = communicationsSummary(crm);
  if (target.kind === "communication") {
    const place = places.find((entry) => entry.id === target.id);
    if (!place) return unavailableFrame();
    return frame("communications", "ACTIVIDAD DEL CRM", place.name,
      "Actividades registradas con los clientes. Hoy se calcula según la fecha y la zona horaria de la empresa.", [
        { label: "Completadas hoy", value: count(place.todayCompleted) },
        { label: "Pendientes", value: count(place.pendingCount) },
        { label: "Total registrado", value: count(place.totalCount), note: "Registros disponibles en esta conexión" },
      ]);
  }
  const completed = (id) => places.find((place) => place.id === id)?.todayCompleted;
  return frame("communications", "CONVERSACIONES Y RELACIONES", "La empresa conecta",
    "Correos, llamadas y reuniones registrados en el CRM. Esta vista no envía mensajes ni realiza llamadas.", [
      { label: "Correos completados hoy", value: count(completed("email")) },
      { label: "Llamadas completadas hoy", value: count(completed("call")) },
      { label: "Reuniones completadas hoy", value: count(completed("meeting")) },
    ]);
}

function industrialFrame(industry, target) {
  const summary = industryMetrics(industry);
  let title = "De la fábrica al cliente";
  let eyebrow = "PRODUCCIÓN Y DISTRIBUCIÓN";
  let description = "Cada lote recorre una sola etapa. Fabricar, almacenar y entregar no equivale a generar una venta ni a cobrarla.";
  let activeStage = null;
  let kpis = [
    { label: "En fabricación", value: units(summary.inProduction) },
    { label: "En stock", value: units(summary.stock) },
    { label: "En reparto", value: units(summary.inTransit), note: "Rutas estimadas; no es GPS en directo" },
  ];
  if (target.kind === "industry-stage") {
    const stage = find(industry.stages, target.id);
    if (!stage || !Object.hasOwn(summary.byStage, stage.id)) return unavailableFrame();
    title = text(stage.name, stage.id);
    eyebrow = "ETAPA DE LA OPERACIÓN";
    description = "Unidades y lotes que se encuentran ahora en esta etapa del ERP.";
    activeStage = stage.id;
    kpis = [
      { label: "Unidades en esta etapa", value: units(summary.byStage[stage.id]) },
      { label: "Lotes en esta etapa", value: summary.complete ? count(industry.batches.filter((batch) => batch.stageId === stage.id).length) : UNAVAILABLE },
      { label: "Total trazado", value: units(summary.totalUnits), note: "Cada unidad aparece una sola vez en el pipeline" },
    ];
  } else if (target.kind === "batch") {
    const batch = find(industry.batches, target.id);
    if (!batch) return unavailableFrame();
    const stage = find(industry.stages, batch.stageId);
    title = `${text(batch.productName, "Lote")} · ${batch.id}`;
    eyebrow = "LOTE DE PRODUCCIÓN";
    description = [text(batch.accountName, "Cliente sin identificar"), text(batch.sourceOrderId, "Pedido sin identificar")].join(" · ");
    activeStage = stage?.id ?? null;
    kpis = [
      { label: "Unidades del lote", value: units(batch.quantity) },
      { label: "Etapa actual", value: text(stage?.name) },
      { label: "Cliente", value: text(batch.accountName) },
    ];
  } else if (target.kind === "vehicle") {
    const vehicle = find(industry.vehicles, target.id);
    if (!vehicle) return unavailableFrame();
    const batch = find(industry.batches, vehicle.cargoBatchId);
    const statuses = { outbound: "Reparto en curso", returning: "Regreso al almacén", available: "Disponible en el almacén", at_customer: "En el cliente" };
    const empty = ["returning", "available", "at_customer"].includes(vehicle.status) && vehicle.cargoBatchId == null;
    title = `${text(vehicle.name, vehicle.id)} · ${text(vehicle.driverName, "Conductor sin identificar")}`;
    eyebrow = "TRANSPORTE · RUTA ESTIMADA";
    description = `${statuses[vehicle.status] || "Estado sin identificar"}. La ruta es una estimación del ERP, sin GPS en directo.`;
    activeStage = batch?.stageId ?? null;
    kpis = [
      { label: "Conductor", value: text(vehicle.driverName) },
      { label: "Carga registrada", value: summary.vehicleComplete ? units(batch?.quantity ?? (empty ? 0 : null)) : UNAVAILABLE },
      { label: "Trayecto estimado", value: numeric(vehicle.route?.durationMinutes) && vehicle.route.durationMinutes > 0 ? `${number.format(vehicle.route.durationMinutes)} min` : UNAVAILABLE,
        note: vehicle.route?.destination?.name ? `Destino: ${text(vehicle.route.destination.name)}` : "No hay una ruta activa registrada" },
    ];
  }
  return frame("industry", eyebrow, title, description, kpis, industrialStages(industry, summary), activeStage);
}

/** A read-only projection of snapshot facts. No clocks, CRM commands or scene
 * state are introduced here; camera actions only select the contextual frame. */
export function getPresentationFrame(snapshot, { target = null, overview = false } = {}) {
  const crm = snapshot?.crm || {};
  const industry = snapshot?.industry || {};
  if (overview || target == null) return overviewFrame(crm, industry);
  if (typeof target !== "object" || typeof target.id !== "string") return unavailableFrame();
  if (target.kind === "district") {
    if (target.id === "all") return overviewFrame(crm, industry);
    if (target.id === "sales") return salesFrame(crm, target);
    if (target.id === "communications") return communicationsFrame(crm, target);
    if (target.id === "industry") return industrialFrame(industry, target);
    return unavailableFrame();
  }
  if (["deal", "account", "owner", "sales-stage"].includes(target.kind)) return salesFrame(crm, target);
  if (target.kind === "communication") return communicationsFrame(crm, target);
  if (["industry-stage", "batch", "vehicle"].includes(target.kind)) return industrialFrame(industry, target);
  return unavailableFrame();
}
