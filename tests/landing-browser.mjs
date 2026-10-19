import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";

// The marketing route is exercised as a real browser page. Existing city and
// presentation routes receive a read-only smoke check; no conversations start.
const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const output = process.env.CAPTURE_DIR || "/tmp/birdview-landing-qa";
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
    if (/\.(?:png|jpe?g|webp|svg)$/i.test(name)) files.push(`public/assets/landing/${name}`);
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
    if (/\.(?:js|css|png|jpe?g|webp|svg|woff2?)(?:\?|$)/i.test(response.url())) loadedAssets.add(url.pathname);
    if (url.origin === new URL(base).origin && response.status() >= 400) failedResources.push({ page: name, url: url.pathname, status: response.status() });
  });
  await page.addInitScript(() => {
    const media = { getUserMedia: 0, play: 0, speech: 0 };
    window.__LANDING_QA_MEDIA__ = media;
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
      media.getUserMedia++;
      throw new DOMException("QA forbids media capture", "NotAllowedError");
    };
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) { media.play++; return originalPlay.apply(this, args); };
    if (window.speechSynthesis) {
      const speak = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak = (...args) => { media.speech++; return speak(...args); };
    }
  });
  return { page, context };
}

async function boot(page, path = "/page") {
  const response = await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
  expect(response.status()).toBe(200);
  await page.evaluate(() => document.fonts.ready);
}
async function capture(page, name, fullPage = false) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage, animations: "disabled" });
}
async function readWholePage(page) {
  const metrics = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, step: innerHeight * 0.75 }));
  for (let y = 0; y < metrics.height; y += metrics.step) {
    await page.evaluate(y => {
      window.scrollTo({ top: y, behavior: "instant" });
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, y);
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
async function noAgentOrMedia(page) {
  const media = await page.evaluate(() => ({
    ...__LANDING_QA_MEDIA__,
    tavusRegistered: !!customElements.get("tavus-embed") || !!customElements.get("tavus-widget"),
    tavusElements: document.querySelectorAll("tavus-embed, tavus-widget").length,
  }));
  expect(media).toEqual({ getUserMedia: 0, play: 0, speech: 0, tavusRegistered: false, tavusElements: 0 });
  return media;
}
function record(name, detail = {}) {
  results.push({ name, passed: true, detail });
  console.log(`PASS ${name}`);
}

try {
  const desktop = await createPage("landing-desktop");
  await boot(desktop.page);
  await expect(desktop.page.locator("main#birdview-landing")).toBeVisible();
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
  await capture(desktop.page, "01-desktop-hero");
  record("desktop-landing-presents-birdview-by-faradai-with-a-working-product-destination", { title, productUrl, layout: await layout(desktop.page), media: await noAgentOrMedia(desktop.page) });

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
  record("feature-controls-show-distinct-sales-team-and-activity-explanations", { featureStates });

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
  await mobile.page.locator("#faq").scrollIntoViewIfNeeded();
  await mobile.page.locator("#faq details summary").first().click();
  await expect(mobile.page.locator("#faq details").first()).toHaveAttribute("open", "");
  await capture(mobile.page, "07-mobile-faq");
  await readWholePage(mobile.page);
  await capture(mobile.page, "08-mobile-full-page", true);
  record("mobile-content-tabs-and-faq-remain-usable-without-horizontal-scroll", { featureLayout: mobileFeatureLayout, faqLayout: await layout(mobile.page), media: await noAgentOrMedia(mobile.page) });
  await mobile.context.close();

  const reduced = await createPage("landing-reduced-motion", { reducedMotion: "reduce" });
  await boot(reduced.page, "/page/");
  await expect(reduced.page.locator("h1")).toBeVisible();
  await reduced.page.locator("[data-feature-tab='team']").click();
  await expect(reduced.page.locator("[data-feature-panel='team']")).toBeVisible();
  record("trailing-slash-route-and-reduced-motion-keep-the-landing-and-feature-controls-available", { path: "/page/", layout: await layout(reduced.page) });
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
  const finalSourceSha256 = await sourceHashes();
  expect(finalSourceSha256).toEqual(sourceSha256);
  await writeFile(`${output}/browser-validation.json`, JSON.stringify({
    generatedAt: new Date().toISOString(), startedAt, browser: browser.version(),
    environment: "Chromium headless on Linux; desktop 1440×1000 and mobile viewport 390×844, not a physical-phone test. Existing WebGL routes use ANGLE/SwiftShader.",
    screenshots: "Actual rendered landing; finite DOM animations disabled for readable stills.",
    productDestination: productUrl, liveConversationStarted: false, microphoneOpened: false,
    results, errors, failedResources, tavusRequests, loadedAssets: [...loadedAssets], sourceSha256, workingTreeSourceSha256AtCompletion: finalSourceSha256,
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
