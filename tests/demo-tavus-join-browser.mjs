import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Real, unmodified @tavus/embed renders and runs its Join handler. Every
// non-local network request is intercepted before loading it. No Tavus room,
// real media device, avatar, or paid service participates in this regression.
// Daily's preview bundle is blocked; if that keeps Join disabled, this test
// explicitly bypasses only the DOM permission gate, then invokes the real
// SDK button's click handler. This verifies failed-Join rollback, not media
// permission acquisition or a successful conversation.
const scenario = process.env.JOIN_QA_SCENARIO || "origin";
assert.ok(["origin", "busy"].includes(scenario), "JOIN_QA_SCENARIO must be origin or busy.");
const output = process.env.JOIN_QA_DIR || `/tmp/demo-tavus-join-real-sdk${scenario === "busy" ? "-busy" : ""}`;
const denial = scenario === "busy"
  ? { status: 423, body: { error: "PAL is in another conversation" } }
  : { status: 403, body: { error: "Origin not allowed" } };
const deniedStartOutcome = `mock-start-${denial.status}`;
const deploymentId = "dqa-offline-join-regression";
const eventNames = [
  "ready", "conversation-created", "conversation-started", "conversation-ended",
  "state-change", "mode-change", "error",
];
const fixture = {
  deployment_id: deploymentId,
  deployment_name: "Offline Join regression fixture",
  channel: "widget",
  is_available: true,
  customization: {
    schema_version: 1,
    show_haircheck: true,
    conversation: { modality: "video", enable_chat: false, enable_closed_captions: false },
    preview: {
      title: "Prueba local: ningún agente real",
      description: "El botón Join ejecuta el SDK oficial contra una respuesta HTTP simulada.",
      background: { type: "background-gradient" },
    },
    haircheck: { join_button: "Join", cancel_btn: "Cancel" },
  },
};
const requests = [], consoleErrors = [], pageErrors = [];
let server, browser, page, origin;
let failure = null;
let permissionGateBypassed = false;
let preservedBeforeFinalizar = null;
const startedAt = new Date().toISOString();
await mkdir(output, { recursive: true });
const sourcePath = process.env.JOIN_SESSION_FIXTURE || "src/demo/tavus-session.js";
const source = await readFile(sourcePath);
const sdk = await readFile("node_modules/@tavus/embed/dist/index.mjs");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sdkPackage = JSON.parse(await readFile("node_modules/@tavus/embed/package.json", "utf8"));
assert.equal(sdkPackage.version, "0.19.3", "Recheck the installed SDK contract before changing this pinned fixture.");

try {
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: "error",
    server: { host: "127.0.0.1", port: Number(process.env.JOIN_QA_PORT || 5188), strictPort: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await server.listen();
  const address = server.httpServer.address();
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  const context = await browser.newContext({
    viewport: { width: 900, height: 780 },
    serviceWorkers: "block",
    permissions: ["microphone", "camera"],
  });
  await context.routeWebSocket("**/*", (socket) => {
    requests.push({ url: socket.url(), method: "WEBSOCKET", outcome: "blocked" });
    socket.close();
  });
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) {
      if (url.pathname === "/src/demo/tavus-session.js" && process.env.JOIN_SESSION_FIXTURE) {
        await route.fulfill({ contentType: "text/javascript", body: source.toString() });
        return;
      }
      if (url.pathname === "/__demo_tavus_join_harness") {
        await route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><html lang="es"><meta charset="utf-8"><title>Join: SDK real, red simulada</title>
            <style>body{margin:24px;background:#eaf2f4;font:14px system-ui;color:#153440}h1{font-size:18px}#widget-host{width:360px;height:470px;background:#dce8e9}button{padding:10px;margin:10px 8px 10px 0}pre{max-height:100px;overflow:auto;font-size:11px}#notice{max-width:750px}</style>
            <h1>Regresión local de Join · SDK real / sin agente ni conexión real</h1>
            <p id="notice">Todos los destinos externos están interceptados. La respuesta de inicio será un ${denial.status} simulado. El gate visual de permisos se puede forzar sólo para probar el handler.</p>
            <button id="start">Iniciar prueba local</button><button id="stop">Finalizar</button>
            <div id="widget-host"></div><pre id="state"></pre>
            <script type="module">
              import '/node_modules/@tavus/embed/dist/index.mjs';
              import { createTavusDemoSession } from '/src/demo/tavus-session.js';
              const names = ${JSON.stringify(eventNames)};
              const trace = [];
              const scene = { start: 0, end: 0 };
              const session = createTavusDemoSession({
                container: document.querySelector('#widget-host'),
                deploymentId: ${JSON.stringify(deploymentId)},
                context: { application: 'Offline regression harness', simulated: true },
                controller: {
                  startSession() { scene.start++; return { ok: true }; },
                  endSession() { scene.end++; },
                  cancel() {},
                },
                onState(state) { document.querySelector('#state').textContent = JSON.stringify(state); },
                createWidget() {
                  const embed = document.createElement('tavus-embed');
                  embed.setAttribute('layout', 'inline');
                  for (const name of names) embed.addEventListener('tavus:' + name, (event) => {
                    trace.push({ name, detail: event.detail, mounted: embed.isConnected, at: performance.now() });
                  });
                  return embed;
                },
              });
              window.__JOIN_QA__ = { session, trace, scene };
              document.querySelector('#start').onclick = () => session.start();
              document.querySelector('#stop').onclick = () => session.stop();
            </script></html>`,
        });
        return;
      }
      await route.continue();
      return;
    }
    const entry = { url: url.href, method: request.method(), outcome: "blocked" };
    requests.push(entry);
    if (url.origin === "https://tavusapi.com") {
      if (request.method() === "OPTIONS") {
        entry.outcome = "mock-options";
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      if (url.pathname === `/v2/deployments/${deploymentId}/init` && request.method() === "GET") {
        entry.outcome = "mock-init-200";
        await route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(fixture) });
        return;
      }
      if (url.pathname === `/v2/deployments/${deploymentId}/start` && request.method() === "POST") {
        entry.outcome = deniedStartOutcome;
        await route.fulfill({ status: denial.status, contentType: "application/json", headers: cors, body: JSON.stringify(denial.body) });
        return;
      }
      if (url.pathname === `/v2/deployments/${deploymentId}/telemetry`) {
        entry.outcome = "mock-telemetry-204";
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
    }
    await route.abort("blockedbyclient");
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(`${origin}/__demo_tavus_join_harness`);
  await page.waitForFunction(() => !!window.__JOIN_QA__);
  assert.equal(await page.locator("tavus-embed").count(), 0, "No embed exists before the explicit test start.");
  await page.locator("#start").click();
  const embed = page.locator("tavus-embed");
  const join = embed.getByRole("button", { name: "Join", exact: true });
  await expect(join).toBeVisible();
  assert.equal(requests.filter((request) => request.outcome === deniedStartOutcome).length, 0, "The SDK haircheck precedes its room start request.");
  permissionGateBypassed = !(await join.isEnabled());
  if (permissionGateBypassed) {
    // Only release the DOM disabled flag. The SDK itself still owns its button
    // and click handler. No SDK event, connection, track or permissions state is
    // fabricated. This deliberately does not test the real permission flow.
    await join.evaluate((button) => { button.disabled = false; button.click(); });
  } else await join.click();
  await expect.poll(() => requests.filter((request) => request.outcome === deniedStartOutcome).length).toBe(1);
  await page.waitForFunction(() => window.__JOIN_QA__.trace.some((event) => event.name === "error"));
  const state = await page.evaluate(() => ({
    trace: window.__JOIN_QA__.trace,
    session: window.__JOIN_QA__.session.getState(),
    mounted: !!window.__JOIN_QA__.session.getWidget()?.isConnected,
    scene: window.__JOIN_QA__.scene,
  }));
  const endedIndex = state.trace.findIndex((event) => event.name === "conversation-ended");
  const errorIndex = state.trace.findIndex((event) => event.name === "error");
  assert.ok(endedIndex >= 0, "The real SDK emits conversation-ended while rolling back this failed Join.");
  assert.ok(errorIndex > endedIndex, "SDK rollback ended precedes the CONVERSATION_ERROR notification.");
  assert.equal(state.trace[errorIndex].detail.code, "CONVERSATION_ERROR");
  assert.equal(state.trace.some((event) => event.name === "conversation-started"), false);
  assert.equal(state.mounted, true, "Recoverable SDK failure must keep the real embed mounted.");
  await expect(embed).toBeVisible();
  await page.waitForFunction(() => window.__JOIN_QA__.trace.some((event) => event.name === "mode-change" && event.detail?.mode === "unavailable"));
  preservedBeforeFinalizar = await page.evaluate(() => ({
    mounted: !!window.__JOIN_QA__.session.getWidget()?.isConnected,
    session: window.__JOIN_QA__.session.getState(),
  }));
  if (scenario === "busy") {
    await expect(embed.getByText("PAL is in another conversation", { exact: true })).toBeVisible();
    await expect(embed.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    assert.equal(preservedBeforeFinalizar.session.error?.code, "AGENT_BUSY", "The host must classify the explicit mocked 423 as busy.");
  }
  await page.screenshot({ path: path.join(output, scenario === "busy" ? "sdk-join-busy-preserved.png" : "sdk-join-denied-preserved.png") });
  assert.equal(requests.filter((request) => request.outcome === deniedStartOutcome).length, 1, "No host retry may create a second automatic attempt.");
  assert.equal(requests.some((request) => request.outcome === "continued-external"), false);
  assert.deepEqual(pageErrors, [], "The fixture must not create uncaught application errors.");
  await page.locator("#stop").click();
  await expect(embed).toHaveCount(0);
} catch (error) {
  failure = { name: error.name, message: error.message, stack: error.stack };
  if (page) await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
} finally {
  const state = page ? await page.evaluate(() => window.__JOIN_QA__ ? ({
    trace: window.__JOIN_QA__.trace,
    session: window.__JOIN_QA__.session.getState(),
    mounted: !!window.__JOIN_QA__.session.getWidget()?.isConnected,
    scene: window.__JOIN_QA__.scene,
  }) : null).catch(() => null) : null;
  await writeFile(path.join(output, "report.json"), JSON.stringify({
    startedAt, completedAt: new Date().toISOString(), passed: !failure,
    sdk: { name: sdkPackage.name, version: sdkPackage.version, sha256: sha256(sdk) },
    sessionSourcePath: sourcePath, sessionSourceSha256: sha256(source),
    scenario, denial,
    scope: "Real installed embed/Join handler with intercepted HTTP denial; no successful call, avatar, real microphone permission, or billable request.",
    permissionGateBypassed, fixture, requests, preservedBeforeFinalizar, state, consoleErrors, pageErrors, failure,
  }, null, 2));
  await browser?.close();
  await server?.close();
}
if (failure) {
  console.error(`${failure.name}: ${failure.message}\nReport: ${path.join(output, "report.json")}`);
  process.exitCode = 1;
} else console.log(`PASS: real SDK failed-Join rollback preserves the embed. Report: ${path.join(output, "report.json")}`);
