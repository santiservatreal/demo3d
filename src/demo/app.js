import "@tavus/widget";
import "@tavus/embed";
import { cityPresentation } from "../city/app.js";
import { createCityPresentationController } from "./city-controller.js";
import { createTavusDemoSession } from "./tavus-session.js";
import {
  createExistingAgentContracts,
  getExistingAgentCatalogue,
} from "./existing-agent-tools.js";
import {
  createTavusToolBridge,
  loadTavusToolContracts,
} from "./tool-contracts.js";
import "./style.css";

const shell = document.querySelector("#city-app");
shell.classList.add("c-bird-demo");
document.title = "Bird View · Demo con IA";
document.querySelector(".c-wordmark").textContent = "Bird View";
const panel = document.createElement("aside");
panel.id = "bird-demo-panel";
panel.className = "bird-demo-panel";
panel.setAttribute("aria-label", "Guía de Bird View");
panel.innerHTML = `<div class="bird-demo-eyebrow">TU EMPRESA, A VISTA DE PÁJARO</div>
  <h1>Guía de Bird View<span>Demo interactiva</span></h1>
  <p class="bird-demo-intro">Conversación por voz con tu guía. Explora ventas o sigue un producto desde la fábrica hasta su entrega.</p>
  <div class="bird-demo-status"><span class="bird-status-dot" aria-hidden="true"></span><b id="bird-demo-status" role="status">Comprobando configuración…</b></div>
  <p id="bird-demo-microphone">Micrófono sin solicitar</p>
  <p id="bird-demo-message" aria-live="polite"></p>
  <div class="bird-session-controls"><button data-demo-action="start" disabled>Iniciar demo con IA</button><button data-demo-action="stop" disabled>Finalizar</button><button data-demo-action="interrupt" disabled>Interrumpir</button></div>
  <p class="bird-manual-label">También puedes explorar ahora</p>
  <div class="bird-tour-controls"><button data-demo-action="sales">Comercial</button><button data-demo-action="industry">Industrial</button><button data-demo-action="overview">Vista general</button></div>
  <div class="bird-current-view" aria-live="polite"><b id="bird-demo-view-title">Tu empresa, de un vistazo</b><p id="bird-demo-view-detail">Datos ficticios · Navegación y visualización</p><button data-demo-action="highlight">Destacar edificio</button></div>
  <p id="bird-demo-config-hint" class="bird-config-hint"></p>
  <div id="bird-widget-host"></div>
  <a class="bird-explore-link" href="/">Explorar Bird View sin asistente ↗</a>`;
document.querySelector(".c-header").after(panel);
panel
  .querySelector(".bird-tour-controls")
  .append(panel.querySelector('[data-demo-action="highlight"]'));
const $ = (selector) => panel.querySelector(selector);
const statusNames = {
  idle: "Listo para empezar",
  initializing: "Preparando Tavus…",
  connecting: "Conectando con tu guía…",
  connected: "Conversación conectada",
  ended: "Sesión finalizada",
  error: "No se ha conectado",
};
let configuration = null,
  session = null,
  disposed = false,
  currentTarget = { kind: "deal", id: "deal-001" };
const controller = createCityPresentationController({
  getScene: cityPresentation.getScene,
  getSnapshot: cityPresentation.getSnapshot,
  onAction: updatePresentationDetails,
});

function updatePresentationDetails(event) {
  if (event.status !== "finished" || !event.result?.ok) return;
  const { command } = event;
  if (command.action === "overview") {
    $("#bird-demo-view-title").textContent = "Tu empresa, de un vistazo";
    $("#bird-demo-view-detail").textContent =
      "Ventas, conversaciones y operaciones en la misma ciudad.";
    return;
  }
  if (!command.target) return;
  const snapshot = cityPresentation.getSnapshot();
  const catalogue = getExistingAgentCatalogue(snapshot);
  const id = `${command.target.kind}:${command.target.id}`;
  const item = catalogue.movements.find((entry) => entry.id === id);
  if (item) $("#bird-demo-view-title").textContent = item.label;
  currentTarget = { ...command.target };
  const { crm, industry } = snapshot;
  const target = command.target;
  let detail = "Navegación y visualización · Datos ficticios";
  if (target.kind === "deal") {
    const deal = crm.deals.find((entry) => entry.id === target.id);
    if (deal)
      detail = `${new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(deal.amount)} · Oportunidad comercial · No es un cobro`;
  } else if (target.kind === "industry-stage" || (target.kind === "district" && target.id === "industry")) {
    const batches = industry.batches.filter((batch) => target.kind === "district" || batch.stageId === target.id);
    detail = `${industry.batches.reduce((sum, batch) => sum + batch.quantity, 0)} unidades trazadas · ${batches.reduce((sum, batch) => sum + batch.quantity, 0)} en ${target.kind === "district" ? "la operación" : "esta etapa"} · Ruta estimada; no es GPS en directo`;
  } else if (target.kind === "owner") {
    const deals = crm.deals.filter((deal) => deal.ownerId === target.id && deal.status !== "lost");
    detail = `${deals.length} oportunidades asignadas · Posición ilustrativa del comercial`;
  } else if (target.kind === "batch") {
    const batch = industry.batches.find((entry) => entry.id === target.id);
    if (batch) detail = `${batch.quantity} unidades · ${batch.productName} · Etapa: ${industry.stages.find((stage) => stage.id === batch.stageId)?.name || batch.stageId}`;
  } else if (target.kind === "vehicle") {
    const vehicle = industry.vehicles.find((entry) => entry.id === target.id);
    if (vehicle) detail = `${vehicle.driverName} · Ruta estimada; no es GPS en directo`;
  }
  $("#bird-demo-view-detail").textContent = detail;
}

function showSession(state = { status: "idle", microphone: "not-requested" }) {
  const active = ["initializing", "connecting", "connected"].includes(
    state.status,
  );
  shell.classList.toggle("is-conversation-active", active);
  panel.dataset.status = state.status;
  $("#bird-demo-status").textContent =
    statusNames[state.status] || "Estado no disponible";
  $("#bird-demo-microphone").textContent =
    state.microphone === "denied"
      ? "Permiso del micrófono denegado"
      : state.microphone === "not-requested"
        ? "Micrófono sin solicitar"
        : state.microphone === "requested"
          ? "Tavus gestiona los permisos del micrófono"
          : "Micrófono: usa los controles de Tavus";
  $("[data-demo-action=start]").disabled =
    active || !configuration?.configured || !cityPresentation.getAvailable();
  $("[data-demo-action=stop]").disabled = !active;
  $("[data-demo-action=interrupt]").disabled = state.status !== "connected";
  if (state.error) $("#bird-demo-message").textContent = state.error.message;
  else if (state.status === "connected")
    $("#bird-demo-message").textContent =
      state.speech === "guide"
        ? "Tu guía está hablando. Puedes interrumpir y preguntar."
        : state.speech === "user"
          ? "El guía está recibiendo tu intervención."
          : "Pregunta por el área que te interese.";
  else if (state.status === "ended")
    $("#bird-demo-message").textContent =
      "Puedes iniciar otra conversación o seguir explorando el mapa.";
}

async function readConfiguration() {
  const deploymentId = (import.meta.env.VITE_TAVUS_DEPLOYMENT_ID || "").trim();
  let config = {
    configured: !!deploymentId,
    deploymentId: deploymentId || null,
    palId: null,
    contractSource: "bundled",
    contracts: null,
  };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 5000);
  try {
    const response = await fetch("/api/tavus-config", {
      signal: abort.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (
      response.ok &&
      response.headers.get("content-type")?.includes("application/json")
    ) {
      const data = await response.json();
      if (typeof data.configured === "boolean")
        config = {
          ...config,
          ...data,
          deploymentId: data.deploymentId || config.deploymentId,
          configured: !!(data.deploymentId || config.deploymentId),
          contractSource: data.contractSource ||
            (data.contracts?.code === "TOOL_SCHEMA_UNAVAILABLE" ? "bundled" : "environment"),
        };
    }
  } catch {
    /* The build-time public ID also works on a static preview. */
  } finally {
    clearTimeout(timer);
  }
  return config;
}

function conversationContext() {
  const { crm, industry } = cityPresentation.getSnapshot();
  return {
    application: "Bird View",
    simulated: true,
    language: "es",
    date: crm.now,
    industrialScenarioImplemented: true,
    limitation:
      "Oportunidades ganadas no son facturas ni cobros. Las posiciones y las rutas son ilustrativas. Obras y cambios de etapa no se ejecutan desde esta demo.",
    toolStatus: configuration.contracts.ready
      ? "Esquemas exportados configurados; espera siempre el resultado de cada herramienta."
      : "Faltan los esquemas exportados: las herramientas devolverán TOOL_SCHEMA_UNAVAILABLE. Explica el límite y sugiere los botones manuales, sin afirmar que has movido el mapa.",
    presentationTools: configuration.contracts.ready
      ? {
          definitions: configuration.contracts.tools,
          catalogue: configuration.contractSource === "bundled"
            ? getExistingAgentCatalogue({ crm, industry })
            : { bindings: configuration.contracts.bindings },
        }
      : null,
    departments: ["all", "sales", "communications", "industry"],
    owners: crm.owners.map(({ id, name }) => ({ id, name })),
    salesStages: crm.stages.map(({ id, name }) => ({ id, name })),
    sales: crm.deals
      .filter((d) => d.status !== "lost")
      .map(({ id, name, amount, stageId }) => ({ id, name, amount, stageId })),
    communications: ["email", "call", "messages", "meeting"],
    batches: industry.batches.map(({ id, stageId, quantity }) => ({
      id,
      stageId,
      quantity,
    })),
    vehicles: industry.vehicles.map(
      ({ id, driverName, status, cargoBatchId }) => ({
        id,
        driverName,
        status,
        cargoBatchId,
      }),
    ),
  };
}

function beginConversation() {
  if (!configuration?.configured || !cityPresentation.getAvailable()) return;
  session?.dispose();
  const snapshot = cityPresentation.getSnapshot();
  if (
    snapshot.crm.source?.type !== "simulated" ||
    snapshot.industry.source?.type !== "simulated"
  ) {
    $("#bird-demo-message").textContent =
      "La demostración pública requiere datos ficticios.";
    return;
  }
  const bridge = createTavusToolBridge({
    contracts: configuration.contracts,
    controller,
  });
  const surface = matchMedia("(max-width: 600px)").matches ? "embed" : "widget";
  panel.dataset.surface = surface;
  session = createTavusDemoSession({
    container: $("#bird-widget-host"),
    deploymentId: configuration.deploymentId,
    context: conversationContext(),
    controller,
    toolBridge: bridge,
    onState: showSession,
    createWidget: () => {
      const element = document.createElement(
        surface === "embed" ? "tavus-embed" : "tavus-widget",
      );
      if (surface === "embed")
        element.setAttribute(
          "expand-options",
          JSON.stringify({ enabled: false }),
        );
      return element;
    },
  });
  session.start();
}

async function manualView(action) {
  await cityPresentation.ready;
  if (!cityPresentation.getAvailable())
    return { ok: false, code: "SCENE_UNAVAILABLE" };
  controller.startSession();
  if (action === "overview") {
    $("#bird-demo-view-title").textContent = "Tu empresa, de un vistazo";
    $("#bird-demo-view-detail").textContent =
      "Ventas, conversaciones y operaciones en la misma ciudad.";
    return controller.executeInternalCommand({
      action: "overview",
      duration: 2.5,
    });
  }
  const { crm, industry } = cityPresentation.getSnapshot();
  if (action === "sales") {
    const deal = crm.deals.find((d) =>
      ["lead", "qualified", "proposal", "negotiation"].includes(d.stageId),
    );
    if (!deal) return { ok: false, code: "TARGET_UNAVAILABLE" };
    currentTarget = { kind: "deal", id: deal.id };
    $("#bird-demo-view-title").textContent = deal.name;
    $("#bird-demo-view-detail").textContent =
      `${new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(deal.amount)} · Oportunidad comercial · No es un cobro`;
    return controller.executeInternalCommand({
      action: "focus",
      target: currentTarget,
      duration: 3,
    });
  }
  if (action === "industry") {
    currentTarget = { kind: "industry-stage", id: "manufacturing" };
    $("#bird-demo-view-title").textContent = "Fabricación y distribución";
    $("#bird-demo-view-detail").textContent =
      `${industry.batches.reduce((sum, b) => sum + b.quantity, 0)} unidades trazadas. Las entregas están registradas; la ruta es estimada.`;
    return controller.executeInternalCommand({
      action: "focus",
      target: currentTarget,
      duration: 3,
    });
  }
  if (action === "highlight")
    return controller.executeInternalCommand({
      action: "animation",
      animation: "pulse",
      target: currentTarget,
      duration: 5,
    });
  return { ok: false, code: "UNKNOWN_ACTION" };
}

panel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-demo-action]");
  if (!button || !panel.contains(button) || button.disabled) return;
  const action = button.dataset.demoAction;
  if (action === "start") beginConversation();
  else if (action === "stop") session?.stop();
  else if (action === "interrupt") session?.interrupt();
  else
    void manualView(action).then((result) => {
      if (!result.ok)
        $("#bird-demo-view-detail").textContent =
          `No se ha ejecutado la acción: ${result.code}`;
    });
});

async function boot() {
  configuration = await readConfiguration();
  await cityPresentation.ready;
  if (disposed) return;
  if (configuration.contractSource === "bundled")
    configuration.contracts = loadTavusToolContracts(
      createExistingAgentContracts(cityPresentation.getSnapshot()),
    );
  else if (!configuration.contracts)
    configuration.contracts = loadTavusToolContracts(null);
  if (!cityPresentation.getAvailable())
    $("#bird-demo-message").textContent =
      "La ciudad 3D no se ha podido iniciar en este navegador. La vista de tabla sigue disponible.";
  else if (!configuration.configured)
    $("#bird-demo-message").textContent =
      "Falta el Deployment ID del widget de Tavus. No se ha iniciado ninguna conversación.";
  else
    $("#bird-demo-message").textContent =
      "Pulsa Iniciar cuando quieras hablar. El navegador te pedirá permiso si es necesario.";
  $("#bird-demo-config-hint").textContent = configuration.contracts?.ready
    ? "Controles del agente configurados · Datos ficticios"
    : "Control por voz del mapa pendiente: faltan los esquemas exportados de las herramientas del agente. Los botones manuales ya funcionan.";
  showSession();
  if (!configuration.configured)
    $("#bird-demo-status").textContent = "Configuración de Tavus pendiente";
}

function cleanup() {
  disposed = true;
  session?.dispose();
  controller.endSession();
}
window.addEventListener("pagehide", cleanup, { once: true });
window.__BIRD_DEMO__ = Object.freeze({
  getState: () => ({
    configuration: configuration
      ? {
          configured: configuration.configured,
          contractsReady: !!configuration.contracts?.ready,
        }
      : null,
    session: session?.getState() || {
      status: "idle",
      microphone: "not-requested",
    },
  }),
  manualTour: manualView,
});
void boot();
