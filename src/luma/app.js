import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import {
  createIcons,
  Box,
  Factory,
  Truck,
  Package,
  ArrowRight,
  ArrowUpRight,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Layers,
  Sun,
  Clock,
  Eye,
  X,
  Plus,
  Minus,
  LocateFixed,
  ChevronDown,
  ChartNoAxesCombined,
  Database,
  Check,
  AlertTriangle,
  Maximize,
  Minimize,
  Camera,
  Navigation,
  Activity,
  Info,
  List,
  GitBranch,
  ArrowLeft,
  Settings2,
  CheckCheck,
  Radio,
} from "lucide";
import { LumaScene } from "./scene.js";
import {
  RULES,
  LABELS,
  DEFAULT_TIME,
  days,
  clock,
  replay,
  advance,
  finances,
  vehicleState,
  nextEvent,
  FixedStepClock,
} from "./simulation.js";
import "./style.css";
const icons = {
  Box,
  Factory,
  Truck,
  Package,
  ArrowRight,
  ArrowUpRight,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Layers,
  Sun,
  Clock,
  Eye,
  X,
  Plus,
  Minus,
  LocateFixed,
  ChevronDown,
  ChartNoAxesCombined,
  Database,
  Check,
  AlertTriangle,
  Maximize,
  Minimize,
  Camera,
  Navigation,
  Activity,
  Info,
  List,
  GitBranch,
  ArrowLeft,
  Settings2,
  CheckCheck,
  Radio,
};
const icon = (n) => `<i data-lucide="${n}"></i>`;
const eur = (n) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
const fmt = (t) =>
  new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  }).format(t);
const date = (t) =>
  new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "short",
  }).format(t);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let state = replay(),
  scene,
  selection = null,
  view = "city",
  filters = { query: "", incident: false },
  playing = false,
  speed = 60,
  scenario = "base",
  lastUI = 0,
  tourStart = null,
  tourView = -1,
  financeVisible = true,
  uiDirty = true,
  recordedFrames = [],
  loadStart = performance.now();
const app = document.querySelector("#app");
app.innerHTML = `<div class="l-shell"><aside class="l-rail"><a class="l-logo" href="./" aria-label="Atlas inicio">a<span>•</span></a><button data-view="city" class="active" aria-label="Campus 3D">${icon("box")}</button><button data-view="list" aria-label="Lista de entidades">${icon("list")}</button><button data-view="pipeline" aria-label="Pipeline de pedidos">${icon("git-branch")}</button><span class="l-rail-separator"></span><button data-action="economics" aria-label="Economía de Luma">${icon("chart-no-axes-combined")}</button><button data-action="sources" aria-label="Fuentes y modelo">${icon("database")}</button><div class="l-rail-bottom"><a href="?experience=operations" title="Atlas anterior">${icon("arrow-left")}</a><button data-action="help" aria-label="Cómo explorar">${icon("info")}</button><span class="l-avatar">SC</span></div></aside><main class="l-main"><header class="l-header"><div class="l-wordmark">atlas<span>.</span><small>BUSINESS IN MOTION</small></div><div class="l-workspace"><span class="l-luma-mark">l<span>↗</span></span><div><b>Luma Works</b><small>Campus industrial · Empresa ficticia</small></div></div><div class="l-top-right"><span class="l-demo"><span></span> Datos simulados</span><button data-action="sources" class="l-sources">${icon("radio")} Fuentes de datos</button><span class="l-avatar">SC</span></div></header><div class="l-intro"><div><div class="l-eyebrow"><span></span> UNA EMPRESA QUE PUEDES ENTENDER</div><h1>Las ideas se convierten en luz<span>.</span></h1><p>Un taller, dos camiones y miles de pequeñas conexiones. Todo, en perspectiva.</p></div><button class="l-tour-button" data-action="tour">${icon("play")} Un paseo por Luma <span>50 s</span></button></div><section class="l-stage"><div class="l-toolbar"><div class="l-tabs"><button data-view="city" class="active">${icon("box")} Campus 3D</button><button data-view="list">${icon("list")} Lista</button><button data-view="pipeline">${icon("git-branch")} Pipeline</button></div><div class="l-toolbar-right"><span class="l-campus-state"><span></span> Un día en Luma Works</span><button data-action="filters" aria-label="Buscar y filtrar">${icon("search")}</button><button data-action="fullscreen" aria-label="Ampliar campus">${icon("maximize")}</button></div></div><div class="l-filterbar" hidden><label>${icon("search")}<input id="l-search" placeholder="Buscar Felipe, LW-024, un recurso…" aria-label="Buscar entidad"></label><select id="l-driver" aria-label="Filtrar responsable"><option value="">Todos los conductores</option><option>Felipe García</option><option>Clara Vidal</option></select><select id="l-status" aria-label="Filtrar estado"><option value="">Todos los estados</option>${Object.entries(
  LABELS,
)
  .map(([id, name]) => `<option value="${id}">${name}</option>`)
  .join(
    "",
  )}</select><label><input type="checkbox" id="l-incidents"> Solo incidencias</label><button data-action="clear">Limpiar</button></div><div class="l-world"><div id="l-canvas"></div><div class="l-world-heading"><span class="l-eyebrow">LUMA WORKS / EST. 2026</span><h2>Fabricamos luz.<br><span>Conectamos historias.</span></h2><p>Montaje → Prueba → Embalaje → Entrega</p></div><div class="l-scene-badge">${icon("navigation")} Campus a escala · Ruta regional esquemática</div><div class="l-view-controls"><button data-action="roof" aria-label="Retirar cubierta" title="Retirar cubierta">${icon("layers")}<span>Interior</span></button><button data-action="presentation" aria-label="Alternar proyección" title="Proyección ortográfica / perspectiva">${icon("camera")}</button><select id="l-quality" aria-label="Calidad gráfica"><option value="high">Alta</option><option value="balanced" selected>Equilibrada</option><option value="light">Ligera</option></select></div><div class="l-frame-presets"><button class="active" data-frame="campus">01 <span>Campus</span></button><button data-frame="production">02 <span>Producción</span></button><button data-frame="dock">03 <span>Muelles</span></button><button data-frame="felipe">04 <span>Felipe</span></button></div><div class="l-map-controls"><button data-action="zoom-in" aria-label="Acercar">${icon("plus")}</button><button data-action="zoom-out" aria-label="Alejar">${icon("minus")}</button><span></span><button data-action="reset-camera" aria-label="Vista inicial">${icon("locate-fixed")}</button></div><div class="l-navigation-hint">${icon("navigation")} Arrastra para explorar <span>·</span> Selecciona para descubrir</div><div id="l-loader"><span class="l-loader-logo">a<span>•</span></span><b>Encendiendo Luma Works…</b><div><span id="l-load-progress"></span></div><small>Modelos locales · luz · materiales</small></div><aside id="l-inspector" hidden></aside><div id="l-data-view" hidden></div><div id="l-tour-banner" hidden>Un paseo por Luma Works <span>50 s</span><button data-action="stop-tour">Saltar recorrido ${icon("x")}</button></div></div><div class="l-timeline"><div class="l-clock"><span>${icon("clock")}</span><div><small>RELOJ SIMULADO · MADRID</small><b id="l-time">10:15</b><em id="l-date">Día operativo 12</em></div></div><div class="l-play-controls"><button data-action="reset" aria-label="Reiniciar demostración">${icon("rotate-ccw")}</button><button data-action="play" id="l-play" aria-label="Iniciar simulación">${icon("play")}</button><select id="l-speed" aria-label="Velocidad de simulación"><option value="1">×1 · tiempo real</option><option value="60" selected>×60 · 1 min / s</option><option value="240">×240 · 4 min / s</option></select><button class="l-next-event" data-action="next">Siguiente evento ${icon("skip-forward")}</button></div><div class="l-scenario"><span>ESCENARIO</span><select id="l-scenario" aria-label="Escenario de simulación"><option value="base">Un día de trabajo</option><option value="loading">Carga en muelle</option><option value="delivery">Entrega de LW-024</option><option value="return">Felipe vuelve vacío</option><option value="lost-data">Llegada sin confirmar</option><option value="blocked">Prueba bloqueada</option><option value="shortage">Stock insuficiente</option><option value="day12">Cierre del día 12</option><option value="month">Cierre mensual</option></select></div></div></section><section class="l-bottom-strip"><div class="l-live-story"><span class="l-live-icon">${icon("activity")}</span><div><span class="l-eyebrow">LA HISTORIA DETRÁS DEL MOVIMIENTO</span><p id="l-story">Felipe está cargando el pedido LW-024. Cada palé lleva 10 lámparas.</p></div><button data-select="LW-01" aria-label="Explorar Felipe">${icon("arrow-up-right")}</button></div><div id="l-kpis" class="l-kpis"></div></section><footer class="l-footer"><span>Menos tablas. Más perspectiva.</span><span>Modelos originales · Datos ficticios · Sin conexión a CRM real</span><span>Luma Works <b>✳</b></span></footer></main></div><div id="l-modal-root"></div><div id="l-toast" role="status"></div>`;
function refreshIcons() {
  createIcons({ icons });
}
refreshIcons();
const simClock = new FixedStepClock({
  onAdvance: (ms) => {
    advance(state, state.now + ms);
    uiDirty = true;
  },
});
simClock.speed = speed;
function toast(text) {
  const el = document.querySelector("#l-toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(window.lToast);
  window.lToast = setTimeout(() => el.classList.remove("show"), 3500);
}
function setPlaying(value) {
  playing = value;
  simClock.playing = value;
  simClock.reset();
  if (scene) scene.playing = value;
  document.querySelector("#l-play").innerHTML = icon(value ? "pause" : "play");
  document
    .querySelector("#l-play")
    .setAttribute(
      "aria-label",
      value ? "Pausar simulación" : "Iniciar simulación",
    );
  refreshIcons();
}
function renderUI() {
  const f = finances(state);
  document.querySelector("#l-time").textContent = fmt(state.now);
  document.querySelector("#l-date").textContent =
    `${date(state.now)} · ${state.completedDays} días cerrados`;
  document.querySelector("#l-kpis").innerHTML =
    `<button data-action="economics"><small>VENTAS ENTREGADAS</small><b>${financeVisible ? eur(f.sales) : "Restringido"} <span>/ 100.000 €</span></b><div class="l-mini-progress"><span style="width:${financeVisible ? Math.min(100, f.sales / 1000) : 0}%"></span></div></button><button data-select="inventory"><small>EN ALMACÉN</small><b>${state.inventory.finished}<span> lámparas</span></b><em>${state.inventory.transit} en tránsito · ${state.produced} fabricadas</em></button><button data-action="economics"><small>RESULTADO OPERATIVO</small><b>${financeVisible ? eur(f.result) : "Restringido"}</b><em>Simplificado · sin impuestos ni intereses</em></button>`;
  const v = state.vehicles[0],
    vs = vehicleState(state, v);
  document.querySelector("#l-story").textContent =
    vs.phase === "dock"
      ? `Felipe prepara ${state.shipments[v.shipmentId]?.orderId || "su expedición"}: ${v.cargo / 10} de 5 palés a bordo. Cada palé lleva 10 lámparas.`
      : vs.phase === "outbound"
        ? "Felipe está entregando LW-024. 50 lámparas conectan el taller con su cliente."
        : vs.status === "pending_arrival"
          ? "La ETA ha vencido. La posición sigue siendo estimada y la llegada no está confirmada."
          : vs.phase === "return"
            ? "Entrega registrada. Felipe vuelve vacío; el retorno también tiene un coste."
            : "La operación continúa: fabricar, comprobar, embalar y entregar.";
  renderInspector();
  renderData();
  refreshIcons();
  uiDirty = false;
}
function entity(id) {
  if (["LW-01", "LW-02"].includes(id))
    return state.vehicles.find((v) => v.id === id);
  if (id?.startsWith("LW-")) return state.orders.find((o) => o.id === id);
  return {
    id,
    name:
      {
        production: "Taller Luma Works",
        warehouse: "Almacén y expediciones",
        inventory: "Luma 01 · Lámpara de escritorio",
        assembly: "Montaje de componentes",
        quality: "Comprobación LED",
        packing: "Embalaje y etiquetado",
        office: "Oficina integrada",
        forklift: "Carretilla de carga",
        "customer-01": "Cliente regional",
      }[id] || id,
  };
}
const row = (name, value) =>
  `<div class="l-detail-row"><span>${name}</span><b>${esc(value)}</b></div>`;
function renderInspector() {
  const el = document.querySelector("#l-inspector");
  if (!selection) {
    el.hidden = true;
    return;
  }
  const e = entity(selection);
  if (!e) {
    selection = null;
    el.hidden = true;
    return;
  }
  el.hidden = false;
  let body = "",
    title = e.driver || e.name || selection,
    tag = "RECURSO OPERATIVO";
  if (e.type === "vehicle") {
    const vs = vehicleState(state, e),
      sh = state.shipments[e.shipmentId],
      cost = sh?.routeCost || 0;
    tag = e.id + " · " + e.plate;
    body = `<div class="l-status-pill ${vs.status === "pending_arrival" ? "warning" : ""}"><span></span>${LABELS[vs.status] || vs.status}</div><div class="l-source-note">${icon(vs.positionType === "estimated" ? "clock" : "check")}<div><b>${vs.positionType === "estimated" ? "Ruta esquemática · posición estimada" : "Ubicación de instalación simulada"}</b><span>${vs.status === "pending_arrival" ? "No se ha recibido confirmación de llegada." : "Datos simulados · no es seguimiento GPS"}</span></div></div>${sh ? `<div class="l-detail-route"><span><small>ORIGEN</small><b>${vs.phase === "return" ? sh.client : "Luma Works · Almacén"}</b></span><span><small>DESTINO</small><b>${vs.phase === "return" ? "Luma Works · Base" : sh.client}</b></span></div>${row("Pedido", sh.orderId)}${row("Carga / capacidad", `${e.cargo / 10} / ${e.capacity} palés · ${e.cargo} lámparas`)}${row("Salida", fmt(vs.phase === "return" ? sh.returnStart : sh.departure))}${row("ETA", fmt(vs.phase === "return" ? sh.eta : sh.delivery))}${row("Tiempo transcurrido", Math.max(0, Math.floor((Math.min(state.now, sh.arrivalAt || state.now) - (vs.phase === "return" ? sh.returnStart : sh.departure)) / 60000)) + " min")}${vs.positionType === "estimated" ? `<div class="l-progress"><span style="width:${vs.progress * 100}%"></span></div>` : ""}${row("Coste de ruta devengado", financeVisible ? eur(cost) : "Restringido")}${row("Coste total previsto", financeVisible ? "100 € · 180 km ida y vuelta" : "Restringido")}${row("Incidencia", vs.status === "pending_arrival" ? "Llegada pendiente de confirmar" : "Sin incidencia registrada")}<button class="l-related" data-select="${sh.orderId}">${icon("package")} ${sh.orderId} · 50 lámparas ${icon("arrow-up-right")}</button>` : ""}<button class="l-primary" data-action="follow">${icon("locate-fixed")} ${scene?.follow ? "Dejar de seguir" : "Seguir vehículo"}</button>`;
  } else if (e.type === "order") {
    tag = "PEDIDO · CRM SIMULADO";
    const sh = state.shipments[e.shipmentId];
    body = `<div class="l-status-pill"><span></span>${LABELS[e.status]}</div><div class="l-detail-value">${financeVisible ? eur(e.amount) : "Importe restringido"}</div>${row("Unidades", "50 lámparas · 10 cajas · 5 palés")}${row("Producto", "Luma 01 · LED escritorio")}${financeVisible ? row("Precio de demo", "50 € / unidad, sin IVA") : ""}${financeVisible ? row("Margen de producto", "1.300 €") + row("Contribución prevista", "1.200 € antes de costes fijos") : ""}${row("Factura", e.invoiceStatus === "issued" ? "Emitida en entrega" : "Pendiente de entrega")}${row("Cobro", "Pendiente · no se crea un cobro al entregar")}${sh ? row("Expedición", sh.id) + `<button class="l-related" data-select="${sh.vehicleId}">${icon("truck")} ${state.vehicles.find((v) => v.id === sh.vehicleId).driver} ${icon("arrow-up-right")}</button>` : ""}`;
  } else if (selection === "inventory") {
    tag = "PRODUCTO · ERP SIMULADO";
    body = `<div class="l-product-swatch">${icon("sun")} <div>Luma 01<small>Ensamblada aquí. Entregada con cuidado.</small></div></div>${row("Componentes disponibles", state.inventory.raw + " kits")}${row("Producto en curso", state.inventory.wip + " uds.")}${row("Terminado", state.inventory.finished + " uds.")}${row("En tránsito", state.inventory.transit + " uds.")}${row("Entregado", state.inventory.delivered + " uds.")}${financeVisible ? row("Valor unitario", "24 € de coste variable") : ""}<div class="l-note">Un palé visible representa 10 lámparas, en 2 cajas de 5. Se muestran hasta 24 proxies de almacén; no son una lectura de ubicaciones físicas reales.</div>`;
  } else if (
    ["production", "assembly", "quality", "packing"].includes(selection)
  ) {
    tag = "PRODUCCIÓN · ERP SIMULADO";
    body = `<div class="l-status-pill ${state.production.blocked ? "warning" : ""}"><span></span>${state.production.blocked ? "Prueba bloqueada" : "Turno de montaje"}</div>${row("Producto", "Luma 01 · Lámpara de escritorio")}${row("Proceso", "Montaje → Prueba LED → Embalaje")}${row("Fabricado acumulado", state.produced + " unidades")}${row("En curso", state.inventory.wip + " unidades")}${row("Plan / capacidad", "100 / 120 unidades al día")}${row("Turno", "20 días operativos · 8 h / día")}<div class="l-note">Cada lote corresponde a 10 lámparas. La lámpara del banco y la del embalaje son el mismo modelo. Los proxies se mueven por eventos del reloj compartido.</div><button class="l-primary" data-frame="production">${icon("layers")} Explorar sin cubierta</button>`;
  } else if (selection === "warehouse" || selection === "forklift") {
    tag = "LOGÍSTICA INTERNA";
    body = `${row("Stock terminado", state.inventory.finished + " unidades")}${row("Carga en tránsito", state.inventory.transit + " unidades")}${row("Vehículos", "2 rígidos · 8 palés de capacidad nominal")}${row("Expedición tipo", "5 palés = 50 lámparas")}<div class="l-note">La transferencia de cada palé cambia el inventario una sola vez. La animación de la carretilla es una representación de ese traslado, no otra transacción.</div><button class="l-primary" data-frame="dock">${icon("eye")} Ver muelle de carga</button>`;
  } else
    body = `<p class="l-detail-description">${selection === "office" ? "Una oficina integrada para coordinar el taller, los pedidos y las entregas. No se crea un edificio por departamento." : "Destino regional representado de forma esquemática, no un mapa geográfico."}</p><button class="l-primary" data-action="economics">${icon("chart-no-axes-combined")} Ver el modelo económico</button>`;
  el.innerHTML = `<div class="l-inspector-head"><span>UNA MIRADA DE CERCA</span><button data-action="close-inspector" aria-label="Cerrar ficha">${icon("x")}</button></div><div class="l-inspector-scroll"><span class="l-eyebrow">${esc(tag)}</span><h2>${esc(title)}</h2>${body}<div class="l-provenance"><span>${icon("database")} Datos simulados · Luma Works</span><small>Última actualización: ${fmt(e.updatedAt || state.now)} · hace ${Math.max(0, Math.floor((state.now - (e.updatedAt || state.now)) / 60000))} min · sin feed GPS</small><small>Sin registro remoto enlazado en la demo</small></div></div>`;
}
function shownOrders() {
  return state.orders.filter(
    (o) =>
      (!filters.query ||
        `${o.id} ${o.driver}`
          .toLowerCase()
          .includes(filters.query.toLowerCase())) &&
      (!filters.driver || o.driver === filters.driver) &&
      (!filters.status || o.status === filters.status) &&
      (!filters.incident ||
        state.incidents.some((i) => i.entityId === o.shipmentId)),
  );
}
function renderData() {
  const el = document.querySelector("#l-data-view");
  if (view === "city") return;
  const orders = shownOrders();
  if (view === "pipeline") {
    const groups = [
      ["waiting", "Pendiente"],
      ["loading", "Carga"],
      ["outbound", "En reparto"],
      ["delivered", "Entregado"],
    ];
    el.innerHTML = `<div class="l-data-heading"><h2>Un pedido. Muchas conexiones.</h2><p>Los mismos eventos que ves en el campus.</p></div><div class="l-kanban">${groups
      .map(
        ([stage, label]) =>
          `<section><h3>${label}<span>${orders.filter((o) => (stage === "loading" ? ["reserved", "loading", "ready"].includes(o.status) : o.status === stage)).length}</span></h3>${orders
            .filter((o) =>
              stage === "loading"
                ? ["reserved", "loading", "ready"].includes(o.status)
                : o.status === stage,
            )
            .map(
              (o) =>
                `<button data-select="${o.id}" class="${selection === o.id ? "selected" : ""}"><small>${o.customerId === "customer-01" ? "Forma Retail" : "Habitat Store"}</small><b>${o.id}</b><strong>${financeVisible ? eur(o.amount) : "Restringido"}</strong><span>50 lámparas ${icon("arrow-up-right")}</span></button>`,
            )
            .join("")}</section>`,
      )
      .join("")}</div>`;
  } else {
    const vehicles = state.vehicles.filter(
      (v) =>
        (!filters.query ||
          `${v.id} ${v.driver}`
            .toLowerCase()
            .includes(filters.query.toLowerCase())) &&
        (!filters.incident ||
          vehicleState(state, v).status === "pending_arrival") &&
        (!filters.driver || v.driver === filters.driver) &&
        (!filters.status || vehicleState(state, v).status === filters.status),
    );
    el.innerHTML = `<div class="l-data-heading"><h2>La empresa, entidad a entidad.</h2><p>Selección compartida con la escena 3D.</p></div><div class="l-list-scroll"><table><thead><tr><th>Recurso</th><th>Estado</th><th>Detalle</th><th>Fuente</th></tr></thead><tbody>${vehicles.map((v) => `<tr><td><button data-select="${v.id}"><b>${v.driver}</b><small>${v.id}</small></button></td><td>${LABELS[vehicleState(state, v).status]}</td><td>${v.cargo / 10} palés · capacidad 8</td><td>Simulador · TMS ficticio</td></tr>`).join("")}${!filters.incident ? orders.map((o) => `<tr><td><button data-select="${o.id}"><b>${o.id}</b><small>50 lámparas</small></button></td><td>${LABELS[o.status]}</td><td>${financeVisible ? eur(o.amount) : "Importe restringido"}</td><td>CRM simulado</td></tr>`).join("") : ""}</tbody></table></div>`;
  }
}
function select(id) {
  selection = id;
  scene?.setSelection(id);
  renderUI();
  document.querySelector(".l-world").classList.add("inspecting");
}
function setView(v) {
  view = v;
  document.querySelector("#l-data-view").hidden = v === "city";
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  renderData();
  refreshIcons();
}
function changeScenario(value) {
  setPlaying(false);
  scene && (scene.follow = false);
  scenario = ["lost-data", "blocked", "shortage"].includes(value)
    ? value
    : "base";
  const times = {
    base: DEFAULT_TIME,
    loading: clock(12, 10, 13),
    delivery: clock(12, 12, 40),
    return: clock(12, 12, 45),
    "lost-data": clock(12, 15, 46),
    blocked: clock(12, 10, 15),
    shortage: clock(1, 8, 40),
    day12: clock(12, 17),
    month: clock(20, 17),
  };
  state = replay(times[value] || DEFAULT_TIME, scenario);
  if (["delivery", "return", "lost-data"].includes(value)) select("LW-01");
  if (value === "loading") scene?.presetView("dock");
  scene?.update(state);
  renderUI();
}
function modal(title, subtitle, content) {
  document.querySelector("#l-modal-root").innerHTML =
    `<div class="l-modal-backdrop"><section class="l-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><button data-action="close-modal" class="l-modal-close" aria-label="Cerrar">${icon("x")}</button><span class="l-eyebrow">ATLAS / LUMA WORKS</span><h2>${title}</h2><p>${subtitle}</p>${content}</section></div>`;
  refreshIcons();
  document.querySelector(".l-modal-close").focus();
}
function economicModal() {
  const f = finances(state);
  modal(
    "La luz también tiene números.",
    "Supuestos ficticios · sin IVA · cifras derivadas de eventos.",
    financeVisible
      ? `<div class="l-econ-grid"><div><small>VENTAS ENTREGADAS</small><b>${eur(f.sales)}</b><span>Objetivo mensual: 100.000 €</span></div><div><small>RESULTADO OPERATIVO</small><b>${eur(f.result)}</b><span>Simplificado; no es beneficio neto</span></div></div><div class="l-econ-rows">${row("Ventas reconocidas al entregar", eur(f.sales))}${row("Coste variable de producto", eur(f.productCost))}${row("Distribución devengada", eur(f.distribution))}${row("Margen de contribución", eur(f.contribution))}${row("Costes fijos devengados", eur(f.fixed))}${row("Días operativos cerrados", `${state.completedDays} / 20`)}${row("Comprometido pendiente de entregar", eur(f.committed))}${row("Extrapolación lineal simple", f.forecast == null ? "No disponible antes del primer cierre" : eur(f.forecast))}</div><details><summary>Ver los supuestos del mes objetivo</summary><p>2.000 lámparas × 50 € = 100.000 €. Producto: componentes 18 € + embalaje 2 € + energía/consumibles 4 € = 24 €/unidad. 40 expediciones × 100 € = 4.000 €. Fijos: personal, incluidos conductores, 22.000 €; instalaciones 5.000 €; administración/software 2.000 €; vehículos/seguros 1.000 €. Resultado simplificado: 18.000 € (18%). No incluye impuestos, intereses ni contabilidad completa.</p><p>180 km × 0,40 €/km + 28 € = 100 € por ruta. Los kilómetros se devengan una vez por eventos simulados, incluida la vuelta vacía. El fijo se registra una vez en la salida. Fijos mensuales: 30.000 / 20 = 1.500 € por día cerrado.</p><p>Inventario inicial: 200 lámparas a 24 €. Las compras no vuelven a reconocerse como coste de venta. El coste de producto se reconoce al entregar. No se muestra saldo de caja: no se han modelado pagos ni saldo inicial.</p></details><div class="l-note">La extrapolación ventas/días cerrados × 20 no es una predicción; durante un día abierto incluye ventas parciales. Cobros pendientes: la entrega no genera cobro.</div><button class="l-text-button" data-action="permissions">Ocultar información financiera en todas las vistas</button>`
      : `<div class="l-note">Información financiera restringida en la demo. La autorización real debe ejecutarse en un backend.</div><button class="l-primary" data-action="permissions">Restaurar acceso financiero de demostración</button>`,
  );
}
function sources() {
  modal(
    "Datos → operaciones → ciudad.",
    "La escena explica un modelo de negocio; no inventa un CRM conectado.",
    `<div class="l-sources-grid"><div><b>CRM simulado</b><span>Pedidos, clientes y factura pendiente</span></div><div><b>ERP simulado</b><span>Componentes, lotes, producción y stock</span></div><div><b>TMS simulado</b><span>Asignación, carga, entregas y retorno</span></div></div><p class="l-modal-body">No hay OAuth ni sincronización real. El adaptador HubSpot y su correspondencia de campos permanecen en la experiencia operativa anterior. El reloj de Luma usa un guion determinista con semilla 42. Una ETA no confirma una llegada; no se simula un feed GPS en este escenario.</p><a class="l-related" href="?experience=operations">Abrir fuentes y configuración del Atlas anterior ${icon("arrow-up-right")}</a><div class="l-note">Permisos financieros: proyección de interfaz de demostración, no frontera de seguridad del servidor. Todos los recursos gráficos son modelos originales disponibles en el proyecto.</div>`,
  );
}
function stopTour() {
  tourStart = null;
  document.querySelector("#l-tour-banner").hidden = true;
}
app.addEventListener("click", (e) => {
  const item = e.target.closest("[data-select]");
  if (item) {
    select(item.dataset.select);
    return;
  }
  const vw = e.target.closest("[data-view]");
  if (vw) {
    setView(vw.dataset.view);
    return;
  }
  const frame = e.target.closest("[data-frame]");
  if (frame) {
    setView("city");
    scene?.presetView(frame.dataset.frame);
    document
      .querySelectorAll("[data-frame]")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.frame === frame.dataset.frame),
      );
    if (frame.dataset.frame === "felipe") select("LW-01");
    return;
  }
  const button = e.target.closest("[data-action]");
  if (!button) return;
  switch (button.dataset.action) {
    case "play":
      setPlaying(!playing);
      break;
    case "reset":
      changeScenario("base");
      document.querySelector("#l-scenario").value = "base";
      break;
    case "next": {
      setPlaying(false);
      const e = nextEvent(state);
      if (e) {
        advance(state, e.timestamp);
        scene?.update(state);
        renderUI();
        toast(
          `${fmt(e.timestamp)} · ${e.kind === "delivery" ? "Entrega confirmada" : e.kind === "return" ? "Orden de retorno" : e.kind === "arrival" ? "Llegada confirmada" : e.kind === "departure" ? "Expedición en ruta" : "Cierre operativo"}`,
        );
      }
      break;
    }
    case "roof":
      scene?.setRoof(!scene.roofOff);
      button.classList.toggle("active", scene?.roofOff);
      break;
    case "presentation":
      scene?.setProjection(
        scene.cameraMode === "ortho" ? "perspective" : "ortho",
      );
      button.classList.toggle("active", scene?.cameraMode === "perspective");
      break;
    case "reset-camera":
      stopTour();
      scene?.presetView("campus");
      break;
    case "zoom-in":
    case "zoom-out":
      if (scene) {
        if (scene.camera.isOrthographicCamera)
          scene.camera.zoom *=
            button.dataset.action === "zoom-in" ? 1.2 : 1 / 1.2;
        else
          scene.camera.position
            .sub(scene.controls.target)
            .multiplyScalar(button.dataset.action === "zoom-in" ? 0.85 : 1.15)
            .add(scene.controls.target);
        scene.camera.updateProjectionMatrix();
        scene.invalidate();
      }
      break;
    case "follow":
      if (scene) {
        const old = scene.follow;
        scene.presetView("felipe");
        scene.follow = !old;
        select("LW-01");
      }
      break;
    case "close-inspector":
      selection = null;
      scene?.setSelection(null);
      document.querySelector("#l-inspector").hidden = true;
      document.querySelector(".l-world").classList.remove("inspecting");
      break;
    case "filters":
      document.querySelector(".l-filterbar").hidden =
        !document.querySelector(".l-filterbar").hidden;
      break;
    case "clear":
      filters = { query: "", incident: false };
      document.querySelector("#l-search").value = "";
      document.querySelector("#l-incidents").checked = false;
      document.querySelector("#l-driver").value = "";
      document.querySelector("#l-status").value = "";
      scene?.setFilters(filters);
      renderUI();
      break;
    case "economics":
      economicModal();
      break;
    case "sources":
      sources();
      break;
    case "permissions":
      financeVisible = !financeVisible;
      renderUI();
      economicModal();
      break;
    case "fullscreen":
      document.querySelector(".l-stage").classList.toggle("expanded");
      scene?.resize();
      break;
    case "tour":
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        toast(
          "Recorrido automático desactivado por tu preferencia de movimiento reducido. Usa los cuatro encuadres.",
        );
        break;
      }
      setView("city");
      tourStart = performance.now();
      tourView = -1;
      document.querySelector("#l-tour-banner").hidden = false;
      break;
    case "stop-tour":
      stopTour();
      break;
    case "help":
      modal(
        "Un taller que puedes explorar.",
        "Cuatro encuadres. Un único estado operativo.",
        `<div class="l-help"><p><b>01 · Campus</b>Órbita, desplaza y amplía la maqueta. Usa el modo perspectiva para inspección cercana.</p><p><b>02 · Producción</b>Retira la cubierta. Una misma lámpara pasa por montaje, comprobación y embalaje.</p><p><b>03 · Muelles</b>Cada transferencia de un palé lleva 10 lámparas del stock al camión. El movimiento no duplica el evento.</p><p><b>04 · Felipe</b>LW-024: 50 lámparas, 2.500 €, 5 palés. A ×240, tres horas simuladas de retorno duran 45 segundos reales, si el navegador mantiene el ritmo de render.</p></div>`,
      );
      break;
  }
});
document.querySelector("#l-modal-root").onclick = (e) => {
  e.stopPropagation();
  if (
    e.target.closest('[data-action="close-modal"]') ||
    e.target.classList.contains("l-modal-backdrop")
  )
    document.querySelector("#l-modal-root").innerHTML = "";
  if (e.target.closest('[data-action="permissions"]')) {
    financeVisible = !financeVisible;
    renderUI();
    economicModal();
  }
};
for (const [id, key] of [
  ["l-driver", "driver"],
  ["l-status", "status"],
])
  document.querySelector("#" + id).onchange = (e) => {
    filters[key] = e.target.value;
    scene?.setFilters(filters);
    renderData();
    refreshIcons();
  };
document.querySelector("#l-search").oninput = (e) => {
  filters.query = e.target.value;
  scene?.setFilters(filters);
  renderData();
  refreshIcons();
};
document.querySelector("#l-search").onkeydown = (e) => {
  if (e.key === "Enter") {
    const v = state.vehicles.find((v) =>
      `${v.id} ${v.driver}`.toLowerCase().includes(filters.query.toLowerCase()),
    );
    select(v?.id || shownOrders()[0]?.id);
  }
};
document.querySelector("#l-incidents").onchange = (e) => {
  filters.incident = e.target.checked;
  scene?.setFilters(filters);
  renderData();
  refreshIcons();
};
document.querySelector("#l-speed").onchange = (e) => {
  speed = Number(e.target.value);
  simClock.speed = speed;
};
document.querySelector("#l-scenario").onchange = (e) =>
  changeScenario(e.target.value);
document.querySelector("#l-quality").onchange = (e) => {
  scene?.configure(e.target.value);
  toast(
    `Calidad ${e.target.selectedOptions[0].textContent}: resolución y sombras ajustadas.`,
  );
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && document.querySelector(".l-modal")) {
    const list = [
      ...document.querySelectorAll(
        ".l-modal button,.l-modal a,.l-modal summary",
      ),
    ].filter((el) => !el.disabled);
    const first = list[0],
      last = list.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  if (e.key === "Escape") {
    stopTour();
    document.querySelector("#l-modal-root").innerHTML = "";
    document.querySelector(".l-stage").classList.remove("expanded");
  }
  if (
    e.key === "/" &&
    !["INPUT", "SELECT"].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    document.querySelector(".l-filterbar").hidden = false;
    document.querySelector("#l-search").focus();
  }
});
renderUI();
try {
  scene = await LumaScene.create(document.querySelector("#l-canvas"), {
    onSelect: select,
    onManual: () => {
      stopTour();
      if (selection) renderInspector();
      refreshIcons();
    },
    onProgress: (p) =>
      (document.querySelector("#l-load-progress").style.width = p * 100 + "%"),
  });
  scene.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  scene.update(state);
  scene.onFrame = (dt) => {
    simClock.tick(dt);
    scene.visualTime =
      state.now + (playing ? simClock.accumulator * speed * 1000 : 0);
    scene.state = state;
    if (playing) scene.update(state, scene.visualTime);
    const now = performance.now();
    if (uiDirty && now - lastUI > 600) {
      renderUI();
      lastUI = now;
    }
    if (tourStart) {
      const elapsed = now - tourStart,
        idx = Math.min(3, Math.floor(elapsed / 12500));
      if (idx !== tourView) {
        tourView = idx;
        scene.presetView(["campus", "production", "dock", "felipe"][idx]);
      }
      if (elapsed >= 50000) stopTour();
    }
  };
  document.querySelector("#l-loader").hidden = true;
  window.__luma = {
    scene,
    get state() {
      return state;
    },
    metrics: () => scene.info,
    loadMs: performance.now() - loadStart,
  };
} catch (error) {
  console.error(error);
  document.querySelector("#l-loader").hidden = true;
  toast("Vista 3D no disponible. Puedes consultar los datos en la lista.");
  setView("list");
  setInterval(() => {
    if (!document.hidden) {
      simClock.tick(0.1);
      if (playing) renderUI();
    }
  }, 100);
}
