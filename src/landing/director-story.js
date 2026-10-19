const STEPS = ["overview", "attention", "team"];
const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const paths = {
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chart: '<path d="M4 19h16M6 15l4-5 4 3 5-8"/><path d="M15 5h4v4"/>',
  attention: '<path d="m10.2 4.8-7 12.1A2 2 0 0 0 4.9 20h14.2a2 2 0 0 0 1.7-3.1l-7-12.1a2.1 2.1 0 0 0-3.6 0Z"/><path d="M12 9v4m0 3h.01"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const metric = (value, format = "eur", className = "", key = "") => `<span class="${className}"${key ? ` data-kpi="${escape(key)}"` : ""} data-count-to="${Number(value) || 0}" data-count-format="${format}">${format === "eur" ? euro.format(Number(value) || 0) : `${Number(value) || 0}${format === "percent" ? " %" : ""}`}</span>`;

function dataFor(snapshot = {}) {
  const totals = snapshot.totals || {};
  return {
    totals: {
      invoiced: Number(totals.invoiced) || 0,
      pendingInvoice: Number(totals.pendingInvoice) || 0,
      won: Number(totals.won) || 0,
      target: Number(totals.target) || 0,
      pipeline: Number(totals.pipeline) || 0,
      attention: Number(totals.attention) || 0,
    },
    reps: Array.isArray(snapshot.reps) ? snapshot.reps : [],
    attention: Array.isArray(snapshot.attention) ? snapshot.attention : [],
  };
}

/** Render a compact, read-only executive story from the shared example snapshot. */
export function renderDirectorStory(snapshot) {
  const { totals, reps, attention } = dataFor(snapshot);
  const priority = attention[0] || {};
  const leads = attention.filter((item) => item.stageId === "lead");
  const leadAttention = leads.length;
  const featuredRep = reps[0] || {};
  const progress = totals.target > 0 ? Math.round((totals.won / totals.target) * 100) : 0;
  const maximumWon = Math.max(...reps.map((rep) => Number(rep.wonValue) || 0), 1);
  const teamRows = reps.map((rep, index) => `
    <li class="bv-direction-person" data-team-rep="${escape(rep.id)}" data-wins="${Number(rep.wins) || 0}" data-active="${Number(rep.active) || 0}" data-reveal-item>
      <span class="bv-direction-avatar bv-direction-avatar-${index}">${escape(rep.initials)}</span>
      <div><strong>${escape(rep.name)}</strong><span>${Number(rep.wins) || 0} ${Number(rep.wins) === 1 ? "venta ganada" : "ventas ganadas"} · ${Number(rep.active) || 0} en curso</span><i class="bv-direction-person-bar" data-progress-to="${Math.round(((Number(rep.wonValue) || 0) / maximumWon) * 100)}" aria-hidden="true"><i></i></i></div>
      <b>${metric(rep.wonValue)}</b>
    </li>`).join("");

  return `
    <section class="bv-direction bv-container" id="direction" aria-labelledby="bv-direction-title">
      <div class="bv-direction-heading" data-reveal-sequence>
        <div data-reveal-item><p class="bv-eyebrow">PARA QUIEN TOMA LAS DECISIONES</p><h2 id="bv-direction-title">Entender antes.<br><span>Decidir mejor.</span></h2></div>
        <p data-reveal-item>La misma ciudad. Tres preguntas que importan.<br>Ve cómo va el negocio, dónde actuar<br class="bv-direction-desktop-break"> y quién necesita tu apoyo.</p>
      </div>

      <div class="bv-direction-layout">
        <div class="bv-direction-sticky">
          <div class="bv-direction-board" data-director-board data-current-board="overview">
            <div class="bv-direction-board-top"><span><i></i> TU VISIÓN DE DIRECCIÓN</span><small>Datos de ejemplo</small></div>
            <div class="bv-direction-tabs" role="tablist" aria-label="Preguntas de dirección">
              <button id="bv-direction-tab-overview" type="button" role="tab" data-director-tab="overview" aria-controls="bv-direction-panel-overview" aria-selected="true" tabindex="0"><span>01</span> El negocio</button>
              <button id="bv-direction-tab-attention" type="button" role="tab" data-director-tab="attention" aria-controls="bv-direction-panel-attention" aria-selected="false" tabindex="-1"><span>02</span> Prioridades</button>
              <button id="bv-direction-tab-team" type="button" role="tab" data-director-tab="team" aria-controls="bv-direction-panel-team" aria-selected="false" tabindex="-1"><span>03</span> El equipo</button>
            </div>

            <div class="bv-direction-panel" id="bv-direction-panel-overview" data-director-panel="overview" role="tabpanel" aria-labelledby="bv-direction-tab-overview" data-metric-group>
              <div class="bv-direction-panel-heading"><div><span>FACTURADO ESTE MES</span><strong>${metric(totals.invoiced, "eur", "", "invoiced")}</strong></div><span class="bv-direction-status">${icon("chart")} Una lectura de conjunto</span></div>
              <div class="bv-direction-map bv-direction-map-sales"><img src="/assets/landing/birdview-sales.webp" width="1600" height="1000" alt="Las oportunidades comerciales de BirdView distribuidas por barrios" loading="lazy"><div class="bv-direction-map-marker"><span>${icon("check")}</span><div>Ventas ganadas<strong>${metric(totals.won)}</strong></div></div><span class="bv-direction-map-note">Cada edificio, una oportunidad.</span></div>
              <div class="bv-direction-finance"><div><span>Ventas ganadas</span><b>${metric(totals.won, "eur", "", "won")}</b></div><span class="bv-direction-equals" aria-hidden="true">=</span><div><span>Facturado</span><b>${metric(totals.invoiced)}</b></div><span class="bv-direction-equals" aria-hidden="true">+</span><div><span>Por facturar</span><b>${metric(totals.pendingInvoice, "eur", "", "pending-invoice")}</b></div></div>
              <div class="bv-direction-target"><div><span>Objetivo de ventas <b>${euro.format(totals.target)}</b></span><strong>${metric(progress, "percent", "", "target-progress")}</strong></div><span class="bv-direction-progress" data-progress-to="${progress}" role="img" aria-label="${progress} por ciento del objetivo de ventas alcanzado"><i></i></span></div>
            </div>

            <div class="bv-direction-panel" id="bv-direction-panel-attention" data-director-panel="attention" role="tabpanel" aria-labelledby="bv-direction-tab-attention" data-metric-group hidden>
              <div class="bv-direction-panel-heading"><div><span>CUENTAS QUE NECESITAN ATENCIÓN</span><strong>${metric(totals.attention, "integer", "", "attention")}<small> prioridades visibles</small></strong></div><span class="bv-direction-attention-icon">${icon("attention")}</span></div>
              <div class="bv-direction-map bv-direction-map-attention"><img src="/assets/landing/birdview-sales.webp" width="1600" height="1000" alt="Una oportunidad destacada dentro del barrio comercial de la ciudad" loading="lazy"><div class="bv-direction-map-marker bv-direction-map-marker-amber"><span>${icon("attention")}</span><div>${escape(priority.company)}<strong>${euro.format(Number(priority.value) || 0)}</strong></div></div><span class="bv-direction-map-note">La próxima conversación importa.</span></div>
              <div class="bv-direction-priority" data-reveal-sequence><span class="bv-direction-priority-dot" aria-hidden="true"></span><div data-reveal-item><div><strong>${escape(priority.company)}</strong><span>Negociación</span></div><p>${escape(priority.issue)}. Una oportunidad de <b>${euro.format(Number(priority.value) || 0)}</b> que merece una llamada.</p><span class="bv-direction-priority-owner">Responsable: ${escape(priority.owner)}</span></div></div>
              <div class="bv-direction-attention-footer"><span><i></i> ${leadAttention} leads pendientes de primer contacto</span></div><div class="bv-direction-lead-list">${leads.map((lead) => `<div data-attention-company="${escape(lead.id)}"><span><strong>${escape(lead.company)}</strong><small>${escape(lead.owner)}</small></span><b>${euro.format(Number(lead.value) || 0)}</b></div>`).join("")}</div>
            </div>

            <div class="bv-direction-panel" id="bv-direction-panel-team" data-director-panel="team" role="tabpanel" aria-labelledby="bv-direction-tab-team" data-metric-group hidden>
              <div class="bv-direction-panel-heading"><div><span>PERSONAS DETRÁS DE LOS RESULTADOS</span><strong>${metric(totals.won)}<small> ganados</small></strong></div><span class="bv-direction-attention-icon bv-direction-team-icon">${icon("people")}</span></div>
              <div class="bv-direction-map bv-direction-map-team"><img src="/assets/landing/birdview-team.webp" width="1600" height="1000" alt="Un comercial acompañando una oportunidad en la ciudad de BirdView" loading="lazy"><span class="bv-direction-team-badge"><span>${escape(featuredRep.initials)}</span> ${escape(featuredRep.name)} <i></i> En la ciudad</span></div>
              <ul class="bv-direction-team-list" data-reveal-sequence>${teamRows}</ul>
              <p class="bv-direction-team-note">Resultados y carga de trabajo, con su contexto.</p>
            </div>
          </div>
          <p class="bv-direction-example">Escenario ilustrativo del mes. Ventas ganadas, facturación y cobros son conceptos distintos.</p>
        </div>

        <div class="bv-direction-narrative">
          <article class="bv-direction-step is-active" data-director-step="overview" aria-labelledby="bv-direction-question-overview">
            <span class="bv-direction-step-number">01 / PERSPECTIVA</span><h3 id="bv-direction-question-overview">¿Cómo vamos?</h3><p>Hay ${euro.format(totals.won)} en ventas ganadas. Pero ¿cuánto está facturado y cuánto queda por facturar?</p><p>Conecta el resultado con el objetivo. Sin perder de vista qué representa cada cifra.</p><div class="bv-direction-insight">${icon("chart")}<span><strong>El ${progress} % del objetivo, a la vista.</strong>Una imagen para empezar la reunión con contexto.</span></div>
          </article>
          <article class="bv-direction-step" data-director-step="attention" aria-labelledby="bv-direction-question-attention">
            <span class="bv-direction-step-number">02 / PRIORIDADES</span><h3 id="bv-direction-question-attention">¿Dónde debo actuar?</h3><p>Una negociación lleva cinco días sin respuesta. Dos leads esperan su primer contacto.</p><p>Localiza las conversaciones que necesitan un impulso y acércate al detalle desde el mapa.</p><div class="bv-direction-insight bv-direction-insight-amber">${icon("attention")}<span><strong>De ver el dato a saber dónde mirar.</strong>La atención se dirige a lo que la necesita.</span></div>
          </article>
          <article class="bv-direction-step" data-director-step="team" aria-labelledby="bv-direction-question-team">
            <span class="bv-direction-step-number">03 / EQUIPO</span><h3 id="bv-direction-question-team">¿Quién necesita apoyo?</h3><p>Cada oportunidad tiene una persona detrás. Mira sus ventas ganadas junto a los acuerdos que siguen en marcha.</p><p>Habla con tu equipo con el contexto delante. Celebra los avances y decide dónde ayudar.</p><div class="bv-direction-insight">${icon("people")}<span><strong>Más contexto para acompañar al equipo.</strong>Personas, oportunidades y actividad en la misma vista.</span></div>
          </article>
        </div>
      </div>
    </section>`;
}

/** Scroll changes perspective only; the underlying CRM snapshot is never modified. */
export function createDirectorStory({ container, snapshot, onChange } = {}) {
  if (!container?.querySelectorAll) throw new TypeError("A director story container is required.");
  const document = container.ownerDocument;
  const view = document.defaultView;
  const section = container.matches?.("#direction") ? container : container.querySelector("#direction");
  if (!section) throw new TypeError("Render the director story before mounting it.");
  const tabs = [...section.querySelectorAll("[data-director-tab]")];
  const panels = [...section.querySelectorAll("[data-director-panel]")];
  const steps = [...section.querySelectorAll("[data-director-step]")];
  const board = section.querySelector("[data-director-board]");
  const desktop = view.matchMedia("(min-width: 901px)");
  const visibility = new Map();
  const cleanups = [];
  let active = "overview";
  let disposed = false;
  let observer = null;

  function select(id, { focus = false, source = "api" } = {}) {
    if (disposed || !STEPS.includes(id)) return false;
    const changed = active !== id;
    active = id;
    section.dataset.directorActive = id;
    board.dataset.currentBoard = id;
    for (const tab of tabs) {
      const selected = tab.dataset.directorTab === id;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    }
    for (const panel of panels) panel.hidden = panel.dataset.directorPanel !== id;
    for (const step of steps) {
      const selected = step.dataset.directorStep === id;
      step.classList.toggle("is-active", selected);
      if (selected) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
      step.setAttribute("aria-hidden", String(!desktop.matches && !selected));
    }
    if (changed) onChange?.({ active, source, panel: panels.find((panel) => panel.dataset.directorPanel === id) });
    return changed;
  }

  for (const [index, tab] of tabs.entries()) {
    const click = () => select(tab.dataset.directorTab, { source: "tab" });
    const keydown = (event) => {
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
      if (next === null) return;
      event.preventDefault();
      select(tabs[next].dataset.directorTab, { focus: true, source: "keyboard" });
    };
    tab.addEventListener("click", click);
    tab.addEventListener("keydown", keydown);
    cleanups.push(() => { tab.removeEventListener("click", click); tab.removeEventListener("keydown", keydown); });
  }

  function connectScroll() {
    observer?.disconnect();
    visibility.clear();
    select(active);
    if (!desktop.matches || !("IntersectionObserver" in view)) return;
    observer = new view.IntersectionObserver((entries) => {
      if (disposed) return;
      for (const entry of entries) visibility.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
      const visible = steps.filter((step) => (visibility.get(step) || 0) > 0);
      const destination = visible.sort((a, b) => (visibility.get(b) || 0) - (visibility.get(a) || 0))[0];
      if (destination) select(destination.dataset.directorStep, { source: "scroll" });
    }, { rootMargin: "-24% 0px -35% 0px", threshold: [0, 0.05, 0.2, 0.4, 0.65, 1] });
    for (const step of steps) observer.observe(step);
  }

  desktop.addEventListener("change", connectScroll);
  connectScroll();
  return {
    select,
    getState: () => ({ active, desktop: desktop.matches, disposed, panelCount: panels.length, simulated: true, businessMutation: false, snapshotProvided: Boolean(snapshot) }),
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      desktop.removeEventListener("change", connectScroll);
      for (const cleanup of cleanups) cleanup();
      visibility.clear();
    },
  };
}
