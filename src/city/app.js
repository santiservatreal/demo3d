import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import {
  createIcons,
  Building2,
  LayoutGrid,
  Table2,
  Search,
  SlidersHorizontal,
  Layers,
  Plus,
  Minus,
  LocateFixed,
  ArrowUpRight,
  ArrowRight,
  X,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Trophy,
  Radio,
  Users,
  Activity,
  Phone,
  Mail,
  MessageCircle,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertCircle,
  Clock,
  Settings2,
  Info,
  MonitorPlay,
  Compass,
  ArrowLeft,
  Box,
  Sparkles,
  Filter,
  Menu,
  Maximize2,
} from "lucide";
import {
  createDemoProvider,
  metrics,
  filterDeals,
  needsAttention,
  demoReplayEvents,
  createReplayState,
  applyEvent,
  stageKind,
} from "./model.js";
import { createCityScene } from "./scene.js";
import "./style.css";

const icons = {
  Building2,
  LayoutGrid,
  Table2,
  Search,
  SlidersHorizontal,
  Layers,
  Plus,
  Minus,
  LocateFixed,
  ArrowUpRight,
  ArrowRight,
  X,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Trophy,
  Radio,
  Users,
  Activity,
  Phone,
  Mail,
  MessageCircle,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertCircle,
  Clock,
  Settings2,
  Info,
  MonitorPlay,
  Compass,
  ArrowLeft,
  Box,
  Sparkles,
  Filter,
  Menu,
  Maximize2,
};
const i = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const eur = (n) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(n)
    : "No disponible";
const compact = (n) =>
  n >= 1000
    ? `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(n / 1000)} mil €`
    : eur(n);
const date = (t) =>
  t && Number.isFinite(new Date(t).getTime())
    ? new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "short",
        timeZone: "Europe/Madrid",
      }).format(new Date(t))
    : "No disponible";
const time = (t) =>
  t && Number.isFinite(new Date(t).getTime())
    ? new Intl.DateTimeFormat("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Madrid",
      }).format(new Date(t))
    : "No disponible";
const provider = createDemoProvider();
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let scene = null,
  sceneReady = false,
  noWebGL = false,
  eventSequence = 0;
const ui = {
  view: "city",
  selectedId: null,
  filters: {
    query: "",
    stageId: "",
    ownerId: "",
    attentionOnly: false,
    includeLost: false,
  },
  layers: { labels: true, connections: true, activity: true, traffic: true },
  mode: "explore",
  sheet: "half",
  quality: "auto",
  replay: {
    playing: false,
    speed: 1,
    index: 0,
    events: [],
    saved: null,
    elapsed: 0,
  },
  drawer: null,
  tvIndex: 0,
};
const root = document.querySelector("#app");
root.innerHTML = `<div id="city-app" class="c-shell">
  <aside class="c-rail" aria-label="Navegación principal"><a href="./" class="c-logo" aria-label="Atlas inicio">a<span>•</span></a><button class="active" data-action="view-city" aria-label="Ciudad CRM" title="Ciudad CRM">${i("building-2")}</button><button data-action="view-table" aria-label="Tabla de oportunidades" title="Tabla">${i("table-2")}</button><button data-action="clients" aria-label="Clientes activos" title="Clientes">${i("users")}</button><button data-action="feed" aria-label="Feed de eventos" title="Eventos">${i("activity")}</button><span class="c-rail-line"></span><a href="?experience=luma" aria-label="Abrir la fábrica Luma" title="Luma Works · experiencia industrial">${i("box")}</a><div class="c-rail-bottom"><button data-action="sources" aria-label="Datos y conexión" title="Datos y conexión">${i("radio")}</button><button data-action="help" aria-label="Ayuda" title="Ayuda">${i("info")}</button><span class="c-avatar" aria-label="Usuario demo">SC</span></div></aside>
  <main class="c-main"><header class="c-header"><div class="c-wordmark">atlas<span>.</span><small>UNA NUEVA PERSPECTIVA</small></div><div class="c-workspace"><span class="c-workspace-icon">${i("building-2")}</span><div><b>Mi ciudad comercial</b><small>Workspace de demostración</small></div></div><div class="c-header-right"><button class="c-demo" data-action="sources"><span></span>Datos simulados</button><button class="c-header-help" data-action="help" aria-label="Cómo funciona">${i("info")}</button><span class="c-avatar">SC</span></div></header>
  <div class="c-heading"><div><div class="c-eyebrow">TU PIPELINE, EN PERSPECTIVA</div><h1>Cada oportunidad tiene su lugar<span>.</span></h1></div><p>Explora tu negocio. Descubre el siguiente paso.</p></div>
  <section id="city-metrics" class="c-metrics" aria-label="Indicadores del negocio"></section>
  <section class="c-workbench" aria-label="Ciudad CRM interactiva"><div class="c-toolbar"><div class="c-view-tabs" role="group" aria-label="Representación"><button class="active" data-action="view-city">${i("building-2")}<span>Ciudad</span></button><button data-action="view-table">${i("table-2")}<span>Tabla</span></button></div><div class="c-mode-tabs" role="group" aria-label="Modo de exploración"><button class="active" data-action="explore" title="Navegación libre">${i("compass")}<span>Explore</span></button><button data-action="replay" title="Reproducir el historial de eventos">${i("rotate-ccw")}<span>Replay</span></button><button data-action="tv" title="Presentación automática sin modificar datos">${i("monitor-play")}<span>TV</span></button></div><div class="c-toolbar-spacer"></div><button class="c-win-button" data-action="simulate-win">${i("sparkles")}<span>Simular una venta</span></button><button data-action="layers" class="c-icon-button" aria-label="Capas de la ciudad" aria-expanded="false">${i("layers")}</button></div>
  <div class="c-search-row"><label class="c-search">${i("search")}<input id="city-search" type="search" placeholder="Buscar una oportunidad, empresa o responsable…" aria-label="Buscar oportunidades"></label><button class="c-filter-toggle" data-action="filters" aria-expanded="false">${i("sliders-horizontal")}<span>Filtros</span><span id="city-filter-count" hidden></span></button><span class="c-search-caption" id="city-result-count"></span></div>
  <div class="c-filter-row" id="city-filters" hidden><label>Etapa<select id="filter-stage" aria-label="Filtrar etapa"></select></label><label>Responsable<select id="filter-owner" aria-label="Filtrar responsable"></select></label><label class="c-check"><input id="filter-attention" type="checkbox">Necesita atención</label><label class="c-check"><input id="filter-lost" type="checkbox">Incluir perdidas</label><button data-action="clear-filters">Limpiar filtros</button></div>
  <div id="city-world" class="c-world"><div id="city-canvas"></div><div id="city-labels" aria-hidden="true"></div><div class="c-world-title"><span class="c-eyebrow">ATLAS DISTRICT / 01</span><h2>Un negocio.<br><span>Muchas posibilidades.</span></h2><p>De la primera conversación a la próxima gran relación.</p></div><div class="c-north" aria-hidden="true"><span>N</span><div>↗</div></div>
  <div id="city-loader" role="status"><span class="c-loader-mark">a<span>•</span></span><b>Tu ciudad está tomando forma</b><small>Arquitectura · relaciones · oportunidades</small><div class="c-load-line"></div></div>
  <div id="city-fallback" class="c-fallback" hidden>${i("table-2")}<div><b>Seguimos en la vista de tabla</b><p>El navegador no ha podido iniciar el 3D. Puedes consultar y simular los mismos registros aquí.</p></div></div>
  <div class="c-map-controls"><button data-action="zoom-in" aria-label="Acercar">${i("plus")}</button><button data-action="zoom-out" aria-label="Alejar">${i("minus")}</button><span></span><button data-action="overview" aria-label="Vista general" title="Vista general">${i("locate-fixed")}</button></div>
  <div id="city-legend" class="c-legend"><span class="c-height-icon"><b></b><b></b><b></b></span><div><b>Altura = importe</b><small>0–28 mil € · Alturas mayores acotadas</small></div><span class="c-legend-alert">!<span>Tarea vencida</span></span></div>
  <div id="city-stage-cards" class="c-stage-cards" aria-label="Barrios y totales por etapa"></div>
  <div class="c-gesture-hint">${i("compass")}<span>Arrastra para explorar · Pulsa un edificio para descubrir</span></div>
  <div id="city-table" class="c-table-view" hidden></div><aside id="city-inspector" class="c-inspector" aria-label="Ficha del registro" hidden></aside><aside id="city-drawer" class="c-drawer" hidden></aside>
  <div id="city-layer-panel" class="c-layer-panel" hidden><div><b>Capas de la ciudad</b><button data-action="layers" aria-label="Cerrar capas">${i("x")}</button></div>${[
    ["labels", "Etiquetas", "Nombres y barrios"],
    ["connections", "Conexiones", "Relaciones y transiciones"],
    ["activity", "Actividad", "Tareas y próximos pasos"],
    [
      "traffic",
      "Tráfico ambiental",
      "Decorativo · se oculta en calidad Ligera",
    ],
  ]
    .map(
      ([id, name, desc]) =>
        `<label><span><b>${name}</b><small>${desc}</small></span><input type="checkbox" data-layer="${id}" checked></label>`,
    )
    .join(
      "",
    )}<label class="c-quality-label"><span><b>Calidad gráfica</b><small>Auto se adapta con histéresis</small></span><select id="city-quality" aria-label="Calidad gráfica"><option value="auto">Auto</option><option value="high">Alta</option><option value="balanced">Equilibrada</option><option value="light">Ligera · sin tráfico</option></select></label><p>Geometría 3D real · Three.js / WebGL2</p></div>
  <div id="city-hover" class="c-hover" hidden></div><div id="city-tv-banner" class="c-presentation-banner" hidden>${i("monitor-play")}<span>TV · Una vuelta por tu negocio</span><button data-action="explore">Salir ${i("x")}</button></div>
  </div><div id="city-replay" class="c-replay" hidden><button data-action="replay-play" aria-label="Reproducir historial">${i("play")}</button><div><b>Historial de etapas</b><small id="city-replay-date">Eventos del mes</small></div><input id="city-replay-progress" aria-label="Posición del historial" type="range" min="0" max="100" value="0"><select id="city-replay-speed" aria-label="Velocidad de reproducción"><option value="1">×1</option><option value="2">×2</option><option value="4">×4</option></select><button data-action="replay-next" aria-label="Siguiente evento">${i("skip-forward")}</button><button data-action="explore" aria-label="Salir de Replay">${i("x")}</button></div>
  <footer class="c-bottom-bar"><button data-action="today" class="c-today">${i("activity")}<span>Hoy en tu ciudad</span></button><div id="city-today"></div><button data-action="feed" class="c-latest-event"><span class="c-live-dot"></span><span id="city-latest-event">Tu pipeline está listo para explorar</span>${i("arrow-up-right")}</button></footer></section>
  <footer class="c-footer"><span>Menos tablas. Más perspectiva.</span><span>Datos ficticios · Tráfico ambiental · Ningún cobro se genera al ganar</span><button data-action="sources">Cómo se conectará a tu CRM ${i("arrow-up-right")}</button></footer></main>
  </div><div id="city-modal-root"></div><div id="city-toast" role="status" aria-live="polite"></div>`;
const $ = (s) => document.querySelector(s);
const refreshIcons = () => createIcons({ icons });
function getState() {
  return provider.getState();
}
function ownerName(id) {
  return getState().owners.find((o) => o.id === id)?.name || "No disponible";
}
function stageFor(id) {
  return (
    getState().stages.find((s) => s.id === id) || {
      name: id === "lost" ? "Perdida" : "No disponible",
      color: "#879394",
    }
  );
}
function eventText(event) {
  const d = getState().deals.find((x) => x.id === event.entityId);
  if (event.type === "deal.won")
    return `${d?.name || "Oportunidad"} · operación ganada`;
  if (event.type === "deal.lost")
    return `${d?.name || "Oportunidad"} · operación perdida`;
  if (event.type === "deal.stage_changed")
    return `${d?.name || "Oportunidad"} → ${stageFor(event.payload?.stageId).name}`;
  return (
    event.description ||
    event.payload?.description ||
    `${d?.name || event.entityId || "CRM"} · ${event.type}`
  );
}
function toast(message) {
  $("#city-toast").textContent = message;
  $("#city-toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(
    () => $("#city-toast").classList.remove("show"),
    4200,
  );
}
function safeCrmLink(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}
function renderMetrics() {
  const m = metrics(getState());
  $("#city-metrics").innerHTML = [
    [
      "Pipeline abierto",
      eur(m.openAmount),
      `${m.openCount} oportunidades en movimiento`,
      "building-2",
      "open",
      m.openAmount,
    ],
    [
      "Ganadas este mes",
      eur(m.wonAmount),
      `${m.wonCount} operaciones · ${new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" }).format(new Date(getState().now))}`,
      "trophy",
      "won",
      m.wonAmount,
    ],
    [
      "Tasa de éxito",
      m.winRate == null
        ? "No disponible"
        : `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(m.winRate * 100)} %`,
      m.winRateHistoryComplete
        ? `${m.wonCount} ganadas / ${m.wonCount + m.lostCount} cierres del mes`
        : "No disponible: falta historial de cierres",
      "activity",
      "win-rate",
      m.winRate,
    ],
    [
      "Necesitan atención",
      String(m.attentionCount),
      `${m.overdueTasks} tareas vencidas · revisa el siguiente paso`,
      "alert-circle",
      "attention",
      m.attentionCount,
    ],
  ]
    .map(
      ([label, value, detail, ico, key, num]) =>
        `<button class="c-metric ${key === "attention" ? "c-metric-attention" : ""}" data-action="${key === "attention" ? "attention" : "metric-info"}" data-key="${key}"><div><span>${label}</span>${i(ico)}</div><b data-metric="${key}" data-value="${num ?? ""}">${value}</b><small>${detail}</small></button>`,
    )
    .join("");
  $("#city-today").innerHTML =
    `<button data-action="today">${i("phone")}<b>${m.callsToday}</b><span>llamadas</span></button><button data-action="today">${i("mail")}<b>${m.emailsToday ?? "—"}</b><span>correos</span></button><button data-action="today">${i("calendar")}<b>${m.meetingsToday ?? "—"}</b><span>reuniones</span></button><button data-action="today">${i("message-circle")}<b>${m.pendingConversations}</b><span>por responder</span></button>`;
  $("#city-stage-cards").style.setProperty(
    "--stage-count",
    m.stages.filter((x) => stageKind(getState(), x.id) !== "lost").length,
  );
  $("#city-stage-cards").innerHTML = m.stages
    .filter((x) => stageKind(getState(), x.id) !== "lost")
    .map(
      (s, idx) =>
        `<button data-stage="${esc(s.id)}" data-count="${s.count}" data-amount="${s.amount}" style="--stage:${s.color}" class="${ui.filters.stageId === s.id ? "active" : ""}"><div><span class="c-stage-number">0${idx + 1}</span><b>${esc(s.name)}</b><span class="c-stage-count">${s.count}</span></div><strong>${eur(s.amount)}</strong><span class="c-stage-line"></span></button>`,
    )
    .join("");
}
function syncFilterOptions() {
  const state = getState(),
    stages = [...state.stages].sort((a, b) => a.order - b.order),
    signature = JSON.stringify([stages, state.owners]);
  if ($("#filter-stage").dataset.signature === signature) return;
  $("#filter-stage").dataset.signature = signature;
  $("#filter-stage").innerHTML =
    '<option value="">Todas las etapas</option>' +
    stages
      .map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`)
      .join("") +
    (stages.some((s) => stageKind(state, s.id) === "lost")
      ? ""
      : '<option value="lost">Perdidas · archivo</option>');
  $("#filter-owner").innerHTML =
    '<option value="">Todos los responsables</option>' +
    state.owners
      .map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`)
      .join("");
}
function updateFilters() {
  syncFilterOptions();
  const f = ui.filters;
  const count = [
    f.query,
    f.stageId,
    f.ownerId,
    f.attentionOnly,
    f.includeLost,
  ].filter(Boolean).length;
  $("#city-filter-count").hidden = !count;
  $("#city-filter-count").textContent = count;
  const visible = filterDeals(getState(), f);
  $("#city-result-count").textContent =
    `${visible.length} oportunidades visibles`;
  $("#filter-stage").value = f.stageId;
  $("#filter-owner").value = f.ownerId;
  $("#filter-attention").checked = f.attentionOnly;
  $("#filter-lost").checked = f.includeLost;
  scene?.sync(getState(), {
    filteredIds: new Set(visible.map((d) => d.id)),
    selectedId: ui.selectedId,
    layers: ui.layers,
  });
  if (ui.view === "table") renderTable();
  document
    .querySelectorAll("#city-stage-cards [data-stage]")
    .forEach((el) =>
      el.classList.toggle("active", el.dataset.stage === f.stageId),
    );
}
function renderTable() {
  const deals = filterDeals(getState(), ui.filters),
    total = deals.every((d) => Number.isFinite(d.amount))
      ? deals.reduce((a, d) => a + d.amount, 0)
      : null;
  $("#city-table").innerHTML =
    `<div class="c-table-heading"><div><span class="c-eyebrow">LOS MISMOS DATOS. OTRA PERSPECTIVA.</span><h2>Tu pipeline, registro a registro</h2></div><span><b id="city-table-total" data-amount="${total}">${eur(total)}</b> en ${deals.length} registros</span></div><div class="c-table-scroll"><table><caption class="c-sr-only">Oportunidades filtradas. Total ${eur(total)}.</caption><thead><tr><th>Oportunidad</th><th>Etapa</th><th>Importe</th><th>Responsable</th><th>Cierre previsto</th><th>Atención</th></tr></thead><tbody>${deals.map((d) => `<tr data-select="${d.id}" data-deal-id="${d.id}" data-amount="${d.amount}" tabindex="0" class="${ui.selectedId === d.id ? "selected" : ""}"><td><button data-select="${d.id}"><b>${esc(d.name)}</b><small>${esc(getState().accounts.find((a) => a.id === d.accountId)?.name || "Sin cuenta relacionada")}</small></button></td><td><span class="c-stage-pill" style="--stage:${stageFor(d.stageId).color}">${esc(stageFor(d.stageId).name)}</span></td><td data-amount="${d.amount}">${eur(d.amount)}</td><td>${esc(ownerName(d.ownerId))}</td><td>${date(d.expectedCloseAt)}</td><td>${needsAttention(d, getState()) ? `<span class="c-attention-tag">${i("alert-circle")}Tarea vencida</span>` : getState().activities.some((a) => a.dealId === d.id) ? "Sin tareas vencidas" : "No disponible"}</td></tr>`).join("")}</tbody></table>${!deals.length ? '<div class="c-empty">No hay oportunidades con estos filtros.<button data-action="clear-filters">Limpiar filtros</button></div>' : ""}</div>`;
  refreshIcons();
}
function renderInspector() {
  const el = $("#city-inspector"),
    state = getState(),
    d = state.deals.find((d) => d.id === ui.selectedId),
    a = state.accounts.find((a) => a.id === ui.selectedId);
  if (!d && !a) {
    el.hidden = true;
    root.classList.remove("c-has-selection");
    return;
  }
  el.hidden = false;
  el.dataset.size = ui.sheet;
  root.classList.add("c-has-selection");
  const entity = d || a,
    stage = d
      ? stageFor(d.stageId)
      : { name: "Cliente activo", color: "#3b8f80" };
  const acts = state.activities.filter(
    (x) => x.dealId === entity.id || x.accountId === entity.id,
  );
  const link = safeCrmLink(entity.crmUrl);
  el.innerHTML = `<div class="c-sheet-handle"><button data-action="sheet-cycle" aria-label="Cambiar altura de la ficha"><span></span></button></div><div class="c-inspector-top"><span class="c-eyebrow">${d ? "OPORTUNIDAD" : "RELACIÓN CON CLIENTE"} · ${esc(entity.id)}</span><button data-action="close-inspector" aria-label="Cerrar ficha">${i("x")}</button></div><div class="c-inspector-title"><span class="c-stage-pill" style="--stage:${stage.color}">${esc(stage.name)}</span><h2>${esc(entity.name)}</h2><p>${d ? esc(state.accounts.find((x) => x.id === d.accountId)?.name || "Sin cliente relacionado") : "Una relación que sigue creciendo"}</p></div><div class="c-sheet-sizes" role="group" aria-label="Altura de ficha"><button data-action="sheet-size" data-size="compact" aria-pressed="${ui.sheet === "compact"}">Contraída</button><button data-action="sheet-size" data-size="half" aria-pressed="${ui.sheet === "half"}">Media</button><button data-action="sheet-size" data-size="full" aria-pressed="${ui.sheet === "full"}">Expandida</button></div><div class="c-inspector-body">${
    d
      ? `
  <div class="c-deal-value"><div><small>Valor de la oportunidad</small><b>${eur(d.amount)}</b></div><span><b>${d.probability == null ? "No disponible" : `${d.probability} %`}</b><small>probabilidad</small></span></div>
  ${needsAttention(d, state) ? `<div class="c-attention-note">${i("alert-circle")}<span>Hay una tarea vencida. Revisa el siguiente paso.</span></div>` : ""}
  <dl class="c-details"><div><dt>Responsable</dt><dd><span class="c-owner-dot">${esc(state.owners.find((x) => x.id === d.ownerId)?.initials || "—")}</span>${esc(ownerName(d.ownerId))}</dd></div><div><dt>Cierre previsto</dt><dd>${date(d.expectedCloseAt)}</dd></div><div><dt>Última actividad</dt><dd>${date(d.lastActivityAt)} · ${time(d.lastActivityAt)}</dd></div></dl>
  <div class="c-next-step"><span>${i("arrow-right")}SIGUIENTE PASO</span><p>${esc(d.nextStep || "No disponible")}</p></div>
  <label class="c-stage-editor">Etapa de la oportunidad <select id="deal-stage" aria-label="Cambiar etapa" ${ui.mode === "replay" ? "disabled" : ""}>${state.stages.map((s) => `<option value="${esc(s.id)}" ${d.stageId === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}${state.stages.some((s) => stageKind(state, s.id) === "lost") ? "" : `<option value="lost" ${d.stageId === "lost" ? "selected" : ""}>Perdida · archivo</option>`}</select></label>
  <section class="c-history"><h3>Su recorrido</h3><ol>${(d.history || []).map((h, index) => `<li style="--stage:${stageFor(h.stageId).color}"><span></span><div><b>${esc(stageFor(h.stageId).name)}</b><small>${date(h.timestamp)} · ${time(h.timestamp)}</small></div>${index === d.history.length - 1 ? "<em>Actual</em>" : ""}</li>`).join("") || "<p>No disponible</p>"}</ol></section>
  <section class="c-products"><h3>Productos asociados</h3>${d.products?.length ? d.products.map((p) => `<div>${i("box")}<span><b>${esc(p.name)}</b><small>${p.quantity ?? "No disponible"} unidades · ${eur(p.unitPrice)} / unidad</small></span></div>`).join("") : "<p>No disponible</p>"}</section>
  ${d.accountId ? `<button class="c-related-account" data-select="${esc(d.accountId)}">${i("users")}Ver cuenta cliente relacionada${i("arrow-up-right")}</button>` : ""}
  ${stageKind(state, d.stageId) === "won" ? '<p class="c-data-note">Operación ganada ≠ factura emitida, cobro o beneficio. Esos datos no están disponibles.</p>' : ""}
  `
      : `<dl class="c-details"><div><dt>Responsable</dt><dd>${esc(ownerName(a.ownerId))}</dd></div><div><dt>Próxima renovación</dt><dd>${date(a.renewalDate)}</dd></div><div><dt>Venta adicional potencial</dt><dd>${eur(a.upsellAmount)}</dd></div></dl><section class="c-client-deals"><h3>Oportunidades relacionadas</h3>${
          state.deals
            .filter((x) => x.accountId === a.id)
            .map(
              (d) =>
                `<button data-select="${d.id}"><span><b>${esc(d.name)}</b><small>${esc(stageFor(d.stageId).name)}</small></span><strong>${eur(d.amount)}</strong>${i("arrow-up-right")}</button>`,
            )
            .join("") || "<p>No disponible</p>"
        }</section>`
  }
  <section class="c-record-activity"><h3>Actividad vinculada</h3>${
    acts
      .slice(0, 5)
      .map(
        (x) =>
          `<div>${i(activityIcon(x.type))}<span><b>${esc(x.subject || x.type)}</b><small>${x.status === "pending" ? "Pendiente" : "Registrada"} · ${date(x.dueAt || x.occurredAt)}</small></span></div>`,
      )
      .join("") || "<p>No disponible</p>"
  }</section><div class="c-record-source">${i("radio")}Demo local · Datos simulados<br><span>Sin credenciales ni conexión a un CRM real</span></div></div><div class="c-inspector-footer">${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Abrir registro en el CRM ${i("external-link")}</a>` : `<button disabled title="No existe una URL del CRM en estos datos ficticios">Abrir en CRM · No disponible ${i("external-link")}</button>`}<button data-action="focus-selected" aria-label="Enfocar en la ciudad">${i("locate-fixed")}</button></div>`;
}
function activityIcon(type) {
  return (
    {
      call: "phone",
      email: "mail",
      meeting: "calendar",
      conversation: "message-circle",
      contact: "users",
      task: "clock",
    }[type] || "activity"
  );
}
function renderDrawer() {
  const el = $("#city-drawer");
  if (!ui.drawer) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const state = getState(),
    m = metrics(state),
    titles = {
      clients: "Relaciones que crecen",
      feed: "Lo que pasa en tu ciudad",
      today: "Hoy en tu ciudad",
    };
  el.innerHTML = `<div class="c-drawer-header"><div><span class="c-eyebrow">${ui.drawer === "clients" ? `${m.activeClients} CLIENTES ACTIVOS` : "ACTIVIDAD CON PROCEDENCIA"}</span><h2>${titles[ui.drawer]}</h2></div><button data-action="close-drawer" aria-label="Cerrar panel">${i("x")}</button></div><nav class="c-drawer-tabs" aria-label="Vistas de actividad"><button data-action="today" class="${ui.drawer === "today" ? "active" : ""}">Hoy</button><button data-action="feed" class="${ui.drawer === "feed" ? "active" : ""}">Eventos</button><button data-action="clients" class="${ui.drawer === "clients" ? "active" : ""}">Clientes</button></nav><div class="c-drawer-body">${
    ui.drawer === "clients"
      ? state.accounts
          .map(
            (a) =>
              `<button class="c-client-card" data-select="${a.id}"><span class="c-client-symbol">${esc(a.name.charAt(0))}</span><div><b>${esc(a.name)}</b><small>Renueva ${date(a.renewalDate)}</small><span>Venta adicional: ${eur(a.upsellAmount)}</span></div>${i("arrow-up-right")}</button>`,
          )
          .join("")
      : ui.drawer === "feed"
        ? `<p class="c-data-note">Historial de eventos ficticios. Cada ID se aplica una sola vez.</p>${
            [...state.events]
              .reverse()
              .slice(0, 80)
              .map(
                (e) =>
                  `<button class="c-feed-event" data-select="${esc(e.entityId)}">${i(e.type === "deal.won" ? "trophy" : "activity")}<span><b>${esc(eventText(e))}</b><small>${date(e.timestamp)} · ${time(e.timestamp)} · ${esc(typeof e.source === "string" ? e.source : e.source?.name || "Demo")}</small><em>${esc(e.id)}</em></span></button>`,
              )
              .join("") || "<p>No hay eventos en este punto del historial.</p>"
          }`
        : `<div class="c-today-summary"><b>${m.pendingContacts}</b> contactos pendientes <span>·</span><b>${m.pendingConversations}</b> conversaciones por responder</div>${state.activities.map((a) => `<button class="c-feed-event" data-select="${esc(a.dealId || a.accountId || "")}">${i(activityIcon(a.type))}<span><b>${esc(a.subject || a.type)}</b><small>${a.status === "pending" ? "Pendiente" : "Registrada"} · ${date(a.dueAt || a.occurredAt)} ${time(a.occurredAt)}</small><em>${esc(a.id)}</em></span></button>`).join("")}`
  }</div>`;
}
function render() {
  renderMetrics();
  updateFilters();
  renderInspector();
  renderDrawer();
  const latest = getState().events.at(-1);
  $("#city-latest-event").textContent = latest
    ? eventText(latest)
    : "Tu pipeline está listo para explorar";
  const replay = ui.mode === "replay";
  $(".c-win-button").disabled = replay;
  refreshIcons();
}
function setView(view) {
  ui.view = view;
  $("#city-table").hidden = view !== "table";
  $("#city-world").classList.toggle("c-is-table", view === "table");
  scene?.setActive?.(view === "city" && !noWebGL);
  document
    .querySelectorAll('[data-action="view-city"]')
    .forEach((el) => el.classList.toggle("active", view === "city"));
  document
    .querySelectorAll('[data-action="view-table"]')
    .forEach((el) => el.classList.toggle("active", view === "table"));
  if (view === "table") renderTable();
  else {
    scene?.resize();
    if (noWebGL)
      toast(
        "El 3D no está disponible en este navegador. La tabla sigue funcionando.",
      );
  }
  refreshIcons();
}
function select(id, { focus = true } = {}) {
  const s = getState();
  if (!s.deals.some((d) => d.id === id) && !s.accounts.some((a) => a.id === id))
    return;
  ui.selectedId = id;
  ui.drawer = null;
  scene?.select(id);
  if (focus && ui.view === "city") scene?.focus(id);
  renderInspector();
  renderDrawer();
  if (ui.view === "table") renderTable();
  refreshIcons();
}
function closeInspector() {
  ui.selectedId = null;
  scene?.select(null);
  renderInspector();
  if (ui.view === "table") renderTable();
}
function nextEventId(prefix) {
  return `${prefix}-${String(++eventSequence).padStart(4, "0")}-${getState().events.length}`;
}
function changeStage(id, stageId) {
  if (ui.mode === "replay") {
    toast("Sal de Replay para simular cambios.");
    return null;
  }
  const d = getState().deals.find((x) => x.id === id);
  if (!d || d.stageId === stageId) return null;
  const kind = stageKind(getState(), stageId);
  const timestamp = new Date(
    new Date(getState().now).getTime() + 60000,
  ).toISOString();
  const event = {
    id: nextEventId("demo"),
    entityId: id,
    timestamp,
    type:
      kind === "won"
        ? "deal.won"
        : kind === "lost"
          ? "deal.lost"
          : "deal.stage_changed",
    source: "Atlas · simulación manual",
    payload: { stageId, accountId: d.accountId },
  };
  if (!provider.dispatch(event)) {
    toast("No se ha podido aplicar el evento a esta etapa.");
    return null;
  }
  toast(
    kind === "won"
      ? `${d.name}: ganada. No se ha generado ningún cobro.`
      : `${d.name} → ${stageFor(stageId).name}`,
  );
  return event;
}
function simulateWin() {
  if (ui.mode === "replay") return null;
  const state = getState(),
    wonStage = state.stages.find((s) => stageKind(state, s.id) === "won");
  if (!wonStage) {
    toast("El proceso del CRM no tiene una etapa de operación ganada.");
    return null;
  }
  const openStages = [...state.stages]
      .filter((s) => stageKind(state, s.id) === "open")
      .sort((a, b) => b.order - a.order),
    selected = state.deals.find(
      (d) => d.id === ui.selectedId && stageKind(state, d.stageId) === "open",
    ),
    d =
      selected ||
      openStages.flatMap((s) =>
        state.deals.filter((d) => d.stageId === s.id),
      )[0];
  if (!d) {
    toast("Todas las oportunidades de la demo están cerradas.");
    return null;
  }
  select(d.id, { focus: false });
  return changeStage(d.id, wonStage.id);
}
function setLayers(partial) {
  Object.assign(ui.layers, partial);
  scene?.setLayers(ui.layers);
  document
    .querySelectorAll("[data-layer]")
    .forEach((e) => (e.checked = ui.layers[e.dataset.layer]));
}
function setMode(mode) {
  if (ui.mode === "replay" && mode !== "replay") {
    ui.replay.playing = false;
    const saved = ui.replay.saved;
    ui.replay.saved = null;
    if (ui.replay.savedUi) {
      ui.selectedId = ui.replay.savedUi.selectedId;
      ui.filters = { ...ui.replay.savedUi.filters };
      ui.sheet = ui.replay.savedUi.sheet;
      setView(ui.replay.savedUi.view);
      $("#city-search").value = ui.filters.query;
      ui.replay.savedUi = null;
    }
    if (saved) provider.reset(saved);
  }
  ui.mode = mode;
  ui.tvIndex = -1;
  scene?.setMode?.(mode === "tv" ? "tv" : "explore");
  $("#city-replay").hidden = mode !== "replay";
  $("#city-tv-banner").hidden = mode !== "tv";
  document
    .querySelectorAll(".c-mode-tabs button")
    .forEach((b) => b.classList.toggle("active", b.dataset.action === mode));
  if (mode === "replay" && !ui.replay.saved) {
    ui.replay.savedUi = {
      selectedId: ui.selectedId,
      filters: { ...ui.filters },
      view: ui.view,
      sheet: ui.sheet,
    };
    ui.replay.saved = structuredClone(getState());
    ui.replay.events = demoReplayEvents(ui.replay.saved);
    ui.replay.index = 0;
    ui.replay.elapsed = 0;
    ui.replay.playing = false;
    provider.reset(createReplayState(ui.replay.saved));
    $("#city-replay-progress").max = ui.replay.events.length;
    updateReplayUI();
    toast(
      "Replay recorre las etapas; clientes y actividades conservan su instantánea. Al salir volverás al estado actual.",
    );
  }
  if (mode === "tv") {
    ui.tvIndex = -1;
    tvLast = 0;
    if (reduced.matches)
      toast(
        "TV mantiene encuadres fijos para respetar el movimiento reducido.",
      );
  }
  render();
  refreshIcons();
}
function replayStep() {
  const r = ui.replay;
  if (r.index >= r.events.length) {
    r.playing = false;
    updateReplayUI();
    return;
  }
  const e = r.events[r.index++];
  provider.dispatch(e);
  if (e.entityId) {
    ui.selectedId = e.entityId;
    scene?.select(e.entityId);
    scene?.focus(e.entityId);
    renderInspector();
  }
  updateReplayUI();
}
function updateReplayUI() {
  const r = ui.replay;
  $("#city-replay-progress").value = r.index;
  $("#city-replay-date").textContent =
    `${r.index} / ${r.events.length} eventos${r.index ? " · " + date(r.events[r.index - 1].timestamp) : ""}`;
  const b = $('[data-action="replay-play"]');
  b.innerHTML = i(r.playing ? "pause" : "play");
  b.setAttribute(
    "aria-label",
    r.playing ? "Pausar historial" : "Reproducir historial",
  );
  refreshIcons();
}
function scrubReplay(value) {
  const r = ui.replay,
    target = Number(value);
  if (!r.saved) return;
  const state = createReplayState(r.saved);
  for (let k = 0; k < target; k++) applyEvent(state, r.events[k]);
  r.index = target;
  provider.reset(state);
  updateReplayUI();
}
function showModal(type) {
  const copy = {
    help: [
      "Una ciudad para entender tu negocio",
      `<p>Cada barrio representa una etapa configurable de tu CRM. Cada edificio es una oportunidad: su acento indica la etapa y su altura acotada, el importe. Pulsa uno para ver el valor exacto, la persona responsable y el siguiente paso.</p><ul><li><b>Explore:</b> arrastra para orbitar; botón derecho o dos dedos para desplazar; rueda o pellizco para zoom.</li><li><b>Replay:</b> recorre las etapas históricas con pausa, velocidad y avance. Clientes y actividades conservan su instantánea. Al salir, restaura la vista anterior.</li><li><b>Simular una venta:</b> crea un evento ficticio, mueve el edificio a Won y reutiliza su cuenta cliente.</li><li><b>TV:</b> alterna encuadres sin modificar los datos.</li><li><b>Rojo + !:</b> una tarea vencida requiere atención.</li></ul><p>El tráfico, los árboles y el mobiliario son ambientales. No representan actividad comercial. Los coches se desactivan desde Capas.</p><p>En móvil puedes ajustar la ficha a tres alturas. Todas las funciones principales también están disponibles en la tabla.</p>`,
    ],
    sources: [
      "Los datos ponen la ciudad en movimiento",
      `<p><b>Esta es una demo con datos simulados.</b> No hay un CRM conectado, credenciales ni peticiones a registros reales.</p><div class="c-source-diagram"><span>CRM / ERP</span>${i("arrow-right")}<span>Adaptador + eventos</span>${i("arrow-right")}<span>Ciudad Atlas</span></div><p>El proveedor de datos está separado del renderer. Cada registro conserva un ID estable y cada evento incluye ID, entidad, fecha, tipo y procedencia. Los eventos repetidos se ignoran.</p><p>En una conexión real, un backend deberá autenticar al usuario, aplicar permisos y normalizar los datos. Los tokens no deben enviarse al navegador. Una oportunidad ganada no confirma una factura ni un cobro.</p><dl class="c-details"><div><dt>Fuente actual</dt><dd>Demo local reproducible</dd></div><div><dt>Fecha de la demo</dt><dd>16 oct 2026 · Madrid</dd></div><div><dt>Última sincronización real</dt><dd>No disponible</dd></div><div><dt>Historial de cierres</dt><dd>Completo para octubre en la demo</dd></div></dl><p>Experiencias conservadas: <a href="?experience=luma">Luma Works</a> · <a href="?experience=operations">Atlas operativo</a> · <a href="?experience=classic">Atlas original</a>.</p>`,
    ],
    "metric-info": [
      "Cómo se calculan los indicadores",
      `<p><b>Pipeline abierto:</b> suma de las oportunidades que no están ganadas ni perdidas. La demo inicial contiene 24 por 120.000 €.</p><p><b>Ganadas este mes:</b> 4 cierres por 30.000 € en el estado inicial. El historial de cierres ficticio incluye también 3 perdidas.</p><p><b>Tasa de éxito:</b> cierres ganados / todos los cierres del mes: 4 / 7 = 57,1 %. No se usa la proporción de edificios abiertos. Si faltara historial, se mostraría «No disponible».</p><p><b>Atención:</b> registros con al menos una tarea pendiente vencida o incidencia. Varias tareas de un mismo registro no crean edificios nuevos.</p><p>Las ventas adicionales de clientes no se añaden al pipeline hasta existir una oportunidad.</p>`,
    ],
  };
  const [title, body] = copy[type] || copy.help;
  const modal = $("#city-modal-root");
  modal.innerHTML = `<div class="c-modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="city-modal-title" class="c-modal"><header><span class="c-eyebrow">ATLAS / EN PERSPECTIVA</span><button data-action="close-modal" aria-label="Cerrar diálogo">${i("x")}</button></header><h2 id="city-modal-title">${title}</h2><div class="c-modal-copy">${body}</div><button class="c-modal-done" data-action="close-modal">Entendido ${i("check")}</button></section></div>`;
  refreshIcons();
  modal.querySelector('[data-action="close-modal"]').focus();
}
function closeModal() {
  $("#city-modal-root").innerHTML = "";
}
let sheetStart = null;
root.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".c-sheet-handle")) sheetStart = { y: e.clientY };
});
root.addEventListener("pointerup", (e) => {
  if (!sheetStart) return;
  const dy = e.clientY - sheetStart.y;
  sheetStart = null;
  if (Math.abs(dy) > 25) {
    const sizes = ["compact", "half", "full"];
    ui.sheet =
      sizes[
        Math.min(2, Math.max(0, sizes.indexOf(ui.sheet) + (dy < 0 ? 1 : -1)))
      ];
    renderInspector();
    refreshIcons();
  }
});
function onClick(e) {
  const selectEl = e.target.closest("[data-select]");
  if (selectEl) {
    select(selectEl.dataset.select);
    return;
  }
  const stage = e.target.closest("[data-stage]");
  if (stage) {
    ui.filters.stageId =
      ui.filters.stageId === stage.dataset.stage ? "" : stage.dataset.stage;
    updateFilters();
    return;
  }
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const a = b.dataset.action;
  if (a === "view-city" || a === "view-table") {
    if (noWebGL && a === "view-city") {
      toast(
        "El 3D no está disponible. Puedes usar todos los registros en Tabla.",
      );
      return;
    }
    setView(a === "view-city" ? "city" : "table");
  } else if (a === "explore") setMode("explore");
  else if (a === "replay") setMode(ui.mode === "replay" ? "explore" : "replay");
  else if (a === "tv") setMode(ui.mode === "tv" ? "explore" : "tv");
  else if (a === "simulate-win") simulateWin();
  else if (a === "close-inspector") closeInspector();
  else if (a === "focus-selected") {
    setView("city");
    scene?.focus(ui.selectedId);
  } else if (a === "overview") {
    if (ui.mode === "tv") setMode("explore");
    scene?.overview();
  } else if (a === "zoom-in" || a === "zoom-out")
    scene?.zoomBy?.(a === "zoom-in" ? 1.2 : 1 / 1.2);
  else if (a === "layers") {
    const panel = $("#city-layer-panel");
    panel.hidden = !panel.hidden;
    document
      .querySelectorAll('[data-action="layers"]')
      .forEach((x) => x.setAttribute("aria-expanded", String(!panel.hidden)));
  } else if (a === "filters") {
    const row = $("#city-filters");
    row.hidden = !row.hidden;
    b.setAttribute("aria-expanded", String(!row.hidden));
    scene?.resize();
  } else if (a === "clear-filters") {
    Object.assign(ui.filters, {
      query: "",
      stageId: "",
      ownerId: "",
      attentionOnly: false,
      includeLost: false,
    });
    $("#city-search").value = "";
    updateFilters();
  } else if (a === "attention") {
    ui.filters.attentionOnly = !ui.filters.attentionOnly;
    updateFilters();
  } else if (["clients", "feed", "today"].includes(a)) {
    ui.drawer = ui.drawer === a ? null : a;
    renderDrawer();
    refreshIcons();
  } else if (a === "close-drawer") {
    ui.drawer = null;
    renderDrawer();
  } else if (a === "sheet-size") {
    ui.sheet = b.dataset.size;
    renderInspector();
    refreshIcons();
  } else if (a === "sheet-cycle") {
    ui.sheet = { compact: "half", half: "full", full: "compact" }[ui.sheet];
    renderInspector();
    refreshIcons();
  } else if (a === "replay-play") {
    if (ui.replay.index >= ui.replay.events.length) scrubReplay(0);
    ui.replay.playing = !ui.replay.playing;
    ui.replay.elapsed = 0;
    updateReplayUI();
  } else if (a === "replay-next") {
    ui.replay.playing = false;
    replayStep();
  } else if (a === "close-modal") closeModal();
  else if (["help", "sources", "metric-info"].includes(a)) showModal(a);
}
root.addEventListener("click", onClick);
$("#city-modal-root").addEventListener("click", (e) => {
  if (e.target.classList.contains("c-modal-backdrop")) closeModal();
  else onClick(e);
});
root.addEventListener("keydown", (e) => {
  const row = e.target.closest("tr[data-select]");
  if (row && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    select(row.dataset.select);
  }
});
$("#city-search").addEventListener("input", (e) => {
  ui.filters.query = e.target.value;
  updateFilters();
});
$("#filter-stage").addEventListener("change", (e) => {
  ui.filters.stageId = e.target.value;
  if (stageKind(getState(), e.target.value) === "lost")
    ui.filters.includeLost = true;
  updateFilters();
});
$("#filter-owner").addEventListener("change", (e) => {
  ui.filters.ownerId = e.target.value;
  updateFilters();
});
$("#filter-attention").addEventListener("change", (e) => {
  ui.filters.attentionOnly = e.target.checked;
  updateFilters();
});
$("#filter-lost").addEventListener("change", (e) => {
  ui.filters.includeLost = e.target.checked;
  updateFilters();
});
root.addEventListener("change", (e) => {
  if (e.target.id === "deal-stage") changeStage(ui.selectedId, e.target.value);
  if (e.target.dataset.layer)
    setLayers({ [e.target.dataset.layer]: e.target.checked });
});
$("#city-quality").addEventListener("change", (e) => {
  ui.quality = e.target.value;
  scene?.setQuality(ui.quality);
});
$("#city-replay-speed").addEventListener("change", (e) => {
  ui.replay.speed = Number(e.target.value);
});
$("#city-replay-progress").addEventListener("input", (e) => {
  ui.replay.playing = false;
  scrubReplay(e.target.value);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if ($("#city-modal-root").firstChild) closeModal();
    else if (!$("#city-layer-panel").hidden)
      $("#city-layer-panel").hidden = true;
    else if (ui.drawer) {
      ui.drawer = null;
      renderDrawer();
    } else if (ui.selectedId) closeInspector();
    else if (ui.mode !== "explore") setMode("explore");
  }
  if (e.key === "Tab" && $("#city-modal-root").firstChild) {
    const nodes = [
        ...$("#city-modal-root").querySelectorAll(
          "button,a[href],input,select",
        ),
      ],
      first = nodes[0],
      last = nodes.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
provider.subscribe(() => render());
render();
let lastTick = performance.now(),
  tvLast = 0;
function tick() {
  const now = performance.now(),
    dt = Math.min(0.25, (now - lastTick) / 1000);
  lastTick = now;
  if (!document.hidden) {
    if (ui.mode === "replay" && ui.replay.playing) {
      ui.replay.elapsed += dt * ui.replay.speed;
      if (ui.replay.elapsed >= 2.4) {
        ui.replay.elapsed -= 2.4;
        replayStep();
      }
    }
    if (ui.mode === "tv" && now - tvLast > 7000) {
      tvLast = now;
      ui.tvIndex++;
      const stages = getState().stages,
        idx = ui.tvIndex % (stages.length + 1);
      if (idx === 0) scene?.overview();
      else {
        const d = getState().deals.find(
          (d) => d.stageId === stages[idx - 1].id,
        );
        if (d) scene?.focus(d.id);
      }
      const text =
        idx === 0
          ? "Tu negocio, en perspectiva"
          : `${stages[idx - 1].name} · ${metrics(getState()).stages.find((s) => s.id === stages[idx - 1].id)?.count || 0} oportunidades`;
      $("#city-tv-banner span").textContent = `TV · ${text}`;
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
document.addEventListener("visibilitychange", () => {
  lastTick = performance.now();
});
async function boot() {
  try {
    scene = await createCityScene({
      container: $("#city-canvas"),
      labelContainer: $("#city-labels"),
      reducedMotion: reduced.matches,
      onSelect: (id) => (id ? select(id, { focus: false }) : closeInspector()),
      onHover: (entity, data, point) => {
        const el = $("#city-hover");
        if (
          !entity ||
          ui.view !== "city" ||
          matchMedia("(pointer: coarse)").matches
        ) {
          el.hidden = true;
          return;
        }
        const id = typeof entity === "string" ? entity : entity.id,
          d = getState().deals.find((d) => d.id === id),
          a = getState().accounts.find((a) => a.id === id);
        if (!d && !a) {
          el.hidden = true;
          return;
        }
        el.hidden = false;
        el.innerHTML = `<b>${esc((d || a).name)}</b><span>${d ? `${esc(stageFor(d.stageId).name)} · ${eur(d.amount)}` : "Cliente activo · Ver relación"}</span>`;
        const rect = $("#city-world").getBoundingClientRect(),
          x = point?.x ?? rect.width / 2,
          y = point?.y ?? rect.height / 2;
        el.style.left = `${Math.max(8, Math.min(rect.width - 240, x - rect.left + 14))}px`;
        el.style.top = `${Math.max(8, Math.min(rect.height - 90, y - rect.top - 35))}px`;
      },
      onNavigate: () => {
        if (ui.mode === "tv") setMode("explore");
        $("#city-hover").hidden = true;
      },
    });
    sceneReady = true;
    $("#city-loader").hidden = true;
    scene.setQuality(ui.quality);
    updateFilters();
    scene.select(ui.selectedId);
    scene.setActive?.(ui.view === "city");
  } catch (error) {
    noWebGL = true;
    sceneReady = false;
    $("#city-loader").hidden = true;
    $("#city-fallback").hidden = false;
    setView("table");
    console.info(
      "Atlas: tabla activada porque el renderer no está disponible.",
      error.message,
    );
    toast(
      "No se ha podido iniciar el 3D. La tabla conserva todas las funciones.",
    );
  }
}
window.__ATLAS_CITY__ = {
  provider,
  get scene() {
    return scene;
  },
  get sceneReady() {
    return sceneReady;
  },
  get noWebGL() {
    return noWebGL;
  },
  getUiState: () => ({
    ...ui,
    filters: { ...ui.filters },
    replay: {
      playing: ui.replay.playing,
      speed: ui.replay.speed,
      index: ui.replay.index,
    },
  }),
  metrics: () => metrics(getState()),
  select,
  simulateWin,
  changeStage,
  setView,
  setLayers,
  setReplay: (enabled) => setMode(enabled ? "replay" : "explore"),
  setMode,
  reset: () => {
    setMode("explore");
    provider.reset();
    closeInspector();
  },
  scrubReplay,
};
boot();
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) scene?.dispose();
});
