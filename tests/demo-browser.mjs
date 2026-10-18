import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { loadEnv } from "vite";
import { EXISTING_AGENT_TOOL_DEFINITIONS, getExistingAgentCatalogue } from "../src/demo/existing-agent-tools.js";
import { getPresentationFrame } from "../src/demo/presentation-state.js";

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
    const nativeDefine = customElements.define.bind(customElements);
    const state = { elements: [], starts: 0, ends: 0, destroys: 0, messages: [], blockedDefinitions: [] };
    Object.defineProperty(window, "__DEMO_QA_SDK_DOUBLE__", { value: state });
    customElements.define = function (name, ...args) {
      if (["tavus-widget", "tavus-embed"].includes(name)) {
        state.blockedDefinitions.push(name);
        return;
      }
      return nativeDefine(name, ...args);
    };
    document.createElement = function (name, ...args) {
      if (!["tavus-widget", "tavus-embed"].includes(String(name).toLowerCase()))
        return nativeCreateElement.call(this, name, ...args);
      // Preserve the literal tag for production :has(tavus-embed) layout CSS,
      // but prevent its registration above: this is an inert HTML element.
      const element = nativeCreateElement.call(this, name);
      element.dataset.qaSdkDouble = name;
      element.startConversation = () => {
        state.starts++;
        queueMicrotask(() => element.dispatchEvent(new CustomEvent("tavus:conversation-started", {
          detail: { conversationId: "qa-controlled-sdk-double-no-real-call" },
        })));
        return Promise.resolve();
      };
      element.sendMessage = (message) => state.messages.push(structuredClone(message));
      element.endConversation = () => { state.ends++; };
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
      type: camera.type,
      fov: camera.fov ?? null,
    };
  });
}
function fixedBearing(before, after) {
  after.quaternion.forEach((value, index) =>
    expect(Math.abs(value - before.quaternion[index])).toBeLessThan(1e-5),
  );
}
function distance(a, b) {
  return Math.hypot(...a.map((value, index) => value - b[index]));
}
function cinematicChange(before, after) {
  expect(before.type).toBe("PerspectiveCamera");
  expect(after.type).toBe("PerspectiveCamera");
  expect(distance(before.position, after.position)).toBeGreaterThan(1);
  expect(distance(before.quaternion, after.quaternion)).toBeGreaterThan(0.005);
}
async function immersiveLayout(page, active = false) {
  const layout = await page.evaluate(() => {
    const bounds = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
    };
    const legacySelectors = [".c-rail", ".c-header", ".c-heading", "#city-metrics", "#city-district-nav", ".c-toolbar", ".c-search-row", "#city-map-summary", ".c-bottom-bar", ".c-footer", "#city-table", ".c-map-controls", ".c-pan-controls", "#city-assistant-host", "#city-inspector", "#city-drawer"];
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      canvas: bounds(__ATLAS_CITY__.scene.debug.renderer.domElement),
      dock: bounds(document.querySelector("#bird-demo-panel")),
      host: bounds(document.querySelector("#bird-widget-host")),
      inertEmbed: document.querySelector("tavus-embed[data-qa-sdk-double]") ? bounds(document.querySelector("tavus-embed[data-qa-sdk-double]")) : null,
      visibleLegacy: legacySelectors.flatMap((selector) => [...document.querySelectorAll(selector)].filter(element => {
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }).map(() => selector)),
    };
  });
  expect(layout.visibleLegacy).toEqual([]);
  expect(Math.abs(layout.canvas.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(layout.canvas.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(layout.canvas.width - layout.viewport.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(layout.canvas.height - layout.viewport.height)).toBeLessThanOrEqual(1);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport.width);
  expect(layout.documentHeight).toBeLessThanOrEqual(layout.viewport.height + 1);
  expect(layout.dock.x).toBeGreaterThanOrEqual(0);
  expect(layout.dock.y).toBeGreaterThanOrEqual(0);
  expect(layout.dock.right).toBeLessThanOrEqual(layout.viewport.width + 1);
  expect(layout.dock.bottom).toBeLessThanOrEqual(layout.viewport.height + 1);
  expect(layout.viewport.width - layout.dock.right).toBeLessThan(64);
  expect(layout.viewport.height - layout.dock.bottom).toBeLessThan(64);
  if (active) {
    expect(layout.inertEmbed).not.toBeNull();
    expect(layout.inertEmbed.width).toBeGreaterThanOrEqual(120);
    expect(layout.inertEmbed.height).toBeGreaterThanOrEqual(100);
    expect(layout.inertEmbed.x).toBeGreaterThanOrEqual(layout.dock.x - 1);
    expect(layout.inertEmbed.right).toBeLessThanOrEqual(layout.dock.right + 1);
    expect(layout.inertEmbed.bottom).toBeLessThanOrEqual(layout.dock.bottom + 1);
    expect(layout.dock.width * layout.dock.height / (layout.viewport.width * layout.viewport.height)).toBeLessThan(0.55);
  }
  return layout;
}
async function frameFromDom(page) {
  return page.evaluate(() => ({
    eyebrow: document.querySelector("#bird-demo-view-eyebrow").textContent.trim(),
    title: document.querySelector("#bird-demo-view-title").textContent.trim(),
    description: document.querySelector("#bird-demo-view-detail").textContent.trim(),
    kpis: [...document.querySelectorAll("#bird-demo-kpis .bird-kpi")].map(element => ({ label: element.querySelector(".label").textContent.trim(), value: element.querySelector(".value").textContent.trim(), note: element.querySelector(".note")?.textContent.trim() || "" })),
    stages: [...document.querySelectorAll("#bird-demo-stages .bird-stage")].map(element => ({ label: element.querySelector(".label").textContent.trim(), value: element.querySelector(".value").textContent.trim(), active: element.dataset.active !== undefined && !["false", "0"].includes(element.dataset.active) })),
  }));
}
async function assertFrame(page, snapshot, options) {
  const expected = getPresentationFrame({ crm: JSON.parse(snapshot.crm), industry: JSON.parse(snapshot.industry) }, options);
  const actual = await frameFromDom(page);
  expect(actual.eyebrow).toBe(expected.eyebrow);
  expect(actual.title).toBe(expected.title);
  expect(actual.description).toBe(expected.description);
  expect(actual.kpis).toEqual(expected.kpis.map(kpi => ({ label: kpi.label, value: kpi.value, note: kpi.note || "" })));
  expect(actual.stages.map(({ label, value }) => ({ label, value }))).toEqual(expected.stages.map(({ label, value }) => ({ label, value })));
  expect(actual.stages.filter(stage => stage.active).length).toBe(expected.activeStage ? 1 : 0);
  return actual;
}
function record(name, detail) {
  results.push({ name, passed: true, detail });
  console.log(`PASS ${name}`);
}
async function mediaState(page) {
  return page.evaluate(() => ({
    ...__DEMO_QA_MEDIA__,
    widgetCount: [...document.querySelectorAll("tavus-widget,tavus-embed")].filter(element => !element.hasAttribute("data-qa-sdk-double")).length,
    inertTagCount: document.querySelectorAll("tavus-widget[data-qa-sdk-double],tavus-embed[data-qa-sdk-double]").length,
    widgetRegistered: Boolean(customElements.get("tavus-widget")),
    embedRegistered: Boolean(customElements.get("tavus-embed")),
    mediaElements: document.querySelectorAll("audio,video").length,
  }));
}
function noMedia(state, sdkRegistered = true, inertTagCount = 0) {
  expect(state).toEqual({
    getUserMedia: 0,
    mediaPlay: 0,
    audioContext: 0,
    widgetCount: 0,
    inertTagCount,
    widgetRegistered: false,
    embedRegistered: sdkRegistered,
    mediaElements: 0,
  });
}
async function manual(page, action) {
  const before = await camera(page);
  const controls = page.locator("details.bird-presentation-controls");
  if (await controls.getAttribute("open") === null) await controls.locator("summary").click();
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
  if (await controls.getAttribute("open") !== null) await controls.locator("summary").click();
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
  await manual(page, "overview");
  const before = await sources(page), initialCamera = await camera(page);
  noMedia(await mediaState(page), false);
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
      actualTavusElementCount: [...document.querySelectorAll("tavus-widget,tavus-embed")].filter(element => !element.hasAttribute("data-qa-sdk-double")).length,
      inertTagCount: document.querySelectorAll("[data-qa-sdk-double]").length,
      registered: { widget: Boolean(customElements.get("tavus-widget")), embed: Boolean(customElements.get("tavus-embed")) },
    };
  });
  expect(capturedContext.surface).toBe("tavus-embed");
  expect(capturedContext.deploymentId).toBe(expectedPublicDeploymentId);
  expect(capturedContext.starts).toBe(1);
  expect(capturedContext.actualTavusElementCount).toBe(0);
  expect(capturedContext.inertTagCount).toBe(1);
  expect(capturedContext.registered).toEqual({ widget: false, embed: false });
  expect(capturedContext.context).toContain("industry-stage:manufacturing");
  const contextData = JSON.parse(capturedContext.context.split("DATOS FICTICIOS DE LA DEMO:\n").at(-1));
  expect(contextData.presentationTools.definitions).toEqual(EXISTING_AGENT_TOOL_DEFINITIONS);
  expect(contextData.presentationTools.catalogue).toEqual(getExistingAgentCatalogue({ crm: JSON.parse(before.crm), industry: JSON.parse(before.industry) }));
  // SDK-reported failure must keep its own error/retry surface mounted in the
  // real presentation dock, on both desktop and mobile. This is a local double;
  // the dedicated Join suite exercises the actual SDK's failed-Join sequence.
  await page.evaluate(() => {
    const widget = __DEMO_QA_SDK_DOUBLE__.elements.at(-1);
    for (const [name, detail] of [
      ["conversation-ended", { conversationId: "controlled-conversation" }],
      ["state-change", { state: "ended" }],
      ["error", { code: "CONVERSATION_ERROR", message: "Controlled Join rejection" }],
      ["state-change", { state: "error" }],
      ["mode-change", { mode: "unavailable" }],
    ]) widget.dispatchEvent(new CustomEvent(`tavus:${name}`, { detail }));
  });
  expect(await page.evaluate(() => __BIRD_DEMO__.getState().session.status)).toBe("error");
  await expect(page.locator("#bird-widget-host tavus-embed")).toBeVisible();
  await expect(page.locator("[data-demo-action='stop']")).toBeEnabled();
  expect(await page.evaluate(() => ({ ends: __DEMO_QA_SDK_DOUBLE__.ends, destroys: __DEMO_QA_SDK_DOUBLE__.destroys }))).toEqual({ ends: 0, destroys: 0 });
  await page.evaluate(() => {
    const widget = __DEMO_QA_SDK_DOUBLE__.elements.at(-1);
    widget.dispatchEvent(new CustomEvent("tavus:mode-change", { detail: { mode: "haircheck" } }));
  });
  await expect(page.locator("#bird-demo-message")).toContainText("Join");
  await page.evaluate(() => {
    const widget = __DEMO_QA_SDK_DOUBLE__.elements.at(-1);
    widget.dispatchEvent(new CustomEvent("tavus:state-change", { detail: { state: "connecting" } }));
    widget.dispatchEvent(new CustomEvent("tavus:conversation-started", { detail: { conversationId: "controlled-retry-conversation" } }));
  });
  expect(await page.evaluate(() => __BIRD_DEMO__.getState().session.status)).toBe("connected");
  const movement = await controlledTool(page, `${label}-move`, "trigger_3d_camera_movement", { movement_id: "industry-stage:manufacturing" });
  expect(movement.properties.output.ok).toBe(true);
  await settled(page);
  const focusedCamera = await camera(page);
  cinematicChange(initialCamera, focusedCamera);
  expect(await page.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics().district)).toBe("industry");
  const highlight = await controlledTool(page, `${label}-highlight`, "highlight_building", { building_id: "industry-stage:manufacturing" });
  expect(highlight.properties.output.ok).toBe(true);
  expect(await page.evaluate(() => __ATLAS_CITY__.scene.presentation.getState().highlight)).toMatchObject({ kind: "industry-stage", id: "manufacturing" });
  const pulse = await controlledTool(page, `${label}-pulse`, "trigger_animation", { animation_id: "pulse:industry-stage:manufacturing" });
  expect(pulse.properties.output.ok).toBe(true);
  const focusedFrame = await assertFrame(page, before, { target: { kind: "industry-stage", id: "manufacturing" } });
  const activeLayout = await immersiveLayout(page, true);
  await frames(page, 1);
  await shot(page, `immersive-qa-inert-embed-${label}`);
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
  noMedia(await mediaState(page), false, 1);
  const resizeLayouts = [];
  if (label === "mobile") {
    for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await frames(page, 3);
      resizeLayouts.push(await immersiveLayout(page, true));
      const count = await page.evaluate(() => ({ starts: __DEMO_QA_SDK_DOUBLE__.starts, elements: __DEMO_QA_SDK_DOUBLE__.elements.length }));
      expect(count).toEqual({ starts: 1, elements: 1 });
      if (viewport.width === 844) await shot(page, "immersive-qa-inert-embed-mobile-landscape");
    }
  }
  // Capture the synchronous restoration before the presentation's deliberate
  // idle camera movement resumes on the next animation frame.
  const restoredCamera = await page.evaluate(() => {
    document.querySelector("[data-demo-action='stop']").click();
    const { camera, controls } = __ATLAS_CITY__.scene.debug;
    return { quaternion: camera.quaternion.toArray(), position: camera.position.toArray(), target: controls.target.toArray(), zoom: camera.zoom, type: camera.type, fov: camera.fov ?? null };
  });
  await page.waitForFunction(() => __BIRD_DEMO__.getState().session.status === "ended");
  await settled(page);
  const restoredFrame = await assertFrame(page, before, { overview: true });
  for (const key of ["position", "target", "quaternion"]) restoredCamera[key].forEach((value, index) => expect(Math.abs(value - initialCamera[key][index])).toBeLessThan(1e-5));
  expect(Math.abs(restoredCamera.zoom - initialCamera.zoom)).toBeLessThan(1e-5);
  expect(Math.abs(restoredCamera.fov - initialCamera.fov)).toBeLessThan(1e-5);
  expect(await sources(page)).toEqual(before);
  const cleanup = await page.evaluate(() => ({ ends: __DEMO_QA_SDK_DOUBLE__.ends, destroys: __DEMO_QA_SDK_DOUBLE__.destroys, mountedDoubles: document.querySelectorAll("[data-qa-sdk-double]").length }));
  expect(cleanup).toEqual({ ends: 1, destroys: 1, mountedDoubles: 0 });
  record(`controlled-sdk-double-${label}-uses-real-exported-schemas-bridge-and-webgl-without-a-live-call`, {
    evidenceKind: "CONTROLLED_SDK_DOUBLE_NOT_A_TAVUS_CONVERSATION",
    capturedContext, movement, highlight, pulse, machinery, invalidCamera, unavailableBuilding,
    initialCamera, focusedCamera, restoredCamera, restoredFrame, focusedFrame, activeLayout, resizeLayouts, machineryMatricesChanged: true, sdkErrorRetainsEmbedAndAllowsRetry: true, cleanup,
  });
  await context.close();
}

try {
  const desktop = await createPage("immersive-desktop");
  const page = desktop.page;
  await boot(page);
  await page.waitForFunction(() => __BIRD_DEMO__?.getState().configuration?.contractsReady);
  await manual(page, "overview");
  const before = await sources(page), initialCamera = await camera(page);
  expect(initialCamera.type).toBe("PerspectiveCamera");
  const configuration = await page.evaluate(() => __BIRD_DEMO__.getState());
  expect(configuration.configuration).toMatchObject({ configured: expectedConfigured, contractsReady: true });
  expect(configuration.session).toMatchObject({ status: "idle", microphone: "not-requested" });
  if (expectedConfigured) await expect(page.locator("[data-demo-action='start']")).toBeEnabled();
  else await expect(page.locator("[data-demo-action='start']")).toBeDisabled();
  await expect(page.locator("[data-demo-action='stop']")).toBeDisabled();
  await expect(page.locator("[data-demo-action='interrupt']")).toBeDisabled();
  await expect(page.locator("#bird-demo-microphone")).toContainText(/sin solicitar/i);
  const initialLayout = await immersiveLayout(page);
  const initialFrame = await assertFrame(page, before, { overview: true });
  noMedia(await mediaState(page));
  await shot(page, `immersive-desktop-${configurationLabel}`);
  record("immersive-city-fills-viewport-without-dashboard-and-gates-media-until-start", { configuration, camera: initialCamera, layout: initialLayout, frame: initialFrame });

  const sales = await manual(page, "sales");
  cinematicChange(initialCamera, sales.after);
  const salesFrame = await assertFrame(page, before, { target: { kind: "district", id: "sales" } });
  expect(salesFrame.stages.length).toBeGreaterThanOrEqual(5);
  expect(await sources(page)).toEqual(before);
  await immersiveLayout(page);
  await shot(page, "immersive-sales-cinematic-plan");
  record("commercial-cinematic-plan-has-source-derived-kpis-and-stage-labels", { sales, frame: salesFrame });

  const industry = await manual(page, "industry");
  cinematicChange(sales.after, industry.after);
  const industryFrame = await assertFrame(page, before, { target: { kind: "industry-stage", id: "manufacturing" } });
  const industrySnapshot = JSON.parse(before.industry);
  expect(industrySnapshot.batches.reduce((sum, batch) => sum + batch.quantity, 0)).toBe(1320);
  expect(industrySnapshot.batches.filter(batch => batch.stageId === "manufacturing").reduce((sum, batch) => sum + batch.quantity, 0)).toBe(240);
  const industryHighlight = await manual(page, "highlight");
  expect(industryHighlight.presentation.highlight).toMatchObject({ kind: "industry-stage", id: "manufacturing" });
  expect(await sources(page)).toEqual(before);
  noMedia(await mediaState(page));
  await immersiveLayout(page);
  await shot(page, "immersive-manufacturing-cinematic-highlight");
  record("manufacturing-plan-and-halo-preserve-1320-units-and-display-240-in-stage", { industry, frame: industryFrame, industryHighlight });

  const communications = await manual(page, "communications");
  cinematicChange(industry.after, communications.after);
  const communicationsFrame = await assertFrame(page, before, { target: { kind: "communication", id: "meeting" } });
  await shot(page, "immersive-communications-cinematic-plan");
  const overview = await manual(page, "overview");
  const overviewFrame = await assertFrame(page, before, { overview: true });
  expect(await sources(page)).toEqual(before);
  await immersiveLayout(page);
  noMedia(await mediaState(page));
  record("communications-and-overview-update-context-without-changing-crm", { communications, communicationsFrame, overview, overviewFrame });
  await desktop.context.close();

  const normal = await createPage("normal-city");
  await boot(normal.page, "/");
  expect(await normal.page.locator("#bird-presentation").count()).toBe(0);
  expect(await normal.page.evaluate(() => typeof window.__BIRD_DEMO__)).toBe("undefined");
  noMedia(await mediaState(normal.page), false);
  await expect(normal.page.locator(".c-assistant")).toBeVisible();
  await expect(normal.page.locator(".c-header")).toBeVisible();
  const normalBefore = await sources(normal.page), normalFixed = await camera(normal.page);
  expect(normalFixed.type).toBe("OrthographicCamera");
  await normal.page.evaluate(() => __ATLAS_CITY__.setDistrict("communications"));
  await settled(normal.page);
  fixedBearing(normalFixed, await camera(normal.page));
  expect(await sources(normal.page)).toEqual(normalBefore);
  const normalRequests = requests.filter(request => request.page === "normal-city");
  expect(normalRequests.some(({ url }) => new URL(url).pathname === "/api/tavus-config")).toBe(false);
  await shot(normal.page, "immersive-regression-normal-city-fixed-map");
  record("normal-route-retains-fixed-orthographic-map-dashboard-and-v5-assistant", { camera: normalFixed, requests: normalRequests.map(({ url }) => new URL(url).pathname) });
  await normal.context.close();

  const mobile = await createPage("immersive-mobile", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await boot(mobile.page);
  await mobile.page.waitForFunction(() => __BIRD_DEMO__?.getState().configuration?.contractsReady);
  await manual(mobile.page, "overview");
  const mobileBefore = await sources(mobile.page);
  await manual(mobile.page, "industry");
  const mobileFrame = await assertFrame(mobile.page, mobileBefore, { target: { kind: "industry-stage", id: "manufacturing" } });
  const mobileLayouts = [await immersiveLayout(mobile.page)];
  if (expectedConfigured) await expect(mobile.page.locator("[data-demo-action='start']")).toBeEnabled();
  else await expect(mobile.page.locator("[data-demo-action='start']")).toBeDisabled();
  const touchTarget = await mobile.page.locator("[data-demo-action='start']").boundingBox();
  expect(touchTarget.height).toBeGreaterThanOrEqual(44);
  noMedia(await mediaState(mobile.page));
  await shot(mobile.page, "immersive-mobile-portrait-city-and-guide");
  await mobile.page.setViewportSize({ width: 844, height: 390 });
  await frames(mobile.page, 3);
  mobileLayouts.push(await immersiveLayout(mobile.page));
  await assertFrame(mobile.page, mobileBefore, { target: { kind: "industry-stage", id: "manufacturing" } });
  await shot(mobile.page, "immersive-mobile-landscape-city-and-guide");
  expect(await sources(mobile.page)).toEqual(mobileBefore);
  record("portrait-and-landscape-keep-full-viewport-city-and-bottom-right-guide", { layouts: mobileLayouts, frame: mobileFrame, touchTarget });
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
