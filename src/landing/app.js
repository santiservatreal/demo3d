import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import { LANDING_EXAMPLE } from "./executive-data.js";
import { createLandingMotion } from "./motion.js";
import { renderLandingMapContext, createLandingMapContext } from "./map-context.js";
import { renderDirectorStory, createDirectorStory } from "./director-story.js";
import { createHeroFilm } from "./hero-film.js";
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
document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#f7f7f4");
const description = document.querySelector('meta[name="description"]') || document.createElement("meta");
description.name = "description";
description.content = "Descubre BirdView, un producto de FaradAI. Una ciudad visual para explorar tus ventas, tu equipo y la actividad de tu negocio. Prueba la demo interactiva.";
if (!description.isConnected) document.head.append(description);

document.querySelector("#app").innerHTML = `
  <a class="bv-skip" href="#birdview-landing">Saltar al contenido</a>
  <header class="bv-header" data-over-film>
    <div class="bv-nav-wrap">
      <a class="bv-brand" href="/page" aria-label="BirdView, inicio">${brand}<span class="bv-brand-origin">by FaradAI</span></a>
      <nav class="bv-nav" aria-label="Navegación principal">
        <a href="#city-map">La visión</a><a href="#features">Plataforma</a><a href="#direction">Para dirección</a>
      </nav>
      <a class="bv-nav-cta" ${external}>Explorar BirdView ${icon("northeast")}</a>
      <button class="bv-menu" data-landing-menu aria-expanded="false" aria-controls="bv-mobile-nav" aria-label="Abrir menú"><span></span><span></span></button>
    </div>
    <nav id="bv-mobile-nav" data-landing-mobile-nav aria-label="Navegación móvil" hidden><a href="#city-map">La visión</a><a href="#features">Plataforma</a><a href="#direction">Para dirección</a><a href="#how-it-works">Cómo funciona</a><a href="#faq">Preguntas frecuentes</a><a ${external}>Explorar BirdView ${icon("northeast")}</a></nav>
  </header>

  <main id="birdview-landing">
    <section class="bv-hero" data-hero-film-state="poster" aria-labelledby="bv-hero-title">
      <img class="bv-hero-poster" src="/assets/landing/birdview-hero-poster.webp" width="1600" height="900" alt="" aria-hidden="true" fetchpriority="high">
      <video class="bv-hero-film" data-hero-film muted loop playsinline preload="metadata" poster="/assets/landing/birdview-hero-poster.webp" aria-hidden="true" tabindex="-1"><source src="/assets/landing/birdview-hero-film.mp4" type="video/mp4"></video>
      <div class="bv-hero-shade" aria-hidden="true"></div>
      <div class="bv-hero-content bv-container" data-reveal-sequence>
        <p class="bv-eyebrow" data-reveal-item>BIRDVIEW / UNA NUEVA VISIÓN DE TU NEGOCIO</p>
        <h1 id="bv-hero-title" data-reveal-item>Tu empresa.<br>Como nunca<br class="bv-mobile-break"> la has visto.</h1>
        <div class="bv-hero-intro" data-reveal-item><p>Los datos de tu CRM cobran otra dimensión.<br>Entiende el presente. Ve tu próximo paso.</p><div class="bv-hero-actions"><a class="bv-button bv-button-light" href="/demo">Ver BirdView en acción ${icon("northeast")}</a><a class="bv-video-link" href="#city-map">Explorar la plataforma ${icon("down")}</a></div></div>
      </div>
      <div class="bv-film-caption bv-container"><span>UNA CIUDAD REAL DE BIRDVIEW / DATOS DE EJEMPLO</span><button type="button" data-hero-film-toggle aria-label="Pausar animación" aria-pressed="false"><span data-hero-film-toggle-icon aria-hidden="true">Ⅱ</span><span data-hero-film-toggle-label>Pausar animación</span></button></div>
    </section>

    <section class="bv-introduction bv-container" aria-labelledby="bv-introduction-title" data-reveal-sequence><p class="bv-eyebrow" data-reveal-item>01 / CAMBIA LA PERSPECTIVA</p><div data-reveal-item><h2 id="bv-introduction-title">Una visión compartida de todo lo que mueve tu empresa.</h2><p>Una venta que avanza. Una conversación pendiente. Un equipo que consigue su objetivo. Todo sucede a la vez. Ahora puedes entender cómo se conecta.</p></div></section>

    <section class="bv-perspectives bv-container" aria-labelledby="bv-perspectives-title"><h2 id="bv-perspectives-title">Una plataforma. Todas las perspectivas.</h2><a class="bv-perspective-row" href="#features" data-feature-link="sales"><span><small>01 / EL PIPELINE</small><p>Del primer contacto<br>al acuerdo ganado.</p></span><strong>Ventas</strong>${icon("northeast")}</a><a class="bv-perspective-row" href="#features" data-feature-link="team"><span><small>02 / LAS PERSONAS</small><p>Quienes hacen avanzar<br>tu negocio, a la vista.</p></span><strong>Equipo</strong>${icon("northeast")}</a><a class="bv-perspective-row" href="#operations"><span><small>03 / LOS PROCESOS</small><p>De la fabricación<br>a la entrega.</p></span><strong>Operaciones</strong>${icon("northeast")}</a></section>

    <section class="bv-map-section" id="city-map" aria-labelledby="bv-map-section-title">
      <div class="bv-section-heading bv-container"><div><p class="bv-eyebrow">02 / TU EMPRESA, EN UNA SOLA VISTA</p><h2 id="bv-map-section-title">Del dato al contexto.</h2></div><p>Explora cada etapa. Acércate a las personas.<br>Reconoce dónde está el siguiente paso.</p></div>
      <div class="bv-city-stage">
        ${renderLandingMapContext(LANDING_EXAMPLE)}
        <div class="bv-map-caption"><span>Visualización de ejemplo · Explora las cinco etapas</span><a href="#direction">Una perspectiva para dirigir ${icon("down")}</a></div>
      </div>
    </section>

    ${renderDirectorStory(LANDING_EXAMPLE)}

    <section class="bv-features bv-container" id="features" aria-labelledby="bv-features-title">
      <div class="bv-section-heading"><div><p class="bv-eyebrow">03 / LA PLATAFORMA</p><h2 id="bv-features-title">El negocio no ocurre<br>en silos.</h2></div><p>Ventas, personas y conversaciones.<br>Una visión compartida de lo que importa.</p></div>
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
      <div class="bv-section-heading"><div><p class="bv-eyebrow">04 / UNA NUEVA CAPA DE INTELIGENCIA</p><h2 id="bv-how-title">Tu información.<br>Otra forma de entenderla.</h2></div><a class="bv-text-link" href="/demo">Conocer la experiencia ${icon("northeast")}</a></div>
      <div class="bv-steps"><article><span class="bv-step-number">01</span><h3>El punto de partida:<br>tu negocio.</h3><p>Oportunidades, responsables y actividades. La información de tu empresa es el punto de partida.</p></article><article><span class="bv-step-number">02</span><h3>La perspectiva:<br>una ciudad.</h3><p>Cada etapa se convierte en un barrio. Cada oportunidad, en un edificio. El conjunto empieza a tener sentido.</p></article><article><span class="bv-step-number">03</span><h3>El siguiente paso:<br>tu decisión.</h3><p>Acércate a los detalles, detecta dónde prestar atención y comparte el mapa con tu equipo.</p></article></div>
      <div class="bv-how-note"><span>${icon("spark")} Pruébalo a tu ritmo.</span><p>La demo ya tiene una ciudad preparada con datos de ejemplo. Puedes entrar y explorar directamente desde el navegador.</p><a ${external}>Abrir demo ${icon("arrow")}</a></div>
    </div></section>

    <section class="bv-possibilities bv-container" id="operations" aria-labelledby="bv-possibilities-title"><div class="bv-section-heading"><div><p class="bv-eyebrow">05 / DISTINTAS FORMAS DE TRABAJAR</p><h2 id="bv-possibilities-title">Cada negocio.<br>Su propia perspectiva.</h2></div><p>Escenarios que puedes explorar en la demo.<br>Una representación que se adapta al proceso.</p></div><div class="bv-business-cases"><a class="bv-business-case" href="#features" data-feature-link="sales"><img src="${asset("sales")}" alt="Barrio comercial de BirdView" width="1600" height="1000" loading="lazy"><div><small>01 / COMERCIAL</small><h3>Equipos de ventas</h3><p>Del primer lead al acuerdo.</p><span>Explorar ${icon("northeast")}</span></div></a><a class="bv-business-case" href="#features" data-feature-link="activity"><img src="${asset("activity")}" alt="Barrio de comunicaciones y reuniones de BirdView" width="1600" height="1000" loading="lazy"><div><small>02 / SERVICIOS</small><h3>Empresas de servicios</h3><p>Personas, clientes y conversaciones.</p><span>Explorar ${icon("northeast")}</span></div></a><a class="bv-business-case" href="/demo"><img src="${asset("industry")}" alt="Fábrica, almacén y reparto de la demo de BirdView" width="1600" height="1000" loading="lazy"><div><small>03 / OPERACIONES</small><h3>Industria y logística</h3><p>Fabricación, almacén y entrega.</p><span>Ver presentación ${icon("northeast")}</span></div></a></div><p class="bv-example-note">Visualizaciones de demostración. La conexión y la representación se adaptan a los datos y procesos de cada empresa.</p></section>

    <section class="bv-faq bv-container" id="faq" aria-labelledby="bv-faq-title"><div><p class="bv-eyebrow">06 / PREGUNTAS FRECUENTES</p><h2 id="bv-faq-title">Las cosas,<br>claras.</h2><p>Lo esencial para conocer BirdView.</p></div><div class="bv-questions">
      <details><summary>¿Qué es exactamente BirdView? ${icon("plus")}</summary><p>BirdView es un producto de FaradAI que representa la información de una empresa como una ciudad visual. Las oportunidades son edificios; las etapas, barrios; y la actividad se convierte en movimiento. Su objetivo es ayudarte a entender el negocio de un vistazo.</p></details>
      <details><summary>¿Puedo probarlo sin conectar mi CRM? ${icon("plus")}</summary><p>Sí. La demo funciona desde el navegador con datos de ejemplo. Puedes explorar la ciudad o abrir la presentación guiada de cuatro minutos, sin configurar una conexión ni activar el asistente virtual.</p></details>
      <details><summary>¿Sustituye a mi CRM? ${icon("plus")}</summary><p>BirdView está planteado como una capa visual sobre la información de tu CRM. La idea es que puedas interpretar tus datos desde otra perspectiva y seguir utilizando tus herramientas de trabajo.</p></details>
      <details><summary>¿Ya puedo conectar los datos de mi empresa? ${icon("plus")}</summary><p>Esta versión es una demostración funcional con datos ficticios. Las conexiones a datos reales requieren adaptar y configurar un conector para cada sistema. La demo no importa ni modifica la información de tu empresa.</p></details>
      <details><summary>¿Para qué tipo de empresa está pensado? ${icon("plus")}</summary><p>El ejemplo comercial permite explorar ventas, responsables y conversaciones. El recorrido industrial amplía el concepto a fabricación, stock y entrega. La representación y los datos deberán adaptarse a los procesos de cada empresa.</p></details>
    </div></section>

    <section class="bv-final-cta" aria-labelledby="bv-cta-title"><div class="bv-container"><p class="bv-eyebrow">EL SIGUIENTE PASO</p><h2 id="bv-cta-title">Empieza por verlo.</h2><div class="bv-cta-bands"><a ${external}><span><small>LA PLATAFORMA</small>Explorar la ciudad</span>${icon("arrow")}</a><a href="/demo"><span><small>EL RECORRIDO</small>Ver presentación</span>${icon("arrow")}</a></div></div></section>
  </main>
  <footer class="bv-footer bv-container"><div><a class="bv-brand" href="/page" aria-label="BirdView, volver al inicio">${brand}</a><p>Una nueva perspectiva para tu negocio.</p></div><div class="bv-footer-company"><span>UN PRODUCTO DE</span><b>${icon("spark")} FaradAI</b><small>© ${new Date().getFullYear()} FaradAI</small></div><nav aria-label="Enlaces del pie"><a href="#features">El producto</a><a href="/demo">Ver presentación ${icon("northeast")}</a><a href="#faq">Preguntas frecuentes</a></nav><div class="bv-footer-wordmark" aria-hidden="true">BirdView</div><div class="bv-footer-bottom"><span>Hecho para ver las cosas de otra manera.</span><a href="#birdview-landing">Volver arriba ↑</a></div></footer>
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
for (const link of document.querySelectorAll("[data-feature-link]")) link.addEventListener("click", event => {
  event.preventDefault();
  exploreFeature(link.dataset.featureLink);
});
const landingRoot = document.querySelector("#birdview-landing");
const heroFilm = createHeroFilm({ root: landingRoot.querySelector(".bv-hero") });
const mapContext = createLandingMapContext({ container: landingRoot, snapshot: LANDING_EXAMPLE, onExplore: exploreFeature });
const directorStory = createDirectorStory({ container: landingRoot, snapshot: LANDING_EXAMPLE, onChange: () => motion?.refresh() });
motion = createLandingMotion({ root: landingRoot });
window.__BIRD_LANDING_MOTION__ = motion;
window.__BIRD_HERO_FILM__ = heroFilm;
window.__BIRD_LANDING__ = Object.freeze({ getState: () => ({ example: LANDING_EXAMPLE, motion: motion.getState(), map: mapContext.getState(), director: directorStory.getState(), hero: heroFilm.getState() }) });

function cleanup(event) {
  if (event.persisted) return;
  motion.dispose();
  heroFilm.dispose();
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
