import {
  createIcons,
  Box,
  Truck,
  Factory,
  Package,
  ArrowUpRight,
  ArrowRight,
  ChevronDown,
  Search,
  SlidersHorizontal,
  Layers,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Plus,
  Minus,
  Maximize,
  Minimize,
  LocateFixed,
  Navigation,
  X,
  Check,
  AlertTriangle,
  Clock,
  Database,
  Link,
  Users,
  ChartNoAxesCombined,
  Settings2,
  MousePointer2,
  GitBranch,
  List,
  ShieldCheck,
  Building2,
  Radio,
  Eye,
  Target,
  Sparkles,
  ArrowLeft,
  ExternalLink,
  CheckCheck,
  Workflow,
} from "lucide";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "./operations.css";
import {
  DemoProvider,
  HubSpotProvider,
  createInitialState,
  START,
  at,
  advance,
  applyEvent,
  authorizedState,
  allEntities,
  matches,
  vehiclePosition,
  statusNames,
  departmentNames,
  typeNames,
  templates,
  defaultMapping,
  mapHubSpotDeal,
} from "./model.js";
import { OperationalScene } from "./scene.js";
const icons = {
  Box,
  Truck,
  Factory,
  Package,
  ArrowUpRight,
  ArrowRight,
  ChevronDown,
  Search,
  SlidersHorizontal,
  Layers,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Plus,
  Minus,
  Maximize,
  Minimize,
  LocateFixed,
  Navigation,
  X,
  Check,
  AlertTriangle,
  Clock,
  Database,
  Link,
  Users,
  ChartNoAxesCombined,
  Settings2,
  MousePointer2,
  GitBranch,
  List,
  ShieldCheck,
  Building2,
  Radio,
  Eye,
  Target,
  Sparkles,
  ArrowLeft,
  ExternalLink,
  CheckCheck,
  Workflow,
};
const ico = (n) => `<i data-lucide="${n}"></i>`;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const euros = (n) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
const time = (t) =>
  t
    ? new Intl.DateTimeFormat("es-ES", {
        timeZone: "Europe/Madrid",
        hour: "2-digit",
        minute: "2-digit",
      }).format(t)
    : "Sin dato";
const minutes = (t) => `${Math.max(0, Math.floor(t / 60000))} min`;
let state = await new DemoProvider().read(),
  selection = "truck-01",
  view = "city",
  speed = 60,
  playing = false,
  scene = null,
  follow = false,
  frameAccum = 0,
  toastTimer,
  filters = {
    query: "",
    department: "",
    owner: "",
    status: "",
    incident: false,
  };
const visible = () => authorizedState(state);
const entities = () => allEntities(visible());
const filtered = () => entities().filter((e) => matches(e, filters));
const app = document.querySelector("#app");
document.body.classList.add("operational");
app.innerHTML = `<div class="op-shell"><aside class="op-sidebar"><a class="op-brand" href="./" aria-label="Atlas inicio">a<span>•</span></a><div class="op-nav"><button class="active" data-action="city" title="Vista 3D" aria-label="Vista 3D">${ico("box")}</button><button data-action="list" title="Entidades" aria-label="Lista de entidades">${ico("list")}</button><button data-action="pipeline" title="Pipeline" aria-label="Pipeline">${ico("git-branch")}</button><span></span><button data-action="transport" title="Transporte" aria-label="Filtrar transporte">${ico("truck")}</button><button data-action="production" title="Producción" aria-label="Filtrar producción">${ico("factory")}</button><button data-action="analytics" title="Resumen" aria-label="Resumen de empresa">${ico("chart-no-axes-combined")}</button></div><div class="op-nav bottom"><button data-action="configure" title="Fuentes y correspondencia" aria-label="Configurar fuentes">${ico("database")}</button><button data-action="help" title="Cómo funciona" aria-label="Cómo funciona">${ico("sparkles")}</button><span class="op-avatar">SC</span></div></aside><div class="op-main"><div class="op-header"><div class="op-breadcrumb">Workspace <span>/</span> <b>Tu empresa, en perspectiva</b><span class="op-beta">ATLAS LAB</span></div><div class="op-header-right"><span class="op-demo-dot"></span><span>Datos ficticios</span><button data-action="configure">${ico("database")} Fuentes de datos</button><span class="op-avatar">SC</span></div></div><div class="op-content"><section class="op-title-row"><div><div class="op-eyebrow"><span></span> EL PULSO DE TU EMPRESA</div><h1>Todo conectado. <span>Todo a la vista.</span></h1><p>Del primer contacto a la última entrega. Entiende lo que ocurre, mientras ocurre.</p></div><div class="op-company-select"><span class="op-company-logo">n<span>®</span></span><div><select id="op-template" aria-label="Tipo de empresa"><option value="industrial">Norte Manufacturing</option><option value="services">Studio Norte · Servicios</option></select><small id="op-company-kind">Industria y distribución · Demo</small></div>${ico("chevron-down")}</div></section><section class="op-metrics" id="op-metrics"></section><section class="op-world-card"><div class="op-world-toolbar"><div class="op-view-tabs"><button class="active" data-view="city">${ico("box")} Ciudad 3D</button><button data-view="list">${ico("list")} Lista</button><button data-view="pipeline">${ico("git-branch")} Pipeline</button></div><div class="op-toolbar-right"><span id="op-sync-state" class="op-sync">${ico("radio")} Simulador conectado</span><button data-action="fullscreen" class="op-icon-button" aria-label="Ampliar escena">${ico("maximize")}</button></div></div><div class="op-command-bar"><label class="op-search">${ico("search")}<input id="op-search" placeholder="Buscar Felipe, un pedido, una instalación…" autocomplete="off" aria-label="Buscar entidad"><kbd>/</kbd></label><button data-action="filters" class="op-filter-button">${ico("sliders-horizontal")} Filtros <span id="op-filter-count"></span></button><button data-action="clear" class="op-clear" hidden>Limpiar</button><span id="op-result-count"></span></div><div id="op-filter-panel" hidden><label>Departamento<select id="op-department"><option value="">Todos</option>${Object.entries(
  departmentNames,
)
  .map(([id, name]) => `<option value="${id}">${name}</option>`)
  .join(
    "",
  )}</select></label><label>Responsable<select id="op-owner"></select></label><label>Estado<select id="op-status"></select></label><label class="op-checkbox"><input type="checkbox" id="op-incidents"> Solo incidencias</label></div><div class="op-workspace"><div class="op-map-area"><div class="op-canvas" id="op-canvas"></div><div class="op-map-heading"><span class="op-eyebrow">VISTA OPERATIVA · NO ES UN MAPA A ESCALA</span><h2 id="op-map-title">Norte <span>Manufacturing</span></h2><p>Instalaciones, recursos y relaciones de tu empresa.</p></div><div class="op-layer-control"><button class="active" data-action="layer" aria-label="Mostrar etiquetas">${ico("layers")}</button></div><div class="op-map-note">${ico("mouse-pointer-2")} Arrastra para girar · Rueda para ampliar · Clic para explorar</div><div class="op-map-controls"><button data-action="zoom-in" aria-label="Acercar">${ico("plus")}</button><button data-action="zoom-out" aria-label="Alejar">${ico("minus")}</button><span></span><button data-action="reset-camera" aria-label="Vista inicial">${ico("locate-fixed")}</button></div><div class="op-orientation">N ${ico("navigation")}</div><div class="op-location-legend"><span class="estimated"></span>Estimado <span class="gps"></span>Último GPS <span class="unknown"></span>Sin posición: solo en lista</div><div id="op-data-view" hidden></div><div class="op-focus-banner" id="op-focus-banner" hidden></div></div><aside class="op-inspector" id="op-inspector" aria-label="Ficha de entidad"></aside></div><div class="op-simulation"><div class="op-sim-title">${ico("clock")}<div><b>RELOJ SIMULADO</b><span>14 oct 2026 · Madrid</span></div><strong id="op-time">10:35</strong></div><div class="op-playback"><button data-action="reset-demo" aria-label="Reiniciar simulación" title="Reiniciar">${ico("rotate-ccw")}</button><button data-action="play" id="op-play" class="op-play" aria-label="Iniciar reloj simulado">${ico("play")}</button><select id="op-speed" aria-label="Velocidad del reloj simulado"><option value="60">1 min / seg</option><option value="600">10 min / seg</option><option value="3600">1 h / seg</option></select><button data-action="next-event" class="op-next">Siguiente evento ${ico("skip-forward")}</button></div><div class="op-sim-separator"></div><label class="op-scenario-label">Escenario<select id="op-scenario" aria-label="Escenario reproducible"><option value="initial">Salida de Felipe</option><option value="delivered">Entrega completada</option><option value="returning">Retorno vacío</option><option value="delayed">Llegada sin confirmar</option><option value="arrived">Llegada confirmada</option><option value="blocked">Producción bloqueada</option><option value="shortage">Falta de stock</option><option value="stale">GPS desactualizado</option></select></label></div><div class="op-world-footer"><span>${ico("shield-check")} Acceso de demostración <button data-action="permissions" id="op-permission-toggle">Todos los departamentos</button></span><span>Escala esquemática · Tamaños por función, no por facturación</span></div></section><section class="op-lower-grid"><div class="op-events-card"><div class="op-section-head"><h3>La historia detrás del movimiento <span>EVENTOS</span></h3><span id="op-event-count">Fuente → estado → escena</span></div><div id="op-events"></div></div><div class="op-story-card"><span class="op-story-icon">${ico("workflow")}</span><div><div class="op-eyebrow">UN NEGOCIO. UN SOLO RECORRIDO.</div><h3>El pedido no termina<br>cuando sale del almacén.</h3><p>Sigue a Felipe y explora cómo una entrega conecta a tu cliente, tu inventario y tu equipo.</p><button data-action="felipe">Explorar el recorrido ${ico("arrow-right")}</button></div><div class="op-story-route"><span></span><span></span><span></span></div></div></section><div class="op-page-footer"><span>Menos tablas. Más perspectiva.</span><a href="?experience=classic">Explorar el Atlas original ${ico("arrow-up-right")}</a><span>Atlas · Business in motion <b>✳</b></span></div></div></div></div><div id="op-modal-root"></div><div id="op-toast" role="status"></div>`;
function iconsRefresh() {
  createIcons({ icons });
}
function toast(message) {
  const el = document.querySelector("#op-toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
}
function status(e) {
  if (e.type === "vehicle" && e.status === "returning")
    return e.cargo === 0 ? "Volviendo vacío" : "Volviendo con carga";
  return statusNames[e.status] || e.status;
}
function badge(e) {
  const bad = e.incident || e.status === "blocked" || e.status === "shortage";
  return `<span class="op-badge ${bad ? "bad" : ["paid", "delivered", "available"].includes(e.status) ? "good" : ""}"><span></span>${esc(status(e))}</span>`;
}
function setState(next, { rebuild = false } = {}) {
  state = next;
  const allowed = entities();
  if (selection && !allowed.some((e) => e.id === selection)) selection = null;
  if (scene) {
    if (rebuild) {
      scene.build(visible());
      scene.follow = false;
    }
    scene.update(visible(), filters, selection);
    scene.paused = !playing;
  }
  render();
}
function render() {
  renderMetrics();
  renderInspector();
  renderEvents();
  renderDataView();
  document.querySelector("#op-time").textContent = time(state.now);
  document.querySelector("#op-result-count").textContent =
    `${filtered().length} entidades`;
  document.querySelector("#op-sync-state").innerHTML =
    `${ico("radio")} Demo · sync ${time(state.sync.lastAt)}`;
  const count = Object.values(filters).filter(Boolean).length;
  document.querySelector("#op-filter-count").textContent = count || "";
  document.querySelector(".op-clear").hidden = !count;
  const selected = entities().find((e) => e.id === selection);
  const filteredOut = selected && !matches(selected, filters);
  const banner = document.querySelector("#op-focus-banner");
  banner.hidden = !filteredOut;
  banner.textContent =
    "La entidad seleccionada está fuera de los filtros actuales.";
  document.querySelector("#op-permission-toggle").textContent = state
    .permissions.finance
    ? "Todos los departamentos"
    : "Finanzas restringidas";
  iconsRefresh();
}
function renderMetrics() {
  const s = visible(),
    v = s.vehicles;
  let metrics =
    s.template === "industrial"
      ? [
          [
            "Producción en marcha",
            `${s.lines.filter((l) => l.status === "active").length}<small> / ${s.lines.length} líneas</small>`,
            s.lines.some((l) => l.incident)
              ? "Una línea necesita atención"
              : "Órdenes activas · datos ERP",
            "factory",
            "green",
          ],
          [
            "Inventario disponible",
            s.inventory.reduce(
              (a, i) => a + Math.max(0, i.onHand - i.reserved),
              0,
            ) + "<small> uds.</small>",
            `${s.inventory.reduce((a, i) => a + i.reserved, 0)} unidades reservadas`,
            "package",
            "blue",
          ],
          [
            "Flota en operación",
            v.filter((v) =>
              ["outbound", "returning", "loading", "delayed"].includes(
                v.status,
              ),
            ).length + `<small> / ${v.length} vehículos</small>`,
            `${v.filter((v) => v.incident).length} con incidencia · ${v.filter((v) => v.positionType === "gps").length} con GPS`,
            "truck",
            "peach",
          ],
          [
            "Pedidos entregados",
            s.orders.filter((o) => o.status === "delivered").length +
              `<small> / ${s.orders.length} pedidos</small>`,
            `${s.orders.filter((o) => o.status === "in_transit").length} en reparto · entregas confirmadas`,
            "check-check",
            "purple",
          ],
        ]
      : [
          [
            "Proyectos activos",
            s.projects.filter((p) => p.status === "active").length,
            "Estado de tareas explícito",
            "layers",
            "green",
          ],
          [
            "Horas registradas",
            s.projects.reduce((a, p) => a + p.hours, 0) + "<small> h</small>",
            "Partes de horas de demostración",
            "clock",
            "blue",
          ],
          [
            "Oportunidades",
            s.records.filter((r) => r.type === "opportunity").length,
            "Datos del CRM simulado",
            "target",
            "peach",
          ],
          [
            "Proyectos en revisión",
            s.projects.filter((p) => p.status === "review").length,
            "Listos para validar con cliente",
            "check-check",
            "purple",
          ],
        ];
  document.querySelector("#op-metrics").innerHTML = metrics
    .map(
      ([label, value, sub, icon, color]) =>
        `<article class="op-metric"><div><span>${label}</span><span class="op-metric-icon ${color}">${ico(icon)}</span></div><strong>${value}</strong><p><span class="op-metric-dot ${color}"></span>${sub}</p></article>`,
    )
    .join("");
}
const row = (k, v) =>
  `<div class="op-detail-row"><span>${k}</span><b>${esc(v)}</b></div>`;
function relatedButton(id, label) {
  const e = entities().find((e) => e.id === id);
  return e
    ? `<button class="op-related" data-select="${esc(id)}"><span>${ico(e.type === "vehicle" ? "truck" : e.type === "order" ? "package" : e.type === "line" ? "factory" : "link")}<span><small>${label || typeNames[e.type]}</small><b>${esc(e.name)}</b></span></span>${ico("arrow-up-right")}</button>`
    : "";
}
function progress(value, label) {
  return `<div class="op-progress"><span>${label}</span><b>${Math.round(value * 100)}%</b><div><span style="width:${Math.max(0, Math.min(value, 1)) * 100}%"></span></div></div>`;
}
function renderInspector() {
  const el = document.querySelector("#op-inspector"),
    e = entities().find((e) => e.id === selection);
  if (!e) {
    el.innerHTML = `<div class="op-empty-inspector">${ico("mouse-pointer-2")}<h3>Cada elemento cuenta una historia.</h3><p>Selecciona una instalación, un camión o un recurso para descubrir lo que ocurre.</p><button data-action="felipe">Explorar el recorrido de Felipe ${ico("arrow-right")}</button></div>`;
    return;
  }
  let body = "",
    rel = "";
  if (e.type === "vehicle") {
    const p = vehiclePosition(e, state.now),
      order = entities().find((o) => o.id === e.orderId);
    body = `<div class="op-position ${p.stale || p.pending ? "warning" : ""}">${ico(e.positionType === "gps" ? "radio" : e.positionType === "unknown" ? "alert-triangle" : "clock")}<div><b>${esc(p.label)}</b><span>${e.positionType === "estimated" ? "Interpolación por tiempo, no seguimiento GPS" : e.positionType === "gps" ? `Recibido ${time(e.gpsAt)} · antigüedad ${minutes(state.now - e.gpsAt)}` : e.positionType === "unknown" ? "No se dibuja una ruta ni ubicación inventada" : "Confirmación de la fuente · maqueta esquemática"}</span></div></div><div class="op-route-summary"><span><i></i><small>ORIGEN</small><b>${esc(e.origin)}</b></span><span><i></i><small>DESTINO</small><b>${esc(e.destination)}</b></span></div>${e.positionType === "estimated" ? progress(p.progress, "Avance estimado del trayecto") : ""}<div class="op-info-grid">${row("Conductor", e.driver)}${row("Vehículo", `${e.name} · ${e.plate}`)}${row("Expedición", e.shipmentId || "Sin asignar")}${row("Carga / capacidad", `${e.cargo} / ${e.capacity} uds.`)}${row("Salida", time(e.departure))}${row("Llegada estimada", time(e.eta))}${e.arrivalAt ? row("Llegada confirmada", time(e.arrivalAt)) : ""}${row("Tiempo transcurrido", e.departure ? minutes((e.arrivalAt || state.now) - e.departure) : "Sin trayecto")}${row("Pedido", order?.name || "Sin asignar")}${row("Cliente", entities().find((c) => c.id === e.clientId)?.name || "Sin asignar")}</div>${e.incident ? `<div class="op-incident">${ico("alert-triangle")}${esc(e.incident)}</div>` : ""}${e.cargo === 0 ? '<div class="op-empty-cargo">Carga vacía confirmada por la fuente de datos.</div>' : ""}<button class="op-primary" data-action="follow" ${!p.known ? "disabled" : ""}>${ico("locate-fixed")}${follow ? "Dejar de seguir" : "Seguir vehículo"}</button>`;
    rel =
      relatedButton(e.orderId, "Pedido asociado") +
      relatedButton("warehouse", "Instalación de origen") +
      (e.clientId ? relatedButton(e.clientId, "Cliente") : "");
  } else if (e.type === "facility") {
    const linked = entities().filter(
      (x) => x.id !== e.id && x.department === e.department,
    );
    body = `<p class="op-description">${esc(e.description)}</p><div class="op-info-grid">${row("Departamento", departmentNames[e.department])}${row("Responsable", e.owner)}${row("Recursos relacionados", linked.length)}</div><div class="op-detail-note">Dimensiones por función y disposición de la maqueta. No representan ingresos ni superficie real.</div>`;
    rel = linked.map((x) => relatedButton(x.id)).join("");
  } else if (e.type === "order") {
    body = `<div class="op-big-value">${euros(e.amount)}</div><div class="op-info-grid">${row("Cliente", e.client)}${row("Producto", entities().find((p) => p.id === e.productId)?.name || e.productId)}${row("Unidades", e.quantity)}${row("Responsable", e.owner)}${row("Estado", status(e))}</div>`;
    rel =
      relatedButton(e.vehicleId, "Vehículo") +
      relatedButton(e.lineId, "Línea de producción") +
      relatedButton(e.productId, "Inventario") +
      relatedButton(e.clientId, "Cliente") +
      entities()
        .filter((x) => x.type === "invoice" && x.orderId === e.id)
        .map((x) => relatedButton(x.id))
        .join("");
  } else if (e.type === "line") {
    body = `${progress(e.progress, "Progreso reportado por ERP")}<div class="op-info-grid">${row("Responsable", e.owner)}${row("Ritmo nominal", `${e.rate} uds. / hora`)}${row("Estado", status(e))}</div><div class="op-detail-note">El progreso es el último valor recibido; la cinta solo se anima si existe una orden activa. No confirma fabricación.</div>${e.incident ? `<div class="op-incident">${ico("alert-triangle")}${esc(e.incident)}</div>` : ""}`;
    rel = relatedButton(e.orderId, "Orden asociada");
  } else if (e.type === "inventory") {
    body = `<div class="op-big-value">${e.onHand}<small> uds. en almacén</small></div><div class="op-info-grid">${row("SKU", e.sku)}${row("Reservas", `${e.reserved} uds.`)}${row("Disponible", `${Math.max(0, e.onHand - e.reserved)} uds.`)}${row("Responsable", e.owner)}</div>${e.onHand < e.reserved ? `<div class="op-incident">${ico("alert-triangle")}Faltan ${e.reserved - e.onHand} unidades para cubrir las reservas.</div>` : ""}<div class="op-detail-note">La mercancía en tránsito ya salió del almacén. Confirmar su entrega no vuelve a descontarla.</div>`;
    rel = entities()
      .filter((o) => o.type === "order" && o.productId === e.id)
      .map((o) => relatedButton(o.id))
      .join("");
  } else if (e.type === "campaign") {
    body = `<div class="op-big-value">${e.leads}<small> leads recibidos</small></div><div class="op-info-grid">${row("Responsable", e.owner)}${row("Presupuesto", euros(e.budget))}${row("Conversiones reportadas", e.conversions)}</div>`;
  } else if (e.type === "project") {
    body = `${progress(e.progress, "Avance reportado")}<div class="op-info-grid">${row("Responsable", e.owner)}${row("Horas registradas", `${e.hours} h`)}${row("Horas previstas", `${e.plannedHours} h`)}${row("Valor", euros(e.amount))}</div><div class="op-detail-note">Tiempo de trabajo procedente de partes explícitos. No se infiere por presencia de avatares.</div>`;
    rel = relatedButton(e.clientId, "Cliente");
  } else {
    body = `<div class="op-big-value">${euros(e.amount)}</div><div class="op-info-grid">${row("Responsable", e.owner)}${row("Estado", status(e))}${e.dueAt ? row("Vencimiento", new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid" }).format(e.dueAt)) : ""}</div>`;
    rel = relatedButton(e.orderId) + relatedButton(e.clientId);
  }
  el.innerHTML = `<div class="op-inspector-top"><span>${ico(e.type === "vehicle" ? "truck" : e.type === "facility" ? "building-2" : e.type === "line" ? "factory" : e.type === "order" ? "package" : "layers")} ${typeNames[e.type]}</span><button data-action="close-inspector" aria-label="Cerrar ficha">${ico("x")}</button></div><div class="op-inspector-scroll"><div class="op-entity-heading"><small>${esc(e.id)} · DATOS FICTICIOS</small><h2>${esc(e.type === "vehicle" ? e.driver : e.name)}</h2>${badge(e)}</div>${body}${rel ? `<div class="op-relations-title">CONECTADO CON</div><div class="op-relations">${rel}</div>` : ""}<div class="op-provenance"><span>${ico("database")} ${esc(e.source)}</span><span>Actualizado ${time(e.updatedAt)} · ${minutes(state.now - e.updatedAt)} de antigüedad</span><p>Lectura de demostración · sin escritura al sistema de origen</p>${e.sourceUrl?.startsWith("https://") ? `<a href="${esc(e.sourceUrl)}" target="_blank" rel="noopener noreferrer">Abrir registro de origen ${ico("external-link")}</a>` : '<span class="op-no-source-link">Sin enlace de origen en datos ficticios</span>'}</div></div>`;
}
const eventNames = {
  delivery: "Entrega completa confirmada",
  return_started: "Retorno iniciado · carga vacía",
  arrival_confirmed: "Llegada confirmada · disponible",
  production_blocked: "Línea 02 bloqueada por temperatura",
  stock_shortage: "Existencias insuficientes",
  stale_gps: "Última posición GPS desactualizada",
};
function renderEvents() {
  const events = state.events.slice(0, 4);
  document.querySelector("#op-events").innerHTML = events.length
    ? events
        .map(
          (e) =>
            `<button class="op-event" data-select="${e.vehicleId || e.lineId || e.productId || "truck-02"}"><span class="op-event-symbol">${ico(e.kind === "delivery" ? "check-check" : e.kind === "return_started" ? "truck" : e.kind === "arrival_confirmed" ? "locate-fixed" : "alert-triangle")}</span><div><b>${eventNames[e.kind]}</b><p>${esc(e.source)} · ${esc(e.vehicleId || e.lineId || e.productId || "truck-02")}</p></div><time>${time(e.at)}</time>${ico("arrow-up-right")}</button>`,
        )
        .join("")
    : `<div class="op-event-empty">${ico("workflow")}<div><b>La escena está leyendo el estado inicial.</b><p>Inicia el reloj o pulsa «Siguiente evento» para observar la cadena de cambios.</p></div></div>`;
}
function renderDataView() {
  if (view === "city") return;
  const rows = filtered().filter(
    (e) =>
      view === "list" ||
      (state.template === "industrial"
        ? e.type === "order"
        : e.type === "project"),
  );
  const el = document.querySelector("#op-data-view");
  if (view === "list") {
    el.innerHTML = `<div class="op-table-head"><h3>Tu empresa, entidad a entidad.</h3><p>Los mismos datos, filtros y selección que en la escena.</p></div><div class="op-table-scroll"><table><thead><tr><th>Entidad</th><th>Tipo</th><th>Responsable</th><th>Estado</th><th>Fuente</th></tr></thead><tbody>${rows.map((e) => `<tr class="${e.id === selection ? "selected" : ""}"><td><button data-select="${e.id}"><b>${esc(e.type === "vehicle" ? `${e.name} · ${e.driver}` : e.name)}</b><small>${e.id}${e.type === "vehicle" ? " · " + vehiclePosition(e, state.now).label : ""}</small></button></td><td>${typeNames[e.type]}</td><td>${esc(e.owner)}</td><td>${badge(e)}</td><td>${esc(e.source)}</td></tr>`).join("")}</tbody></table>${!rows.length ? '<div class="op-no-results">Sin entidades con estos filtros. <button data-action="clear">Limpiar filtros</button></div>' : ""}</div>`;
  } else {
    const stages =
      state.template === "industrial"
        ? ["pending", "in_production", "ready", "in_transit", "delivered"]
        : ["pending", "active", "review"];
    el.innerHTML = `<div class="op-table-head"><h3>Del pedido a la entrega.</h3><p>Los eventos de la fuente actualizan estas etapas y la ciudad a la vez.</p></div><div class="op-kanban">${stages
      .map(
        (st) =>
          `<section><h4><span class="op-stage-dot ${st}"></span>${statusNames[st]}<b>${rows.filter((o) => o.status === st).length}</b></h4>${rows
            .filter((o) => o.status === st)
            .map(
              (o) =>
                `<button class="op-order-card ${selection === o.id ? "selected" : ""}" data-select="${o.id}"><small>${esc(o.client || o.owner)}</small><b>${esc(o.name)}</b><strong>${euros(o.amount)}</strong><span>${o.quantity ? o.quantity + " uds." : Math.round(o.progress * 100) + "%"} ${ico("arrow-up-right")}</span></button>`,
            )
            .join("")}</section>`,
      )
      .join(
        "",
      )}</div>${!rows.length ? '<div class="op-no-results">No hay pedidos con estos filtros.</div>' : ""}`;
  }
}
function select(id, { focus = false } = {}) {
  const e = entities().find((e) => e.id === id);
  if (!e) return;
  selection = id;
  follow = false;
  if (scene) {
    scene.follow = false;
    scene.update(visible(), filters, selection);
    if (focus && !scene.focus(id))
      toast(
        "Sin posición conocida o entidad fuera de los filtros; consulta la ficha.",
      );
  }
  renderInspector();
  renderDataView();
  iconsRefresh();
  document.querySelector("#op-inspector").classList.remove("closed");
}
function changeView(next) {
  view = next;
  document.querySelector("#op-data-view").hidden = next === "city";
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === next));
  document
    .querySelectorAll(".op-nav [data-action]")
    .forEach((b) => b.classList.toggle("active", b.dataset.action === next));
  renderDataView();
  iconsRefresh();
}
function applyFilters() {
  scene?.update(visible(), filters, selection);
  render();
  document.querySelector("#op-department").value = filters.department;
  document.querySelector("#op-owner").value = filters.owner;
  document.querySelector("#op-status").value = filters.status;
  document.querySelector("#op-incidents").checked = filters.incident;
}
function setupFilters() {
  document.querySelector("#op-owner").innerHTML =
    '<option value="">Todos</option>' +
    [...new Set(entities().map((e) => e.owner))]
      .sort()
      .map((n) => `<option>${esc(n)}</option>`)
      .join("");
  document.querySelector("#op-status").innerHTML =
    '<option value="">Todos</option>' +
    [
      ...new Set([
        ...Object.keys(statusNames),
        ...entities().map((e) => e.status),
      ]),
    ]
      .map((s) => `<option value="${s}">${statusNames[s] || s}</option>`)
      .join("");
}
function play(next) {
  playing = next;
  if (scene) scene.paused = !next;
  document.querySelector("#op-play").innerHTML = ico(next ? "pause" : "play");
  document
    .querySelector("#op-play")
    .setAttribute(
      "aria-label",
      next ? "Pausar reloj simulado" : "Iniciar reloj simulado",
    );
  iconsRefresh();
}
function scenario(value) {
  play(false);
  follow = false;
  if (scene) scene.follow = false;
  const permissions = state.permissions,
    template = state.template;
  let next = createInitialState(template);
  next.permissions = permissions;
  if (template === "industrial") {
    const times = {
      delivered: at("11:00"),
      returning: at("11:25"),
      delayed: at("14:12"),
      arrived: at("14:20"),
    };
    if (times[value]) next = advance(next, times[value]);
    else if (value === "blocked")
      next = applyEvent(next, {
        id: "scenario-blocked",
        kind: "production_blocked",
        lineId: "line-02",
        at: next.now,
      });
    else if (value === "shortage")
      next = applyEvent(next, {
        id: "scenario-shortage",
        kind: "stock_shortage",
        productId: "product-02",
        at: next.now,
      });
    else if (value === "stale")
      next = applyEvent(next, {
        id: "scenario-stale",
        kind: "stale_gps",
        at: next.now,
      });
  }
  selection =
    value === "blocked"
      ? "line-02"
      : value === "shortage"
        ? "product-02"
        : value === "stale"
          ? "truck-02"
          : template === "industrial"
            ? "truck-01"
            : "project-01";
  setState(next);
}
function modal(title, subtitle, content) {
  document.querySelector("#op-modal-root").innerHTML =
    `<div class="op-modal-backdrop"><section class="op-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><button data-action="close-modal" class="op-modal-close" aria-label="Cerrar">${ico("x")}</button><div class="op-modal-mark">${ico("database")}</div><h2>${title}</h2><p>${subtitle}</p>${content}</section></div>`;
  iconsRefresh();
  document.querySelector(".op-modal-close").focus();
}
function configure() {
  let mapping = defaultMapping;
  try {
    mapping =
      JSON.parse(localStorage.getItem("atlas-field-mapping")) || defaultMapping;
  } catch {}
  modal(
    "De tus datos, a tu ciudad.",
    "Atlas interpreta un modelo común. El CRM sigue siendo la fuente de verdad.",
    `<div class="op-source-grid"><div><b>HubSpot</b><span>CRM · Adaptador preparado</span><small>Contactos, oportunidades, pedidos</small></div><div><b>ERP / TMS</b><span>Proveedor simulado activo</span><small>Producción, stock y expediciones</small></div><div><b>Geolocalización</b><span>Última lectura simulada</span><small>Sin conexión a GPS real</small></div></div><div class="op-config-section"><h3>Correspondencia de campos · HubSpot</h3><p>Propuesta inicial editable. Define qué campos de origen alimentan cada atributo.</p><form id="op-mapping-form">${Object.entries(
      mapping,
    )
      .map(
        ([key, value]) =>
          `<label>${{ dealId: "Identificador", dealName: "Nombre", dealAmount: "Importe", dealStage: "Etapa" }[key]}<input name="${key}" value="${esc(value)}" required></label>`,
      )
      .join(
        "",
      )}<button class="op-primary" type="submit">Validar y guardar configuración local</button></form><div id="op-mapping-result" role="status"></div></div><div class="op-config-section"><h3>Plantilla sectorial</h3><p>${state.template === "industrial" ? "Industria: fábrica, almacén, flota, clientes y departamentos." : "Servicios: estudio, equipo de proyectos, clientes y departamentos. Sin camiones ni inventario."} La selección de empresa aplica esta configuración; las instalaciones no se deducen automáticamente de los nombres del CRM.</p></div><div class="op-modal-note">${ico("shield-check")} Sin OAuth ni backend conectado. No se solicitan claves. El control de acceso es una demostración en el cliente; una integración real debe filtrar y autorizar los datos en el servidor.</div>`,
  );
  document.querySelector("#op-mapping-form").onsubmit = (e) => {
    e.preventDefault();
    const mapping = Object.fromEntries(new FormData(e.target));
    try {
      const preview = mapHubSpotDeal(
        {
          id: "demo-01",
          properties: {
            dealname: "Pedido Habitat",
            amount: "12800",
            dealstage: "contractsent",
          },
        },
        mapping,
      );
      localStorage.setItem("atlas-field-mapping", JSON.stringify(mapping));
      document.querySelector("#op-mapping-result").textContent =
        `Configuración guardada en este navegador. Muestra validada: ${preview.name} · ${euros(preview.amount)}. La etapa «${preview.stage}» requiere correspondencia comercial en la integración.`;
    } catch (error) {
      document.querySelector("#op-mapping-result").textContent =
        `No se pudo validar con la muestra HubSpot: ${error.message}. No se ha guardado.`;
    }
  };
}
app.addEventListener("click", (e) => {
  const selected = e.target.closest("[data-select]");
  if (selected) {
    select(selected.dataset.select, { focus: true });
    return;
  }
  const tab = e.target.closest("[data-view]");
  if (tab) {
    changeView(tab.dataset.view);
    return;
  }
  const button = e.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (["city", "list", "pipeline"].includes(action)) changeView(action);
  else if (action === "play") play(!playing);
  else if (action === "next-event") {
    play(false);
    const next = state.plan.find(
      (e) => !state.processed.includes(e.id) && e.at >= state.now,
    );
    if (next) {
      setState(advance(state, next.at));
      toast(eventNames[next.kind]);
    } else
      toast(
        "No hay más eventos programados. Reinicia para repetir el recorrido.",
      );
  } else if (action === "reset-demo") {
    scenario("initial");
    document.querySelector("#op-scenario").value = "initial";
    toast("Simulación reiniciada. Los datos originales no se modifican.");
  } else if (action === "filters")
    document.querySelector("#op-filter-panel").hidden =
      !document.querySelector("#op-filter-panel").hidden;
  else if (action === "clear") {
    filters = {
      query: "",
      department: "",
      owner: "",
      status: "",
      incident: false,
    };
    document.querySelector("#op-search").value = "";
    applyFilters();
  } else if (action === "transport" || action === "production") {
    filters.department = action;
    document.querySelector("#op-filter-panel").hidden = false;
    applyFilters();
  } else if (action === "close-inspector") {
    selection = null;
    follow = false;
    if (scene) scene.follow = false;
    scene?.update(visible(), filters, null);
    render();
  } else if (action === "felipe") {
    if (state.template !== "industrial") {
      toast(
        "El escenario de servicios no tiene flota. Cambia a Norte Manufacturing.",
      );
      return;
    }
    filters = {
      query: "",
      department: "",
      owner: "",
      status: "",
      incident: false,
    };
    document.querySelector("#op-search").value = "";
    applyFilters();
    select("truck-01", { focus: true });
    changeView("city");
  } else if (action === "follow") {
    const v = state.vehicles.find((v) => v.id === selection);
    if (!v || !vehiclePosition(v, state.now).known) return;
    follow = !follow;
    if (scene) {
      scene.follow = follow;
      if (follow) scene.focus(selection);
    }
    renderInspector();
    iconsRefresh();
  } else if (action === "reset-camera") {
    scene?.reset();
    follow = false;
    renderInspector();
    iconsRefresh();
  } else if (action === "zoom-in" || action === "zoom-out") {
    if (scene)
      scene.camera.position
        .sub(scene.controls.target)
        .multiplyScalar(action === "zoom-in" ? 0.85 : 1.15)
        .add(scene.controls.target);
  } else if (action === "layer") {
    document.querySelector(".op-labels")?.classList.toggle("labels-hidden");
    button.classList.toggle("active");
  } else if (action === "fullscreen") {
    document.querySelector(".op-world-card").classList.toggle("expanded");
    button.innerHTML = ico(
      document.querySelector(".op-world-card").classList.contains("expanded")
        ? "minimize"
        : "maximize",
    );
    iconsRefresh();
  } else if (action === "configure") configure();
  else if (action === "permissions") {
    state.permissions.finance = !state.permissions.finance;
    setState(state);
    toast(
      state.permissions.finance
        ? "Finanzas visibles en la demo"
        : "Finanzas ocultas en todas las vistas, métricas y relaciones.",
    );
  } else if (action === "help")
    modal(
      "La empresa es la escena.",
      "Cada movimiento tiene una explicación en los datos.",
      `<div class="op-help-grid"><p><b>01 · Explora</b>Selecciona instalaciones, recursos, camiones o pedidos. La lista ofrece la misma información sin depender del 3D.</p><p><b>02 · Observa el ciclo</b>Pulsa «Siguiente evento»: entrega, inicio del retorno y llegada se confirman por eventos separados.</p><p><b>03 · Distingue la posición</b>GPS es la última lectura. Estimado interpola el tiempo. Sin información, no aparece ningún vehículo en un lugar inventado.</p><p><b>04 · Entiende la escala</b>La maqueta resume ubicaciones geográficas. Las rutas no están a escala y los tamaños no representan facturación.</p></div><div class="op-modal-note">Todos los datos, fechas y eventos son ficticios. El reloj se inicia pausado. Las fuentes reales necesitan conectores seguros y configuración.</div>`,
    );
  else if (action === "analytics") {
    const s = visible();
    modal(
      "Un negocio conectado.",
      "Resumen de los datos disponibles para tu perfil de demostración.",
      `<div class="op-summary">${row("Oportunidades CRM", s.records.filter((r) => r.type === "opportunity").length)}${row("Valor oportunidades", euros(s.records.filter((r) => r.type === "opportunity").reduce((a, r) => a + r.amount, 0)))}${s.permissions.finance ? row("Cobros confirmados", euros(s.records.filter((r) => r.type === "invoice" && r.status === "paid").reduce((a, r) => a + r.amount, 0))) : row("Finanzas", "Acceso restringido")}${row("Última sincronización", time(s.sync.lastAt))}</div><div class="op-modal-note">El resumen usa el estado y los permisos actuales; no incluye previsiones inventadas.</div>`,
    );
  }
});
document.querySelector("#op-modal-root").addEventListener("click", (e) => {
  if (
    e.target.closest('[data-action="close-modal"]') ||
    e.target.classList.contains("op-modal-backdrop")
  )
    closeModal();
});
function closeModal() {
  document.querySelector("#op-modal-root").innerHTML = "";
}
document.querySelector("#op-search").addEventListener("input", (e) => {
  filters.query = e.target.value;
  applyFilters();
});
document.querySelector("#op-search").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const found =
      filtered().find((e) => e.type !== "facility") || filtered()[0];
    if (found) select(found.id, { focus: true });
  }
});
for (const [id, key] of [
  ["op-department", "department"],
  ["op-owner", "owner"],
  ["op-status", "status"],
])
  document.querySelector("#" + id).onchange = (e) => {
    filters[key] = e.target.value;
    applyFilters();
  };
document.querySelector("#op-incidents").onchange = (e) => {
  filters.incident = e.target.checked;
  applyFilters();
};
document.querySelector("#op-speed").onchange = (e) =>
  (speed = Number(e.target.value));
document.querySelector("#op-scenario").onchange = (e) =>
  scenario(e.target.value);
document.querySelector("#op-template").onchange = async (e) => {
  play(false);
  follow = false;
  const permissions = { ...state.permissions };
  state = await new DemoProvider().read(e.target.value);
  state.permissions = permissions;
  filters = {
    query: "",
    department: "",
    owner: "",
    status: "",
    incident: false,
  };
  selection = state.template === "industrial" ? "truck-01" : "project-01";
  document.querySelector("#op-company-kind").textContent =
    templates[state.template].label + " · Demo";
  document.querySelector("#op-map-title").innerHTML =
    state.template === "industrial"
      ? "Norte <span>Manufacturing</span>"
      : "Studio <span>Norte</span>";
  document.querySelector("#op-scenario").disabled =
    state.template !== "industrial";
  document.querySelector("#op-scenario").value = "initial";
  document.querySelector("#op-search").value = "";
  setupFilters();
  setState(state, { rebuild: true });
  applyFilters();
  scene?.reset();
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
    document.querySelector(".op-world-card").classList.remove("expanded");
  }
  if (
    e.key === "/" &&
    !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    document.querySelector("#op-search").focus();
  }
  if (e.key === "Tab" && document.querySelector(".op-modal")) {
    const focusable = [
      ...document.querySelectorAll(
        ".op-modal button,.op-modal input,.op-modal a",
      ),
    ].filter((el) => !el.disabled);
    const first = focusable[0],
      last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
setupFilters();
try {
  scene = new OperationalScene(document.querySelector("#op-canvas"), {
    onSelect: (id) => select(id),
  });
  scene.build(visible());
  scene.update(visible(), filters, selection);
  scene.onFrame = (dt) => {
    if (!playing || document.hidden) return;
    frameAccum += dt;
    if (frameAccum >= 0.35) {
      const elapsed = frameAccum;
      frameAccum = 0;
      setState(advance(state, state.now + elapsed * speed * 1000));
    }
  };
} catch (error) {
  console.error("WebGL unavailable:", error);
  document.querySelector("#op-canvas").innerHTML =
    '<div class="op-webgl-fallback">Vista 3D indisponible. Toutes les données sont disponibles dans la liste.</div>';
  changeView("list");
  toast("La vista 3D requiere WebGL. La lista sigue disponible.");
}
if (!scene) {
  setInterval(() => {
    if (playing && !document.hidden)
      setState(advance(state, state.now + speed * 500));
  }, 500);
}
render();
play(false);
