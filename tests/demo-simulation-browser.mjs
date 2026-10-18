import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { getStoryChapter, sampleStory } from "../src/demo/story-model.js";

// Real local WebGL scene. Vendor routes are blocked before navigation, and no
// voice agent double is installed: the default presentation must work offline
// from Tavus and without opening a microphone or consuming conversation time.
const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const output = process.env.CAPTURE_DIR || "/tmp/bird-demo-simulation-qa";
const voiceOnly = process.env.STORY_QA_SCENARIO === "voice";
const closeupsOnly = process.env.STORY_QA_SCENARIO === "closeups";
const storyTour = ["intro", "commercial", "industrial"];
const tourDuration = () => storyTour.reduce((sum, id) => sum + getStoryChapter(id).duration, 0);
const beatAt = (chapterId, beatId) => {
  const beat = getStoryChapter(chapterId).beats.find(entry => entry.id === beatId);
  if (!beat || beat.choice) throw new Error(`Unknown timed beat: ${chapterId}/${beatId}`);
  return beat;
};
const beatTime = (chapterId, beatId, progress = 0.5) => {
  const beat = beatAt(chapterId, beatId);
  return beat.start + beat.duration * progress;
};
await mkdir(output, { recursive: true });
await rm(`${output}/browser-validation.json`, { force: true });
const startedAt = new Date().toISOString();
const results = [], errors = [], requests = [];
const loadedAssets = new Set();
let currentPage, activeScenarioDetail = null;
const vendorHost = (hostname) =>
  /(?:^|\.)(?:tavusapi\.com|tavus\.(?:io|com|dev)|daily\.co)$/i.test(hostname);
const hash = (body) => createHash("sha256").update(body).digest("hex");
async function sourceHashes() {
  const files = ["src/main.js", "package.json", "package-lock.json"];
  for (const directory of ["src/city", "src/demo"])
    for (const name of await readdir(directory))
      if (/\.(js|css)$/.test(name)) files.push(`${directory}/${name}`);
  return Object.fromEntries(await Promise.all(files.sort().map(async name => [name, hash(await readFile(name))])));
}
const sourceSha256 = await sourceHashes();
const state = page => page.evaluate(() => __BIRD_DEMO_SIMULATION__.getState());
async function seek(page, seconds) {
  await page.evaluate(seconds => __BIRD_DEMO_SIMULATION__.player.seek(seconds), seconds);
  await frames(page, 3);
  return state(page);
}
async function seekBeat(page, chapterId, beatId, progress = 0.5) {
  const seconds = beatTime(chapterId, beatId, progress);
  const sampled = await seek(page, seconds);
  expect(sampled.chapterId).toBe(chapterId);
  expect(sampled.frame).toMatchObject(sampleStory(chapterId, seconds));
  return sampled;
}
async function playChapter(page, chapter, elapsed = 0) {
  await page.evaluate(options => __BIRD_DEMO_SIMULATION__.player.play(options), { chapter, elapsed, tour: false });
  return pause(page);
}
async function pause(page) {
  await page.evaluate(() => __BIRD_DEMO_SIMULATION__.player.pause());
  await frames(page, 2);
  return state(page);
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
async function createPage(name, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
  await context.route("**/*", route => vendorHost(new URL(route.request().url()).hostname) ? route.abort("blockedbyclient") : route.continue());
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", error => errors.push({ page: name, message: error.message }));
  page.on("request", request => {
    requests.push({ page: name, url: request.url(), method: request.method() });
    if (/\.(?:js|css)(?:\?|$)/.test(request.url())) loadedAssets.add(new URL(request.url()).pathname);
  });
  await page.addInitScript(() => {
    const media = { getUserMedia: 0, mediaPlay: 0, audioContext: 0, speech: 0 };
    Object.defineProperty(window, "__STORY_QA_MEDIA__", { value: media });
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
      media.getUserMedia++;
      throw new DOMException("QA forbids media capture", "NotAllowedError");
    };
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) { media.mediaPlay++; return originalPlay.apply(this, args); };
    for (const name of ["AudioContext", "webkitAudioContext"]) if (typeof window[name] === "function") {
      const Original = window[name];
      window[name] = new Proxy(Original, { construct(target, args) { media.audioContext++; return Reflect.construct(target, args); } });
    }
    if (window.speechSynthesis) {
      const speak = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak = (...args) => { media.speech++; return speak(...args); };
    }
  });
  currentPage = page;
  return { page, context };
}
async function frames(page, count = 2) {
  await page.evaluate(count => new Promise(resolve => {
    let seen = 0;
    const tick = () => ++seen >= count ? resolve() : requestAnimationFrame(tick);
    requestAnimationFrame(tick);
  }), count);
}
async function boot(page, path = "/demo") {
  const response = await page.goto(new URL(path, base).href);
  expect(response.status()).toBe(200);
  await page.waitForFunction(() => window.__ATLAS_CITY__?.sceneReady);
  await page.evaluate(() => __ATLAS_CITY__.scene.debug.ready);
  if (path.startsWith("/demo") && new URL(path, base).searchParams.get("mode") !== "live")
    await page.waitForFunction(() => window.__BIRD_DEMO_SIMULATION__?.getState);
  await frames(page, 2);
}
async function sources(page) {
  return page.evaluate(() => ({ crm: JSON.stringify(__ATLAS_CITY__.provider.getState()), industry: JSON.stringify(__ATLAS_CITY__.industryProvider.getState()) }));
}
async function camera(page) {
  return page.evaluate(() => {
    const { camera, controls } = __ATLAS_CITY__.scene.debug;
    return { type: camera.type, position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), target: controls.target.toArray(), zoom: camera.zoom };
  });
}
async function assemblyRootScales(page) {
  return page.evaluate(() => {
    const names = new Set(["Atlas streets and civic landscape", "Connected avenues to communications and industry", "CRM district parcels and front plaques", "crm-communications-district"]);
    const roots = [];
    __ATLAS_CITY__.scene.debug.scene.traverse(object => {
      if (names.has(object.name) || object.name.startsWith("Distrito industrial")) roots.push({ id: object.uuid, name: object.name, scale: object.scale.toArray() });
    });
    return roots;
  });
}
async function projectedConfetti(page) {
  return page.evaluate(() => {
    const { scene, camera } = __ATLAS_CITY__.scene.debug;
    const mesh = scene.getObjectByName("Bounded 3D celebration · 112 reusable pieces");
    if (!mesh) return { found: false, visible: false, insideViewport: 0 };
    let visible = true;
    for (let parent = mesh; parent; parent = parent.parent) visible &&= parent.visible;
    const matrix = mesh.matrixWorld.clone(), point = mesh.position.clone();
    let insideViewport = 0;
    const projected = [];
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      point.setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld).project(camera);
      if (point.x >= -1 && point.x <= 1 && point.y >= -1 && point.y <= 1 && point.z >= -1 && point.z <= 1) insideViewport++;
      projected.push([point.x, point.y, point.z]);
    }
    return { found: true, visible, opacity: mesh.material.opacity, insideViewport, instances: mesh.count, projectedBounds: {
      minX: Math.min(...projected.map(p => p[0])), maxX: Math.max(...projected.map(p => p[0])),
      minY: Math.min(...projected.map(p => p[1])), maxY: Math.max(...projected.map(p => p[1])),
    } };
  });
}
async function floatingLabelLayout(page) {
  const layout = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const visible = el => { const r = el.getBoundingClientRect(), style = getComputedStyle(el); return !el.hidden && style.display !== "none" && style.visibility !== "hidden" && r.width > 0 && r.height > 0; };
    const selectors = [".bird-story-copy", ".bird-story-kpis", ".bird-story-header", ".bird-story-player", "#bird-story-stages", ".bird-story-guide", "#bird-story-milestone", "#bird-story-choices", ".bird-story-explore[open]"];
    return {
      state: __BIRD_DEMO_SIMULATION__.getState().labels,
      viewport: { width: innerWidth, height: innerHeight },
      cards: [...document.querySelectorAll(".bird-story-floating-label[data-visible='true']")].map(el => ({ id: el.dataset.labelId, text: el.textContent.trim(), active: el.dataset.active === "true", rect: rect(el) })),
      obstacles: selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(visible).map(el => ({ selector, rect: rect(el) }))),
    };
  });
  const overlaps = (a, b) => a.x < b.right - 0.5 && a.right > b.x + 0.5 && a.y < b.bottom - 0.5 && a.bottom > b.y + 0.5;
  if (layout.state?.mode === "stage") expect(layout.cards.length).toBeLessThanOrEqual(1);
  for (const [index, card] of layout.cards.entries()) {
    expect(card.text.length).toBeGreaterThan(0);
    expect(card.rect.x).toBeGreaterThanOrEqual(-1);
    expect(card.rect.y).toBeGreaterThanOrEqual(-1);
    expect(card.rect.right).toBeLessThanOrEqual(layout.viewport.width + 1);
    expect(card.rect.bottom).toBeLessThanOrEqual(layout.viewport.height + 1);
    for (const other of layout.cards.slice(index + 1)) expect(overlaps(card.rect, other.rect), `${card.id} overlaps ${other.id}`).toBe(false);
    for (const obstacle of layout.obstacles) expect(overlaps(card.rect, obstacle.rect), `${card.id} overlaps ${obstacle.selector}`).toBe(false);
  }
  return layout;
}
async function mediaState(page) {
  return page.evaluate(() => ({
    ...__STORY_QA_MEDIA__,
    embedRegistered: Boolean(customElements.get("tavus-embed")),
    widgetRegistered: Boolean(customElements.get("tavus-widget")),
    tavusElements: document.querySelectorAll("tavus-embed,tavus-widget").length,
    mediaElements: document.querySelectorAll("audio,video").length,
  }));
}
async function noTavus(page) {
  expect(await mediaState(page)).toEqual({ getUserMedia: 0, mediaPlay: 0, audioContext: 0, speech: 0, embedRegistered: false, widgetRegistered: false, tavusElements: 0, mediaElements: 0 });
}
async function screenshot(page, name) {
  // Finish only DOM entrance animations for a readable still. WebGL positions
  // come from the paused story clock; no scene or business state is replaced.
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled", timeout: 60000 });
}
async function fullscreenLayout(page) {
  const state = await page.evaluate(() => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const legacy = [".c-rail", ".c-header", "#city-metrics", "#city-district-nav", ".c-toolbar", "#city-assistant-host", "#city-inspector"];
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      canvasCount: document.querySelectorAll("canvas").length,
      canvas: rect(__ATLAS_CITY__.scene.debug.renderer.domElement),
      visibleLegacy: legacy.filter(selector => [...document.querySelectorAll(selector)].some(el => { const style = getComputedStyle(el), r = el.getBoundingClientRect(); return style.display !== "none" && style.visibility !== "hidden" && r.width > 0 && r.height > 0; })),
      controls: [...document.querySelectorAll("[data-story-action],[data-story-choice]")].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none"; }).map(el => ({ action: el.dataset.storyAction || null, choice: el.dataset.storyChoice || null, bounds: rect(el) })),
    };
  });
  expect(state.canvasCount).toBe(1);
  expect(state.visibleLegacy).toEqual([]);
  expect(Math.abs(state.canvas.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(state.canvas.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(state.canvas.width - state.viewport.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(state.canvas.height - state.viewport.height)).toBeLessThanOrEqual(1);
  expect(state.document.width).toBeLessThanOrEqual(state.viewport.width);
  expect(state.document.height).toBeLessThanOrEqual(state.viewport.height + 1);
  for (const control of state.controls) {
    expect(control.bounds.x).toBeGreaterThanOrEqual(-1);
    expect(control.bounds.y).toBeGreaterThanOrEqual(-1);
    expect(control.bounds.right).toBeLessThanOrEqual(state.viewport.width + 1);
    expect(control.bounds.bottom).toBeLessThanOrEqual(state.viewport.height + 1);
  }
  return state;
}
async function choiceLayout(page) {
  await expect(page.locator("#bird-story-stages")).toBeHidden();
  const layout = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; };
    return { cards: [...document.querySelectorAll("#bird-story-choices button")].map(rect), guide: rect(document.querySelector(".bird-story-guide")), footer: rect(document.querySelector(".bird-story-player")) };
  });
  const overlaps = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
  for (const card of layout.cards) {
    expect(overlaps(card, layout.guide)).toBe(false);
    expect(overlaps(card, layout.footer)).toBe(false);
  }
  return layout;
}
function record(name, detail) { results.push({ name, passed: true, detail }); activeScenarioDetail = null; console.log(`PASS ${name}`); }

async function controlledVoiceScenario() {
  const voice = await createPage("controlled-browser-voice-double-no-real-audio");
  await voice.page.addInitScript(() => {
    const state = { paused: false, speaking: false, calls: [], pauses: 0, resumes: 0, cancels: 0 };
    const engine = {
      get paused() { return state.paused; }, get speaking() { return state.speaking; },
      getVoices() { return [{ name: "QA Spanish voice double", lang: "es-ES", localService: true }]; },
      cancel() { state.cancels++; state.speaking = false; },
      pause() { state.pauses++; state.paused = true; },
      resume() { state.resumes++; state.paused = false; },
      speak(utterance) {
        state.calls.push({ text: utterance.text, lang: utterance.lang, rate: utterance.rate, voice: utterance.voice?.lang || null, pausedAtCall: state.paused });
        if (!state.paused) { state.speaking = true; queueMicrotask(() => utterance.onstart?.()); }
      },
      addEventListener() {}, removeEventListener() {},
    };
    Object.defineProperty(window, "__STORY_QA_VOICE_DOUBLE__", { value: state });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: engine });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: class {
      constructor(text) { this.text = text; }
    } });
  });
  await boot(voice.page);
  await voice.page.waitForFunction(() => __BIRD_DEMO_SIMULATION__.getState().ready);
  const before = await sources(voice.page);
  await voice.page.locator("[data-story-action='voice']").click();
  expect(await voice.page.evaluate(() => __STORY_QA_VOICE_DOUBLE__.calls.length)).toBe(0);
  await voice.page.locator("[data-story-action='start']").click();
  await voice.page.waitForFunction(() => __STORY_QA_VOICE_DOUBLE__.calls.length === 1);
  await voice.page.locator("[data-story-action='pause']").click();
  expect(await voice.page.evaluate(() => __STORY_QA_VOICE_DOUBLE__.paused)).toBe(true);
  await voice.page.locator("[data-story-action='replay']").click();
  await voice.page.waitForFunction(() => __STORY_QA_VOICE_DOUBLE__.calls.length >= 2);
  const replayCall = await voice.page.evaluate(() => __STORY_QA_VOICE_DOUBLE__.calls.at(-1));
  expect(replayCall.pausedAtCall).toBe(false);
  expect(replayCall.lang).toBe("es-ES");
  expect(replayCall.text).toBe(beatAt("intro", "world-assembles").narration);
  await voice.page.locator("[data-story-action='pause']").click();
  await voice.page.locator(".bird-story-explore summary").click();
  await voice.page.locator(".bird-story-explore [data-story-choice='industrial']").click();
  await voice.page.waitForFunction(() => __STORY_QA_VOICE_DOUBLE__.calls.length >= 3);
  const branchCall = await voice.page.evaluate(() => __STORY_QA_VOICE_DOUBLE__.calls.at(-1));
  expect(branchCall.pausedAtCall).toBe(false);
  expect(branchCall.text).toBe(beatAt("industrial", "industry-overview").narration);
  expect(branchCall.voice).toBe("es-ES");
  await voice.page.locator("[data-story-action='voice']").click();
  expect((await state(voice.page)).narration.enabled).toBe(false);
  expect(await sources(voice.page)).toEqual(before);
  await noTavus(voice.page);
  record("controlled-voice-double-resumes-after-pause-replay-and-branch-change", {
    validation: "Explicit local speech double only; no actual speech synthesis or audio output verified",
    state: await voice.page.evaluate(() => __STORY_QA_VOICE_DOUBLE__),
  });
  await voice.context.close();
}

async function closeupScenario() {
  const desktop = await createPage("focused-closeups-desktop");
  await boot(desktop.page);
  await desktop.page.waitForFunction(() => __BIRD_DEMO_SIMULATION__.getState().ready);
  const initial = await sources(desktop.page);
  const saleSteps = [], industrialSteps = [], mobileSteps = [];
  await playChapter(desktop.page, "commercial");
  for (const [beatId, progress, name] of [["sale-deconstruct", 0.6, "04-sale-dismantling"], ["sale-transport", 0.6, "05-sale-truck-in-transit"], ["sale-rebuild", 0.6, "06-sale-rebuilding"], ["sale-won", 0.35, "07-sale-celebration"]]) {
    const sampled = await seekBeat(desktop.page, "commercial", beatId, progress);
    saleSteps.push({ frame: sampled.frame, scene: sampled.scene, camera: await camera(desktop.page), labels: await floatingLabelLayout(desktop.page), ...(beatId === "sale-won" ? { confettiProjection: await projectedConfetti(desktop.page) } : {}) });
    await screenshot(desktop.page, name);
  }
  await playChapter(desktop.page, "industrial");
  for (const [beatId, progress, name] of [["manufacturing", .5, "08-manufacturing"], ["packing", .5, "09-packing"], ["warehouse", .5, "10-warehouse"], ["production-in-motion", .5, "11-production-in-transit"], ["delivery-arrives", .8, "12-delivery-arrives"], ["delivered", .35, "13-product-delivered"]]) {
    const sampled = await seekBeat(desktop.page, "industrial", beatId, progress);
    industrialSteps.push({ frame: sampled.frame, scene: sampled.scene, camera: await camera(desktop.page), labels: await floatingLabelLayout(desktop.page), ...(["delivery-arrives", "delivered"].includes(beatId) ? { confettiProjection: await projectedConfetti(desktop.page) } : {}) });
    await screenshot(desktop.page, name);
  }
  expect(await sources(desktop.page)).toEqual(initial);
  await noTavus(desktop.page);
  await desktop.context.close();
  const mobile = await createPage("focused-closeups-mobile", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await boot(mobile.page);
  await mobile.page.waitForFunction(() => __BIRD_DEMO_SIMULATION__.getState().ready);
  await playChapter(mobile.page, "commercial");
  for (const [beatId, progress] of [["sale-deconstruct", .6], ["sale-won", .35]]) {
    const sampled = await seekBeat(mobile.page, "commercial", beatId, progress);
    mobileSteps.push({ frame: sampled.frame, scene: sampled.scene, camera: await camera(mobile.page), labels: await floatingLabelLayout(mobile.page), layout: await fullscreenLayout(mobile.page), ...(beatId === "sale-won" ? { confettiProjection: await projectedConfetti(mobile.page) } : {}) });
    await screenshot(mobile.page, `mobile-portrait-${beatId}`);
  }
  await mobile.page.setViewportSize({ width: 844, height: 390 });
  await frames(mobile.page, 4);
  mobileSteps.push({ viewport: "landscape", camera: await camera(mobile.page), labels: await floatingLabelLayout(mobile.page), layout: await fullscreenLayout(mobile.page) });
  await screenshot(mobile.page, "mobile-landscape-sale-won");
  await noTavus(mobile.page);
  await mobile.context.close();
  activeScenarioDetail = { saleSteps, industrialSteps, mobileSteps };
  expect(saleSteps.map(step => step.scene.phase)).toEqual(["deconstruct", "transport", "build", "complete"]);
  expect(saleSteps.slice(0, 3).every(step => step.scene.cameraDistance < 24)).toBe(true);
  expect(saleSteps.at(-1).confettiProjection.insideViewport).toBeGreaterThanOrEqual(5);
  expect(industrialSteps.map(step => step.scene.phase)).toEqual(["manufacturing", "packing", "stored", "transit", "delivered", "delivered"]);
  expect(industrialSteps[4].confettiProjection.insideViewport).toBeGreaterThanOrEqual(5);
  expect(mobileSteps[1].confettiProjection.insideViewport).toBeGreaterThanOrEqual(5);
  record("focused-sales-and-industrial-closeups-with-floating-signs-and-mobile-framing", activeScenarioDetail);
}

// Scenario assertions follow the public, read-only presentation diagnostics.
// They intentionally never mutate CRM/ERP data to manufacture an event.
try {
  if (closeupsOnly) await closeupScenario();
  if (!voiceOnly && !closeupsOnly) {
  const desktop = await createPage("desktop-simulation");
  await boot(desktop.page);
  await desktop.page.waitForFunction(() => __BIRD_DEMO_SIMULATION__.getState().ready);
  const initialSources = await sources(desktop.page);
  const initialState = await state(desktop.page);
  const rigidRootScales = await assemblyRootScales(desktop.page);
  expect(rigidRootScales.length).toBeGreaterThan(0);
  const sceneDiagnostics = await desktop.page.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics());
  expect(initialState.simulated).toBe(true);
  expect(initialState.chapterId).toBe("intro");
  expect(initialState.narration.enabled).toBe(false);
  expect(sceneDiagnostics.renderer).toBe("WebGL2");
  expect(sceneDiagnostics.calls).toBeGreaterThan(0);
  expect(sceneDiagnostics.entityCount).toBeGreaterThan(0);
  await noTavus(desktop.page);
  record("default-demo-is-an-immersive-local-presentation-with-no-voice-service", { state: initialState, scene: { renderer: sceneDiagnostics.renderer, renderedCalls: sceneDiagnostics.calls, entityCount: sceneDiagnostics.entityCount }, layout: await fullscreenLayout(desktop.page) });

  await desktop.page.locator("[data-story-action='start']").click();
  await desktop.page.waitForFunction(() => __BIRD_DEMO_SIMULATION__.getState().status === "playing");
  await desktop.page.locator("[data-story-action='pause']").click();
  await desktop.page.waitForFunction(() => __BIRD_DEMO_SIMULATION__.getState().status === "paused");
  const tourInitial = await state(desktop.page);
  expect(tourInitial.tour).toBe(true);
  expect(tourInitial.tourDuration).toBe(tourDuration());
  expect(tourInitial.tourDuration).toBeGreaterThanOrEqual(240);
  await expect(desktop.page.locator("#bird-story-scrubber")).toHaveAttribute("max", String(tourDuration()));
  const tourBoundaries = [];
  let chapterOffset = 0;
  for (const chapterId of storyTour) {
    const chapter = getStoryChapter(chapterId);
    for (const beat of chapter.beats.filter(beat => !beat.choice)) {
      const tourSeconds = chapterOffset + beat.start + beat.duration * 0.5;
      await desktop.page.evaluate(seconds => __BIRD_DEMO_SIMULATION__.player.seekTour(seconds), tourSeconds);
      await frames(desktop.page, 2);
      const sampled = await state(desktop.page);
      expect(sampled.tour).toBe(true);
      expect(sampled.status).toBe("paused");
      expect(sampled.chapterId).toBe(chapterId);
      expect(sampled.frame.beatId).toBe(beat.id);
      expect(sampled.tourElapsed).toBeCloseTo(tourSeconds, 8);
      expect(sampled.holdingChoice).toBe(false);
      tourBoundaries.push({ chapterId, beatId: beat.id, tourElapsed: sampled.tourElapsed, camera: await camera(desktop.page) });
    }
    chapterOffset += chapter.duration;
    await desktop.page.evaluate(seconds => __BIRD_DEMO_SIMULATION__.player.seekTour(seconds), chapterOffset);
    await frames(desktop.page, 2);
    const boundary = await state(desktop.page);
    if (chapterId !== storyTour.at(-1)) {
      expect(boundary.chapterId).toBe(storyTour[storyTour.indexOf(chapterId) + 1]);
      expect(boundary.holdingChoice).toBe(false);
      await expect(desktop.page.locator("#bird-story-choices")).toBeHidden();
    } else {
      expect(boundary.status).toBe("choice");
      expect(boundary.frame.holdingChoice).toBe(true);
    }
  }
  const realTimeTransitions = [];
  for (const [chapter, nextChapter] of [["intro", "commercial"], ["commercial", "industrial"]]) {
    await desktop.page.evaluate(options => __BIRD_DEMO_SIMULATION__.player.play(options), { chapter, elapsed: getStoryChapter(chapter).duration - 0.001, tour: true });
    await frames(desktop.page, 3);
    const advanced = await pause(desktop.page);
    expect(advanced.chapterId).toBe(nextChapter);
    expect(advanced.status).toBe("paused");
    expect(advanced.holdingChoice).toBe(false);
    realTimeTransitions.push({ from: chapter, to: nextChapter, state: advanced });
  }
  expect(await sources(desktop.page)).toEqual(initialSources);
  record("default-presentation-is-a-four-minute-continuous-commercial-and-industrial-story", { duration: tourDuration(), samples: tourBoundaries, realTimeTransitions, final: await state(desktop.page), validation: "Deterministic tour clock sampling across every beat and exact chapter boundary, plus real RAF transitions started immediately before each boundary; not four minutes of real-time playback" });

  await playChapter(desktop.page, "intro");
  const assembling = await seekBeat(desktop.page, "intro", "world-assembles", 0.42);
  expect(assembling.frame.cityProgress).toBeCloseTo(0.42, 10);
  expect(assembling.frame.effect).toBe("assemble-city");
  expect(assembling.scene).toBeTruthy();
  expect(assembling.scene.revealProgress).toBeCloseTo(0.42, 10);
  expect(assembling.scene.geometry.tilesVisible).toBe(true);
  expect(assembling.scene.geometry.tileInstances).toBe(63);
  expect(assembling.scene.geometry.truckVisible).toBe(false);
  expect(assembling.scene.geometry.confettiVisible).toBe(false);
  expect(assembling.scene.geometry.industryParcelsVisible).toBe(false);
  expect(assembling.scene.rendererCount).toBe(0);
  expect(assembling.scene.animationFrameCount).toBe(0);
  expect(assembling.scene.businessMutation).toBe(false);
  await expect(desktop.page.locator("#bird-story-title")).toHaveText(assembling.frame.title);
  await expect(desktop.page.locator("#bird-story-narration")).toHaveText(assembling.frame.narration);
  await screenshot(desktop.page, "01-city-assembling");
  const assemblyCamera = await camera(desktop.page);
  expect(await assemblyRootScales(desktop.page)).toEqual(rigidRootScales);
  const assemblySettlement = [];
  for (const progress of [0.2, 0.4, 0.6, 0.8, 0.94, 0.98, 0.995, 0.99999]) {
    const sampled = await seekBeat(desktop.page, "intro", "world-assembles", progress);
    expect(await assemblyRootScales(desktop.page)).toEqual(rigidRootScales);
    expect(sampled.scene.assembly.rigidRoots).toBe(true);
    expect(sampled.scene.assembly.rootCount).toBeGreaterThan(0);
    expect(sampled.scene.assembly.tileTopMaxY).toBeLessThanOrEqual(sampled.scene.assembly.terrainFloorY + sampled.scene.assembly.terrainOffset - sampled.scene.assembly.foundationClearance + 0.001);
    assemblySettlement.push({ progress, scene: sampled.scene });
  }
  const assembled = await seekBeat(desktop.page, "intro", "neighborhoods");
  expect(assembled.frame.cityProgress).toBe(1);
  expect(assembled.scene.geometry.tilesVisible).toBe(false);
  expect(await camera(desktop.page)).not.toEqual(assemblyCamera);
  await screenshot(desktop.page, "02-city-assembled");
  record("city-assembles-piece-by-piece-and-settles-before-the-neighborhood-tour", { assembling, assemblySettlement, assembled });

  const initialChoice = await seek(desktop.page, getStoryChapter("intro").duration);
  expect(initialChoice.status).toBe("choice");
  expect(initialChoice.frame.holdingChoice).toBe(true);
  const desktopChoiceLayout = await choiceLayout(desktop.page);
  for (const chapter of ["commercial", "industrial", "communications"])
    await expect(desktop.page.locator(`#bird-story-choices [data-story-choice='${chapter}']`)).toBeVisible();
  await screenshot(desktop.page, "03-choose-a-neighborhood");
  await desktop.page.locator("#bird-story-choices [data-story-choice='commercial']").click();
  await desktop.page.waitForFunction(() => __BIRD_DEMO_SIMULATION__.getState().chapterId === "commercial");
  await pause(desktop.page);
  const salesLead = await seekBeat(desktop.page, "commercial", "first-contact");
  expect(salesLead.tour).toBe(false);
  expect(salesLead.frame.target).toEqual({ kind: "sales-stage", id: "lead" });
  expect((await camera(desktop.page)).type).toBe("PerspectiveCamera");
  record("manual-decisions-open-a-standalone-commercial-pipeline", { initialChoice, desktopChoiceLayout, salesLead });
  const commercialLabels = [];
  for (const [beatId, stage] of [["first-contact", "lead"], ["qualified-opportunity", "qualified"], ["the-proposal", "proposal"], ["negotiation", "negotiation"], ["sale-won", "won"]]) {
    await seekBeat(desktop.page, "commercial", beatId, beatId === "sale-won" ? 0.35 : 0.65);
    const layout = await floatingLabelLayout(desktop.page);
    expect(layout.cards).toHaveLength(1);
    expect(layout.cards[0].active).toBe(true);
    expect(layout.cards[0].id).toBe(stage);
    expect(layout.state.activeId).toBe(stage);
    commercialLabels.push({ beatId, stage, layout });
  }
  record("floating-sales-signs-identify-each-pipeline-stage-without-covering-the-interface", { commercialLabels });

  const saleSteps = [];
  for (const [beatId, progress, name] of [
    ["sale-deconstruct", 0.6, "04-sale-dismantling"],
    ["sale-transport", 0.6, "05-sale-truck-in-transit"],
    ["sale-rebuild", 0.6, "06-sale-rebuilding"],
    ["sale-won", 0.35, "07-sale-celebration"],
  ]) {
    const sampled = await seekBeat(desktop.page, "commercial", beatId, progress);
    await expect(desktop.page.locator("#bird-story-title")).toHaveText(sampled.frame.title);
    saleSteps.push({ seconds: beatTime("commercial", beatId, progress), frame: sampled.frame, scene: sampled.scene, camera: await camera(desktop.page), ...(beatId === "sale-won" ? { confettiProjection: await projectedConfetti(desktop.page) } : {}) });
    await screenshot(desktop.page, name);
  }
  activeScenarioDetail = { saleSteps };
  expect(saleSteps[0].camera.position).not.toEqual(saleSteps[2].camera.position);
  expect(saleSteps.slice(0, 3).every(step => step.scene.cameraDistance < 24)).toBe(true);
  expect(saleSteps[0].camera.position[1]).toBeLessThan(14);
  expect(saleSteps[1].camera.position[1]).toBeLessThan(14);
  expect(saleSteps.at(-1).frame.effect).toBe("celebrate-sale");
  expect(saleSteps.map(step => step.scene.phase)).toEqual(["deconstruct", "transport", "build", "complete"]);
  expect(saleSteps.slice(0, 3).every(step => step.scene.geometry.constructionRigs === 1)).toBe(true);
  expect(saleSteps.every(step => step.scene.geometry.representativeVisible)).toBe(true);
  expect(saleSteps[1].scene.geometry.truckVisible).toBe(true);
  expect(saleSteps.at(-1).scene.geometry.confettiVisible).toBe(true);
  expect(saleSteps.at(-1).scene.geometry.confettiInstances).toBe(112);
  expect(saleSteps.at(-1).confettiProjection.visible).toBe(true);
  expect(saleSteps.at(-1).confettiProjection.insideViewport).toBeGreaterThanOrEqual(5);
  expect(saleSteps.at(-1).confettiProjection.opacity).toBeGreaterThan(0.15);
  record("commercial-story-has-distinct-closeups-for-dismantling-road-rebuilding-and-confetti", { saleSteps });

  await seekBeat(desktop.page, "commercial", "sale-transport", 0.65);
  const frozen = { state: await state(desktop.page), camera: await camera(desktop.page) };
  await frames(desktop.page, 10);
  const afterPause = { state: await state(desktop.page), camera: await camera(desktop.page) };
  expect(afterPause.state.status).toBe("paused");
  expect(afterPause.state.elapsed).toBe(frozen.state.elapsed);
  expect(afterPause.state.frame).toEqual(frozen.state.frame);
  expect(afterPause.state.scene).toEqual(frozen.state.scene);
  expect(afterPause.camera).toEqual(frozen.camera);
  await desktop.page.locator("[data-story-action='next']").click();
  const next = await state(desktop.page);
  expect(next.status).toBe("paused");
  expect(next.frame.beatId).toBe("sale-rebuild");
  await desktop.page.locator("[data-story-action='previous']").click();
  const previous = await state(desktop.page);
  expect(previous.status).toBe("paused");
  expect(previous.frame.beatId).toBe("sale-transport");
  await desktop.page.locator("[data-story-action='replay']").click();
  await pause(desktop.page);
  const replay = await seek(desktop.page, 0);
  expect(replay.chapterId).toBe("intro");
  expect(replay.tour).toBe(true);
  expect(replay.frame.effect).toBe("assemble-city");
  expect(replay.frame.cityProgress).toBe(0);
  expect(replay.scene.geometry.constructionRigs).toBe(0);
  expect(replay.scene.geometry.representativeVisible).toBe(false);
  expect(replay.scene.geometry.confettiVisible).toBe(false);
  expect(await sources(desktop.page)).toEqual(initialSources);
  record("pause-freezes-camera-and-choreography-while-navigation-and-replay-stay-clean", { frozen, afterPause, next, previous, replay });

  await playChapter(desktop.page, "intro", getStoryChapter("intro").duration);
  await desktop.page.locator("#bird-story-choices [data-story-choice='industrial']").click();
  await pause(desktop.page);
  const industrialSteps = [];
  for (const [beatId, progress, name] of [
    ["manufacturing", 0.5, "08-manufacturing"],
    ["packing", 0.5, "09-packing"],
    ["warehouse", 0.5, "10-warehouse"],
    ["production-in-motion", 0.5, "11-production-in-transit"],
    ["delivery-arrives", 0.8, "12-delivery-arrives"],
    ["delivered", 0.35, "13-product-delivered"],
  ]) {
    const sampled = await seekBeat(desktop.page, "industrial", beatId, progress);
    industrialSteps.push({ seconds: beatTime("industrial", beatId, progress), frame: sampled.frame, scene: sampled.scene, labels: await floatingLabelLayout(desktop.page), camera: await camera(desktop.page), ...(["delivery-arrives", "delivered"].includes(beatId) ? { confettiProjection: await projectedConfetti(desktop.page) } : {}) });
    await screenshot(desktop.page, name);
  }
  activeScenarioDetail = { industrialSteps };
  expect(industrialSteps.map(step => step.scene.phase)).toEqual(["manufacturing", "packing", "stored", "transit", "delivered", "delivered"]);
  expect(industrialSteps[1].scene.geometry.industryParcelsVisible).toBe(true);
  expect(industrialSteps.slice(0, 4).every(step => step.scene.cameraDistance < 30)).toBe(true);
  expect(industrialSteps[3].scene.geometry.truckVisible).toBe(true);
  expect(industrialSteps[4].scene.geometry.confettiVisible).toBe(true);
  expect(industrialSteps[4].confettiProjection.insideViewport).toBeGreaterThanOrEqual(5);
  expect(industrialSteps.at(-1).scene.phase).toBe("delivered");
  expect(new Set(industrialSteps.map(step => JSON.stringify(step.camera.position))).size).toBe(industrialSteps.length);
  record("industrial-tour-shows-manufacturing-packing-stock-transport-and-delivery", { industrialSteps });

  await seek(desktop.page, getStoryChapter("industrial").duration);
  await desktop.page.locator("#bird-story-choices [data-story-choice='communications']").click();
  await pause(desktop.page);
  const relationships = await seekBeat(desktop.page, "communications", "meetings");
  expect(relationships.frame.target).toEqual({ kind: "communication", id: "meeting" });
  await screenshot(desktop.page, "14-communications-meetings");
  expect(await sources(desktop.page)).toEqual(initialSources);
  await noTavus(desktop.page);
  record("relationship-tour-and-all-replays-preserve-the-crm-and-erp-snapshots", { relationships });

  await desktop.page.evaluate(() => {
    __BIRD_DEMO_SIMULATION__.player.resume();
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  const restoredDocument = await state(desktop.page);
  expect(restoredDocument.status).toBe("paused");
  expect(restoredDocument.disposed).toBe(false);
  expect(restoredDocument.chapterId).toBe("communications");
  expect(await desktop.page.locator("canvas").count()).toBe(1);
  await desktop.page.locator("[data-story-action='pause']").click();
  await desktop.page.waitForFunction(() => __BIRD_DEMO_SIMULATION__.getState().status === "playing");
  await pause(desktop.page);
  await desktop.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
  const unloadedDocument = await state(desktop.page);
  expect(unloadedDocument.status).toBe("disposed");
  expect(unloadedDocument.disposed).toBe(true);
  expect(await desktop.page.locator("canvas").count()).toBe(0);
  await desktop.page.evaluate(() => __BIRD_DEMO_SIMULATION__.player.play());
  expect((await state(desktop.page)).status).toBe("disposed");
  expect(await sources(desktop.page)).toEqual(initialSources);
  record("persisted-page-transition-retains-the-player-and-real-unload-disposes-it", {
    validation: "Explicit PageTransitionEvent fixtures; browser back/forward cache admission and real history navigation were not exercised",
    restoredDocument, unloadedDocument,
  });
  await desktop.context.close();

  const mobile = await createPage("mobile-simulation", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await boot(mobile.page);
  await mobile.page.waitForFunction(() => __BIRD_DEMO_SIMULATION__.getState().ready);
  const mobileSources = await sources(mobile.page);
  await playChapter(mobile.page, "intro", getStoryChapter("intro").duration);
  await frames(mobile.page, 3);
  const portraitLayout = await fullscreenLayout(mobile.page);
  const portraitLabelLayout = await floatingLabelLayout(mobile.page);
  const portraitChoiceLayout = await choiceLayout(mobile.page);
  await screenshot(mobile.page, "15-mobile-portrait-choice");
  await mobile.page.locator("#bird-story-choices [data-story-choice='commercial']").click();
  await pause(mobile.page);
  await seekBeat(mobile.page, "commercial", "sale-won", 0.35);
  const portraitWinLabels = await floatingLabelLayout(mobile.page);
  await screenshot(mobile.page, "16-mobile-portrait-win");
  await mobile.page.setViewportSize({ width: 844, height: 390 });
  await frames(mobile.page, 4);
  const landscapeLayout = await fullscreenLayout(mobile.page);
  const landscapeWinLabels = await floatingLabelLayout(mobile.page);
  await screenshot(mobile.page, "17-mobile-landscape-win");
  await playChapter(mobile.page, "intro", getStoryChapter("intro").duration);
  await frames(mobile.page, 3);
  const landscapeChoiceLayout = await choiceLayout(mobile.page);
  await fullscreenLayout(mobile.page);
  await screenshot(mobile.page, "18-mobile-landscape-choice");
  expect(await sources(mobile.page)).toEqual(mobileSources);
  await noTavus(mobile.page);
  record("portrait-and-landscape-keep-the-map-and-presentation-controls-in-view", { portraitLayout, portraitLabelLayout, portraitChoiceLayout, portraitWinLabels, landscapeLayout, landscapeWinLabels, landscapeChoiceLayout });
  await mobile.context.close();

  const dashboard = await createPage("normal-dashboard");
  await boot(dashboard.page, "/");
  await expect(dashboard.page.locator(".c-rail")).toBeVisible();
  expect(await dashboard.page.evaluate(() => typeof window.__BIRD_DEMO_SIMULATION__)).toBe("undefined");
  expect((await camera(dashboard.page)).type).toBe("OrthographicCamera");
  expect(await dashboard.page.locator("canvas").count()).toBe(1);
  await noTavus(dashboard.page);
  record("normal-crm-dashboard-keeps-its-original-orthographic-camera", { camera: await camera(dashboard.page) });
  await dashboard.context.close();

  const reduced = await createPage("reduced-motion", { reducedMotion: "reduce" });
  await boot(reduced.page);
  await reduced.page.waitForFunction(() => __BIRD_DEMO_SIMULATION__.getState().ready);
  await playChapter(reduced.page, "intro", beatTime("intro", "world-assembles", 0.4));
  const reducedState = await state(reduced.page), reducedCamera = await camera(reduced.page);
  expect(reducedState.scene.phase).toBe("complete");
  expect(reducedState.scene.revealProgress).toBe(1);
  expect(reducedState.scene.geometry.confettiVisible).toBe(false);
  await frames(reduced.page, 6);
  expect(await camera(reduced.page)).toEqual(reducedCamera);
  await noTavus(reduced.page);
  record("reduced-motion-assembles-the-city-immediately-without-confetti", { state: reducedState, camera: reducedCamera });
  await reduced.context.close();
  }

  if (!closeupsOnly) await controlledVoiceScenario();

  if (!voiceOnly && !closeupsOnly) {
  const live = await createPage("live-route-smoke-no-start");
  await boot(live.page, "/demo?mode=live");
  await live.page.waitForFunction(() => window.__BIRD_DEMO__?.getState().configuration?.contractsReady);
  await expect(live.page.locator("[data-demo-action='start']")).toBeVisible();
  expect(await live.page.evaluate(() => typeof window.__BIRD_DEMO_SIMULATION__)).toBe("undefined");
  const liveMedia = await mediaState(live.page);
  expect(liveMedia).toEqual({ getUserMedia: 0, mediaPlay: 0, audioContext: 0, speech: 0, embedRegistered: true, widgetRegistered: false, tavusElements: 0, mediaElements: 0 });
  expect(await live.page.evaluate(() => __BIRD_DEMO__.getState().session.status)).toBe("idle");
  record("optional-live-route-retains-the-agent-without-starting-a-conversation", { media: liveMedia, state: await live.page.evaluate(() => __BIRD_DEMO__.getState()) });
  await live.context.close();
  }

  expect(errors).toEqual([]);
  const tavusRequests = requests.filter(({ url }) => vendorHost(new URL(url).hostname));
  expect(tavusRequests).toEqual([]);
  const finalSourceSha256 = await sourceHashes();
  expect(finalSourceSha256).toEqual(sourceSha256);
  await writeFile(`${output}/browser-validation.json`, JSON.stringify({
    generatedAt: new Date().toISOString(), startedAt, scenario: closeupsOnly ? "focused-closeups" : voiceOnly ? "controlled-voice-double" : "full-extended-presentation",
    browser: browser.version(), environment: "Chromium headless, ANGLE/SwiftShader software WebGL; no physical-device or live-Tavus validation; no FPS performance claim",
    screenshots: "Actual WebGL city at paused story samples; finite DOM entrance animations are finished for readable stills",
    liveConversationStarted: false, microphoneOpened: false,
    loadedAssets: [...loadedAssets], sourceSha256, workingTreeSourceSha256AtCompletion: finalSourceSha256,
    errors, tavusRequests, results,
  }, null, 2));
  await rm(`${output}/last-failure.json`, { force: true });
  await rm(`${output}/failure.png`, { force: true });
} catch (error) {
  if (currentPage && !currentPage.isClosed()) await screenshot(currentPage, "failure").catch(() => {});
  await writeFile(`${output}/last-failure.json`, JSON.stringify({ generatedAt: new Date().toISOString(), startedAt, error: error.stack, activeScenarioDetail, errors, loadedAssets: [...loadedAssets], results, sourceSha256, workingTreeSourceSha256AtCompletion: await sourceHashes() }, null, 2));
  throw error;
} finally {
  await browser.close();
}
