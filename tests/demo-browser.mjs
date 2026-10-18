import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { loadEnv } from "vite";
import { EXISTING_AGENT_TOOL_DEFINITIONS, getExistingAgentCatalogue } from "../src/demo/existing-agent-tools.js";

// This suite exercises the real public configuration and manual 3D
// controls. SDK doubles below exercise local events only: no Tavus connection,
// media stream, or avatar is created. Their screenshots carry a QA banner.
const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const output = process.env.CAPTURE_DIR || "docs/demo";
// An explicit empty override exercises the unconfigured build. Never infer a
// connection from the presence of a public deployment ID. Start is clicked only
// after replacing widget creation with the explicitly labelled local SDK double.
const expectedPublicDeploymentId = Object.hasOwn(
  process.env,
  "EXPECT_TAVUS_DEPLOYMENT_ID",
)
  ? process.env.EXPECT_TAVUS_DEPLOYMENT_ID.trim()
  : (
      loadEnv("production", process.cwd(), "VITE_").VITE_TAVUS_DEPLOYMENT_ID ||
      ""
    ).trim();
const expectedConfigured = Boolean(expectedPublicDeploymentId);
const configurationLabel = expectedConfigured ? "ready" : "unconfigured";
await mkdir(`${output}/captures`, { recursive: true });
const startedAt = new Date().toISOString();
const results = [],
  errors = [],
  requests = [];
const loadedAssetUrls = new Set(),
  loadedAssetPromises = [];
let currentPage;
let controlledStartClicks = 0;
const vendorHost = (hostname) =>
  /(?:^|\.)(?:tavusapi\.com|tavus\.(?:io|com|dev)|daily\.co)$/i.test(hostname);
const hash = (body) => createHash("sha256").update(body).digest("hex");
async function sourceHashes() {
  const files = [
    "src/main.js",
    "api/tavus-config.js",
    "package.json",
    "package-lock.json",
    ".env.production",
  ];
  for (const directory of ["src/city", "src/demo"])
    for (const name of await readdir(directory))
      if (/\.(js|css)$/.test(name)) files.push(`${directory}/${name}`);
  return Object.fromEntries(
    await Promise.all(
      files.sort().map(async (name) => [name, hash(await readFile(name))]),
    ),
  );
}
const initialSourceSha256 = await sourceHashes();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
function observe(page, name) {
  page.setDefaultTimeout(60000);
  page.on("pageerror", (error) =>
    errors.push({ page: name, message: error.message }),
  );
  page.on("request", (request) =>
    requests.push({ page: name, url: request.url(), method: request.method() }),
  );
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.origin !== new URL(base).origin ||
      !/\.(?:js|css)$/.test(url.pathname) ||
      loadedAssetUrls.has(url.href)
    )
      return;
    loadedAssetUrls.add(url.href);
    loadedAssetPromises.push(
      response
        .body()
        .then((body) => ({
          url: url.pathname,
          status: response.status(),
          sha256: hash(body),
          containsExpectedPublicDeploymentId:
            expectedConfigured &&
            body.includes(Buffer.from(expectedPublicDeploymentId)),
        }))
        .catch((error) => ({ url: url.pathname, error: error.message })),
    );
  });
}
async function createPage(name, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ...options,
  });
  const page = await context.newPage();
  observe(page, name);
  // A guard in addition to assertions: no test may accidentally start a paid
  // Tavus session or open a Daily room, even if a future SDK changes behaviour.
  await context.route("**/*", (route) =>
    vendorHost(new URL(route.request().url()).hostname)
      ? route.abort("blockedbyclient")
      : route.continue(),
  );
  await page.addInitScript(() => {
    const calls = { getUserMedia: 0, mediaPlay: 0, audioContext: 0 };
    Object.defineProperty(window, "__DEMO_QA_MEDIA__", { value: calls });
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = async () => {
        calls.getUserMedia++;
        throw new DOMException(
          "QA blocks unexpected media capture",
          "NotAllowedError",
        );
      };
    }
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      calls.mediaPlay++;
      return originalPlay.apply(this, args);
    };
    for (const name of ["AudioContext", "webkitAudioContext"]) {
      if (typeof window[name] === "function") {
        const Original = window[name];
        window[name] = new Proxy(Original, {
          construct(target, args) {
            calls.audioContext++;
            return Reflect.construct(target, args);
          },
        });
      }
    }
  });
  currentPage = page;
  return { page, context };
}
async function installControlledSdkDouble(page) {
  await page.addInitScript(() => {
    const nativeCreateElement = document.createElement;
    const state = { elements: [], starts: 0, closes: 0, destroys: 0, messages: [] };
    Object.defineProperty(window, "__DEMO_QA_SDK_DOUBLE__", { value: state });
    document.createElement = function (name, ...args) {
      if (!["tavus-widget", "tavus-embed"].includes(String(name).toLowerCase()))
        return nativeCreateElement.call(this, name, ...args);
      // This is a DIV, never an instance of either registered Tavus element.
      const element = nativeCreateElement.call(this, "div");
      element.dataset.qaSdkDouble = name;
      element.style.display = "none";
      element.startConversation = () => {
        state.starts++;
        queueMicrotask(() => element.dispatchEvent(new CustomEvent("tavus:conversation-started", {
          detail: { conversationId: "qa-controlled-sdk-double-no-real-call" },
        })));
        return Promise.resolve();
      };
      element.sendMessage = (message) => state.messages.push(structuredClone(message));
      element.close = () => { state.closes++; };
      element.destroy = () => { state.destroys++; };
      state.elements.push(element);
      return element;
    };
  });
}
async function markControlledScreenshot(page) {
  await page.evaluate(() => {
    const banner = document.createElement("div");
    banner.id = "qa-controlled-sdk-banner";
    banner.textContent = "PRUEBA CONTROLADA · SDK DOBLE · Sin conexión, voz ni vídeo reales";
    banner.setAttribute("role", "note");
    banner.style.cssText = "position:fixed;z-index:2147483647;top:0;left:0;right:0;background:#7c2d12;color:white;padding:9px 12px;font:700 12px/1.4 sans-serif;text-align:center;pointer-events:none";
    document.body.append(banner);
  });
}
async function frames(page, count = 2) {
  await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        let seen = 0;
        const tick = () =>
          ++seen >= count ? resolve() : requestAnimationFrame(tick);
        requestAnimationFrame(tick);
      }),
    count,
  );
}
async function settled(page) {
  await page.waitForFunction(
    () =>
      !!window.__ATLAS_CITY__?.scene &&
      !__ATLAS_CITY__.scene.getDiagnostics().cameraMoving,
  );
  await frames(page);
}
async function boot(page, path = "/demo") {
  const response = await page.goto(new URL(path, base).href);
  expect(response.status()).toBe(200);
  await page.waitForFunction(() => window.__ATLAS_CITY__?.sceneReady);
  await page.evaluate(() => __ATLAS_CITY__.scene.debug.ready);
  await settled(page);
}
async function shot(page, name) {
  await page.screenshot({
    path: `${output}/captures/${name}.png`,
    fullPage: true,
    timeout: 60000,
  });
}
async function sources(page) {
  return page.evaluate(() => ({
    crm: JSON.stringify(__ATLAS_CITY__.provider.getState()),
    industry: JSON.stringify(__ATLAS_CITY__.industryProvider.getState()),
  }));
}
async function camera(page) {
  return page.evaluate(() => {
    const { camera, controls } = __ATLAS_CITY__.scene.debug;
    return {
      quaternion: camera.quaternion.toArray(),
      position: camera.position.toArray(),
      target: controls.target.toArray(),
      zoom: camera.zoom,
    };
  });
}
function fixedBearing(before, after) {
  after.quaternion.forEach((value, index) =>
    expect(Math.abs(value - before.quaternion[index])).toBeLessThan(1e-5),
  );
}
function record(name, detail) {
  results.push({ name, passed: true, detail });
  console.log(`PASS ${name}`);
}
async function mediaState(page) {
  return page.evaluate(() => ({
    ...__DEMO_QA_MEDIA__,
    widgetCount: document.querySelectorAll("tavus-widget,tavus-embed").length,
    widgetRegistered: Boolean(customElements.get("tavus-widget")),
    embedRegistered: Boolean(customElements.get("tavus-embed")),
    mediaElements: document.querySelectorAll("audio,video").length,
  }));
}
function noMedia(state, sdkRegistered = true) {
  expect(state).toEqual({
    getUserMedia: 0,
    mediaPlay: 0,
    audioContext: 0,
    widgetCount: 0,
    widgetRegistered: sdkRegistered,
    embedRegistered: sdkRegistered,
    mediaElements: 0,
  });
}
async function manual(page, action) {
  const before = await camera(page);
  await page.locator(`[data-demo-action='${action}']`).click();
  if (["sales", "industry", "overview"].includes(action)) {
    await page.waitForFunction(
      () =>
        __ATLAS_CITY__.scene.presentation.getState().navigating ||
        __ATLAS_CITY__.scene.getDiagnostics().cameraMoving,
    );
    await settled(page);
  } else await frames(page, 1);
  const after = await camera(page);
  fixedBearing(before, after);
  return {
    before,
    after,
    presentation: await page.evaluate(() =>
      __ATLAS_CITY__.scene.presentation.getState(),
    ),
    title: await page.locator("#bird-demo-view-title").innerText(),
    detail: await page.locator("#bird-demo-view-detail").innerText(),
  };
}
async function controlledTool(page, id, name, args) {
  await page.evaluate(({ id, name, args }) => {
    const widget = __DEMO_QA_SDK_DOUBLE__.elements.at(-1);
    widget.dispatchEvent(new CustomEvent("tavus:tool-call", {
      detail: { name, arguments: JSON.stringify(args), tool_call_id: id },
    }));
  }, { id, name, args });
  await page.waitForFunction((id) => __DEMO_QA_SDK_DOUBLE__.messages.some((message) =>
    message.event_type === "conversation.tool_result" && message.properties.tool_call_id === id), id);
  return page.evaluate((id) => __DEMO_QA_SDK_DOUBLE__.messages.find((message) =>
    message.event_type === "conversation.tool_result" && message.properties.tool_call_id === id), id);
}
async function controlledBridgeScenario(label, options = {}) {
  const { page, context } = await createPage(`qa-controlled-sdk-${label}`, options);
  await installControlledSdkDouble(page);
  await boot(page);
  await page.waitForFunction(() => __BIRD_DEMO__?.getState().configuration?.contractsReady);
  const before = await sources(page), initialCamera = await camera(page);
  noMedia(await mediaState(page));
  await markControlledScreenshot(page);
  await page.locator("[data-demo-action='start']").click();
  controlledStartClicks++;
  await page.waitForFunction(() => __BIRD_DEMO__.getState().session.status === "connected");
  const capturedContext = await page.evaluate(() => {
    const widget = __DEMO_QA_SDK_DOUBLE__.elements.at(-1);
    return {
      surface: widget.dataset.qaSdkDouble,
      deploymentId: widget.getAttribute("deployment-id"),
      context: widget.getAttribute("conversational-context"),
      starts: __DEMO_QA_SDK_DOUBLE__.starts,
      actualTavusElementCount: document.querySelectorAll("tavus-widget,tavus-embed").length,
    };
  });
  expect(capturedContext.surface).toBe(label === "mobile" ? "tavus-embed" : "tavus-widget");
  expect(capturedContext.deploymentId).toBe(expectedPublicDeploymentId);
  expect(capturedContext.starts).toBe(1);
  expect(capturedContext.actualTavusElementCount).toBe(0);
  expect(capturedContext.context).toContain("industry-stage:manufacturing");
  const contextData = JSON.parse(capturedContext.context.split("DATOS FICTICIOS DE LA DEMO:\n").at(-1));
  expect(contextData.presentationTools.definitions).toEqual(EXISTING_AGENT_TOOL_DEFINITIONS);
  expect(contextData.presentationTools.catalogue).toEqual(getExistingAgentCatalogue({ crm: JSON.parse(before.crm), industry: JSON.parse(before.industry) }));
  const movement = await controlledTool(page, `${label}-move`, "trigger_3d_camera_movement", { movement_id: "industry-stage:manufacturing" });
  expect(movement.properties.output.ok).toBe(true);
  await settled(page);
  const focusedCamera = await camera(page);
  fixedBearing(initialCamera, focusedCamera);
  expect(await page.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics().district)).toBe("industry");
  const highlight = await controlledTool(page, `${label}-highlight`, "highlight_building", { building_id: "industry-stage:manufacturing" });
  expect(highlight.properties.output.ok).toBe(true);
  expect(await page.evaluate(() => __ATLAS_CITY__.scene.presentation.getState().highlight)).toMatchObject({ kind: "industry-stage", id: "manufacturing" });
  const pulse = await controlledTool(page, `${label}-pulse`, "trigger_animation", { animation_id: "pulse:industry-stage:manufacturing" });
  expect(pulse.properties.output.ok).toBe(true);
  if (label === "mobile") await page.locator("#city-world").scrollIntoViewIfNeeded();
  await frames(page, 1);
  await shot(page, `qa-sdk-double-${label}-tool-highlight`);
  const machinery = await controlledTool(page, `${label}-machinery`, "trigger_animation", { animation_id: "machinery" });
  expect(machinery.properties.output.ok).toBe(true);
  const matrixBefore = await page.evaluate(() => Array.from(__ATLAS_CITY__.scene.debug.scene.getObjectByName("Animación ilustrativa de fabricación y empacado").instanceMatrix.array.slice(0, 32)));
  await frames(page, 3);
  const matrixAfter = await page.evaluate(() => Array.from(__ATLAS_CITY__.scene.debug.scene.getObjectByName("Animación ilustrativa de fabricación y empacado").instanceMatrix.array.slice(0, 32)));
  expect(matrixAfter).not.toEqual(matrixBefore);
  const invalidCamera = await controlledTool(page, `${label}-invalid-args`, "trigger_3d_camera_movement", { unsupported_key: "industry-stage:manufacturing" });
  expect(invalidCamera.properties.output.ok).toBe(false);
  expect(invalidCamera.properties.output.code).toBe("TOOL_ARGUMENTS_INVALID");
  const unavailableBuilding = await controlledTool(page, `${label}-missing-building`, "highlight_building", { building_id: "not-an-existing-building" });
  expect(unavailableBuilding.properties.output.ok).toBe(false);
  expect(unavailableBuilding.properties.output.code).toBe("TOOL_BINDING_UNRESOLVED");
  expect(await sources(page)).toEqual(before);
  noMedia(await mediaState(page));
  await page.locator("[data-demo-action='stop']").click();
  await page.waitForFunction(() => __BIRD_DEMO__.getState().session.status === "ended");
  await settled(page);
  const restoredCamera = await camera(page);
  for (const key of ["position", "target", "quaternion"]) restoredCamera[key].forEach((value, index) => expect(Math.abs(value - initialCamera[key][index])).toBeLessThan(1e-5));
  expect(Math.abs(restoredCamera.zoom - initialCamera.zoom)).toBeLessThan(1e-5);
  expect(await sources(page)).toEqual(before);
  const cleanup = await page.evaluate(() => ({ closes: __DEMO_QA_SDK_DOUBLE__.closes, destroys: __DEMO_QA_SDK_DOUBLE__.destroys, mountedDoubles: document.querySelectorAll("[data-qa-sdk-double]").length }));
  expect(cleanup).toEqual({ closes: 1, destroys: 1, mountedDoubles: 0 });
  record(`controlled-sdk-double-${label}-uses-real-exported-schemas-bridge-and-webgl-without-a-live-call`, {
    evidenceKind: "CONTROLLED_SDK_DOUBLE_NOT_A_TAVUS_CONVERSATION",
    capturedContext, movement, highlight, pulse, machinery, invalidCamera, unavailableBuilding,
    initialCamera, focusedCamera, restoredCamera, machineryMatricesChanged: true, cleanup,
  });
  await context.close();
}

try {
  const desktop = await createPage("demo-desktop");
  await boot(desktop.page);
  const page = desktop.page;
  await page.waitForFunction(
    () => !!window.__BIRD_DEMO__?.getState().configuration,
  );
  const before = await sources(page),
    fixed = await camera(page);
  const configuration = await page.evaluate(() => __BIRD_DEMO__.getState());
  expect(configuration.configuration).toMatchObject({
    configured: expectedConfigured,
    contractsReady: true,
  });
  expect(configuration.session).toMatchObject({
    status: "idle",
    microphone: "not-requested",
  });
  if (expectedConfigured)
    await expect(page.locator("[data-demo-action='start']")).toBeEnabled();
  else await expect(page.locator("[data-demo-action='start']")).toBeDisabled();
  await expect(page.locator("[data-demo-action='stop']")).toBeDisabled();
  await expect(page.locator("[data-demo-action='interrupt']")).toBeDisabled();
  await expect(page.locator("#bird-demo-status")).toContainText(
    expectedConfigured ? "Listo para empezar" : "pendiente",
  );
  await expect(page.locator("#bird-demo-message")).toContainText(
    expectedConfigured ? "Pulsa Iniciar" : "Deployment ID",
  );
  await expect(page.locator("#bird-demo-config-hint")).toContainText(
    "Controles del agente configurados",
  );
  await expect(page.locator("#bird-demo-microphone")).toHaveText(
    "Micrófono sin solicitar",
  );
  await expect(page.locator("#bird-demo-panel")).toBeVisible();
  const initialMedia = await mediaState(page);
  noMedia(initialMedia);
  await shot(page, `demo-desktop-${configurationLabel}`);
  record(
    `demo-route-renders-real-city-with-${configurationLabel}-configuration-and-no-media-autostart`,
    { url: page.url(), configuration, media: initialMedia, camera: fixed },
  );

  const sales = await manual(page, "sales");
  const expectedDeal = JSON.parse(before.crm).deals.find((deal) =>
    ["lead", "qualified", "proposal", "negotiation"].includes(deal.stageId),
  );
  expect(sales.title).toContain(expectedDeal.name);
  expect(sales.detail).toContain("Oportunidad comercial");
  expect(sales.detail).toContain("No es un cobro");
  expect(
    await page.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics().district),
  ).toBe("sales");
  expect(sales.after.zoom).toBeGreaterThan(fixed.zoom);
  const salesHighlight = await manual(page, "highlight");
  expect(salesHighlight.presentation.highlight).toMatchObject({
    kind: "deal",
    id: expectedDeal.id,
  });
  expect(await sources(page)).toEqual(before);
  await shot(page, "demo-commercial-readonly-highlight");
  record("manual-commercial-camera-and-real-highlight-preserve-crm-and-erp", {
    expectedDeal: {
      id: expectedDeal.id,
      name: expectedDeal.name,
      amount: expectedDeal.amount,
    },
    sales,
    salesHighlight,
  });

  const industry = await manual(page, "industry");
  const sourceUnits = JSON.parse(before.industry).batches.reduce(
    (sum, batch) => sum + batch.quantity,
    0,
  );
  expect(sourceUnits).toBe(1320);
  expect(industry.title).toContain(JSON.parse(before.industry).stages.find((stage) => stage.id === "manufacturing").name);
  expect(industry.detail).toContain(`${sourceUnits} unidades`);
  expect(industry.detail).toContain("Ruta estimada");
  expect(
    await page.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics().district),
  ).toBe("industry");
  const industryHighlight = await manual(page, "highlight");
  expect(industryHighlight.presentation.highlight).toMatchObject({
    kind: "industry-stage",
    id: "manufacturing",
  });
  expect(await sources(page)).toEqual(before);
  noMedia(await mediaState(page));
  await shot(page, "demo-industrial-readonly-highlight");
  record(
    "manual-industrial-camera-highlights-manufacturing-and-preserves-1320-units",
    { sourceUnits, industry, industryHighlight },
  );

  const overview = await manual(page, "overview");
  expect(
    await page.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics().district),
  ).toBe("all");
  expect(overview.title).toBe("Tu empresa, de un vistazo");
  expect(overview.after.zoom).toBeLessThan(industry.after.zoom);
  expect(await sources(page)).toEqual(before);
  const finalMedia = await mediaState(page);
  noMedia(finalMedia);
  record("manual-overview-keeps-fixed-bearing-without-starting-tavus", {
    overview,
    media: finalMedia,
  });
  await desktop.context.close();

  const normal = await createPage("normal-city");
  await boot(normal.page, "/");
  expect(await normal.page.locator("#bird-demo-panel").count()).toBe(0);
  expect(await normal.page.evaluate(() => typeof window.__BIRD_DEMO__)).toBe(
    "undefined",
  );
  const normalMedia = await mediaState(normal.page);
  noMedia(normalMedia, false);
  await expect(normal.page.locator(".c-assistant")).toBeVisible();
  const normalBefore = await sources(normal.page),
    normalFixed = await camera(normal.page);
  await normal.page.evaluate(() =>
    __ATLAS_CITY__.setDistrict("communications"),
  );
  await settled(normal.page);
  fixedBearing(normalFixed, await camera(normal.page));
  expect(
    await normal.page.evaluate(
      () => __ATLAS_CITY__.scene.getDiagnostics().district,
    ),
  ).toBe("communications");
  expect(await sources(normal.page)).toEqual(normalBefore);
  const normalRequests = requests.filter(
    (request) => request.page === "normal-city",
  );
  expect(
    normalRequests.some(({ url }) =>
      /\/assets\/(?:tavus|demo)[^/]*\.(?:js|css)/i.test(new URL(url).pathname),
    ),
  ).toBe(false);
  expect(
    normalRequests.some(
      ({ url }) => new URL(url).pathname === "/api/tavus-config",
    ),
  ).toBe(false);
  await shot(normal.page, "normal-city-v5-preserved");
  record(
    "normal-city-retains-v5-assistant-and-navigation-without-demo-or-tavus-sdk",
    {
      media: normalMedia,
      requests: normalRequests.map(({ url }) => new URL(url).pathname),
    },
  );
  await normal.context.close();

  const mobile = await createPage("demo-mobile", {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  await boot(mobile.page);
  await mobile.page.waitForFunction(
    () => !!window.__BIRD_DEMO__?.getState().configuration,
  );
  if (expectedConfigured)
    await expect(
      mobile.page.locator("[data-demo-action='start']"),
    ).toBeEnabled();
  else
    await expect(
      mobile.page.locator("[data-demo-action='start']"),
    ).toBeDisabled();
  await expect(mobile.page.locator("#bird-demo-message")).toContainText(
    expectedConfigured ? "Pulsa Iniciar" : "Deployment ID",
  );
  const mobileBefore = await sources(mobile.page),
    mobileFixed = await camera(mobile.page);
  const mobileIndustry = await manual(mobile.page, "industry");
  fixedBearing(mobileFixed, await camera(mobile.page));
  expect(mobileIndustry.detail).toContain("1320 unidades");
  expect(await sources(mobile.page)).toEqual(mobileBefore);
  const mobileMedia = await mediaState(mobile.page);
  noMedia(mobileMedia);
  await mobile.page.locator("#bird-demo-panel").scrollIntoViewIfNeeded();
  const responsive = await mobile.page.evaluate(() => {
    const bounds = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      };
    };
    return {
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panel: bounds("#bird-demo-panel"),
      start: bounds("[data-demo-action='start']"),
      canvas: bounds("#city-canvas"),
    };
  });
  expect(responsive.documentWidth).toBeLessThanOrEqual(390);
  expect(responsive.panel.x).toBeGreaterThanOrEqual(0);
  expect(responsive.panel.right).toBeLessThanOrEqual(390);
  expect(responsive.start.width).toBeGreaterThanOrEqual(44);
  expect(responsive.start.height).toBeGreaterThanOrEqual(44);
  expect(responsive.canvas.height).toBeGreaterThanOrEqual(150);
  await shot(mobile.page, `demo-mobile-${configurationLabel}-industry`);
  await mobile.page.locator("#city-world").scrollIntoViewIfNeeded();
  await frames(mobile.page, 2);
  const visibleMobileCanvas = await mobile.page
    .locator("#city-canvas")
    .boundingBox();
  expect(visibleMobileCanvas.y).toBeGreaterThanOrEqual(0);
  expect(
    visibleMobileCanvas.y + visibleMobileCanvas.height,
  ).toBeLessThanOrEqual(845);
  await shot(mobile.page, "demo-mobile-industrial-city");
  record("390px-demo-keeps-guide-controls-and-city-usable-without-media", {
    responsive,
    visibleMobileCanvas,
    media: mobileMedia,
    mobileIndustry,
  });
  await mobile.context.close();

  if (expectedConfigured) {
    await controlledBridgeScenario("desktop");
    await controlledBridgeScenario("mobile", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  }

  expect(errors).toEqual([]);
  const tavusRequests = requests.filter(({ url }) => vendorHost(new URL(url).hostname));
  expect(tavusRequests).toEqual([]);
  const finalSourceSha256 = await sourceHashes();
  expect(finalSourceSha256).toEqual(initialSourceSha256);
  const loadedAssets = await Promise.all(loadedAssetPromises);
  if (expectedConfigured)
    expect(
      loadedAssets.some((asset) => asset.containsExpectedPublicDeploymentId),
    ).toBe(true);
  await writeFile(
    `${output}/browser-validation.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        startedAt,
        expectedPublicDeploymentId: expectedPublicDeploymentId || null,
        realSdkStartButtonClicked: false,
        controlledSdkDoubleStartClicks: controlledStartClicks,
        browser: browser.version(),
        environment:
          "Chromium headless, ANGLE/SwiftShader software WebGL; no physical-device or live-Tavus validation",
        loadedAssets,
        sourceSha256: initialSourceSha256,
        workingTreeSourceSha256AtCompletion: finalSourceSha256,
        errors,
        tavusRequests,
        results,
      },
      null,
      2,
    ),
  );
  await rm(`${output}/last-failure.json`, { force: true });
  await rm(`${output}/captures/failure.png`, { force: true });
} catch (error) {
  if (currentPage && !currentPage.isClosed())
    await shot(currentPage, "failure").catch(() => {});
  await writeFile(
    `${output}/last-failure.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        startedAt,
        error: error.stack,
        errors,
        loadedAssets: await Promise.all(loadedAssetPromises),
        results,
        sourceSha256: initialSourceSha256,
        workingTreeSourceSha256AtCompletion: await sourceHashes(),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
