const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("es-ES");
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({ check: '<path d="m5 12 4 4L19 6"/>', arrow: '<path d="M7 17 17 7M7 7h10v10"/>', attention: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>', trend: '<path d="m3 16 6-6 4 4 8-10M15 4h6v6"/>' })[name]}</svg>`;

// Coordinates are projections of the five district plaques in birdview-city.webp,
// using the same orthographic camera as /tmp/bird-landing-render-assets.mjs.
const neighborhoods = {
  lead: { x: 28.74, y: 49.14, color: "#41769e", owner: "Equipo comercial", heading: "El próximo negocio empieza aquí.", action: "Prioriza los contactos que todavía esperan respuesta." },
  qualified: { x: 36.68, y: 55.16, color: "#2d7b74", owner: "Lucía Costa", heading: "El interés ya tiene recorrido.", action: "Comprueba qué oportunidades están listas para una propuesta." },
  proposal: { x: 44.50, y: 61.09, color: "#9b6e20", owner: "Ana Gil", heading: "Propuestas con una decisión pendiente.", action: "Mira cuánto valor está esperando el siguiente paso." },
  negotiation: { x: 52.31, y: 67.02, color: "#8459a4", owner: "Marc Ruiz", heading: "Una negociación que merece tu atención.", action: "Una oportunidad lleva cinco días sin actividad. Revisa el siguiente paso con Marc." },
  won: { x: 60.25, y: 73.04, color: "#30744f", owner: "Todo el equipo", heading: "Los resultados también tienen barrio.", action: "Cuatro ventas ganadas este mes. El objetivo de cierre está al 75 %." },
};

function view(snapshot) {
  return { stages: snapshot?.stages || [], reps: snapshot?.reps || [], totals: snapshot?.totals || {}, recentWin: snapshot?.recentWin || {} };
}

function count(value, format = "eur", extra = "") {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `<span data-count-to="${safe}" data-count-format="${format}" ${extra}>${format === "eur" ? money.format(safe) : integer.format(safe)}</span>`;
}

function detailMarkup(stage) {
  const context = neighborhoods[stage.id] || neighborhoods.lead;
  const attention = Number(stage.attention || 0);
  return `<div class="bv-map-detail-copy"><span class="bv-map-detail-eyebrow"><i style="--stage-color:${context.color}"></i>${escape(stage.label)}</span><h3>${context.heading}</h3><p>${escape(stage.signal || context.action)}</p></div><dl class="bv-map-detail-values"><div><dt>${stage.id === "won" ? "Ganado este mes" : "Valor en esta etapa"}</dt><dd>${money.format(stage.value)}</dd></div><div><dt>${stage.id === "won" ? "Ventas ganadas" : "Oportunidades"}</dt><dd>${integer.format(stage.count)}</dd></div><div><dt>Responsable${context.owner.includes("equipo") || context.owner.includes("Equipo") ? "s" : ""}</dt><dd>${context.owner}</dd></div></dl><button class="bv-map-detail-action${attention ? " has-attention" : ""}" data-map-explore="sales">${attention ? `${icon("attention")} ${attention} ${attention === 1 ? "necesita" : "necesitan"} atención` : `Ver el pipeline ${icon("arrow")}`}</button>`;
}

/** Render the map and its explanatory UI; the caller retains the outer caption. */
export function renderLandingMapContext(snapshot) {
  const { stages, reps, totals, recentWin } = view(snapshot);
  const representative = reps.find((person) => person.name?.startsWith("Lucía")) || reps[0] || {};
  const selected = stages.find((stage) => stage.id === "negotiation") || stages[0];
  return `<div class="bv-map-context" data-map-context data-reveal-sequence>
    <div class="bv-map-scene">
      <div class="bv-map-grid" aria-hidden="true"></div>
      <img class="bv-city-image" src="/assets/landing/birdview-city.webp" alt="Ciudad de BirdView. Los cinco barrios comerciales representan nuevos leads, cualificados, propuestas, negociación y ventas ganadas; detrás aparecen comunicaciones y producción." width="2400" height="1344" loading="lazy" decoding="async">
      <section class="bv-map-kpis" aria-label="Visión ejecutiva, datos de ejemplo" data-map-pipeline data-metric-group data-reveal-item>
        <div><span>Facturado este mes</span><strong>${count(totals.invoiced)}</strong><small>Facturas emitidas</small></div>
        <div><span>Pipeline abierto</span><strong>${count(totals.pipeline)}</strong><small>${integer.format(totals.opportunities || 0)} oportunidades activas</small></div>
        <div class="bv-map-kpi-attention"><span>Necesitan atención</span><strong>${count(totals.attention, "integer")}</strong><small>Para priorizar hoy</small></div>
        <p>UN VISTAZO. TRES PRIORIDADES. <span>Datos de ejemplo</span></p>
      </section>
      <div class="bv-map-stage-list" role="group" aria-label="Explora las cinco etapas del pipeline">
        ${stages.map((stage, index) => { const place = neighborhoods[stage.id] || neighborhoods.lead; return `<button class="bv-map-stage" data-map-stage="${escape(stage.id)}" aria-pressed="${stage.id === selected?.id}" aria-controls="bv-map-detail" style="--stage-x:${place.x}%;--stage-y:${place.y}%;--stage-color:${place.color};--stage-order:${index}" data-reveal-item><span class="bv-map-stage-name"><i>${index + 1}</i>${escape(stage.label)}</span><span class="bv-map-stage-amount">${integer.format(stage.count)} ${stage.id === "won" ? "ganadas" : stage.count === 1 ? "oportunidad" : "oportunidades"}<b> · ${money.format(stage.value)}</b></span><span class="bv-map-stage-stem" aria-hidden="true"></span></button>`; }).join("")}
      </div>
      <button class="bv-map-representative" data-map-rep data-map-explore="team" data-metric-group data-reveal-item><span class="bv-map-avatar" aria-hidden="true">${escape(representative.initials || "LC")}</span><span class="bv-map-rep-copy"><b>${escape(representative.name || "Lucía Costa")}</b><span>${representative.wins || 0} ventas ganadas · ${representative.active || 0} abiertas</span><strong>${count(representative.wonValue)} <small>ganados este mes</small></strong></span>${icon("arrow")}</button>
      <aside class="bv-map-achievement" aria-label="Ejemplo de una venta ganada" data-map-win data-metric-group data-reveal-item><span class="bv-map-achievement-check">${icon("check")}</span><div><span>ASÍ SE VE UN NUEVO LOGRO</span><b>¡Venta ganada!</b><p>${escape(recentWin.company)} · ${escape(recentWin.owner)}</p></div><strong>+${count(recentWin.value)}</strong></aside>
      <p class="bv-map-instruction">Cinco barrios. Un pipeline. <span>Pulsa una etapa para entender qué ocurre.</span></p>
    </div>
    <section class="bv-map-detail" id="bv-map-detail" data-map-detail aria-label="Detalle de la etapa seleccionada" aria-live="polite" aria-atomic="true">${selected ? detailMarkup(selected) : ""}</section>
  </div>`;
}

/** Event-only controller. Motion and counters share the landing's observer/clock. */
export function createLandingMapContext({ container, snapshot, onExplore = () => {} }) {
  const root = container.matches?.("[data-map-context]") ? container : container.querySelector("[data-map-context]");
  if (!root) throw new Error("Landing map context was not rendered.");
  const data = view(snapshot);
  let activeStage = data.stages.some((stage) => stage.id === "negotiation") ? "negotiation" : data.stages[0]?.id;
  let disposed = false;
  const buttons = [...root.querySelectorAll("[data-map-stage]")];
  const detail = root.querySelector("[data-map-detail]");
  function selectStage(id, { focus = false } = {}) {
    if (disposed) return false;
    const stage = data.stages.find((entry) => entry.id === id);
    if (!stage) return false;
    activeStage = id;
    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(button.dataset.mapStage === id));
      if (focus && button.dataset.mapStage === id) button.focus();
    }
    detail.innerHTML = detailMarkup(stage);
    root.dataset.activeStage = id;
    return true;
  }
  const click = (event) => {
    const stage = event.target.closest("[data-map-stage]");
    const explore = event.target.closest("[data-map-explore]");
    if (stage && root.contains(stage)) selectStage(stage.dataset.mapStage);
    if (explore && root.contains(explore)) onExplore(explore.dataset.mapExplore);
  };
  const keydown = (event) => {
    const button = event.target.closest("[data-map-stage]");
    if (!button || !root.contains(button)) return;
    const current = buttons.indexOf(button);
    const destination = event.key === "ArrowRight" || event.key === "ArrowDown" ? (current + 1) % buttons.length : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (current + buttons.length - 1) % buttons.length : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : null;
    if (destination !== null) { event.preventDefault(); selectStage(buttons[destination].dataset.mapStage, { focus: true }); }
  };
  root.dataset.activeStage = activeStage || "";
  root.addEventListener("click", click);
  root.addEventListener("keydown", keydown);
  return {
    selectStage,
    getState: () => ({ activeStage, stageCount: buttons.length, disposed }),
    dispose() { if (disposed) return; disposed = true; root.removeEventListener("click", click); root.removeEventListener("keydown", keydown); },
  };
}
