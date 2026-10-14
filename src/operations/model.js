// Shared read-model contract. Providers never create meshes or modify presentation state.
export const SOURCE = {
  crm: "CRM · demo",
  erp: "ERP · demo",
  tms: "TMS · demo",
  gps: "GPS · demo",
};
export const START = Date.parse("2026-10-14T08:35:00Z");
export const at = (t) => Date.parse(`2026-10-14T${t}:00Z`);
export const templates = {
  industrial: {
    label: "Industria y distribución",
    facilities: [
      "marketing",
      "sales",
      "finance",
      "production",
      "warehouse",
      "transport",
      "client-a",
      "client-b",
      "client-c",
    ],
  },
  services: {
    label: "Empresa de servicios",
    facilities: [
      "marketing",
      "sales",
      "finance",
      "studio",
      "delivery",
      "client-a",
      "client-b",
      "client-c",
    ],
  },
};
export const defaultMapping = {
  dealId: "id",
  dealName: "properties.dealname",
  dealAmount: "properties.amount",
  dealStage: "properties.dealstage",
};
const get = (obj, path) => path.split(".").reduce((v, k) => v?.[k], obj);
export function mapHubSpotDeal(record, mapping = defaultMapping) {
  const id = get(record, mapping.dealId),
    name = get(record, mapping.dealName),
    raw = get(record, mapping.dealAmount);
  if (!id || !name || raw == null || !Number.isFinite(Number(raw)))
    throw new Error("Identificador, nombre e importe válidos son obligatorios");
  return {
    id: `deal-${id}`,
    type: "opportunity",
    name,
    amount: Number(raw),
    stage: get(record, mapping.dealStage) || "Sin asignar",
    department: "sales",
    status: "unmapped",
    source: "HubSpot",
    sourceId: String(id),
    updatedAt: Date.now(),
    fictional: false,
  };
}
const provenance = (source, now = START) => ({
  source,
  updatedAt: now,
  fictional: true,
});
export function createInitialState(template = "industrial") {
  const facilities = [
    ["marketing", "Marketing", "Campañas y demanda", [-23, -10], "marketing"],
    ["sales", "Comercial", "Oportunidades y pedidos", [-23, 0], "sales"],
    ["finance", "Finanzas", "Facturas y cobros", [-23, 10], "finance"],
    [
      "production",
      "Fábrica Norte",
      "2 líneas de producción",
      [-7, -9],
      "production",
    ],
    [
      "warehouse",
      "Almacén central",
      "Stock y muelles de carga",
      [9, -9],
      "warehouse",
    ],
    [
      "transport",
      "Base de transporte",
      "6 vehículos · distribución",
      [9, 9],
      "transport",
    ],
    ["client-a", "Habitat Barcelona", "Punto de entrega", [28, -10], "clients"],
    ["client-b", "Noma Girona", "Punto de entrega", [28, 2], "clients"],
    ["client-c", "Casa Sur Tarragona", "Punto de entrega", [28, 13], "clients"],
    [
      "studio",
      "Estudio de proyectos",
      "Diseño y desarrollo",
      [-6, -7],
      "production",
    ],
    [
      "delivery",
      "Equipo de entrega",
      "Proyectos y capacidad",
      [9, 7],
      "delivery",
    ],
  ]
    .filter((f) => templates[template].facilities.includes(f[0]))
    .map(([id, name, description, position, department]) => ({
      id,
      type: "facility",
      name,
      description,
      position,
      department,
      owner: department === "production" ? "Ana Torres" : "Santi Costa",
      status: "operational",
      ...provenance(department === "finance" ? SOURCE.erp : SOURCE.crm),
    }));
  const orders = [
    {
      id: "order-1042",
      type: "order",
      name: "Pedido #1042",
      client: "Habitat Barcelona",
      clientId: "client-a",
      productId: "product-01",
      quantity: 40,
      amount: 12800,
      status: "in_transit",
      shipmentId: "shipment-01",
      vehicleId: "truck-01",
      owner: "Lucía Martín",
      department: "transport",
      lineId: "line-01",
    },
    {
      id: "order-1043",
      type: "order",
      name: "Pedido #1043",
      client: "Noma Girona",
      clientId: "client-b",
      productId: "product-01",
      quantity: 24,
      amount: 7680,
      status: "in_production",
      owner: "Ana Torres",
      department: "production",
      lineId: "line-01",
    },
    {
      id: "order-1044",
      type: "order",
      name: "Pedido #1044",
      client: "Casa Sur Tarragona",
      clientId: "client-c",
      productId: "product-02",
      quantity: 18,
      amount: 8100,
      status: "ready",
      shipmentId: "shipment-03",
      vehicleId: "truck-03",
      owner: "Marcos Gil",
      department: "warehouse",
    },
    {
      id: "order-1045",
      type: "order",
      name: "Pedido #1045",
      client: "Habitat Barcelona",
      clientId: "client-a",
      productId: "product-02",
      quantity: 32,
      amount: 14400,
      status: "in_production",
      owner: "Lucía Martín",
      department: "production",
      lineId: "line-02",
    },
    {
      id: "order-1046",
      type: "order",
      name: "Pedido #1046",
      client: "Noma Girona",
      clientId: "client-b",
      productId: "product-01",
      quantity: 12,
      amount: 3840,
      status: "delivered",
      shipmentId: "shipment-02",
      vehicleId: "truck-02",
      owner: "Clara Vidal",
      department: "transport",
    },
  ].map((o) => ({ ...o, ...provenance(SOURCE.crm) }));
  const routes = {
    outbound: [
      [11, -3],
      [11, 2],
      [19, 2],
      [19, -10],
      [24, -10],
    ],
    return: [
      [24, -10],
      [19, -10],
      [19, 2],
      [11, 2],
      [11, -3],
    ],
    coastal: [
      [11, 11],
      [19, 11],
      [19, 13],
      [24, 13],
    ],
  };
  const vehicles = [
    {
      id: "truck-01",
      type: "vehicle",
      name: "AT-001",
      plate: "4821 MLR",
      driver: "Felipe García",
      owner: "Felipe García",
      status: "outbound",
      shipmentId: "shipment-01",
      orderId: "order-1042",
      clientId: "client-a",
      origin: "Almacén central",
      destination: "Habitat Barcelona",
      capacity: 60,
      cargo: 40,
      productId: "product-01",
      positionType: "estimated",
      route: routes.outbound,
      departure: at("08:00"),
      eta: at("11:00"),
      incident: null,
    },
    {
      id: "truck-02",
      type: "vehicle",
      name: "AT-002",
      plate: "5612 MKP",
      driver: "Clara Vidal",
      owner: "Clara Vidal",
      status: "returning",
      shipmentId: "shipment-02",
      orderId: "order-1046",
      clientId: "client-b",
      origin: "Noma Girona",
      destination: "Almacén central",
      capacity: 48,
      cargo: 0,
      positionType: "gps",
      gpsPosition: [19, 5],
      gpsAt: START - 120000,
      departure: at("07:45"),
      eta: at("10:15"),
      incident: null,
    },
    {
      id: "truck-03",
      type: "vehicle",
      name: "AT-003",
      plate: "9120 LVP",
      driver: "Diego Ruiz",
      owner: "Diego Ruiz",
      status: "loading",
      shipmentId: "shipment-03",
      orderId: "order-1044",
      clientId: "client-c",
      origin: "Almacén central",
      destination: "Casa Sur Tarragona",
      capacity: 50,
      cargo: 18,
      positionType: "known",
      location: [13, -3],
      incident: null,
    },
    {
      id: "truck-04",
      type: "vehicle",
      name: "AT-004",
      plate: "2315 MBC",
      driver: "Sara López",
      owner: "Sara López",
      status: "available",
      origin: "Base de transporte",
      destination: "Sin asignar",
      capacity: 60,
      cargo: 0,
      positionType: "known",
      location: [5, 12],
      incident: null,
    },
    {
      id: "truck-05",
      type: "vehicle",
      name: "AT-005",
      plate: "7482 JHP",
      driver: "Iván Mora",
      owner: "Iván Mora",
      status: "delayed",
      origin: "Casa Sur Tarragona",
      destination: "Almacén central",
      capacity: 48,
      cargo: 6,
      positionType: "unknown",
      incident: "Incidencia de tráfico. Sin ruta ni posición disponible.",
    },
    {
      id: "truck-06",
      type: "vehicle",
      name: "AT-006",
      plate: "1059 MNP",
      driver: "Noa Pérez",
      owner: "Noa Pérez",
      status: "maintenance",
      origin: "Base de transporte",
      destination: "Taller",
      capacity: 60,
      cargo: 0,
      positionType: "known",
      location: [8, 12],
      incident: "Revisión programada; fuera de servicio.",
    },
  ].map((v) => ({
    ...v,
    department: "transport",
    ...provenance(v.positionType === "gps" ? SOURCE.gps : SOURCE.tms),
  }));
  const lines = [
    {
      id: "line-01",
      type: "line",
      name: "Línea 01 · Ensamblaje",
      department: "production",
      owner: "Ana Torres",
      status: "active",
      orderId: "order-1043",
      progress: 0.42,
      rate: 8,
      incident: null,
    },
    {
      id: "line-02",
      type: "line",
      name: "Línea 02 · Acabados",
      department: "production",
      owner: "Pablo Vidal",
      status: "active",
      orderId: "order-1045",
      progress: 0.76,
      rate: 6,
      incident: null,
    },
  ].map((l) => ({ ...l, ...provenance(SOURCE.erp) }));
  const inventory = [
    {
      id: "product-01",
      type: "inventory",
      name: "Silla Nórdica",
      sku: "SN-01",
      onHand: 160,
      reserved: 24,
      department: "warehouse",
      owner: "Marcos Gil",
      status: "available",
    },
    {
      id: "product-02",
      type: "inventory",
      name: "Mesa Olmo",
      sku: "MO-02",
      onHand: 72,
      reserved: 32,
      department: "warehouse",
      owner: "Marcos Gil",
      status: "available",
    },
  ].map((i) => ({ ...i, ...provenance(SOURCE.erp) }));
  const records = [
    {
      id: "campaign-01",
      type: "campaign",
      name: "Colección otoño",
      department: "marketing",
      owner: "Elena Ruiz",
      status: "active",
      leads: 84,
      budget: 2400,
      conversions: 12,
    },
    {
      id: "deal-01",
      type: "opportunity",
      name: "Contrato Habitat 2027",
      department: "sales",
      owner: "Lucía Martín",
      status: "proposal",
      amount: 42000,
      clientId: "client-a",
    },
    {
      id: "deal-02",
      type: "opportunity",
      name: "Nueva colección Noma",
      department: "sales",
      owner: "Marcos Gil",
      status: "negotiation",
      amount: 24000,
      clientId: "client-b",
    },
    {
      id: "invoice-01",
      type: "invoice",
      name: "Factura F-2026-184",
      department: "finance",
      owner: "Santi Costa",
      status: "paid",
      amount: 3840,
      orderId: "order-1046",
      dueAt: at("17:00"),
    },
    {
      id: "invoice-02",
      type: "invoice",
      name: "Factura F-2026-185",
      department: "finance",
      owner: "Santi Costa",
      status: "pending",
      amount: 12800,
      orderId: "order-1042",
      dueAt: Date.parse("2026-10-20T10:00:00Z"),
    },
  ].map((r) => ({
    ...r,
    ...provenance(r.type === "invoice" ? SOURCE.erp : SOURCE.crm),
  }));
  const projects = [
    {
      id: "project-01",
      type: "project",
      name: "Identidad · Habitat",
      department: "production",
      owner: "Ana Torres",
      status: "active",
      progress: 0.65,
      amount: 12000,
      clientId: "client-a",
      hours: 18,
      plannedHours: 32,
    },
    {
      id: "project-02",
      type: "project",
      name: "Web · Noma",
      department: "delivery",
      owner: "Pablo Vidal",
      status: "review",
      progress: 0.85,
      amount: 8400,
      clientId: "client-b",
      hours: 27,
      plannedHours: 40,
    },
  ].map((p) => ({ ...p, ...provenance(SOURCE.crm) }));
  return {
    version: 1,
    template,
    now: START,
    facilities,
    orders: template === "industrial" ? orders : [],
    vehicles: template === "industrial" ? vehicles : [],
    lines: template === "industrial" ? lines : [],
    inventory: template === "industrial" ? inventory : [],
    records,
    projects: template === "services" ? projects : [],
    events: [],
    processed: [],
    permissions: { finance: true },
    sync: { status: "demo", lastAt: START },
    plan:
      template === "industrial"
        ? [
            {
              id: "event-delivery-01",
              kind: "delivery",
              at: at("11:00"),
              vehicleId: "truck-01",
              orderId: "order-1042",
              deliveredQuantity: 40,
              remainingCargo: 0,
            },
            {
              id: "event-return-01",
              kind: "return_started",
              at: at("11:10"),
              vehicleId: "truck-01",
              origin: "Habitat Barcelona",
              destination: "Almacén central",
              route: routes.return,
              eta: at("14:10"),
            },
            {
              id: "event-arrival-01",
              kind: "arrival_confirmed",
              at: at("14:20"),
              vehicleId: "truck-01",
              nextStatus: "available",
            },
          ]
        : [],
  };
}
export const statusNames = {
  operational: "Operativo",
  outbound: "En reparto",
  returning: "Volviendo vacío",
  unloading: "Entrega registrada",
  loading: "Cargando",
  available: "Disponible",
  delayed: "Retrasado",
  maintenance: "Mantenimiento",
  active: "En marcha",
  blocked: "Bloqueada",
  in_transit: "En reparto",
  in_production: "En producción",
  ready: "Preparado",
  pending: "Pendiente",
  delivered: "Entregado",
  proposal: "Propuesta",
  negotiation: "Negociación",
  paid: "Cobrado",
  review: "En revisión",
  shortage: "Falta de stock",
};
export const departmentNames = {
  marketing: "Marketing",
  sales: "Comercial",
  finance: "Finanzas",
  production: "Producción",
  warehouse: "Almacén",
  transport: "Transporte",
  clients: "Clientes",
  delivery: "Entrega",
};
export const typeNames = {
  facility: "Instalación",
  vehicle: "Vehículo",
  line: "Línea",
  order: "Pedido",
  inventory: "Inventario",
  campaign: "Campaña",
  opportunity: "Oportunidad",
  invoice: "Factura",
  project: "Proyecto",
};
export function allEntities(s) {
  return [
    ...s.facilities,
    ...s.vehicles,
    ...s.lines,
    ...s.inventory,
    ...s.orders,
    ...s.records,
    ...s.projects,
  ];
}
export function authorizedState(s) {
  return {
    ...s,
    facilities: s.facilities.filter(
      (f) => s.permissions.finance || f.department !== "finance",
    ),
    records: s.records.filter(
      (r) => s.permissions.finance || r.department !== "finance",
    ),
  };
}
export function applyEvent(s, event) {
  if (s.processed.includes(event.id)) return s;
  const next = structuredClone(s),
    v = next.vehicles.find((v) => v.id === event.vehicleId),
    o = next.orders.find((o) => o.id === event.orderId);
  if (event.kind === "delivery") {
    if (
      !v ||
      !o ||
      v.orderId !== o.id ||
      o.status === "delivered" ||
      event.deliveredQuantity !== o.quantity ||
      event.remainingCargo !== v.cargo - event.deliveredQuantity ||
      event.remainingCargo < 0
    )
      throw new Error("Entrega inconsistente");
    o.status = "delivered";
    o.updatedAt = event.at;
    v.cargo = event.remainingCargo;
    v.status = "unloading";
    v.positionType = "known";
    v.location = v.route.at(-1);
    v.route = null;
    v.updatedAt = event.at;
  } else if (event.kind === "return_started") {
    if (!v || v.status !== "unloading")
      throw new Error("El retorno necesita un estado de salida confirmado");
    Object.assign(v, {
      status: "returning",
      origin: event.origin,
      destination: event.destination,
      route: event.route,
      departure: event.at,
      eta: event.eta,
      positionType: "estimated",
      updatedAt: event.at,
    });
  } else if (event.kind === "arrival_confirmed") {
    if (!v || v.status !== "returning")
      throw new Error("No existe retorno para confirmar");
    Object.assign(v, {
      status: event.nextStatus,
      positionType: "known",
      location: v.route.at(-1),
      route: null,
      arrivalAt: event.at,
      updatedAt: event.at,
    });
  } else if (event.kind === "production_blocked") {
    let l = next.lines.find((l) => l.id === event.lineId);
    if (!l) throw new Error("Línea no encontrada");
    l.status = "blocked";
    l.incident = "Sensor de temperatura · requiere revisión";
    l.updatedAt = event.at;
  } else if (event.kind === "stock_shortage") {
    let i = next.inventory.find((i) => i.id === event.productId);
    if (!i) throw new Error("Producto no encontrado");
    i.onHand = 10;
    i.status = "shortage";
    i.incident = "Existencias inferiores a las reservas. Revisar reposición.";
    i.updatedAt = event.at;
  } else if (event.kind === "stale_gps") {
    let target = next.vehicles.find((v) => v.id === "truck-02");
    target.gpsAt = event.at - 7200000;
  } else throw new Error("Tipo de evento no soportado");
  next.processed.push(event.id);
  next.events.unshift({
    ...event,
    source: "Simulador · evento explícito",
    receivedAt: next.now,
  });
  next.sync.lastAt = event.at;
  return next;
}
export function advance(s, now) {
  let next = { ...s, now };
  for (const event of s.plan
    .filter((e) => e.at <= now && !s.processed.includes(e.id))
    .sort((a, b) => a.at - b.at))
    next = applyEvent(next, event);
  return next;
}
export function pathPosition(route, p) {
  const segments = route
    .slice(1)
    .map((b, i) => Math.hypot(b[0] - route[i][0], b[1] - route[i][1]));
  let d = Math.max(0, Math.min(p, 1)) * segments.reduce((a, b) => a + b, 0);
  for (let i = 0; i < segments.length; i++) {
    if (d <= segments[i] || i === segments.length - 1) {
      let a = route[i],
        b = route[i + 1],
        f = segments[i] ? d / segments[i] : 0;
      return {
        x: a[0] + (b[0] - a[0]) * f,
        z: a[1] + (b[1] - a[1]) * f,
        angle: Math.atan2(b[0] - a[0], b[1] - a[1]),
      };
    }
    d -= segments[i];
  }
}
export function vehiclePosition(v, now) {
  if (v.positionType === "unknown")
    return { known: false, position: null, label: "Sin ubicación disponible" };
  if (v.positionType === "gps")
    return {
      known: true,
      position: { x: v.gpsPosition[0], z: v.gpsPosition[1], angle: 0 },
      stale: now - v.gpsAt > 900000,
      label: "Último GPS recibido",
    };
  if (v.positionType === "estimated" && v.route) {
    const p = (now - v.departure) / (v.eta - v.departure);
    return {
      known: true,
      position: pathPosition(v.route, p),
      progress: Math.max(0, Math.min(p, 1)),
      pending: now >= v.eta,
      label:
        now >= v.eta ? "Llegada pendiente de confirmar" : "Posición estimada",
    };
  }
  return {
    known: true,
    position: { x: v.location[0], z: v.location[1], angle: 0 },
    label: "Ubicación confirmada en instalación",
  };
}
export function matches(e, f) {
  return (
    (!f.query ||
      `${e.name} ${e.id} ${e.driver || ""} ${e.owner || ""} ${e.client || ""} ${e.plate || ""}`
        .toLowerCase()
        .includes(f.query.toLowerCase())) &&
    (!f.department || e.department === f.department) &&
    (!f.owner || e.owner === f.owner) &&
    (!f.status || e.status === f.status) &&
    (!f.incident || !!e.incident)
  );
}
// Same contract for mock and future remote connector: read() yields a normalized snapshot.
export class DemoProvider {
  async read(template = "industrial") {
    return createInitialState(template);
  }
}
export class HubSpotProvider {
  constructor(readAuthorizedDeals, mapping = defaultMapping) {
    this.readAuthorizedDeals = readAuthorizedDeals;
    this.mapping = mapping;
  }
  async read() {
    const rows = await this.readAuthorizedDeals();
    const now = Date.now();
    return {
      version: 1,
      template: "services",
      now,
      facilities: [],
      orders: [],
      vehicles: [],
      lines: [],
      inventory: [],
      records: rows.map((r) => mapHubSpotDeal(r, this.mapping)),
      projects: [],
      events: [],
      processed: [],
      permissions: { finance: false },
      sync: { status: "connected", lastAt: now },
      plan: [],
    };
  }
}
