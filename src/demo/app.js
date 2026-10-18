import "@tavus/embed";
import { cityPresentation } from "../city/app.js";
import { createCityPresentationController } from "./city-controller.js";
import { createTavusDemoSession } from "./tavus-session.js";
import { createExistingAgentContracts, getExistingAgentCatalogue } from "./existing-agent-tools.js";
import { createTavusToolBridge, loadTavusToolContracts } from "./tool-contracts.js";
import { getPresentationFrame } from "./presentation-state.js";
import "./style.css";

const shell = document.querySelector("#city-app");
shell.classList.add("c-bird-demo");
document.title = "Bird View · Una ciudad, toda tu empresa";
const presentation = document.createElement("section");
presentation.id = "bird-presentation";
presentation.className = "bird-presentation";
presentation.setAttribute("aria-label", "Presentación interactiva de Bird View");
presentation.innerHTML = `
  <div class="bird-scene-shade" aria-hidden="true"></div>
  <header class="bird-presentation-header">
    <a href="/" class="bird-presentation-brand" aria-label="Bird View: volver a la aplicación"><span class="bird-brand-symbol" aria-hidden="true">b<span>·</span></span><span>Bird View<small>UNA CIUDAD. TODA TU EMPRESA.</small></span></a>
    <div class="bird-presentation-actions"><span class="bird-demo-badge">EXPERIENCIA INTERACTIVA</span><button data-demo-action="fullscreen" aria-label="Pantalla completa" title="Pantalla completa">⛶</button><a href="/" aria-label="Salir de la presentación">Salir ↗</a></div>
  </header>
  <div id="bird-demo-kpis" class="bird-shot-kpis" aria-label="Indicadores de la zona"></div>
  <div class="bird-shot-caption" aria-live="polite"><p id="bird-demo-view-eyebrow">TU EMPRESA, A VISTA DE PÁJARO</p><h1 id="bird-demo-view-title">Cada historia empieza aquí.</h1><p id="bird-demo-view-detail">Descubre lo que ocurre en cada rincón de tu empresa.</p><span class="bird-data-caption">Empresa de ejemplo · Datos simulados</span></div>
  <div id="bird-demo-stages" class="bird-stage-strip" role="list" aria-label="Etapas del recorrido" hidden></div>
  <details class="bird-presentation-controls"><summary>Explorar la ciudad <span aria-hidden="true">⌄</span></summary><div class="bird-tour-controls"><button data-demo-action="overview">Vista general</button><button data-demo-action="sales">Comercial</button><button data-demo-action="industry">Industrial</button><button data-demo-action="communications">Comunicaciones</button><button data-demo-action="highlight">Destacar selección</button></div></details>
  <aside id="bird-demo-panel" class="bird-guide-dock" aria-label="Tu guía de Bird View" data-surface="embed">
    <div class="bird-guide-heading"><div class="bird-guide-mark" aria-hidden="true">✳</div><div><h2>Tu guía de Bird View</h2><div class="bird-demo-status"><span class="bird-status-dot" aria-hidden="true"></span><b id="bird-demo-status" role="status">Preparando la experiencia…</b></div></div></div>
    <p id="bird-demo-microphone">Micrófono sin solicitar</p>
    <p id="bird-demo-message" aria-live="polite">Una conversación para descubrir tu empresa desde dentro.</p>
    <div id="bird-widget-host"></div>
    <div class="bird-session-controls"><button data-demo-action="start" disabled>Iniciar demo con IA <span aria-hidden="true">↗</span></button><button data-demo-action="interrupt" disabled>Interrumpir</button><button data-demo-action="stop" disabled>Finalizar</button></div>
    <p id="bird-demo-config-hint" class="bird-config-hint"></p>
  </aside>`;
shell.append(presentation);
const panel = presentation.querySelector("#bird-demo-panel");
const $ = (selector) => presentation.querySelector(selector);
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const activeStatuses = new Set(["initializing", "connecting", "connected"]);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const statusNames = { idle: "Pronta para conversar", initializing: "Preparando tu guía…", connecting: "Conectando…", connected: "Conversación conectada", ended: "Sesión finalizada", error: "No se ha conectado" };
let configuration = null, session = null, disposed = false;
let currentTarget = { kind: "industry-stage", id: "manufacturing" };
let currentFrame = null, ambientTimer = null, ambientEnabled = false, ambientIndex = 0, canvas = null;
const controller = createCityPresentationController({ getScene: cityPresentation.getScene, getSnapshot: cityPresentation.getSnapshot, onAction: updatePresentationDetails });

function renderFrame(target = null, overview = false) {
  const frame = getPresentationFrame(cityPresentation.getSnapshot(), { target, overview });
  currentFrame = frame;
  shell.dataset.section = frame.section;
  $("#bird-demo-view-eyebrow").textContent = frame.eyebrow;
  $("#bird-demo-view-title").textContent = frame.title;
  $("#bird-demo-view-detail").textContent = frame.description;
  $("#bird-demo-kpis").innerHTML = frame.kpis.map((item) => `<div class="bird-kpi"><span class="label">${escapeHTML(item.label)}</span><b class="value">${escapeHTML(item.value)}</b>${item.note ? `<small class="note">${escapeHTML(item.note)}</small>` : ""}</div>`).join("");
  const strip = $("#bird-demo-stages");
  strip.hidden = !frame.stages.length;
  strip.innerHTML = frame.stages.map((stage, index) => `<div class="bird-stage" role="listitem" data-active="${stage.id === frame.activeStage}" style="--stage-color:${escapeHTML(stage.color)}"><small class="number">${String(index + 1).padStart(2, "0")}</small><span class="label">${escapeHTML(stage.label)}</span><b class="value">${escapeHTML(stage.value)}</b></div>`).join("");
}
function updatePresentationDetails(event) {
  if (event.status === "manual_navigation") {
    stopAmbient("manual_navigation");
    return;
  }
  const { command } = event;
  if (!command || !["started", "finished"].includes(event.status)) return;
  if (event.status === "finished" && !event.result?.ok) return;
  if (command.action === "overview") return renderFrame(null, true);
  if (command.target) {
    currentTarget = { ...command.target };
    renderFrame(currentTarget);
  }
}
function syncFrameToShot() {
  const shot = cityPresentation.getScene()?.presentation?.getState().shot;
  if (!shot) return;
  currentTarget = { ...shot };
  renderFrame(shot, shot.kind === "district" && shot.id === "all");
}
function stopAmbient(reason = "presentation_interaction") {
  ambientEnabled = false;
  clearTimeout(ambientTimer);
  ambientTimer = null;
  cityPresentation.getScene()?.presentation?.setCinematicIdle?.(false);
  controller.cancel({ reason });
}
function startAmbient() {
  if (disposed || reducedMotion.matches || activeStatuses.has(session?.getState().status)) return;
  ambientEnabled = true;
  cityPresentation.getScene()?.presentation?.setCinematicIdle?.(true);
  clearTimeout(ambientTimer);
  ambientTimer = setTimeout(advanceAmbient, 18000);
}
async function advanceAmbient() {
  if (!ambientEnabled || disposed || activeStatuses.has(session?.getState().status)) return;
  const shots = [null, { kind: "district", id: "sales" }, { kind: "industry-stage", id: "manufacturing" }, { kind: "communication", id: "meeting" }];
  const target = shots[++ambientIndex % shots.length];
  cityPresentation.getScene()?.presentation?.setCinematicIdle?.(false);
  controller.startSession();
  await controller.executeInternalCommand(target ? { action: "focus", target, duration: 7 } : { action: "overview", duration: 7 });
  if (ambientEnabled) startAmbient();
}
function showSession(state = { status: "idle", microphone: "not-requested" }) {
  const active = activeStatuses.has(state.status);
  if (active) {
    ambientEnabled = false;
    clearTimeout(ambientTimer);
    ambientTimer = null;
    cityPresentation.getScene()?.presentation?.setCinematicIdle?.(false);
  }
  shell.classList.toggle("is-conversation-active", active);
  panel.dataset.status = state.status;
  $("#bird-demo-status").textContent = statusNames[state.status] || "Estado no disponible";
  $("#bird-demo-microphone").textContent = state.microphone === "denied" ? "Permiso del micrófono denegado" : state.microphone === "not-requested" ? "Micrófono sin solicitar" : state.microphone === "requested" ? "Tavus gestiona los permisos del micrófono" : "Micrófono: usa los controles de Tavus";
  $("[data-demo-action=start]").disabled = active || !configuration?.configured || !cityPresentation.getAvailable();
  $("[data-demo-action=stop]").disabled = !active;
  $("[data-demo-action=interrupt]").disabled = state.status !== "connected";
  if (state.error) {
    syncFrameToShot();
    $("#bird-demo-message").textContent = state.error.message;
  }
  else if (state.status === "connected") $("#bird-demo-message").textContent = state.speech === "guide" ? "Tu guía está hablando. Puedes interrumpir y preguntar." : state.speech === "user" ? "Te está escuchando…" : "Pregunta por el lugar que te apetezca descubrir.";
  else if (state.status === "ended") {
    syncFrameToShot();
    $("#bird-demo-message").textContent = "Tu ciudad sigue aquí. Podemos empezar otro recorrido cuando quieras.";
    startAmbient();
  }
}
async function readConfiguration() {
  const deploymentId = (import.meta.env.VITE_TAVUS_DEPLOYMENT_ID || "").trim();
  let config = { configured: !!deploymentId, deploymentId: deploymentId || null, palId: null, contractSource: "bundled", contracts: null };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 5000);
  try {
    const response = await fetch("/api/tavus-config", { signal: abort.signal, headers: { Accept: "application/json" }, cache: "no-store" });
    if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
      const data = await response.json();
      if (typeof data.configured === "boolean") config = { ...config, ...data, deploymentId: data.deploymentId || config.deploymentId, configured: !!(data.deploymentId || config.deploymentId), contractSource: data.contractSource || (data.contracts?.code === "TOOL_SCHEMA_UNAVAILABLE" ? "bundled" : "environment") };
    }
  } catch { /* The public, build-time ID also supports static previews. */ }
  finally { clearTimeout(timer); }
  return config;
}
function conversationContext() {
  const { crm, industry } = cityPresentation.getSnapshot();
  return {
    application: "Bird View", experience: "Presentación inmersiva a pantalla completa, con planos cinematográficos dentro de la ciudad. No es el dashboard de trabajo.", simulated: true, language: "es", date: crm.now, industrialScenarioImplemented: true,
    limitation: "Oportunidades ganadas no son facturas ni cobros. Posiciones y rutas ilustrativas. Las herramientas no fabrican, cierran ventas ni cambian etapas.",
    currentScene: currentFrame ? { section: currentFrame.section, title: currentFrame.title, indicators: currentFrame.kpis } : null,
    toolStatus: configuration.contracts.ready ? "Herramientas configuradas. Cada movimiento utiliza una toma propia de la presentación. Espera su resultado antes de describir lo que muestras." : "Las herramientas no están disponibles; explica el límite sin afirmar que has movido el mapa.",
    presentationTools: configuration.contracts.ready ? { definitions: configuration.contracts.tools, catalogue: configuration.contractSource === "bundled" ? getExistingAgentCatalogue({ crm, industry }) : { bindings: configuration.contracts.bindings } } : null,
    departments: ["all", "sales", "communications", "industry"],
    owners: crm.owners.map(({ id, name }) => ({ id, name })), salesStages: crm.stages.map(({ id, name }) => ({ id, name })),
    sales: crm.deals.filter((deal) => deal.status !== "lost").map(({ id, name, amount, stageId }) => ({ id, name, amount, stageId })),
    communications: ["email", "call", "messages", "meeting"],
    batches: industry.batches.map(({ id, stageId, quantity }) => ({ id, stageId, quantity })),
    vehicles: industry.vehicles.map(({ id, driverName, status, cargoBatchId }) => ({ id, driverName, status, cargoBatchId })),
  };
}
function beginConversation() {
  if (!configuration?.configured || !cityPresentation.getAvailable()) return;
  stopAmbient("conversation_start");
  session?.dispose();
  controller.endSession({ restore: false });
  const snapshot = cityPresentation.getSnapshot();
  if (snapshot.crm.source?.type !== "simulated" || snapshot.industry.source?.type !== "simulated") {
    $("#bird-demo-message").textContent = "La demostración pública requiere datos ficticios.";
    return;
  }
  const bridge = createTavusToolBridge({ contracts: configuration.contracts, controller });
  session = createTavusDemoSession({
    container: $("#bird-widget-host"), deploymentId: configuration.deploymentId, context: conversationContext(), controller, toolBridge: bridge, onState: showSession,
    createWidget: () => { const embed = document.createElement("tavus-embed"); embed.setAttribute("layout", "inline"); return embed; },
  });
  session.start();
}
async function manualView(action) {
  await cityPresentation.ready;
  if (!cityPresentation.getAvailable()) return { ok: false, code: "SCENE_UNAVAILABLE" };
  stopAmbient("manual_presentation");
  controller.startSession();
  const targets = { sales: { kind: "district", id: "sales" }, industry: { kind: "industry-stage", id: "manufacturing" }, communications: { kind: "communication", id: "meeting" } };
  if (action === "overview") return controller.executeInternalCommand({ action: "overview", duration: 5.5 });
  if (targets[action]) return controller.executeInternalCommand({ action: "focus", target: targets[action], duration: 5.5 });
  if (action === "highlight") return controller.executeInternalCommand({ action: "animation", animation: "pulse", target: currentTarget, duration: 5 });
  return { ok: false, code: "UNKNOWN_ACTION" };
}
presentation.addEventListener("click", (event) => {
  const button = event.target.closest("[data-demo-action]");
  if (!button || !presentation.contains(button) || button.disabled) return;
  const action = button.dataset.demoAction;
  if (action === "start") beginConversation();
  else if (action === "stop") session?.stop();
  else if (action === "interrupt") session?.interrupt();
  else if (action === "fullscreen") {
    const attempt = document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.();
    attempt?.catch?.(() => { button.title = "La presentación ya ocupa toda la ventana"; });
  } else {
    $(".bird-presentation-controls").open = false;
    void manualView(action).then((result) => { if (!result.ok) $("#bird-demo-message").textContent = "No se ha podido mostrar ese plano. Prueba con otra zona."; });
  }
});
async function boot() {
  configuration = await readConfiguration();
  await cityPresentation.ready;
  if (disposed) return;
  if (configuration.contractSource === "bundled") configuration.contracts = loadTavusToolContracts(createExistingAgentContracts(cityPresentation.getSnapshot()));
  else if (!configuration.contracts) configuration.contracts = loadTavusToolContracts(null);
  if (!cityPresentation.getAvailable()) $("#bird-demo-message").textContent = "La ciudad 3D no se ha podido iniciar en este navegador.";
  else {
    cityPresentation.getScene().presentation.setCinematicMode(true);
    canvas = shell.querySelector(".city-webgl");
    canvas?.addEventListener("pointerup", syncFrameToShot);
    renderFrame(null, true);
    $("#bird-demo-message").textContent = configuration.configured ? "Pulsa Iniciar y descubre la ciudad conversando con tu guía." : "Falta el Deployment ID de Tavus. Puedes explorar la presentación.";
    startAmbient();
  }
  $("#bird-demo-config-hint").textContent = configuration.contracts.ready ? "" : "El control por voz de la ciudad no está disponible con esta configuración.";
  showSession();
  if (!configuration.configured) $("#bird-demo-status").textContent = "Configuración de Tavus pendiente";
}
function cleanup() {
  disposed = true;
  canvas?.removeEventListener("pointerup", syncFrameToShot);
  clearTimeout(ambientTimer);
  session?.dispose();
  controller.endSession();
}
window.addEventListener("pagehide", cleanup, { once: true });
window.__BIRD_DEMO__ = Object.freeze({ getState: () => ({ configuration: configuration ? { configured: configuration.configured, contractsReady: !!configuration.contracts?.ready } : null, session: session?.getState() || { status: "idle", microphone: "not-requested" }, presentation: { section: currentFrame?.section || "all", ambient: ambientEnabled } }), manualTour: manualView });
void boot();
