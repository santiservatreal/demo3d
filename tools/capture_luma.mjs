import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.env.BASE_URL || "http://127.0.0.1:5173";
const out = "/tmp/luma-captures";
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
// Identical viewport and camera for the old operational model and the new campus.
for (const variant of ["before", "after"]) {
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto(base);
  await p.waitForFunction(() => !!window.__luma);
  await p.evaluate(async (variant) => {
    let scene;
    if (variant === "before") {
      __luma.scene.dispose();
      document.body.innerHTML =
        '<div id="compare" style="position:fixed;inset:0"></div>';
      const { OperationalScene } = await import("/src/operations/scene.js");
      const { createInitialState } = await import("/src/operations/model.js");
      await import("/src/operations/operations.css");
      scene = new OperationalScene(document.querySelector("#compare"), {
        onSelect: () => {},
      });
      scene.build(createInitialState());
    } else {
      scene = __luma.scene;
      scene.transition = null;
      scene.setProjection("perspective");
      document.body.append(scene.container);
      scene.container.style.cssText = "position:fixed;inset:0;z-index:1000";
    }
    scene.camera.fov = 34;
    scene.camera.position.set(51, 55, 66);
    scene.controls.target.set(1, 0, 1);
    scene.camera.updateProjectionMatrix();
    scene.controls.update();
    scene.resize();
    scene.invalidate?.();
  }, variant);
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/compare-${variant}.png` });
  await p.close();
}
const p = await b.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
await p.goto(base);
await p.waitForFunction(() => !!window.__luma);
await p.locator("#l-speed").selectOption("1");
await p.locator('[data-action="play"]').click();
const profile = await p.evaluate(async () => {
  const { scene } = __luma;
  const gl = scene.renderer.getContext(),
    ext = gl.getExtension("WEBGL_debug_renderer_info");
  const meta = {
    browser: navigator.userAgent,
    gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unavailable",
    viewport: [innerWidth, innerHeight],
    deviceDpr: devicePixelRatio,
    loadMs: __luma.loadMs,
    presets: {},
  };
  for (const preset of ["high", "balanced", "light"]) {
    scene.configure(preset);
    scene.playing = true;
    const intervals = [],
      submits = [],
      calls = [],
      triangles = [];
    let last = 0;
    await new Promise((resolve) => {
      let frames = 0;
      scene.onRendered = (info) => {
        const now = performance.now();
        if (frames++ > 6) {
          intervals.push(now - last);
          submits.push(info.renderSubmitMs);
          calls.push(info.calls);
          triangles.push(info.triangles);
        }
        last = now;
        if (intervals.length >= 30) {
          scene.onRendered = null;
          resolve();
        }
      };
    });
    const sorted = intervals.slice().sort((a, b) => a - b);
    meta.presets[preset] = {
      internalResolution: [
        scene.renderer.domElement.width,
        scene.renderer.domElement.height,
      ],
      canvasCss: [scene.width, scene.height],
      effectiveDpr: scene.renderer.getPixelRatio(),
      frameMedianMs: sorted[Math.floor(sorted.length * 0.5)],
      frameP95Ms: sorted[Math.floor(sorted.length * 0.95)],
      rafObservedFps:
        1000 / (intervals.reduce((a, b) => a + b, 0) / intervals.length),
      callsMedian: calls.sort((a, b) => a - b)[15],
      trianglesMedian: triangles.sort((a, b) => a - b)[15],
      submitMedianMs: submits.sort((a, b) => a - b)[15],
      sampleCount: intervals.length,
    };
  }
  scene.playing = false;
  return meta;
});
fs.writeFileSync(
  "docs/luma/performance.json",
  JSON.stringify(profile, null, 2),
);
console.log(JSON.stringify(profile, null, 2));
await p.close();
await b.close();
