import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import { LANDING_EXAMPLE } from "./executive-data.js";
import { createLandingMotion } from "./motion.js";
import { renderLandingMapContext, createLandingMapContext } from "./map-context.js";
import { renderDirectorStory, createDirectorStory } from "./director-story.js";
import "./style.css";
import "./map-context.css";
import "./director-story.css";
import "./motion.css";

const productUrl = "https://pipeline-city.vercel.app/";
const asset = (name) => `/assets/landing/birdview-${name}.webp`;
const icons = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  northeast: '<path d="M6 18 18 6M6 6h12v12"/>',
  play: '<path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chart: '<path d="M4 20V9m8 11V4m8 16v-8"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  spark: '<path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2Z"/>',
};
const icon = (name, className = "") => `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const bird = `<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="m4 18 14-5 13-8-7 15-5 14-4-12-11-4Z" fill="currentColor"/><path d="m15 22 9-2-6-7" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
const brand = `<span class="bv-brand-mark">${bird}</span><span class="bv-brand-word">BirdView</span>`;
const external = `href="${productUrl}" target="_blank" rel="noopener noreferrer"`;

document.title = "BirdView — Tu empresa. En perspectiva. · FaradAI";
document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#131917");
const description = document.querySelector('meta[name="description"]') || document.createElement("meta");
description.name = "description";
description.content = "Descubre BirdView, un producto de FaradAI. Una ciudad visual para explorar tus ventas, tu equipo y la actividad de tu negocio. Prueba la demo interactiva.";
if (!description.isConnected) document.head.append(description);

document.querySelector("#app").innerHTML = `
  <a class="bv-skip" href="#birdview-landing">Saltar al contenido</a>
  <header class="bv-header">
    <div class="bv-nav-wrap">
      <a class="bv-brand" href="/page" aria-label="BirdView, inicio">${brand}<span class="bv-brand-origin">by FaradAI</span></a>
      <nav class="bv-nav" aria-label="Navegación principal">
        <a href="#features">Plataforma</a><a href="#direction">Para dirección</a><a href="#how-it-works">Cómo funciona</a>
      </nav>
      <a class="bv-nav-cta" ${external}>Explorar BirdView ${icon("northeast")}</a>
      <button class="bv-menu" data-landing-menu aria-expanded="false" aria-controls="bv-mobile-nav" aria-label="Abrir menú"><span></span><span></span></button>
    </div>
    <nav id="bv-mobile-nav" data-landing-mobile-nav aria-label="Navegación móvil" hidden><a href="#features">Plataforma</a><a href="#direction">Para dirección</a><a href="#how-it-works">Cómo funciona</a><a href="#faq">Preguntas frecuentes</a><a ${external}>Explorar BirdView ${icon("northeast")}</a></nav>
  </header>

  <main id="birdview-landing">
    <section class="bv-hero" aria-labelledby="bv-hero-title">
      <div class="bv-hero-top bv-container"><p class="bv-eyebrow"><i></i> INTELIGENCIA VISUAL PARA TU NEGOCIO</p><span>BIRDVIEW / BY FARADAI</span></div>
      <div class="bv-hero-heading bv-container" data-reveal-sequence>
        <div data-reveal-item><h1 id="bv-hero-title">Tu empresa.<br><span>En perspectiva.</span></h1></div>
        <div class="bv-hero-intro" data-reveal-item><p>Los datos de tu CRM, convertidos en una ciudad. Ve qué avanza, qué necesita atención y dónde está tu próxima oportunidad.</p><div class="bv-hero-actions"><a class="bv-button bv-button-blue" ${external}>Explorar BirdView ${icon("northeast")}</a><a class="bv-video-link" href="/demo"><span>${icon("play")}</span> Ver presentación</a></div></div>
      </div>
      <div class="bv-scene-index bv-container"><span><i></i> VISIÓN OPERATIVA / PIPELINE COMERCIAL</span><span>01 — EXPLORA TU EMPRESA</span></div>
      <div class="bv-city-stage">
        ${renderLandingMapContext(LANDING_EXAMPLE)}
        <div class="bv-hero-caption"><span><i></i> Ciudad real de BirdView · Datos de ejemplo</span><a href="#direction">DEL DATO A LA DECISIÓN ${icon("down")}</a><span>FARADAI / BIRDVIEW</span></div>
      </div>
    </section>

    <div class="bv-value-strip bv-container" data-reveal-sequence><div data-reveal-item><span>01 / VISIBILIDAD</span><p>El negocio, en una misma vista.</p></div><div data-reveal-item><span>02 / CONTEXTO</span><p>Las personas detrás de cada cifra.</p></div><div data-reveal-item><span>03 / DIRECCIÓN</span><p>Más claridad para decidir.</p></div></div>

    ${renderDirectorStory(LANDING_EXAMPLE)}

    <section class="bv-features bv-container" id="features" aria-labelledby="bv-features-title">
      <div class="bv-section-heading"><div><p class="bv-eyebrow">[02] / EXPLORA LA PLATAFORMA</p><h2 id="bv-features-title">Cada dato.<br>Con su contexto.</h2></div><p>Una oportunidad, una persona, una conversación.<br>Entiende cómo se conecta todo.</p></div>
      <div class="bv-feature-tabs" role="tablist" aria-label="Perspectivas de BirdView"><button id="bv-tab-sales" role="tab" data-feature-tab="sales" aria-controls="bv-panel-sales" aria-selected="true" tabindex="0">${icon("chart")} Tus ventas <span>01</span></button><button id="bv-tab-team" role="tab" data-feature-tab="team" aria-controls="bv-panel-team" aria-selected="false" tabindex="-1">${icon("people")} Tu equipo <span>02</span></button><button id="bv-tab-activity" role="tab" data-feature-tab="activity" aria-controls="bv-panel-activity" aria-selected="false" tabindex="-1">${icon("message")} La actividad <span>03</span></button></div>
      <div class="bv-feature-panel" id="bv-panel-sales" data-feature-panel="sales" role="tabpanel" aria-labelledby="bv-tab-sales">
        <div class="bv-feature-copy"><span class="bv-feature-number">01 / VENTAS</span><h3>Cada oportunidad<br>tiene su lugar.</h3><p>Tu pipeline se convierte en barrios. Los edificios muestran las oportunidades y la ciudad cambia cuando una venta avanza.</p><ul><li>${icon("check")} Identifica la etapa de cada oportunidad.</li><li>${icon("check")} Reconoce dónde se concentra el valor.</li><li>${icon("check")} Celebra los acuerdos ganados.</li></ul><a ${external}>Recorrer el pipeline ${icon("northeast")}</a></div><div class="bv-feature-visual"><img src="${asset("sales")}" alt="Detalle del barrio comercial de BirdView con oportunidades representadas como edificios" width="1600" height="1000" loading="lazy"><div class="bv-visual-tag"><i></i> De nuevo lead a venta ganada</div></div>
      </div>
      <div class="bv-feature-panel" id="bv-panel-team" data-feature-panel="team" role="tabpanel" aria-labelledby="bv-tab-team" hidden>
        <div class="bv-feature-copy"><span class="bv-feature-number">02 / EQUIPO</span><h3>El trabajo de tu equipo<br>cobra vida.</h3><p>Las personas forman parte del mapa. Relaciona las oportunidades con sus responsables y sigue el recorrido del equipo por la ciudad.</p><ul><li>${icon("check")} Identifica a los responsables.</li><li>${icon("check")} Pon contexto a cada oportunidad.</li><li>${icon("check")} Comparte una misma visión del negocio.</li></ul><a href="/demo">Conocer la presentación ${icon("northeast")}</a></div><div class="bv-feature-visual"><img src="${asset("team")}" alt="Un comercial junto a un edificio de la ciudad, acompañando el avance de una venta" width="1600" height="1000" loading="lazy"><div class="bv-visual-tag"><i></i> Personas detrás de cada oportunidad</div></div>
      </div>
      <div class="bv-feature-panel" id="bv-panel-activity" data-feature-panel="activity" role="tabpanel" aria-labelledby="bv-tab-activity" hidden>
        <div class="bv-feature-copy"><span class="bv-feature-number">03 / ACTIVIDAD</span><h3>Las conversaciones<br>también tienen barrio.</h3><p>Correos, llamadas y reuniones encuentran su lugar. Una oficina de correos, una central de llamadas o una cafetería hacen visible la actividad que mueve tu negocio.</p><ul><li>${icon("check")} Da contexto a los contactos con clientes.</li><li>${icon("check")} Reúne los canales en una misma vista.</li><li>${icon("check")} Entiende la actividad de un vistazo.</li></ul><a ${external}>Descubrir la actividad ${icon("northeast")}</a></div><div class="bv-feature-visual"><img src="${asset("activity")}" alt="Barrio de comunicaciones con la oficina de correos, la central de llamadas y la cafetería de reuniones" width="1600" height="1000" loading="lazy"><div class="bv-visual-tag"><i></i> Cada conversación cuenta</div></div>
      </div>
      <p class="bv-example-note">Imágenes de la demo de BirdView. Todos los datos y eventos mostrados son ejemplos.</p>
    </section>

    <section class="bv-how" id="how-it-works" aria-labelledby="bv-how-title"><div class="bv-container">
      <div class="bv-section-heading"><div><p class="bv-eyebrow">[03] / DE LOS DATOS A LA VISIÓN</p><h2 id="bv-how-title">Tu información.<br>Una nueva dimensión.</h2></div><a class="bv-text-link" href="/demo">Verlo en movimiento ${icon("northeast")}</a></div>
      <div class="bv-steps"><article><span class="bv-step-number">01</span><div class="bv-step-illustration bv-data-illustration" aria-hidden="true"><i></i><i></i><i></i><span>${icon("layers")}</span></div><h3>Tu negocio tiene la historia.</h3><p>Oportunidades, responsables y actividades. La información de tu empresa es el punto de partida.</p></article><article><span class="bv-step-number">02</span><div class="bv-step-illustration bv-blocks-illustration" aria-hidden="true"><i></i><i></i><i></i></div><h3>BirdView le da forma.</h3><p>Cada etapa se convierte en un barrio. Cada oportunidad, en un edificio. El conjunto empieza a tener sentido.</p></article><article><span class="bv-step-number">03</span><div class="bv-step-illustration bv-view-illustration" aria-hidden="true">${icon("eye")}<i></i><i></i><i></i></div><h3>Exploras. Entiendes. Decides.</h3><p>Acércate a los detalles, detecta dónde prestar atención y comparte el mapa con tu equipo.</p></article></div>
      <div class="bv-how-note"><span>${icon("spark")} Pruébalo a tu ritmo.</span><p>La demo ya tiene una ciudad preparada con datos de ejemplo. Puedes entrar y explorar directamente desde el navegador.</p><a ${external}>Abrir demo ${icon("arrow")}</a></div>
    </div></section>

    <section class="bv-possibilities bv-container" aria-labelledby="bv-possibilities-title"><div><p class="bv-eyebrow">[04] / MÁS ALLÁ DE LA VENTA</p><h2 id="bv-possibilities-title">Una empresa.<br><span>Todas sus conexiones.</span></h2><p>De la producción al almacén. Del reparto al cliente. La presentación de BirdView explora también el recorrido industrial, con cada proceso en su lugar.</p><a class="bv-text-link" href="/demo">Explorar las operaciones ${icon("northeast")}</a></div><div class="bv-industry-visual"><img src="${asset("industry")}" alt="Zona industrial de la demo con fábrica, almacén y vehículos de reparto" width="1600" height="1000" loading="lazy"><span>FABRICAR → PREPARAR → ENTREGAR</span></div></section>

    <section class="bv-faq bv-container" id="faq" aria-labelledby="bv-faq-title"><div><p class="bv-eyebrow">[05] / PREGUNTAS FRECUENTES</p><h2 id="bv-faq-title">Las cosas,<br>claras.</h2><p>Lo esencial para conocer BirdView.</p></div><div class="bv-questions">
      <details><summary>¿Qué es exactamente BirdView? ${icon("plus")}</summary><p>BirdView es un producto de FaradAI que representa la información de una empresa como una ciudad visual. Las oportunidades son edificios; las etapas, barrios; y la actividad se convierte en movimiento. Su objetivo es ayudarte a entender el negocio de un vistazo.</p></details>
      <details><summary>¿Puedo probarlo sin conectar mi CRM? ${icon("plus")}</summary><p>Sí. La demo funciona desde el navegador con datos de ejemplo. Puedes explorar la ciudad o abrir la presentación guiada de cuatro minutos, sin configurar una conexión ni activar el asistente virtual.</p></details>
      <details><summary>¿Sustituye a mi CRM? ${icon("plus")}</summary><p>BirdView está planteado como una capa visual sobre la información de tu CRM. La idea es que puedas interpretar tus datos desde otra perspectiva y seguir utilizando tus herramientas de trabajo.</p></details>
      <details><summary>¿Ya puedo conectar los datos de mi empresa? ${icon("plus")}</summary><p>Esta versión es una demostración funcional con datos ficticios. Las conexiones a datos reales requieren adaptar y configurar un conector para cada sistema. La demo no importa ni modifica la información de tu empresa.</p></details>
      <details><summary>¿Para qué tipo de empresa está pensado? ${icon("plus")}</summary><p>El ejemplo comercial permite explorar ventas, responsables y conversaciones. El recorrido industrial amplía el concepto a fabricación, stock y entrega. La representación y los datos deberán adaptarse a los procesos de cada empresa.</p></details>
    </div></section>

    <section class="bv-final-cta" aria-labelledby="bv-cta-title"><div class="bv-container"><div class="bv-cta-top"><p class="bv-eyebrow">EL SIGUIENTE PASO EMPIEZA POR VERLO.</p><span aria-hidden="true">${bird}</span></div><h2 id="bv-cta-title">Cambia la perspectiva.<br>Cambia lo que viene.</h2><div class="bv-cta-bottom"><a class="bv-button bv-button-light" ${external}>Entrar en BirdView ${icon("northeast")}</a><span class="bv-cta-note">DEMO INTERACTIVA / DATOS DE EJEMPLO / EN TU NAVEGADOR</span></div></div></section>
  </main>
  <footer class="bv-footer bv-container"><div><a class="bv-brand" href="/page" aria-label="BirdView, volver al inicio">${brand}</a><p>Una nueva perspectiva para tu negocio.</p></div><div class="bv-footer-company"><span>UN PRODUCTO DE</span><b>${icon("spark")} FaradAI</b><small>© ${new Date().getFullYear()} FaradAI</small></div><nav aria-label="Enlaces del pie"><a href="#features">El producto</a><a href="/demo">Ver presentación ${icon("northeast")}</a><a href="#faq">Preguntas frecuentes</a></nav><div class="bv-footer-bottom"><span>Hecho para ver las cosas de otra manera.</span><a href="#birdview-landing">Volver arriba ↑</a></div></footer>
`;

const menu = document.querySelector("[data-landing-menu]");
const mobileNav = document.querySelector("[data-landing-mobile-nav]");
const closeMenu = () => { menu.setAttribute("aria-expanded", "false"); menu.setAttribute("aria-label", "Abrir menú"); mobileNav.hidden = true; };
menu.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  mobileNav.hidden = !open;
});
mobileNav.addEventListener("click", (event) => { if (event.target.closest("a")) closeMenu(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !mobileNav.hidden) { closeMenu(); menu.focus(); } });
matchMedia("(min-width: 901px)").addEventListener("change", (event) => { if (event.matches) closeMenu(); });

let motion = null;
const tabs = [...document.querySelectorAll("[data-feature-tab]")];
function selectFeature(id, focus = false) {
  for (const tab of tabs) {
    const selected = tab.dataset.featureTab === id;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  for (const panel of document.querySelectorAll("[data-feature-panel]")) panel.hidden = panel.dataset.featurePanel !== id;
  motion?.refresh();
}
for (const [index, tab] of tabs.entries()) {
  tab.addEventListener("click", () => selectFeature(tab.dataset.featureTab));
  tab.addEventListener("keydown", (event) => {
    const destination = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
    if (destination !== null) { event.preventDefault(); selectFeature(tabs[destination].dataset.featureTab, true); }
  });
}
function exploreFeature(id) {
  selectFeature(id);
  document.querySelector("#features").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}
const landingRoot = document.querySelector("#birdview-landing");
const mapContext = createLandingMapContext({ container: landingRoot, snapshot: LANDING_EXAMPLE, onExplore: exploreFeature });
const directorStory = createDirectorStory({ container: landingRoot, snapshot: LANDING_EXAMPLE, onChange: () => motion?.refresh() });
motion = createLandingMotion({ root: landingRoot });
window.__BIRD_LANDING_MOTION__ = motion;
window.__BIRD_LANDING__ = Object.freeze({ getState: () => ({ example: LANDING_EXAMPLE, motion: motion.getState(), map: mapContext.getState(), director: directorStory.getState() }) });

function cleanup(event) {
  if (event.persisted) return;
  motion.dispose();
  mapContext.dispose();
  directorStory.dispose();
  window.removeEventListener("pagehide", cleanup);
}
window.addEventListener("pagehide", cleanup);

const appear = [...document.querySelectorAll(".bv-section-heading, .bv-perspective, .bv-steps > article, .bv-possibilities")];
if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) appear.forEach(element => element.classList.add("is-visible"));
else {
  const observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } }, { threshold: 0.08 });
  for (const element of appear) { element.classList.add("bv-reveal"); observer.observe(element); }
}
