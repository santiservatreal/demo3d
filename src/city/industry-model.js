/**
 * Renderer-independent industrial snapshot. All records are fictitious.
 * Units belong to one exclusive batch stage; travel estimates never post events.
 */
export const INDUSTRY_DEMO_NOW = "2026-10-16T10:15:00+02:00";
export const INDUSTRY_STAGES = Object.freeze(
  [
    { id: "manufacturing", name: "Fabricación", color: "#f28b26", order: 0 },
    { id: "packing", name: "Empacado", color: "#efbb26", order: 1 },
    { id: "warehouse", name: "Almacén", color: "#2496d8", order: 2 },
    { id: "transit", name: "En transporte", color: "#9863df", order: 3 },
    { id: "delivered", name: "Entregado", color: "#24b66b", order: 4 },
  ].map(Object.freeze),
);

const clone = (value) => structuredClone(value);
const validTime = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
const stageIds = INDUSTRY_STAGES.map(({ id }) => id);
const warehouseLocation = () => ({
  id: "atlas-warehouse",
  name: "Almacén Atlas",
});
const accountLocation = (batch) => ({
  id: batch.accountId,
  accountId: batch.accountId,
  name: batch.accountName,
});

/** One SKU, so the dashboard never sums incompatible product quantities. */
export function createIndustryState() {
  const now = INDUSTRY_DEMO_NOW;
  const products = [
    {
      id: "product-kit-atlas",
      sku: "KIT-ATLAS",
      name: "Kit Atlas",
      unit: "unidades",
    },
  ];
  const rows = [
    ["manufacturing", 120, "account-001", "Norte Studio"],
    ["manufacturing", 120, "account-005", "Casa Aurora"],
    ["packing", 120, "account-002", "Oliva Hotels"],
    ["warehouse", 160, "account-003", "Brisa Market"],
    ["warehouse", 160, "account-006", "Taller Forma"],
    ["warehouse", 160, "account-008", "Terra Supply"],
    ["transit", 80, "account-004", "Lumen Labs", "truck-01"],
    ["transit", 80, "account-007", "Marea Foods", "truck-02"],
    ["delivered", 160, "account-009", "Roca Design"],
    ["delivered", 160, "account-010", "Delta Health"],
  ];
  const batches = rows.map(
    ([stageId, quantity, accountId, accountName, truckId], index) => {
      const id = `batch-${String(index + 1).padStart(3, "0")}`;
      const sourceOrderId = `ERP-PED-${1001 + index}`;
      const timestamp =
        stageId === "delivered"
          ? `2026-10-16T09:${index === 8 ? "20" : "40"}:00+02:00`
          : now;
      return {
        id,
        productId: products[0].id,
        productName: products[0].name,
        quantity,
        stageId,
        accountId,
        accountName,
        sourceOrderId,
        assignedTruckId: truckId ?? null,
        createdAt: "2026-10-16T06:00:00+02:00",
        updatedAt: timestamp,
        stageEnteredAt: timestamp,
        delivery:
          stageId === "delivered"
            ? {
                id: `delivery-initial-${id}`,
                recordedAt: timestamp,
                sourceOrderId,
                accountId,
                quantity,
                source: "atlas-industry-demo",
              }
            : null,
        history: [
          {
            stageId,
            timestamp,
            eventId: `snapshot-${id}`,
            type: "batch.snapshot",
          },
        ],
      };
    },
  );
  const vehicles = [
    {
      id: "truck-01",
      name: "Camión 01",
      plate: "AT-101",
      driverName: "Felipe Martín",
      cargoBatchId: "batch-007",
      startedAt: "2026-10-16T08:00:00+02:00",
      durationMinutes: 180,
    },
    {
      id: "truck-02",
      name: "Camión 02",
      plate: "AT-102",
      driverName: "Sara Costa",
      cargoBatchId: "batch-008",
      startedAt: "2026-10-16T08:45:00+02:00",
      durationMinutes: 150,
    },
    {
      id: "truck-03",
      name: "Camión 03",
      plate: "AT-103",
      driverName: "Pablo Ríos",
      cargoBatchId: null,
    },
  ].map(({ startedAt, durationMinutes, ...vehicle }) => {
    const batch = batches.find(({ id }) => id === vehicle.cargoBatchId);
    return {
      ...vehicle,
      capacity: 200,
      status: batch ? "outbound" : "available",
      location: batch ? "route" : "warehouse",
      updatedAt: now,
      route: batch
        ? {
            origin: warehouseLocation(),
            destination: accountLocation(batch),
            startedAt,
            durationMinutes,
            estimateBasis: "Duración prevista del ERP; sin GPS",
          }
        : null,
      lastCustomer: batch ? accountLocation(batch) : null,
    };
  });
  const events = batches.map((batch) => ({
    id: `snapshot-${batch.id}`,
    entityId: batch.id,
    type: "batch.snapshot",
    timestamp: batch.updatedAt,
    source: "atlas-industry-demo",
    payload: { stageId: batch.stageId, quantity: batch.quantity },
  }));
  const state = {
    stages: clone(INDUSTRY_STAGES),
    products,
    batches,
    vehicles,
    events,
    appliedEventIds: events.map(({ id }) => id),
    now,
    source: {
      type: "simulated",
      system: "atlas-industry-demo",
      name: "ERP industrial simulado",
      description:
        "Lotes y entregas ficticios; independientes de las oportunidades comerciales",
      recordedAt: now,
    },
    coverage: {
      batchesComplete: true,
      productsComplete: true,
      vehiclesComplete: true,
      totalUnits: 1320,
      productTotals: { "product-kit-atlas": 1320 },
      unit: "unidades",
      from: "2026-10-16T00:00:00+02:00",
      to: now,
      scope: "Lotes registrados de Kit Atlas; no incluye materias primas",
    },
  };
  assertIndustryConservation(state);
  return state;
}

/** Reject malformed/duplicated records, negative stock and inconsistent cargo. */
export function assertIndustryConservation(
  state,
  expectedTotal = state?.coverage?.totalUnits,
) {
  if (
    !Array.isArray(state?.products) ||
    !Array.isArray(state?.batches) ||
    !Array.isArray(state?.vehicles)
  ) {
    throw new Error("Faltan productos, lotes o vehículos industriales");
  }
  const productIds = new Set(state.products.map(({ id }) => id));
  if (productIds.size !== state.products.length)
    throw new Error("Productos duplicados");
  const batchIds = new Set(),
    vehicleIds = new Set(),
    assigned = new Set(),
    deliveryIds = new Set();
  const byProduct = {};
  let total = 0;
  for (const batch of state.batches) {
    if (!batch.id || batchIds.has(batch.id))
      throw new Error("Lote duplicado o sin identificador");
    batchIds.add(batch.id);
    if (
      !productIds.has(batch.productId) ||
      !positiveInteger(batch.quantity) ||
      !stageIds.includes(batch.stageId)
    ) {
      throw new Error("Producto, unidades o etapa del lote no válidos");
    }
    total += batch.quantity;
    byProduct[batch.productId] =
      (byProduct[batch.productId] ?? 0) + batch.quantity;
    if (batch.stageId === "transit") {
      if (!batch.assignedTruckId || assigned.has(batch.assignedTruckId))
        throw new Error("Carga sin camión exclusivo");
      assigned.add(batch.assignedTruckId);
      const truck = state.vehicles.find(
        ({ id }) => id === batch.assignedTruckId,
      );
      if (
        !truck ||
        truck.status !== "outbound" ||
        truck.cargoBatchId !== batch.id ||
        truck.capacity < batch.quantity
      ) {
        throw new Error(
          "Las unidades en reparto no coinciden con la carga del camión",
        );
      }
    } else if (batch.assignedTruckId != null)
      throw new Error("Un lote fuera de reparto conserva un camión cargado");
    if (
      batch.stageId === "delivered" &&
      (!batch.delivery ||
        batch.delivery.quantity !== batch.quantity ||
        !validTime(batch.delivery.recordedAt))
    ) {
      throw new Error("Entrega sin registro explícito");
    }
    if (batch.delivery) {
      if (!batch.delivery.id || deliveryIds.has(batch.delivery.id))
        throw new Error("Registro de entrega duplicado");
      deliveryIds.add(batch.delivery.id);
    }
    if (batch.stageId !== "delivered" && batch.delivery != null)
      throw new Error("Registro de entrega en una etapa previa");
  }
  for (const truck of state.vehicles) {
    if (!truck.id || vehicleIds.has(truck.id))
      throw new Error("Camión duplicado o sin identificador");
    vehicleIds.add(truck.id);
    if (
      !positiveInteger(truck.capacity) ||
      !["outbound", "available", "at_customer", "returning"].includes(
        truck.status,
      )
    ) {
      throw new Error("Capacidad o estado del camión no válidos");
    }
    if (truck.status === "outbound") {
      const batch = state.batches.find(({ id }) => id === truck.cargoBatchId);
      if (
        !batch ||
        batch.stageId !== "transit" ||
        batch.assignedTruckId !== truck.id
      )
        throw new Error("Camión con carga no registrada");
    } else if (truck.cargoBatchId != null)
      throw new Error("Camión vacío con carga residual");
    if (
      ["outbound", "returning"].includes(truck.status) &&
      (!validTime(truck.route?.startedAt) ||
        !Number.isFinite(truck.route.durationMinutes) ||
        !(truck.route.durationMinutes > 0) ||
        !truck.route.origin?.id ||
        !truck.route.destination?.id)
    ) {
      throw new Error("Trayecto sin estimación válida");
    }
  }
  if (expectedTotal != null && total !== expectedTotal)
    throw new Error("Las unidades no se conservan");
  for (const [productId, quantity] of Object.entries(
    state.coverage?.productTotals ?? {},
  )) {
    if (byProduct[productId] !== quantity)
      throw new Error("Las unidades del producto no se conservan");
  }
  return true;
}

/** Missing or partial snapshots stay unavailable rather than fabricating zeroes. */
export function industryMetrics(state) {
  let valid = true;
  try {
    assertIndustryConservation(state);
  } catch {
    valid = false;
  }
  const sourceAvailable =
    typeof state?.source?.system === "string" &&
    Boolean(state.source.system) &&
    validTime(state?.now);
  const complete =
    valid &&
    sourceAvailable &&
    state?.coverage?.batchesComplete === true &&
    state?.coverage?.productsComplete === true;
  const byStage = Object.fromEntries(
    stageIds.map((id) => [id, complete ? 0 : null]),
  );
  if (complete)
    for (const batch of state.batches) byStage[batch.stageId] += batch.quantity;
  const vehicleComplete =
    valid && sourceAvailable && state?.coverage?.vehiclesComplete === true;
  return {
    byStage,
    totalUnits: complete
      ? Object.values(byStage).reduce((sum, value) => sum + value, 0)
      : null,
    inProduction: byStage.manufacturing,
    packed: byStage.packing,
    stock: byStage.warehouse,
    inTransit: byStage.transit,
    delivered: byStage.delivered,
    batchCount: complete ? state.batches.length : null,
    availableTrucks: vehicleComplete
      ? state.vehicles.filter(({ status }) => status === "available").length
      : null,
    activeTrucks: vehicleComplete
      ? state.vehicles.filter(({ status }) =>
          ["outbound", "returning"].includes(status),
        ).length
      : null,
    unit: state?.coverage?.unit ?? null,
    complete,
    vehicleComplete,
    source: state?.source ?? null,
    basis:
      "Unidades en una sola etapa por lote; entrega registrada no implica venta ni cobro",
  };
}

/** Pure interpolation: reaching 100% does not deliver a batch or empty a truck. */
export function getVehicleProgress(state, vehicleOrId, now = state?.now) {
  const vehicle =
    typeof vehicleOrId === "string"
      ? state?.vehicles?.find(({ id }) => id === vehicleOrId)
      : vehicleOrId;
  const route = vehicle?.route;
  const time = typeof now === "number" ? now : Date.parse(now);
  const canInterpolate =
    ["outbound", "returning"].includes(vehicle?.status) &&
    validTime(route?.startedAt) &&
    route.durationMinutes > 0 &&
    Number.isFinite(time);
  const ratio = canInterpolate
    ? (time - Date.parse(route.startedAt)) / (route.durationMinutes * 60_000)
    : null;
  return {
    progress: ratio == null ? null : Math.min(1, Math.max(0, ratio)),
    estimated: canInterpolate,
    estimateElapsed: ratio != null && ratio >= 1,
    origin: route?.origin ?? null,
    destination: route?.destination ?? null,
    status: vehicle?.status ?? null,
    basis: canInterpolate ? route.estimateBasis : null,
  };
}

const newerThan = (timestamp, record) =>
  validTime(record?.updatedAt) &&
  Date.parse(timestamp) > Date.parse(record.updatedAt);

/** Validated, atomic and idempotent ERP event application. Never called by RAF. */
export function applyIndustryEvent(state, event) {
  if (
    !event ||
    typeof event.id !== "string" ||
    !event.id ||
    typeof event.entityId !== "string" ||
    !validTime(event.timestamp) ||
    !validTime(state?.now)
  )
    return false;
  if (
    !Array.isArray(state.events) ||
    !Array.isArray(state.appliedEventIds) ||
    !state.batches?.every(
      (batch) => Array.isArray(batch.history) && validTime(batch.updatedAt),
    )
  )
    return false;
  if (state?.appliedEventIds?.includes(event.id)) return false;
  if (
    ![
      "batch.stage_changed",
      "vehicle.return_started",
      "vehicle.arrived",
    ].includes(event.type)
  )
    return false;
  try {
    assertIndustryConservation(state);
  } catch {
    return false;
  }
  const next = clone(state),
    payload = event.payload ?? {};
  let recordedEvent = clone(event);
  if (event.type === "batch.stage_changed") {
    const batch = next.batches.find(({ id }) => id === event.entityId);
    if (!batch || !newerThan(event.timestamp, batch)) return false;
    const fromIndex = stageIds.indexOf(batch.stageId),
      target = payload.stageId;
    if (
      !stageIds.includes(target) ||
      target !== stageIds[fromIndex + 1] ||
      (payload.fromStageId != null && payload.fromStageId !== batch.stageId)
    )
      return false;
    // Quantities and product identities are immutable for this transition contract.
    if (
      (payload.quantity != null && payload.quantity !== batch.quantity) ||
      (payload.productId != null && payload.productId !== batch.productId)
    )
      return false;
    if (target === "transit") {
      const truck = next.vehicles.find(({ id }) => id === payload.truckId);
      if (
        !truck ||
        truck.status !== "available" ||
        truck.location !== "warehouse" ||
        truck.cargoBatchId != null ||
        truck.capacity < batch.quantity ||
        !newerThan(event.timestamp, truck)
      )
        return false;
      const durationMinutes = payload.durationMinutes ?? 180;
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0)
        return false;
      truck.status = "outbound";
      truck.location = "route";
      truck.cargoBatchId = batch.id;
      truck.updatedAt = event.timestamp;
      truck.lastCustomer = accountLocation(batch);
      truck.route = {
        origin: warehouseLocation(),
        destination: accountLocation(batch),
        startedAt: event.timestamp,
        durationMinutes,
        estimateBasis: "Duración prevista del ERP; sin GPS",
      };
      batch.assignedTruckId = truck.id;
    } else if (target === "delivered") {
      const truck = next.vehicles.find(
        ({ id }) => id === batch.assignedTruckId,
      );
      if (
        !truck ||
        truck.status !== "outbound" ||
        truck.cargoBatchId !== batch.id ||
        !newerThan(event.timestamp, truck)
      )
        return false;
      batch.delivery = {
        id:
          typeof payload.deliveryId === "string" && payload.deliveryId
            ? payload.deliveryId
            : `delivery-${event.id}`,
        recordedAt: event.timestamp,
        sourceOrderId: batch.sourceOrderId,
        accountId: batch.accountId,
        quantity: batch.quantity,
        source: event.source ?? next.source?.system ?? null,
        truckId: truck.id,
      };
      truck.status = "at_customer";
      truck.location = "customer";
      truck.lastCustomer = accountLocation(batch);
      truck.cargoBatchId = null;
      truck.route = null;
      truck.updatedAt = event.timestamp;
      batch.assignedTruckId = null;
    }
    const fromStageId = batch.stageId;
    batch.stageId = target;
    batch.stageEnteredAt = event.timestamp;
    batch.updatedAt = event.timestamp;
    batch.history.push({
      stageId: target,
      timestamp: event.timestamp,
      eventId: event.id,
      type: event.type,
    });
    recordedEvent.payload = { ...payload, stageId: target, fromStageId };
  } else {
    const truck = next.vehicles.find(({ id }) => id === event.entityId);
    if (
      !truck ||
      !newerThan(event.timestamp, truck) ||
      truck.cargoBatchId != null
    )
      return false;
    if (event.type === "vehicle.return_started") {
      if (truck.status !== "at_customer" || !truck.lastCustomer) return false;
      const durationMinutes = payload.durationMinutes ?? 180;
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0)
        return false;
      truck.status = "returning";
      truck.location = "route";
      truck.route = {
        origin: clone(truck.lastCustomer),
        destination: warehouseLocation(),
        startedAt: event.timestamp,
        durationMinutes,
        estimateBasis: "Duración prevista de vuelta en vacío; sin GPS",
      };
    } else {
      if (truck.status !== "returning") return false;
      truck.status = "available";
      truck.location = "warehouse";
      truck.route = null;
    }
    truck.updatedAt = event.timestamp;
  }
  next.events.push(recordedEvent);
  next.events.sort(
    (a, b) =>
      Date.parse(a.timestamp) - Date.parse(b.timestamp) ||
      a.id.localeCompare(b.id),
  );
  next.appliedEventIds.push(event.id);
  if (Date.parse(event.timestamp) > Date.parse(next.now))
    next.now = event.timestamp;
  if (next.coverage?.batchesComplete) next.coverage.to = next.now;
  try {
    assertIndustryConservation(next);
  } catch {
    return false;
  }
  Object.assign(state, next);
  return true;
}

/** Demo controls explicitly post events; rendering and ETA never call these. */
export function createIndustryProvider(initialState) {
  let state = initialState ? clone(initialState) : createIndustryState();
  assertIndustryConservation(state);
  const subscribers = new Set();
  let serial = 0;
  const notify = (event) => {
    for (const subscriber of subscribers) subscriber(state, event);
  };
  const dispatch = (event) => {
    const applied = applyIndustryEvent(state, event);
    if (applied) notify(event);
    return applied;
  };
  const demoEvent = (type, entityId, payload) => {
    let id;
    do {
      id = `industry-demo-${++serial}-${type}-${entityId}`;
    } while (state.appliedEventIds.includes(id));
    return {
      id,
      type,
      entityId,
      payload,
      source: "atlas-industry-demo",
      timestamp: new Date(Date.parse(state.now) + 60_000).toISOString(),
    };
  };
  return {
    getState: () => state,
    subscribe(fn) {
      if (typeof fn !== "function")
        throw new TypeError("El suscriptor debe ser una función");
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    dispatch,
    reset(nextState) {
      const candidate = nextState ? clone(nextState) : createIndustryState();
      assertIndustryConservation(candidate);
      state = candidate;
      serial = 0;
      notify({
        type: "industry.reset",
        source: "atlas-industry-demo",
        timestamp: state.now,
      });
      return state;
    },
    advanceBatch(id) {
      const batch = state.batches.find((entry) => entry.id === id);
      if (!batch) return false;
      const stageId = stageIds[stageIds.indexOf(batch.stageId) + 1];
      if (!stageId) return false;
      const payload = { stageId, fromStageId: batch.stageId };
      if (stageId === "transit") {
        const truck = state.vehicles.find(
          (entry) =>
            entry.status === "available" &&
            entry.location === "warehouse" &&
            entry.capacity >= batch.quantity,
        );
        if (!truck) return false;
        payload.truckId = truck.id;
      }
      return dispatch(demoEvent("batch.stage_changed", id, payload));
    },
    returnVehicle: (id) =>
      dispatch(demoEvent("vehicle.return_started", id, {})),
    arriveVehicle: (id) => dispatch(demoEvent("vehicle.arrived", id, {})),
  };
}
