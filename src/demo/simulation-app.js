import { cityPresentation } from "../city/app.js";
import { getPresentationFrame } from "./presentation-state.js";
import { createStoryPlayer } from "./story-player.js";
import { STORY_CHOICES } from "./story-model.js";
import "./style.css";
import "./story.css";

const shell = document.querySelector("#city-app");
shell.classList.add("c-bird-demo", "is-story-presentation");
document.title = "Bird View · Imagina tu empresa";
const root = document.createElement("section");
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({ play: '<path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none"/>', pause: '<path d="M8 5v14M16 5v14"/>', fullscreen: '<path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/>', previous: '<path d="m14 6-6 6 6 6"/>', next: '<path d="m10 6 6 6-6 6"/>', replay: '<path d="M4 10a8 8 0 1 1 2 8M4 4v6h6"/>', arrow: '<path d="M6 18 18 6M6 6h12v12"/>', voice: '<path d="m11 5-6 5H2v4h3l6 5V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>' })[name]}</svg>`;
root.id = "bird-presentation";
root.className = "bird-presentation bird-story";
root.setAttribute("aria-label", "Presentación simulada de Bird View");
root.innerHTML = `
  <div class="bird-story-veil" aria-hidden="true"></div>
  <header class="bird-story-header">
    <a class="bird-story-brand" href="/" aria-label="Volver a Bird View"><span class="bird-story-monogram">b<span>·</span></span><span>Bird View<small>EL NEGOCIO COBRA VIDA</small></span></a>
    <div class="bird-story-header-actions"><span class="bird-story-mode"><i></i> PRESENTACIÓN SIMULADA</span><button data-story-action="fullscreen" aria-label="Pantalla completa" title="Pantalla completa">⛶</button><a href="/" aria-label="Salir de la presentación">Salir ${icon("arrow")}</a></div>
  </header>
  <div class="bird-story-corner" aria-hidden="true"><span>UNA CIUDAD.</span><span>TODA TU EMPRESA.</span></div>
  <div id="bird-story-kpis" class="bird-story-kpis" aria-label="Indicadores del ejemplo"></div>
  <div class="bird-story-copy">
    <p id="bird-story-eyebrow">IMAGINA UNA FORMA DISTINTA DE ENTENDER TU EMPRESA</p>
    <h1 id="bird-story-title">Tu negocio.<br>Un mundo vivo.</h1>
    <p id="bird-story-narration">De los datos a una ciudad que puedes recorrer. Cada barrio, cada movimiento y cada edificio cuentan una historia.</p>
    <p class="bird-story-data">Empresa de ejemplo · Acontecimientos simulados</p>
    <button class="bird-story-start" data-story-action="start" disabled>Preparando la ciudad… <span>↗</span></button>
  </div>
  <div id="bird-story-choices" class="bird-story-choices" aria-label="Elige el recorrido" hidden></div>
  <div id="bird-story-stages" class="bird-story-stages" role="list" aria-label="Etapas del proceso" hidden></div>
  <div id="bird-story-milestone" class="bird-story-milestone" role="status" hidden><span>✦</span><div><small>ASÍ SE VE UN NUEVO LOGRO</small><b>¡Una venta ganada!</b><p>Una nueva historia en el barrio de clientes.</p></div></div>
  <div class="bird-story-guide" aria-label="Guía de presentación"><div class="bird-story-orb" aria-hidden="true"><i></i><i></i><i></i></div><div><span>Tu guía de Bird View</span><b id="bird-story-status" role="status">Preparando la presentación…</b></div><button data-story-action="voice" aria-label="Activar voz del navegador" aria-pressed="false" title="Voz opcional del navegador">♪</button></div>
  <footer class="bird-story-player" aria-label="Controles de la presentación">
    <div class="bird-story-transport"><button data-story-action="previous" aria-label="Plano anterior" title="Plano anterior">‹</button><button data-story-action="pause" class="bird-story-play" aria-label="Reproducir presentación" title="Reproducir presentación">▶</button><button data-story-action="next" aria-label="Plano siguiente" title="Plano siguiente">›</button></div>
    <div class="bird-story-timeline"><div><span id="bird-story-chapter">PRÓLOGO · IMAGINA</span><span id="bird-story-time">00:00</span></div><input id="bird-story-scrubber" type="range" min="0" max="1" step="0.05" value="0" aria-label="Posición en el recorrido"></div>
    <button data-story-action="replay" class="bird-story-replay" aria-label="Repetir desde el principio" title="Repetir desde el principio">↻</button>
    <details class="bird-story-explore"><summary aria-label="Cambiar de recorrido">Recorridos <span>⌄</span></summary><div><button data-story-choice="commercial">Comercial <span>↗</span></button><button data-story-choice="industrial">Industria <span>↗</span></button><button data-story-choice="communications">Comunicaciones <span>↗</span></button><a href="/demo?mode=live">Abrir guía IA <span>↗</span></a></div></details>
  </footer>
  <div id="bird-story-error" role="alert" hidden></div>`;
shell.append(root);
const $ = (selector) => root.querySelector(selector);
for (const name of ["fullscreen", "previous", "next", "replay", "voice"])
  $(`[data-story-action=${name}]`).innerHTML = icon(name);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const time = (seconds) => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, "0")}:${String(Math.floor(Math.max(0, seconds)) % 60).padStart(2, "0")}`;
let ready = false, disposed = false, lastBeat = null, lastFrame = null, lastStatus = null, snapshot = null;
let voiceEnabled = false, speaking = false, utterance = null, voiceBeat = null;
let samplingSeek = false;
let lastVisualPhase = null;
const chapterNames = { intro: "PRÓLOGO · IMAGINA", commercial: "01 · LA HISTORIA DE UNA VENTA", industrial: "02 · DEL PRODUCTO A LA ENTREGA", communications: "03 · CADA CONVERSACIÓN CUENTA" };
const effects = { "assemble-city": "assemble", "sales-transfer": "sale", "celebrate-sale": "sale", "production-flow": "industry", delivery: "industry" };
const choices = [
  ["commercial", "01", "La historia de una venta", "Del primer contacto al confeti.", icon("arrow")],
  ["industrial", "02", "Del producto a la entrega", "Una fábrica que cuenta su historia.", "▦"],
  ["communications", "03", "Cada conversación cuenta", "El pulso humano de tu negocio.", "✳"],
];
$("#bird-story-choices").innerHTML = `<span class="bird-story-choice-label">TÚ ELIGES EL SIGUIENTE CAPÍTULO</span>${choices.map(([id, number, title, detail, icon]) => `<button data-story-choice="${id}"><small>${number}</small><span><b>${title}</b><em>${detail}</em></span><i>${icon}</i></button>`).join("")}`;

function stopSpeech() {
  utterance = null;
  speaking = false;
  window.speechSynthesis?.cancel();
  root.classList.remove("is-speaking");
}
function narrate(frame, state) {
  if (!voiceEnabled || state.status !== "playing" || !frame.narration || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window) || voiceBeat === frame.beatId) return;
  stopSpeech();
  voiceBeat = frame.beatId;
  const line = new SpeechSynthesisUtterance(frame.narration);
  line.lang = "es-ES";
  line.rate = 0.98;
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((item) => item.lang === "es-ES") || voices.find((item) => item.lang.startsWith("es"));
  if (voice) line.voice = voice;
  utterance = line;
  line.onstart = () => { if (utterance === line) { speaking = true; root.classList.add("is-speaking"); } };
  line.onend = line.onerror = () => { if (utterance === line) { speaking = false; root.classList.remove("is-speaking"); } };
  // cancel() clears the queue but keeps the browser's paused flag. A new
  // chapter/replay must resume the engine before queuing its new narration.
  window.speechSynthesis.resume();
  window.speechSynthesis.speak(line);
}
function renderContext(frame) {
  if (!snapshot) return;
  const view = getPresentationFrame(snapshot, { target: frame.target, overview: frame.target?.id === "all" });
  $("#bird-story-kpis").innerHTML = view.kpis.slice(0, 3).map((item) => `<div><small>${escape(item.label)}</small><b>${escape(item.value)}</b></div>`).join("");
  const stages = $("#bird-story-stages");
  stages.hidden = frame.holdingChoice || !view.stages.length || frame.effect === "assemble-city";
  stages.innerHTML = view.stages.map((stage, index) => `<div role="listitem" data-active="${stage.id === view.activeStage}" style="--stage-color:${escape(stage.color)}"><small>${String(index + 1).padStart(2, "0")}</small><span>${escape(stage.label)}</span></div>`).join("");
}
function render(frame, state) {
  if (disposed || !frame) return;
  lastFrame = frame;
  const changed = lastBeat !== frame.beatId || lastStatus !== state.status;
  const idle = state.status === "idle", choice = state.status === "choice";
  root.dataset.status = state.status;
  root.dataset.chapter = frame.chapterId;
  root.dataset.effect = effects[frame.effect] || "none";
  root.dataset.beat = frame.beatId;
  shell.dataset.section = frame.section;
  root.classList.toggle("is-intro", frame.chapterId === "intro");
  root.classList.toggle("is-choice", choice);
  root.classList.toggle("is-idle", idle);
  root.classList.toggle("is-paused", state.status === "paused");
  const visual = ready ? cityPresentation.getScene().presentation.sampleStory?.({ chapterId: frame.chapterId, beatId: frame.beatId, section: frame.section, shotId: `${frame.chapterId}:${frame.beatId}`, seeking: samplingSeek, effect: idle ? "assemble" : effects[frame.effect] || null, progress: idle ? 1 : frame.effectStageProgress, target: frame.target, fromTarget: frame.fromTarget, cameraProgress: idle ? 1 : frame.cameraProgress, camera: true }) : null;
  if (changed) {
    $("#bird-story-eyebrow").textContent = idle ? "IMAGINA UNA FORMA DISTINTA DE ENTENDER TU EMPRESA" : frame.eyebrow;
    $("#bird-story-title").textContent = idle ? "Tu negocio.\nUn mundo vivo." : frame.title;
    $("#bird-story-narration").textContent = idle ? "De los datos a una ciudad que puedes recorrer. Cada barrio, cada movimiento y cada edificio cuentan una historia." : frame.narration;
    $("#bird-story-status").textContent = idle ? "Una historia que puedes explorar" : state.status === "paused" ? "Presentación en pausa" : choice ? "Elige qué quieres descubrir" : voiceEnabled ? "Narración guiada · Voz del navegador" : "Narración guiada · Subtítulos";
    $("#bird-story-choices").hidden = !choice;
    $("[data-story-action=start]").hidden = !idle;
    $("[data-story-action=start]").disabled = !ready;
    $("#bird-story-chapter").textContent = chapterNames[frame.chapterId];
    const pause = $("[data-story-action=pause]");
    pause.innerHTML = icon(state.playing ? "pause" : "play");
    pause.setAttribute("aria-label", state.playing ? "Pausar presentación" : "Reproducir presentación");
    pause.title = `${state.playing ? "Pausar" : "Reproducir"} presentación · Espacio`;
    pause.disabled = !ready || choice;
    $("[data-story-action=previous]").disabled = !ready || idle || !state.canPrevious;
    $("[data-story-action=next]").disabled = !ready || choice || idle;
    $("[data-story-action=replay]").disabled = !ready;
    if (lastBeat !== frame.beatId && !reducedMotion.matches && !idle) $("#bird-story-title").animate?.([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 380, easing: "ease-out" });
  }
  if (changed || visual?.phase !== lastVisualPhase) {
    const target = visual?.effect === "sale" && ["deconstruct", "transport"].includes(visual.phase) ? { kind: "sales-stage", id: "negotiation" } : frame.target;
    renderContext({ ...frame, target });
    lastVisualPhase = visual?.phase;
  }
  const scrubber = $("#bird-story-scrubber");
  scrubber.max = String(frame.chapterDuration);
  scrubber.value = String(frame.chapterElapsed);
  scrubber.disabled = idle || !ready;
  scrubber.style.setProperty("--story-progress", `${100 * frame.chapterProgress}%`);
  $("#bird-story-time").textContent = `${time(frame.chapterElapsed)} / ${time(frame.chapterDuration)}`;
  const milestone = $("#bird-story-milestone");
  milestone.hidden = idle || choice || (frame.effect !== "celebrate-sale" && frame.beatId !== "delivered");
  milestone.querySelector("b").textContent = frame.beatId === "delivered" ? "¡Producto entregado!" : "¡Una venta ganada!";
  milestone.querySelector("p").textContent = frame.beatId === "delivered" ? "Un recorrido completo, del producto al cliente." : "Una nueva historia en el barrio de clientes.";
  if (state.status === "paused") window.speechSynthesis?.pause();
  else if (state.status !== "playing") { stopSpeech(); voiceBeat = null; }
  else narrate(frame, state);
  lastBeat = frame.beatId;
  lastStatus = state.status;
}
const corePlayer = createStoryPlayer({ onFrame: render });
const player = { ...corePlayer,
  seek(seconds) { samplingSeek = true; try { return corePlayer.seek(seconds); } finally { samplingSeek = false; } },
  play(options = {}) { samplingSeek = Number(options.elapsed) > 0; try { return corePlayer.play(options); } finally { samplingSeek = false; } },
};
function error(message) { $("#bird-story-error").hidden = false; $("#bird-story-error").textContent = message; }
function begin() {
  if (!ready || disposed) return;
  stopSpeech(); voiceBeat = null;
  cityPresentation.getScene().presentation.clearStoryEffects();
  if (document.fullscreenEnabled && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  player.play({ chapter: "intro", elapsed: 0 });
}
function pauseOrResume() {
  const { status } = player.getState();
  if (status === "idle") begin();
  else if (status === "playing") player.pause();
  else if (status === "paused") { window.speechSynthesis?.resume(); player.resume(); }
}
root.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-story-choice]");
  if (choice && ready) { stopSpeech(); voiceBeat = null; $(".bird-story-explore").open = false; player.choose(choice.dataset.storyChoice); return; }
  const button = event.target.closest("[data-story-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.storyAction;
  if (action === "start") begin();
  else if (action === "pause") pauseOrResume();
  else if (action === "replay") { stopSpeech(); voiceBeat = null; cityPresentation.getScene().presentation.clearStoryEffects(); player.play({ chapter: "intro", elapsed: 0 }); }
  else if (action === "previous" || action === "next") { stopSpeech(); voiceBeat = null; player[action](); }
  else if (action === "voice") {
    if (!("speechSynthesis" in window)) return error("Este navegador no ofrece narración. Puedes seguir los subtítulos de la presentación.");
    voiceEnabled = !voiceEnabled;
    button.setAttribute("aria-pressed", String(voiceEnabled));
    button.setAttribute("aria-label", voiceEnabled ? "Desactivar voz del navegador" : "Activar voz del navegador");
    button.title = voiceEnabled ? "Desactivar voz del navegador" : "Activar voz del navegador";
    voiceBeat = null;
    if (!voiceEnabled) stopSpeech();
    lastStatus = null;
    render(lastFrame, player.getState());
  } else if (action === "fullscreen") {
    const attempt = document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.();
    attempt?.catch?.(() => { button.title = "La presentación ya ocupa toda la ventana"; });
  }
});
$("#bird-story-scrubber").addEventListener("input", (event) => { stopSpeech(); voiceBeat = null; player.seek(Number(event.target.value)); });
function keydown(event) {
  if (!ready || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(event.target.tagName)) return;
  if (event.code === "Space") { event.preventDefault(); pauseOrResume(); }
  if (event.code === "ArrowRight") { event.preventDefault(); stopSpeech(); voiceBeat = null; player.next(); }
  if (event.code === "ArrowLeft") { event.preventDefault(); stopSpeech(); voiceBeat = null; player.previous(); }
}
function visibility() { if (document.hidden && player.getState().playing) player.pause(); }
document.addEventListener("keydown", keydown);
document.addEventListener("visibilitychange", visibility);
async function boot() {
  try {
    await cityPresentation.ready;
    if (disposed) return;
    if (!cityPresentation.getAvailable()) throw new Error("scene unavailable");
    cityPresentation.getScene().presentation.setCinematicMode(true);
    cityPresentation.getScene().presentation.setCinematicIdle(false);
    snapshot = cityPresentation.getSnapshot(); ready = true;
    $("[data-story-action=start]").innerHTML = `Comenzar presentación ${icon("arrow")}`;
    lastStatus = null;
    player.reset({ autoplay: false });
  } catch {
    error("La ciudad 3D no ha podido iniciarse. Recarga la página en un navegador con WebGL habilitado.");
    $("#bird-story-status").textContent = "No se ha podido cargar la ciudad";
  }
}
function cleanup() {
  if (disposed) return;
  disposed = true; player.dispose(); stopSpeech();
  document.removeEventListener("keydown", keydown);
  document.removeEventListener("visibilitychange", visibility);
  window.removeEventListener("pagehide", pagehide);
  cityPresentation.getScene()?.presentation?.clearStoryEffects?.();
}
function pagehide(event) {
  // Back/forward cache keeps this document alive. Leave the story paused and
  // reusable when the visitor returns, and dispose only on a real unload.
  if (event.persisted) { player.pause(); stopSpeech(); voiceBeat = null; }
  else cleanup();
}
window.addEventListener("pagehide", pagehide);
window.__BIRD_DEMO_SIMULATION__ = Object.freeze({ player, getState: () => ({ ...player.getState(), ready, simulated: true, frame: lastFrame, scene: cityPresentation.getScene()?.presentation?.getState().story || null, narration: { enabled: voiceEnabled, speaking }, tavusLoaded: !!customElements.get("tavus-embed"), choices: STORY_CHOICES }) });
void boot();
