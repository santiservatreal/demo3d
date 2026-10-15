/** Luma Works: deterministic read model. All numbers are fictitious, ex VAT. */
export const RULES = Object.freeze({
  price: 50,
  unitCost: 24,
  components: 18,
  packaging: 2,
  energy: 4,
  monthlyUnits: 2000,
  monthlyTarget: 100000,
  dailyCapacity: 120,
  plannedDaily: 100,
  operatingDays: 20,
  fixedPerDay: 1500,
  truckPallets: 8,
  unitsPerPallet: 10,
  unitsPerBox: 5,
  routeKm: 180,
  kmRate: 0.4,
  dispatchFixed: 28,
});
export const DAY = 86400000;
export const BASE = Date.parse("2026-10-01T06:00:00Z");
export const days = Array.from({ length: 28 }, (_, i) => BASE + i * DAY)
  .filter((t) => ![0, 6].includes(new Date(t).getUTCDay()))
  .slice(0, 20);
export const clock = (day, h, m = 0) =>
  days[day - 1] + (h - 8) * 3600000 + m * 60000;
export const DEFAULT_TIME = clock(12, 10, 15);
export const LABELS = {
  available: "Disponible",
  reserved: "Reservado",
  loading: "Cargando",
  ready: "Listo para salir",
  outbound: "En ruta de entrega",
  unloading: "Descargando",
  delivered: "Entrega confirmada",
  returning: "Retorno vacío",
  pending_arrival: "Llegada pendiente de confirmar",
  waiting: "Pendiente",
  blocked: "Bloqueado",
  active: "En producción",
  packed: "Embalado",
};
export function makePlan(scenario = "base") {
  const plan = [];
  const add = (day, time, kind, entityId, payload = {}) =>
    plan.push({
      eventId: `${day}:${entityId}:${kind}:${payload.pallet ?? payload.batch ?? payload.km ?? ""}`,
      entityId,
      timestamp: time,
      source: "Simulador Luma · datos ficticios",
      kind,
      payload,
    });
  for (let d = 1; d <= 20; d++) {
    for (let b = 0; b < 10; b++) {
      const id = `lot-${d}-${b}`,
        t = clock(d, 8, b * 40);
      add(d, t, "assembly", id, { units: 10, batch: b });
      add(d, t + 28 * 60000, "quality", id, {
        units: 10,
        batch: b,
        blocked: scenario === "blocked" && d >= 12,
      });
      add(d, t + 40 * 60000, "pack", id, { units: 10, batch: b });
    }
    for (let index = 0; index < 2; index++) {
      const n = (d - 1) * 2 + index + 1,
        id = `shipment-${n}`,
        orderId = `LW-${String(n).padStart(3, "0")}`,
        vehicleId =
          d === 12
            ? index === 0
              ? "LW-02"
              : "LW-01"
            : index === 0
              ? "LW-01"
              : "LW-02";
      const reserve = clock(d, index === 0 ? 8 : 10, index === 0 ? 20 : 0),
        loadStart = reserve + 60000,
        depart = clock(d, index === 0 ? 9 : 11, index === 0 ? 10 : 0),
        arrive = clock(d, index === 0 ? 10 : 12, index === 0 ? 48 : 38),
        delivery = arrive + 120000,
        back = delivery + (index === 0 ? 10 : 5) * 60000,
        eta = back + 3 * 3600000;
      const payload = {
        orderId,
        vehicleId,
        day: d,
        client: index === 0 ? "Forma Retail · Girona" : "Habitat Store · Vic",
        units: 50,
        pallets: 5,
        departure: depart,
        delivery,
        returnStart: back,
        eta,
      };
      add(d, reserve, "reserve", id, payload);
      add(d, loadStart, "loading", id, payload);
      for (let p = 0; p < 5; p++)
        add(
          d,
          loadStart + (index === 0 ? p * 2 : p * 6) * 60000 + 60000,
          "load_pallet",
          id,
          { ...payload, pallet: p },
        );
      add(d, depart, "departure", id, payload);
      add(d, arrive, "unloading", id, payload);
      add(d, delivery, "delivery", id, payload);
      add(d, back, "return", id, payload);
      for (let k = 1; k <= 10; k++) {
        add(d, depart + ((delivery - depart) * k) / 10, "mileage", id, {
          ...payload,
          km: k * 9,
        });
        add(d, back + ((eta - back) * k) / 10, "mileage", id, {
          ...payload,
          km: 90 + k * 9,
        });
      }
      if (!(scenario === "lost-data" && n === 24))
        add(d, eta + 120000, "arrival", id, payload);
    }
    add(d, clock(d, 17), "close_day", "company", { day: d });
  }
  return plan.sort(
    (a, b) => a.timestamp - b.timestamp || priority(a.kind) - priority(b.kind),
  );
}
const priority = (k) =>
  ({
    assembly: 0,
    quality: 1,
    pack: 2,
    reserve: 3,
    loading: 4,
    load_pallet: 5,
    departure: 6,
    unloading: 7,
    delivery: 8,
    return: 9,
    mileage: 10,
    arrival: 11,
    close_day: 12,
  })[k];
export function fresh(scenario = "base", seed = 42) {
  const orders = Array.from({ length: 40 }, (_, i) => ({
    id: `LW-${String(i + 1).padStart(3, "0")}`,
    type: "order",
    name: `Pedido LW-${String(i + 1).padStart(3, "0")}`,
    quantity: 50,
    amount: 2500,
    status: "waiting",
    shipmentId: `shipment-${i + 1}`,
    customerId: i % 2 ? "customer-02" : "customer-01",
    driver:
      i === 23
        ? "Felipe García"
        : i === 22
          ? "Clara Vidal"
          : i % 2
            ? "Clara Vidal"
            : "Felipe García",
    source: "CRM simulado",
    updatedAt: BASE,
  }));
  // LW-024 is Felipe's main vertical slice, assigned explicitly to the second vehicle that day.
  const vehicles = [
    {
      id: "LW-01",
      type: "vehicle",
      name: "Luma 01",
      driver: "Felipe García",
      plate: "4821 LWZ",
      capacity: 8,
      cargo: 0,
      status: "available",
      shipmentId: null,
      positionType: "known",
      updatedAt: BASE,
    },
    {
      id: "LW-02",
      type: "vehicle",
      name: "Luma 02",
      driver: "Clara Vidal",
      plate: "5612 LWZ",
      capacity: 8,
      cargo: 0,
      status: "available",
      shipmentId: null,
      positionType: "known",
      updatedAt: BASE,
    },
  ];
  return {
    schema: 1,
    scenario,
    seed,
    now: BASE,
    plan: makePlan(scenario),
    cursor: 0,
    processed: new Set(),
    events: [],
    ledger: [],
    orders,
    vehicles,
    shipments: {},
    lots: {},
    inventory: {
      raw: 2000,
      wip: 0,
      finished: scenario === "shortage" ? 20 : 200,
      transit: 0,
      delivered: 0,
      initial: scenario === "shortage" ? 2020 : 2200,
      packaging: 2000,
    },
    produced: 0,
    completedDays: 0,
    incidents: [],
    permissions: { finance: true },
    sources: { crm: "Simulado", erp: "Simulado", gps: "Sin feed GPS" },
    production: {
      assembly: 0,
      quality: 0,
      packing: 0,
      blocked: false,
      activityUntil: [0, 0, 0],
    },
    dockReservations: {},
  };
}
function financial(s, e, kind, amount) {
  s.ledger.push({
    id: `${e.eventId}:${kind}`,
    entityId: e.entityId,
    timestamp: e.timestamp,
    kind,
    amount,
    source: e.source,
  });
}
function incident(s, e, message) {
  if (!s.incidents.some((x) => x.id === e.entityId + message))
    s.incidents.push({
      id: e.entityId + message,
      entityId: e.entityId,
      message,
      timestamp: e.timestamp,
    });
}
export function reduceEvent(s, e) {
  if (s.processed.has(e.eventId)) return false;
  s.processed.add(e.eventId);
  const p = e.payload,
    sh = s.shipments[e.entityId],
    v = s.vehicles.find((v) => v.id === p.vehicleId),
    order = s.orders.find((o) => o.id === p.orderId);
  let applied = true;
  switch (e.kind) {
    case "assembly":
      if (s.inventory.raw < p.units) {
        applied = false;
        break;
      }
      s.inventory.raw -= p.units;
      s.inventory.wip += p.units;
      s.lots[e.entityId] = {
        id: e.entityId,
        units: p.units,
        status: "assembly",
        day: Number(e.eventId.split(":")[0]),
      };
      s.production.assembly++;
      s.production.activityUntil[0] = e.timestamp + 28 * 60000;
      break;
    case "quality":
      if (!s.lots[e.entityId]) {
        applied = false;
        break;
      }
      if (p.blocked) {
        s.production.blocked = true;
        s.production.activityUntil[1] = 0;
        s.production.activityUntil[2] = 0;
        s.lots[e.entityId].status = "blocked";
        incident(
          s,
          e,
          "Estación de comprobación bloqueada. Producto retenido en curso.",
        );
      } else {
        s.lots[e.entityId].status = "checked";
        s.production.quality++;
        s.production.activityUntil[1] = e.timestamp + 8 * 60000;
        s.production.activityUntil[2] = e.timestamp + 12 * 60000;
      }
      break;
    case "pack":
      if (
        s.lots[e.entityId]?.status !== "checked" ||
        s.inventory.packaging < p.units
      ) {
        applied = false;
        break;
      }
      s.lots[e.entityId].status = "packed";
      s.inventory.wip -= p.units;
      s.inventory.finished += p.units;
      s.inventory.packaging -= p.units;
      s.produced += p.units;
      s.production.packing++;
      break;
    case "reserve":
      if (v.status !== "available" || s.dockReservations[p.vehicleId]) {
        incident(
          s,
          e,
          "Vehículo no disponible. La expedición no se asigna ni se duplica.",
        );
        applied = false;
        break;
      }
      s.shipments[e.entityId] = {
        id: e.entityId,
        ...p,
        cargo: 0,
        status: "reserved",
        km: 0,
        routeCost: 0,
        reservedAt: e.timestamp,
        updatedAt: e.timestamp,
      };
      v.status = "reserved";
      v.shipmentId = e.entityId;
      s.dockReservations[p.vehicleId] = e.entityId;
      order.status = "reserved";
      break;
    case "loading":
      if (!sh || v.shipmentId !== e.entityId) {
        applied = false;
        break;
      }
      sh.status = "loading";
      v.status = "loading";
      order.status = "loading";
      break;
    case "load_pallet":
      if (!sh || sh.status !== "loading" || v.shipmentId !== e.entityId) {
        applied = false;
        break;
      }
      if (s.inventory.finished < 10) {
        incident(s, e, "Stock terminado insuficiente para transferir un palé.");
        applied = false;
        break;
      }
      s.inventory.finished -= 10;
      s.inventory.transit += 10;
      sh.cargo += 10;
      v.cargo += 10;
      if (sh.cargo === 50) {
        sh.status = "ready";
        v.status = "ready";
        order.status = "ready";
      }
      break;
    case "departure":
      if (!sh || sh.cargo !== 50 || v.shipmentId !== e.entityId) {
        incident(
          s,
          e,
          "Salida retenida: carga incompleta o vehículo no reservado.",
        );
        applied = false;
        break;
      }
      sh.status = "outbound";
      v.status = "outbound";
      v.positionType = "estimated";
      order.status = "outbound";
      delete s.dockReservations[p.vehicleId];
      sh.routeCost += 28;
      financial(s, e, "distribution", 28);
      break;
    case "unloading":
      if (!sh || sh.status !== "outbound") {
        applied = false;
        break;
      }
      sh.status = "unloading";
      v.status = "unloading";
      break;
    case "delivery":
      if (
        !sh ||
        !["outbound", "unloading"].includes(sh.status) ||
        sh.cargo !== 50
      ) {
        applied = false;
        break;
      }
      s.inventory.transit -= 50;
      s.inventory.delivered += 50;
      sh.cargo = 0;
      v.cargo = 0;
      sh.status = "delivered";
      v.status = "delivered";
      order.status = "delivered";
      order.invoiceStatus = "issued";
      order.paymentStatus = "pending";
      financial(s, e, "sales", 2500);
      financial(s, e, "productCost", 1200);
      break;
    case "return":
      if (!sh || sh.status !== "delivered" || v.shipmentId !== e.entityId) {
        applied = false;
        break;
      }
      sh.status = "returning";
      v.status = "returning";
      v.positionType = "estimated";
      break;
    case "mileage":
      if (
        !sh ||
        ![
          "outbound",
          "unloading",
          "delivered",
          "returning",
          "available",
        ].includes(sh.status) ||
        sh.km >= p.km
      ) {
        applied = false;
        break;
      }
      const delta = p.km - sh.km;
      sh.km = p.km;
      const cost = Math.round(delta * 0.4 * 100) / 100;
      sh.routeCost = Math.round((sh.routeCost + cost) * 100) / 100;
      financial(s, e, "distribution", cost);
      break;
    case "arrival":
      if (!sh || sh.status !== "returning" || v.shipmentId !== e.entityId) {
        applied = false;
        break;
      }
      sh.status = "available";
      v.status = "available";
      v.positionType = "known";
      sh.arrivalAt = e.timestamp;
      break;
    case "close_day":
      s.completedDays++;
      financial(s, e, "fixed", 1500);
      break;
    default:
      throw new Error(`Unknown business event ${e.kind}`);
  }
  if (v && applied) v.updatedAt = e.timestamp;
  if (sh && applied) sh.updatedAt = e.timestamp;
  if (order && applied) order.updatedAt = e.timestamp;
  s.events.unshift({ ...e, applied });
  s.events.length = Math.min(s.events.length, 80);
  return applied;
}
export function advance(s, target) {
  if (target < s.now) throw new Error("Use replay() to rewind");
  while (s.cursor < s.plan.length && s.plan[s.cursor].timestamp <= target) {
    reduceEvent(s, s.plan[s.cursor]);
    s.cursor++;
  }
  s.now = target;
  return s;
}
export function replay(target = DEFAULT_TIME, scenario = "base", seed = 42) {
  return advance(fresh(scenario, seed), target);
}
export function finances(s) {
  const totals = { sales: 0, productCost: 0, distribution: 0, fixed: 0 };
  for (const e of s.ledger) totals[e.kind] += e.amount;
  for (const k in totals) totals[k] = Math.round(totals[k] * 100) / 100;
  return {
    ...totals,
    contribution: totals.sales - totals.productCost - totals.distribution,
    result:
      totals.sales - totals.productCost - totals.distribution - totals.fixed,
    forecast: s.completedDays ? (totals.sales / s.completedDays) * 20 : null,
    committed: s.orders
      .filter((o) => o.status !== "delivered")
      .reduce((n, o) => n + o.amount, 0),
  };
}
export function vehicleState(s, v) {
  const sh = s.shipments[v.shipmentId];
  if (!sh)
    return {
      status: v.status,
      progress: 0,
      positionType: "known",
      phase: "depot",
      updatedAt: v.updatedAt,
    };
  if (v.status === "reserved")
    return {
      ...sh,
      status: v.status,
      progress: Math.max(0, Math.min(1, (s.now - sh.reservedAt) / 60000)),
      phase: "reserve_move",
      positionType: "known",
    };
  if (["loading", "ready"].includes(v.status))
    return {
      ...sh,
      status: v.status,
      progress: 0,
      phase: "dock",
      positionType: "known",
    };
  if (v.status === "outbound") {
    const p = Math.min(
      1,
      Math.max(0, (s.now - sh.departure) / (sh.delivery - sh.departure)),
    );
    return { ...sh, progress: p, phase: "outbound", positionType: "estimated" };
  }
  if (v.status === "unloading" || v.status === "delivered")
    return { ...sh, progress: 1, phase: "destination", positionType: "known" };
  if (v.status === "returning") {
    const p = Math.min(
      1,
      Math.max(0, (s.now - sh.returnStart) / (sh.eta - sh.returnStart)),
    );
    return {
      ...sh,
      status: s.now >= sh.eta ? "pending_arrival" : "returning",
      progress: p,
      phase: "return",
      positionType: "estimated",
    };
  }
  return { ...sh, phase: "depot", progress: 1, positionType: "known" };
}
export function nextEvent(s, { major = true } = {}) {
  return s.plan
    .slice(s.cursor)
    .find(
      (e) =>
        !major ||
        ["departure", "delivery", "return", "arrival", "close_day"].includes(
          e.kind,
        ),
    );
}
export function loadingAnimation(s, v) {
  const sh = s.shipments[v.shipmentId];
  if (!sh || !["loading", "ready"].includes(v.status)) return null;
  const events = s.plan.filter(
    (e) => e.entityId === sh.id && e.kind === "load_pallet",
  );
  const next = events.find((e) => e.timestamp > s.now);
  if (!next) return null;
  const last =
    next.timestamp - (Number(sh.id.split("-")[1]) % 2 ? 2 : 6) * 60000;
  return {
    phase: Math.max(0, Math.min(1, (s.now - last) / (next.timestamp - last))),
    pallet: next.payload.pallet,
  };
}
export class FixedStepClock {
  constructor({ step = 0.05, onAdvance }) {
    this.step = step;
    this.onAdvance = onAdvance;
    this.accumulator = 0;
    this.speed = 1;
    this.playing = false;
  }
  tick(realDelta) {
    if (!this.playing) return;
    this.accumulator += Math.max(0, realDelta);
    while (this.accumulator + 1e-9 >= this.step) {
      this.onAdvance(this.step * this.speed * 1000);
      this.accumulator = Math.max(0, this.accumulator - this.step);
    }
  }
  reset() {
    this.accumulator = 0;
  }
}
