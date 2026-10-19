import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";

// The marketing route is exercised as a real browser page. Existing city and
// presentation routes receive a read-only smoke check; no conversations start.
const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const output = process.env.CAPTURE_DIR || "/tmp/birdview-landing-qa";
const previewOnly = process.env.LANDING_QA_MODE === "preview";
const startedAt = new Date().toISOString();
const productUrl = "https://pipeline-city.vercel.app/";
const results = [], errors = [], requests = [], failedResources = [];
const loadedAssets = new Set();
let currentPage;
const vendorHost = hostname => /(?:^|\.)(?:tavusapi\.com|tavus\.(?:io|com|dev)|daily\.co)$/i.test(hostname);
await mkdir(output, { recursive: true });
await rm(`${output}/browser-validation.json`, { force: true });

async function sourceHashes() {
  const files = ["package.json", "package-lock.json", "index.html", "page/index.html", "vite.config.js", "vercel.json"];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await visit(path);
      else if (/\.(?:js|css|html|svg)$/.test(entry.name)) files.push(path);
    }
  }
  await visit("src");
  for (const name of await readdir("public/assets/landing"))
    if (/\.(?:png|jpe?g|webp|svg|mp4|webm)$/i.test(name)) files.push(`public/assets/landing/${name}`);
  return Object.fromEntries(await Promise.all(files.sort().map(async file => [file, createHash("sha256").update(await readFile(file)).digest("hex")])));
}
const sourceSha256 = await sourceHashes();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

async function createPage(name, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
  await context.route("**/*", route => vendorHost(new URL(route.request().url()).hostname) ? route.abort("blockedbyclient") : route.continue());
  const page = await context.newPage();
  currentPage = page;
  page.setDefaultTimeout(30000);
  page.on("pageerror", error => errors.push({ page: name, message: error.message }));
  page.on("request", request => requests.push({ page: name, url: request.url(), method: request.method() }));
  page.on("response", response => {
    const url = new URL(response.url());
    if (/\.(?:js|css|png|jpe?g|webp|svg|woff2?|mp4|webm)(?:\?|$)/i.test(response.url())) loadedAssets.add(url.pathname);
    if (url.origin === new URL(base).origin && response.status() >= 400) failedResources.push({ page: name, url: url.pathname, status: response.status() });
  });
  await page.addInitScript(() => {
    const media = { getUserMedia: 0, play: 0, speech: 0, playTargets: [] };
    window.__LANDING_QA_MEDIA__ = media;
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
      media.getUserMedia++;
      throw new DOMException("QA forbids media capture", "NotAllowedError");
    };
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      media.play++;
      media.playTargets.push({ hero: this.matches("[data-hero-film]"), tag: this.tagName, muted: this.muted, defaultMuted: this.defaultMuted, source: this.currentSrc || this.src || this.querySelector("source")?.src || "" });
      return originalPlay.apply(this, args);
    };
    if (window.speechSynthesis) {
      const speak = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak = (...args) => { media.speech++; return speak(...args); };
    }
    const nativeFrame = requestAnimationFrame.bind(window), nativeCancel = cancelAnimationFrame.bind(window);
    const pendingFrames = new Set();
    let requestedFrames = 0, completedFrames = 0;
    window.__LANDING_QA_RAF__ = { getState: () => ({ pending: pendingFrames.size, requested: requestedFrames, completed: completedFrames }) };
    window.requestAnimationFrame = callback => {
      requestedFrames++;
      const id = nativeFrame(timestamp => { pendingFrames.delete(id); completedFrames++; callback.call(window, timestamp); });
      pendingFrames.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { pendingFrames.delete(id); return nativeCancel(id); };
    const counterSamples = new Map();
    window.__LANDING_QA_COUNTERS__ = counterSamples;
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type !== "attributes" || !record.target.matches("[data-count-to]")) continue;
        const target = record.target;
        if (!counterSamples.has(target)) counterSamples.set(target, []);
        counterSamples.get(target).push({ value: Number(target.getAttribute("data-count-value")), state: target.getAttribute("data-count-state") });
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-count-value", "data-count-state"] });
  });
  return { page, context };
}

async function boot(page, path = "/page") {
  const response = await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
  expect(response.status()).toBe(200);
  await page.evaluate(() => document.fonts.ready);
}
async function capture(page, name, fullPage = false) {
  let resumeFilm = false;
  if (fullPage && await page.locator("[data-hero-film]").count()) {
    const state = await page.evaluate(() => __BIRD_HERO_FILM__.getState());
    if (!state.reducedMotion && !state.manuallyPaused && !state.unavailable) {
      await page.waitForFunction(() => !document.querySelector("[data-hero-film]").paused);
      await page.locator("[data-hero-film-toggle]").click();
      resumeFilm = true;
    }
    await page.evaluate(() => {
      scrollTo({ top: 0, behavior: "instant" });
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
  }
  try {
    await page.screenshot({ path: `${output}/${name}.png`, fullPage, animations: "disabled" });
  } finally {
    if (resumeFilm) await page.locator("[data-hero-film-toggle]").click();
  }
}
async function readWholePage(page) {
  const metrics = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, step: innerHeight * 0.75 }));
  for (let y = 0; y < metrics.height; y += metrics.step) {
    await page.evaluate(y => {
      window.scrollTo({ top: y, behavior: "instant" });
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, y);
  }
  for (const group of await page.locator("[data-metric-group]").all()) {
    if (!await group.isVisible() || !await group.locator("[data-count-to]").count()) continue;
    await group.scrollIntoViewIfNeeded();
    // A desktop scroll can switch the sticky director panel. A panel that was
    // visible before scrolling may now be hidden and must keep its value paused.
    await expect.poll(() => group.evaluate(element => !element.getClientRects().length || [...element.querySelectorAll("[data-count-to]")].every(counter => counter.dataset.countState === "complete"))).toBe(true);
  }
  await page.waitForFunction(() => [...document.images].filter(image => image.getClientRects().length > 0).every(image => image.complete && image.naturalWidth > 0));
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function layout(page) {
  const measurement = await page.evaluate(() => ({
    viewportWidth: innerWidth, viewportHeight: innerHeight,
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll("main *, header *, footer *")].flatMap(el => {
      const style = getComputedStyle(el), rect = el.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) return [];
      return rect.left < -1 || rect.right > innerWidth + 1 ? [{ tag: el.tagName, className: el.className?.baseVal ?? el.className, left: rect.left, right: rect.right }] : [];
    }),
  }));
  expect(measurement.bodyWidth).toBeLessThanOrEqual(measurement.viewportWidth + 1);
  expect(measurement.documentWidth).toBeLessThanOrEqual(measurement.viewportWidth + 1);
  return measurement;
}
async function noAgentOrMedia(page, { allowHeroVideo = false } = {}) {
  const media = await page.evaluate(() => ({
    ...__LANDING_QA_MEDIA__,
    tavusRegistered: !!customElements.get("tavus-embed") || !!customElements.get("tavus-widget"),
    tavusElements: document.querySelectorAll("tavus-embed, tavus-widget").length,
    audioElements: document.querySelectorAll("audio").length,
    videos: [...document.querySelectorAll("video")].map(video => ({ hero: video.matches("[data-hero-film]"), muted: video.muted, defaultMuted: video.defaultMuted, loop: video.loop, playsInline: video.playsInline, source: video.currentSrc || video.src || video.querySelector("source")?.src || "" })),
  }));
  expect(media.getUserMedia).toBe(0);
  expect(media.speech).toBe(0);
  expect(media.tavusRegistered).toBe(false);
  expect(media.tavusElements).toBe(0);
  expect(media.audioElements).toBe(0);
  if (allowHeroVideo) {
    expect(media.videos).toHaveLength(1);
    for (const video of media.videos) {
      expect(video.hero).toBe(true);
      expect(video.muted).toBe(true);
      expect(video.defaultMuted).toBe(true);
      expect(video.loop).toBe(true);
      expect(video.playsInline).toBe(true);
      expect(new URL(video.source).origin).toBe(new URL(base).origin);
      expect(new URL(video.source).pathname).toMatch(/^\/assets\/landing\/.+\.(?:mp4|webm)$/);
    }
    expect(media.playTargets).toHaveLength(media.play);
    for (const target of media.playTargets) {
      expect(target.hero).toBe(true);
      expect(target.tag).toBe("VIDEO");
      expect(target.muted).toBe(true);
      expect(target.defaultMuted).toBe(true);
      expect(new URL(target.source).origin).toBe(new URL(base).origin);
    }
  } else {
    expect(media.play).toBe(0);
    expect(media.playTargets).toEqual([]);
    expect(media.videos).toEqual([]);
  }
  return media;
}
async function settleVisibleCounters(page) {
  await page.waitForFunction(() => [...document.querySelectorAll("[data-count-to]")].filter(element => {
    const rect = element.getBoundingClientRect();
    return element.getClientRects().length && rect.bottom > 90 && rect.top < innerHeight;
  }).every(element => element.dataset.countState === "complete"));
}
async function counterSnapshot(page, scope = "body") {
  return page.locator(`${scope} [data-count-to]`).evaluateAll(elements => elements.map(element => ({
    target: Number(element.dataset.countTo), value: Number(element.dataset.countValue), state: element.dataset.countState,
    text: element.textContent, label: element.getAttribute("aria-label"), format: element.dataset.countFormat,
  })));
}
async function mapControls(page) {
  return page.locator("[data-map-stage]").evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { stage: element.dataset.mapStage, text: element.textContent.replace(/\s+/g, " ").trim(), label: element.getAttribute("aria-label"), pressed: element.getAttribute("aria-pressed"), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
}
async function verifyMapControlLayout(page) {
  const controls = await mapControls(page);
  expect(controls).toHaveLength(5);
  for (const control of controls) {
    expect(control.width).toBeGreaterThanOrEqual(44);
    expect(control.height).toBeGreaterThanOrEqual(40);
    expect(control.x).toBeGreaterThanOrEqual(-1);
    expect(control.x + control.width).toBeLessThanOrEqual((await page.viewportSize()).width + 1);
  }
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
    const a = controls[i], b = controls[j];
    const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
    expect(overlap).toBe(false);
  }
  return controls;
}
function record(name, detail = {}) {
  results.push({ name, passed: true, detail });
  console.log(`PASS ${name}`);
}

try {
  const desktop = await createPage("landing-desktop");
  await boot(desktop.page);
  if (previewOnly) {
    await desktop.page.waitForTimeout(1600);
    await capture(desktop.page, "01-desktop-hero");
    await desktop.page.locator(".bv-city-stage").scrollIntoViewIfNeeded();
    await settleVisibleCounters(desktop.page);
    await capture(desktop.page, "02-desktop-map");
    await desktop.page.locator("[data-director-board]").scrollIntoViewIfNeeded();
    for (const perspective of ["overview", "attention", "team"]) {
      await desktop.page.locator(`[data-director-tab='${perspective}']`).click();
      await desktop.page.waitForTimeout(1500);
      await capture(desktop.page, `06-desktop-executive-${perspective}`);
    }
    await readWholePage(desktop.page);
    await capture(desktop.page, "07-desktop-full-page", true);
    const desktopLayout = await layout(desktop.page);
    await desktop.context.close();
    const mobile = await createPage("landing-mobile-preview", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await boot(mobile.page);
    await mobile.page.waitForTimeout(1600);
    await capture(mobile.page, "03-mobile-hero");
    await mobile.page.locator(".bv-city-stage").scrollIntoViewIfNeeded();
    await settleVisibleCounters(mobile.page);
    await capture(mobile.page, "04-mobile-map");
    await mobile.page.locator("[data-director-board]").scrollIntoViewIfNeeded();
    await mobile.page.waitForTimeout(1500);
    await capture(mobile.page, "09-mobile-executive");
    await readWholePage(mobile.page);
    await capture(mobile.page, "05-mobile-full-page", true);
    const mobileLayout = await layout(mobile.page);
    await mobile.context.close();
    const narrow = await createPage("landing-narrow-mobile-preview", { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
    await boot(narrow.page);
    await narrow.page.waitForTimeout(1600);
    await capture(narrow.page, "10-narrow-mobile-hero");
    await narrow.page.locator(".bv-city-stage").scrollIntoViewIfNeeded();
    await settleVisibleCounters(narrow.page);
    await capture(narrow.page, "11-narrow-mobile-map");
    await narrow.page.locator("[data-director-board]").scrollIntoViewIfNeeded();
    await settleVisibleCounters(narrow.page);
    await capture(narrow.page, "12-narrow-mobile-executive");
    await writeFile(`${output}/preview.json`, JSON.stringify({ generatedAt: new Date().toISOString(), exploratory: true, desktopLayout, mobileLayout, narrowLayout: await layout(narrow.page), errors, failedResources }, null, 2));
    await browser.close();
    process.exit(0);
  }
  await expect(desktop.page.locator("main#birdview-landing")).toBeVisible();
  await expect(desktop.page.locator("main")).toHaveCount(1);
  await expect(desktop.page.locator(".bv-hero")).toHaveCount(1);
  await expect(desktop.page.locator("footer")).toHaveCount(1);
  await expect(desktop.page.locator("h1")).toHaveCount(1);
  await expect(desktop.page.locator("h1")).toBeVisible();
  await expect(desktop.page.locator("body")).toContainText("BirdView");
  await expect(desktop.page.locator("body")).toContainText("FaradAI");
  const title = await desktop.page.title();
  expect(title).toContain("BirdView");
  const heroCtas = desktop.page.locator(`a[href='${productUrl}']`);
  expect(await heroCtas.count()).toBeGreaterThan(0);
  await expect(heroCtas.first()).toBeVisible();
  await expect(heroCtas.first()).toHaveAttribute("target", "_blank");
  expect((await heroCtas.first().getAttribute("rel")).split(/\s+/)).toContain("noopener");
  await expect(desktop.page.locator("a[href='/demo']").first()).toBeVisible();
  const exampleBefore = await desktop.page.evaluate(() => JSON.stringify(__BIRD_LANDING__.getState().example));
  await expect(desktop.page.locator("#city-map [data-map-pipeline]")).toBeVisible();
  await expect(desktop.page.locator("#city-map [data-map-stage]")).toHaveCount(5);
  const firstViewportContext = await desktop.page.evaluate(() => [...document.querySelectorAll("[data-map-stage]")].filter(element => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight && rect.left >= 0 && rect.right <= innerWidth;
  }).map(element => element.dataset.mapStage));
  const metadata = await desktop.page.evaluate(() => ({
    description: document.querySelector('meta[name="description"]')?.content || "",
    themeColor: document.querySelector('meta[name="theme-color"]')?.content || "",
    validThemeColor: CSS.supports("color", document.querySelector('meta[name="theme-color"]')?.content || ""),
  }));
  expect(metadata.description).toContain("BirdView");
  expect(metadata.description).toContain("FaradAI");
  expect(metadata.description.length).toBeGreaterThan(80);
  expect(metadata.validThemeColor).toBe(true);
  await desktop.page.waitForFunction(() => {
    const video = document.querySelector("[data-hero-film]");
    return video?.readyState >= 2 && video.videoWidth > 0;
  });
  const heroImage = await desktop.page.locator("[data-hero-film]").evaluate(video => ({ path: new URL(video.currentSrc || video.src, location.href).pathname, poster: new URL(video.poster, location.href).pathname, width: video.videoWidth, height: video.videoHeight }));
  await capture(desktop.page, "01-desktop-hero");
  record("desktop-landing-presents-birdview-by-faradai-with-a-working-product-destination", { title, productUrl, metadata, heroImage, firstViewportContext, layout: await layout(desktop.page), media: await noAgentOrMedia(desktop.page, { allowHeroVideo: true }) });

  const film = desktop.page.locator("[data-hero-film]");
  const filmToggle = desktop.page.locator("[data-hero-film-toggle]");
  await expect(film).toBeVisible();
  await expect(filmToggle).toBeVisible();
  await expect(filmToggle).toHaveAccessibleName(/.+/);
  expect((await filmToggle.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(desktop.page.locator(".bv-header")).toHaveAttribute("data-over-film", "");
  await desktop.page.waitForFunction(() => !!window.__BIRD_HERO_FILM__?.getState && !document.querySelector("[data-hero-film]").paused);
  const filmStart = await film.evaluate(video => ({ time: video.currentTime, duration: video.duration, muted: video.muted, defaultMuted: video.defaultMuted, loop: video.loop, playsInline: video.playsInline, poster: video.poster, source: video.currentSrc || video.src }));
  expect(filmStart.duration).toBeGreaterThan(2);
  expect(Number.isFinite(filmStart.duration)).toBe(true);
  expect(filmStart.poster).not.toBe("");
  expect(new URL(filmStart.poster).origin).toBe(new URL(base).origin);
  await desktop.page.waitForFunction(initial => {
    const video = document.querySelector("[data-hero-film]");
    const distance = video.currentTime >= initial ? video.currentTime - initial : video.duration - initial + video.currentTime;
    return !video.paused && distance > 0.15;
  }, filmStart.time);
  await filmToggle.click();
  await expect(film).toHaveJSProperty("paused", true);
  await expect(filmToggle).toHaveAttribute("aria-pressed", "true");
  expect((await desktop.page.evaluate(() => __BIRD_HERO_FILM__.getState())).manuallyPaused).toBe(true);
  const manuallyPausedAt = await film.evaluate(video => video.currentTime);
  await desktop.page.waitForTimeout(220);
  expect(await film.evaluate(video => video.currentTime)).toBe(manuallyPausedAt);
  await filmToggle.click();
  await expect(film).toHaveJSProperty("paused", false);
  await expect(filmToggle).toHaveAttribute("aria-pressed", "false");
  await desktop.page.locator("#city-map").evaluate(element => element.scrollIntoView({ block: "start", behavior: "instant" }));
  await desktop.page.waitForFunction(() => !__BIRD_HERO_FILM__.getState().visible);
  await expect(film).toHaveJSProperty("paused", true);
  await expect(desktop.page.locator(".bv-header")).not.toHaveAttribute("data-over-film");
  const offscreenAt = await film.evaluate(video => video.currentTime);
  await desktop.page.waitForTimeout(220);
  expect(await film.evaluate(video => video.currentTime)).toBe(offscreenAt);
  await desktop.page.locator(".bv-hero").evaluate(element => element.scrollIntoView({ block: "start", behavior: "instant" }));
  await expect(film).toHaveJSProperty("paused", false);
  await desktop.page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(film).toHaveJSProperty("paused", true);
  const hiddenFilmAt = await film.evaluate(video => video.currentTime);
  await desktop.page.waitForTimeout(220);
  expect(await film.evaluate(video => video.currentTime)).toBe(hiddenFilmAt);
  await desktop.page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(film).toHaveJSProperty("paused", false);
  record("local-silent-hero-film-advances-and-pauses-with-controls-scroll-and-page-visibility", { filmStart, manuallyPausedAt, offscreenAt, hiddenFilmAt, state: await desktop.page.evaluate(() => __BIRD_HERO_FILM__.getState()), visibilityMethod: "QA-controlled document.visibilityState with visibilitychange; not an OS focus test" });

  const stageFacts = [
    ["lead", /nuevos leads/i, 4, 20000],
    ["qualified", /cualificados/i, 3, 18000],
    ["proposal", /propuestas/i, 2, 30000],
    ["negotiation", /negociación/i, 1, 27000],
    ["won", /ventas ganadas/i, 4, 60000],
  ];
  const stageStates = [];
  for (const [stage, label, count, amount] of stageFacts) {
    const control = desktop.page.locator(`[data-map-stage='${stage}']`);
    await expect(control).toBeVisible();
    await expect(control).toContainText(label);
    await control.click();
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await expect(desktop.page.locator("[data-map-stage][aria-pressed='true']")).toHaveCount(1);
    const detail = desktop.page.locator("[data-map-detail]");
    await expect(detail).toBeVisible();
    await expect(detail).toHaveAttribute("aria-live", "polite");
    await expect(detail).toContainText(label);
    await expect(detail.locator("dd").nth(0)).toHaveText(new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount));
    await expect(detail.locator("dd").nth(1)).toHaveText(String(count));
    stageStates.push({ stage, count, amount, control: (await control.innerText()).replace(/\s+/g, " "), detail: (await detail.innerText()).replace(/\s+/g, " ") });
  }
  await desktop.page.locator("[data-map-stage='lead']").focus();
  await desktop.page.keyboard.press("Enter");
  await expect(desktop.page.locator("[data-map-stage='lead']")).toHaveAttribute("aria-pressed", "true");
  await expect(desktop.page.locator("[data-map-stage='lead']")).toBeFocused();
  await desktop.page.keyboard.press("ArrowRight");
  await expect(desktop.page.locator("[data-map-stage='qualified']")).toHaveAttribute("aria-pressed", "true");
  await expect(desktop.page.locator("[data-map-stage='qualified']")).toBeFocused();
  await desktop.page.keyboard.press("End");
  await expect(desktop.page.locator("[data-map-stage='won']")).toHaveAttribute("aria-pressed", "true");
  await desktop.page.keyboard.press("Home");
  await expect(desktop.page.locator("[data-map-stage='lead']")).toHaveAttribute("aria-pressed", "true");
  await expect(desktop.page.locator("[data-map-pipeline]")).toContainText(/95[.\s]?000/);
  await desktop.page.locator("[data-map-win]").scrollIntoViewIfNeeded();
  await expect(desktop.page.locator("[data-map-win]")).toContainText(/18[.\s]?000/);
  await expect(desktop.page.locator("[data-map-rep]")).toContainText(/Lucía\s+Costa/);
  await expect(desktop.page.locator("[data-map-rep]")).toContainText(/32[.\s]?000/);
  await settleVisibleCounters(desktop.page);
  await capture(desktop.page, "09-desktop-map-context");
  record("commercial-map-identifies-five-real-stages-and-opens-context-with-keyboard-and-pointer", { stageStates, controls: await verifyMapControlLayout(desktop.page) });

  await desktop.page.locator("#direction").scrollIntoViewIfNeeded();
  const directorStates = [];
  for (const question of ["overview", "attention", "team"]) {
    const tab = desktop.page.locator(`[data-director-tab='${question}']`);
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(desktop.page.locator("[data-director-tab][aria-selected='true']")).toHaveCount(1);
    const panel = desktop.page.locator(`[data-director-panel='${question}']`);
    await expect(panel).toBeVisible();
    for (const other of ["overview", "attention", "team"].filter(value => value !== question)) await expect(desktop.page.locator(`[data-director-panel='${other}']`)).toBeHidden();
    for (const counter of await panel.locator("[data-count-to]").all()) await expect(counter).toHaveAttribute("data-count-state", "complete");
    directorStates.push({ question, text: (await panel.innerText()).replace(/\s+/g, " "), metrics: await counterSnapshot(desktop.page, `[data-director-panel='${question}']`) });
    await capture(desktop.page, `12-executive-${question}`);
  }
  const overview = desktop.page.locator("[data-director-panel='overview']");
  for (const [metric, target] of [["invoiced", 42000], ["won", 60000], ["pending-invoice", 18000], ["target-progress", 75]]) {
    const element = overview.locator(`[data-kpi='${metric}']`);
    const targets = await element.evaluate(node => [node, ...node.querySelectorAll("[data-count-to]")].filter(element => element.hasAttribute("data-count-to")).map(element => Number(element.dataset.countTo)));
    expect(targets).toContain(target);
  }
  expect(directorStates.find(state => state.question === "overview").text).toMatch(/facturad[oa]/i);
  expect(directorStates.find(state => state.question === "overview").text).toMatch(/ganad[oa]/i);
  expect(directorStates.find(state => state.question === "overview").text).not.toMatch(/cobrad[oa]/i);
  const attentionText = directorStates.find(state => state.question === "attention").text;
  expect(attentionText).toMatch(/Luma\s+SL/);
  expect(attentionText).toMatch(/5\s+días/);
  expect(attentionText).toMatch(/Marc\s+Ruiz/);
  record("executive-questions-distinguish-open-pipeline-won-contracts-and-issued-invoices", { directorStates });

  const teamFacts = [];
  for (const [id, name, amount, wins, active] of [["lucia", "Lucía Costa", 32000, 2, 4], ["marc", "Marc Ruiz", 18000, 1, 3], ["ana", "Ana Gil", 10000, 1, 3]]) {
    const row = desktop.page.locator(`[data-team-rep='${id}']`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(name);
    await expect(row).toHaveAttribute("data-wins", String(wins));
    await expect(row).toHaveAttribute("data-active", String(active));
    const values = await row.locator("[data-count-to]").evaluateAll(elements => elements.map(element => Number(element.dataset.countTo)));
    expect(values).toContain(amount);
    teamFacts.push({ id, name, amount, wins, active, text: (await row.innerText()).replace(/\s+/g, " ") });
  }
  expect(teamFacts.reduce((total, rep) => total + rep.amount, 0)).toBe(60000);
  expect(teamFacts.reduce((total, rep) => total + rep.wins, 0)).toBe(4);
  expect(teamFacts.reduce((total, rep) => total + rep.active, 0)).toBe(10);
  expect(await desktop.page.evaluate(() => JSON.stringify(__BIRD_LANDING__.getState().example))).toBe(exampleBefore);
  record("representative-results-reconcile-with-the-company-example-without-changing-its-data", { teamFacts, wonTotal: 60000, wins: 4, activeOpportunities: 10 });

  const scrollPerspectives = [];
  for (const perspective of ["overview", "attention", "team"]) {
    await desktop.page.locator(`[data-director-step='${perspective}']`).evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
    await expect(desktop.page.locator(`[data-director-tab='${perspective}']`)).toHaveAttribute("aria-selected", "true");
    await expect(desktop.page.locator(`[data-director-panel='${perspective}']`)).toBeVisible();
    scrollPerspectives.push({ perspective, state: await desktop.page.evaluate(() => __BIRD_LANDING__.getState().director) });
  }
  await capture(desktop.page, "13-executive-scroll-team");
  record("scrolling-the-executive-story-changes-the-visible-question-and-its-indicators", { scrollPerspectives });

  const anchorLinks = await desktop.page.evaluate(() => [...document.querySelectorAll("a[href^='#']")].map(link => ({ text: link.textContent.trim(), href: link.getAttribute("href"), exists: !!document.getElementById(link.getAttribute("href").slice(1)) })));
  expect(anchorLinks.length).toBeGreaterThanOrEqual(3);
  expect(anchorLinks.filter(link => !link.exists)).toEqual([]);
  for (const id of ["features", "how-it-works", "faq"]) await expect(desktop.page.locator(`#${id}`)).toHaveCount(1);
  const featuresLink = desktop.page.locator("header a[href='#features']").first();
  await featuresLink.click();
  await desktop.page.waitForFunction(() => location.hash === "#features");
  await expect(desktop.page.locator("#features")).toBeInViewport();
  record("navigation-anchors-resolve-to-real-product-sections", { anchorLinks });

  const featureStates = [];
  for (const feature of ["sales", "team", "activity"]) {
    const tab = desktop.page.locator(`[data-feature-tab='${feature}']`);
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    const panel = desktop.page.locator(`[data-feature-panel='${feature}']`);
    await expect(panel).toBeVisible();
    expect((await panel.innerText()).trim().length).toBeGreaterThan(30);
    for (const other of ["sales", "team", "activity"].filter(entry => entry !== feature))
      await expect(desktop.page.locator(`[data-feature-panel='${other}']`)).toBeHidden();
    featureStates.push({ feature, text: (await panel.innerText()).trim() });
    await capture(desktop.page, `02-feature-${feature}`);
  }
  expect(new Set(featureStates.map(state => state.text)).size).toBe(3);
  const perspectiveLinks = [];
  for (const feature of ["sales", "team", "activity"]) {
    const link = desktop.page.locator(`[data-feature-link='${feature}']`).first();
    // Start each link from a settled source viewport. A previous smooth scroll
    // must not compete with Playwright's automatic scrolling to the next link.
    await link.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
    await desktop.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await link.click();
    await expect(desktop.page.locator(`[data-feature-tab='${feature}']`)).toHaveAttribute("aria-selected", "true");
    await expect(desktop.page.locator(`[data-feature-panel='${feature}']`)).toBeVisible();
    await expect(desktop.page.locator("#features")).toBeInViewport();
    await desktop.page.waitForFunction(() => Math.abs(document.querySelector("#features").getBoundingClientRect().top - parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)) < 3);
    perspectiveLinks.push({ feature, text: (await link.innerText()).replace(/\s+/g, " ") });
  }
  const operationsLink = desktop.page.locator(".bv-perspective-row[href='#operations']");
  await operationsLink.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await desktop.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await operationsLink.click();
  await expect(desktop.page.locator("#operations")).toBeInViewport();
  await expect(desktop.page.locator(".bv-business-case")).toHaveCount(3);
  await expect(desktop.page.locator(".bv-business-case[href='/demo']")).toHaveCount(1);
  record("feature-controls-show-distinct-sales-team-and-activity-explanations", { featureStates, perspectiveLinks, businessCases: 3 });

  await desktop.page.locator("#faq").scrollIntoViewIfNeeded();
  const questions = desktop.page.locator("#faq details");
  expect(await questions.count()).toBeGreaterThanOrEqual(3);
  const faq = questions.first(), summary = faq.locator("summary");
  await summary.click();
  await expect(faq).toHaveAttribute("open", "");
  expect((await faq.innerText()).length).toBeGreaterThan((await summary.innerText()).length + 20);
  await summary.focus();
  await desktop.page.keyboard.press("Enter");
  await expect(faq).not.toHaveAttribute("open", "");
  await readWholePage(desktop.page);
  await capture(desktop.page, "03-desktop-full-page", true);
  const imageResults = await desktop.page.evaluate(() => [...document.images].map(image => ({ src: new URL(image.currentSrc || image.src, location.href).pathname, complete: image.complete, width: image.naturalWidth })));
  expect(imageResults.length).toBeGreaterThan(0);
  expect(imageResults.filter(image => !image.complete || image.width <= 0)).toEqual([]);
  record("faq-opens-with-pointer-and-closes-with-keyboard-and-product-imagery-loads", { questions: await questions.count(), images: imageResults, layout: await layout(desktop.page) });
  await desktop.context.close();

  const motion = await createPage("landing-number-evolution");
  await boot(motion.page);
  await motion.page.waitForFunction(() => !!window.__BIRD_LANDING_MOTION__?.getState);
  const initialMetrics = await counterSnapshot(motion.page);
  const subject = await motion.page.evaluate(() => {
    const candidates = [...document.querySelectorAll("[data-count-to]")];
    const element = candidates.find(element => Number(element.dataset.countTo) > 0 && element.dataset.countState === "pending" && element.getBoundingClientRect().top > innerHeight && element.getClientRects().length);
    if (!element) return null;
    element.dataset.qaCounter = "scroll-subject";
    const owner = element.closest("[data-metric-group], [data-reveal-sequence]") || element;
    owner.dataset.qaMetricGroup = "scroll-subject";
    return { target: Number(element.dataset.countTo), value: Number(element.dataset.countValue), state: element.dataset.countState, text: element.textContent, label: element.getAttribute("aria-label") };
  });
  expect(subject).not.toBeNull();
  expect(subject.value).toBe(0);
  expect(subject.state).toBe("pending");
  expect(subject.label).not.toBe(subject.text);
  await motion.page.locator("[data-qa-metric-group='scroll-subject']").scrollIntoViewIfNeeded();
  await motion.page.waitForFunction(() => {
    const element = document.querySelector("[data-qa-counter='scroll-subject']");
    return element.dataset.countState === "running" && Number(element.dataset.countValue) > 0 && Number(element.dataset.countValue) < Number(element.dataset.countTo);
  });
  const partial = await motion.page.locator("[data-qa-counter='scroll-subject']").evaluate(element => ({ value: Number(element.dataset.countValue), text: element.textContent }));
  expect(partial.value).toBeGreaterThan(0);
  expect(partial.value).toBeLessThan(subject.target);

  await motion.page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenBefore = await motion.page.evaluate(() => __BIRD_LANDING_MOTION__.getState());
  expect(hiddenBefore.suspended).toBe(true);
  expect(hiddenBefore.pendingFrame).toBe(false);
  await motion.page.waitForTimeout(220);
  const hiddenAfter = await motion.page.evaluate(() => __BIRD_LANDING_MOTION__.getState());
  expect(hiddenAfter.frameCount).toBe(hiddenBefore.frameCount);
  expect(hiddenAfter.values).toEqual(hiddenBefore.values);
  await motion.page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await motion.page.waitForFunction(previous => __BIRD_LANDING_MOTION__.getState().frameCount > previous, hiddenAfter.frameCount);
  record("backgrounded-landing-suspends-counter-work-and-resumes-without-a-time-jump", { visibilityMethod: "QA-controlled document.visibilityState with a real visibilitychange event; not an OS focus test", hiddenBefore, hiddenAfter });

  await expect(motion.page.locator("[data-qa-counter='scroll-subject']")).toHaveAttribute("data-count-state", "complete");
  const animation = await motion.page.locator("[data-qa-counter='scroll-subject']").evaluate(element => ({
    target: Number(element.dataset.countTo), value: Number(element.dataset.countValue), text: element.textContent,
    samples: __LANDING_QA_COUNTERS__.get(element) || [],
  }));
  expect(animation.value).toBe(animation.target);
  expect(animation.samples.some(sample => sample.value > 0 && sample.value < animation.target)).toBe(true);
  for (let index = 1; index < animation.samples.length; index++) expect(animation.samples[index].value).toBeGreaterThanOrEqual(animation.samples[index - 1].value);
  await motion.page.locator("h1").scrollIntoViewIfNeeded();
  await motion.page.locator("[data-qa-metric-group='scroll-subject']").scrollIntoViewIfNeeded();
  await motion.page.waitForTimeout(180);
  expect(await motion.page.locator("[data-qa-counter='scroll-subject']").evaluate(element => Number(element.dataset.countValue))).toBe(subject.target);
  record("offscreen-metrics-start-at-zero-then-count-monotonically-to-the-final-value-once", { subject, partial, animation, initialMetrics });

  for (const tab of ["sales", "team", "activity"]) {
    await motion.page.locator(`[data-feature-tab='${tab}']`).click();
    for (const counter of await motion.page.locator(`[data-feature-panel='${tab}'] [data-count-to]`).all()) {
      await counter.scrollIntoViewIfNeeded();
      await expect(counter).toHaveAttribute("data-count-state", "complete");
    }
  }
  await readWholePage(motion.page);
  await motion.page.locator("footer").scrollIntoViewIfNeeded();
  await motion.page.waitForTimeout(150);
  const idleBefore = await motion.page.evaluate(() => __BIRD_LANDING_MOTION__.getState());
  expect(idleBefore.pendingFrame).toBe(false);
  expect(idleBefore.active).toBe(0);
  await motion.page.waitForTimeout(220);
  const idleAfter = await motion.page.evaluate(() => __BIRD_LANDING_MOTION__.getState());
  expect(idleAfter.frameCount).toBe(idleBefore.frameCount);
  expect(idleAfter.values).toEqual(idleBefore.values);
  record("finished-or-offscreen-metrics-leave-no-idle-animation-clock-running", { idleBefore, idleAfter });
  await motion.context.close();

  const mobile = await createPage("landing-mobile", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await boot(mobile.page);
  await expect(mobile.page.locator("h1")).toBeInViewport();
  await capture(mobile.page, "04-mobile-hero");
  const mobileHeroLayout = await layout(mobile.page);
  const menu = mobile.page.locator("[data-landing-menu]");
  const mobileNav = mobile.page.locator("[data-landing-mobile-nav]");
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(mobileNav).toBeVisible();
  await capture(mobile.page, "05-mobile-menu");
  await mobileNav.locator("a[href='#features']").click();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(mobileNav).toBeHidden();
  await expect(mobile.page.locator("#features")).toBeInViewport();
  await menu.click();
  await mobile.page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  record("mobile-navigation-opens-closes-on-selection-and-supports-escape", { heroLayout: mobileHeroLayout });

  await mobile.page.locator("[data-feature-tab='activity']").click();
  await expect(mobile.page.locator("[data-feature-panel='activity']")).toBeVisible();
  await capture(mobile.page, "06-mobile-feature");
  const mobileFeatureLayout = await layout(mobile.page);
  await mobile.page.locator("[data-map-stage='won']").scrollIntoViewIfNeeded();
  await mobile.page.locator("[data-map-stage='won']").click();
  await expect(mobile.page.locator("[data-map-detail]")).toContainText(/ventas ganadas/i);
  const mobileMapControls = await verifyMapControlLayout(mobile.page);
  await settleVisibleCounters(mobile.page);
  await capture(mobile.page, "10-mobile-commercial-map");
  await mobile.page.locator("#faq").scrollIntoViewIfNeeded();
  await mobile.page.locator("#faq details summary").first().click();
  await expect(mobile.page.locator("#faq details").first()).toHaveAttribute("open", "");
  await capture(mobile.page, "07-mobile-faq");
  await readWholePage(mobile.page);
  await capture(mobile.page, "08-mobile-full-page", true);
  record("mobile-content-tabs-and-faq-remain-usable-without-horizontal-scroll", { featureLayout: mobileFeatureLayout, faqLayout: await layout(mobile.page), mobileMapControls, media: await noAgentOrMedia(mobile.page, { allowHeroVideo: true }) });
  await mobile.context.close();

  const narrow = await createPage("landing-narrow-mobile", { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
  await boot(narrow.page);
  await narrow.page.locator("[data-map-stage='negotiation']").scrollIntoViewIfNeeded();
  const narrowControls = await verifyMapControlLayout(narrow.page);
  await narrow.page.locator("[data-map-stage='negotiation']").click();
  await expect(narrow.page.locator("[data-map-detail]")).toContainText(/Luma\s+SL/);
  await capture(narrow.page, "11-narrow-mobile-map");
  await narrow.page.locator("footer a[href='#birdview-landing']").click();
  await expect(narrow.page.locator("h1")).toBeInViewport();
  record("narrow-mobile-keeps-five-stage-targets-separated-and-footer-navigation-working", { controls: narrowControls, layout: await layout(narrow.page) });
  await narrow.context.close();

  const reduced = await createPage("landing-reduced-motion", { reducedMotion: "reduce" });
  await boot(reduced.page, "/page/");
  await expect(reduced.page.locator("h1")).toBeVisible();
  await reduced.page.locator("[data-feature-tab='team']").click();
  await expect(reduced.page.locator("[data-feature-panel='team']")).toBeVisible();
  const reducedMetrics = await counterSnapshot(reduced.page);
  expect(reducedMetrics.length).toBeGreaterThan(5);
  expect(reducedMetrics.filter(metric => metric.state !== "complete" || metric.value !== metric.target)).toEqual([]);
  const reducedState = await reduced.page.evaluate(() => __BIRD_LANDING_MOTION__.getState());
  expect(reducedState.reducedMotion).toBe(true);
  expect(reducedState.pendingFrame).toBe(false);
  expect(reducedState.frameCount).toBe(0);
  await expect(reduced.page.locator("[data-hero-film]")).toHaveJSProperty("paused", true);
  await expect(reduced.page.locator("[data-hero-film-toggle]")).toBeHidden();
  await expect(reduced.page.locator(".bv-hero")).toHaveAttribute("data-hero-film-state", "poster");
  await expect(reduced.page.locator(".bv-hero-poster")).toBeVisible();
  const reducedFilm = await reduced.page.evaluate(() => __BIRD_HERO_FILM__.getState());
  expect(reducedFilm.reducedMotion).toBe(true);
  expect(reducedFilm.playing).toBe(false);
  const reducedMedia = await noAgentOrMedia(reduced.page, { allowHeroVideo: true });
  expect(reducedMedia.play).toBe(0);
  const reducedFramesBefore = await reduced.page.evaluate(() => __LANDING_QA_RAF__.getState());
  expect(reducedFramesBefore.pending).toBe(0);
  await reduced.page.waitForTimeout(220);
  const reducedFramesAfter = await reduced.page.evaluate(() => __LANDING_QA_RAF__.getState());
  expect(reducedFramesAfter).toEqual(reducedFramesBefore);
  expect(await reduced.page.evaluate(() => document.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
  record("trailing-slash-route-and-reduced-motion-show-final-metrics-without-animation", { path: "/page/", layout: await layout(reduced.page), reducedMetrics, reducedState, reducedFilm, reducedMedia, reducedFramesBefore, reducedFramesAfter });
  await reduced.context.close();

  for (const [path, name] of [["/", "dashboard"], ["/demo", "presentation"]]) {
    const route = await createPage(`existing-${name}`);
    await boot(route.page, path);
    await route.page.waitForFunction(() => window.__ATLAS_CITY__?.sceneReady, null, { timeout: 90000 });
    expect(await route.page.locator("main#birdview-landing").count()).toBe(0);
    expect(await route.page.locator("canvas").count()).toBe(1);
    if (path === "/") {
      await expect(route.page.locator(".c-rail")).toBeVisible();
      expect(await route.page.evaluate(() => typeof window.__BIRD_DEMO_SIMULATION__)).toBe("undefined");
    } else {
      await route.page.waitForFunction(() => !!window.__BIRD_DEMO_SIMULATION__?.getState);
      expect((await route.page.evaluate(() => __BIRD_DEMO_SIMULATION__.getState())).simulated).toBe(true);
    }
    record(`existing-${name}-route-keeps-its-city-experience`, { path, media: await noAgentOrMedia(route.page) });
    await route.context.close();
  }

  expect(errors).toEqual([]);
  expect(failedResources).toEqual([]);
  const tavusRequests = requests.filter(request => vendorHost(new URL(request.url).hostname));
  expect(tavusRequests).toEqual([]);
  const thirdPartyRequests = requests.filter(request => new URL(request.url).origin !== new URL(base).origin);
  expect(thirdPartyRequests).toEqual([]);
  const finalSourceSha256 = await sourceHashes();
  expect(finalSourceSha256).toEqual(sourceSha256);
  await writeFile(`${output}/browser-validation.json`, JSON.stringify({
    generatedAt: new Date().toISOString(), startedAt, browser: browser.version(),
    environment: "Chromium headless on Linux; desktop 1440×1000 and mobile viewports 390×844 / 360×800, not a physical-phone test. Existing WebGL routes use ANGLE/SwiftShader.",
    screenshots: "Actual rendered landing. Finite DOM entrance animations are disabled for readable stills; number evolution is observed as real intermediate DOM values in a separate page.",
    fullPageCaptureCaveat: "This headless Chromium/ANGLE environment can repeat hero compositor layers near the end of long screenshots, even with the film paused. Use the viewport/section captures as visual evidence for the footer; this does not occur in the actual footer viewport or DOM.",
    productDestination: productUrl, liveConversationStarted: false, microphoneOpened: false,
    results, errors, failedResources, tavusRequests, thirdPartyRequests, loadedAssets: [...loadedAssets], sourceSha256, workingTreeSourceSha256AtCompletion: finalSourceSha256,
  }, null, 2));
  await rm(`${output}/last-failure.json`, { force: true });
  await rm(`${output}/failure.png`, { force: true });
} catch (error) {
  if (currentPage && !currentPage.isClosed()) await capture(currentPage, "failure").catch(() => {});
  await writeFile(`${output}/last-failure.json`, JSON.stringify({ generatedAt: new Date().toISOString(), startedAt, error: error.stack, results, errors, failedResources, loadedAssets: [...loadedAssets] }, null, 2));
  throw error;
} finally {
  await browser.close();
}
