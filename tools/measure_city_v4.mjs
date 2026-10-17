import { chromium } from "@playwright/test";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const phase = process.env.BENCHMARK_PHASE || "final";
const output =
  process.env.BENCHMARK_OUTPUT ||
  `docs/city/v4/${phase === "baseline" ? "baseline-" : ""}performance.json`;
await mkdir("docs/city/v4", { recursive: true });
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
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(60000);
page.on("pageerror", (error) => errors.push(error.message));
const report = {
  generatedAt: new Date().toISOString(),
  phase,
  sourceGitHead: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  browser: browser.version(),
  physicalGpu: false,
  method:
    "Same 1280×800 page, light preset, industry overview, 5 warm-up and 20 requestAnimationFrame intervals; software ANGLE/SwiftShader, not physical display FPS. Separate 20-frame sales-owner DOM observation.",
  errors,
};
try {
  if (phase === "final") {
    const sourceFiles = await readdir("src/city");
    report.sourceSha256 = Object.fromEntries(
      await Promise.all(
        sourceFiles
          .filter((name) => /\.(js|css)$/.test(name))
          .map(async (name) => [
            `src/city/${name}`,
            createHash("sha256")
              .update(await readFile(`src/city/${name}`))
              .digest("hex"),
          ]),
      ),
    );
  }
  const assets = await readdir("dist/assets");
  report.builtJsSha256 = Object.fromEntries(
    await Promise.all(
      assets
        .filter((f) => f.endsWith(".js"))
        .map(async (f) => [
          f,
          createHash("sha256")
            .update(await readFile(`dist/assets/${f}`))
            .digest("hex"),
        ]),
    ),
  );
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:4173");
  await page.waitForFunction(
    () => !!window.__ATLAS_CITY__?.scene?.debug?.industry,
  );
  await page.evaluate(() => __ATLAS_CITY__.scene.debug.ready);
  await page.evaluate(() => {
    __ATLAS_CITY__.scene.setQuality("light");
    __ATLAS_CITY__.setDistrict("industry");
  });
  await page.waitForFunction(
    () => !__ATLAS_CITY__.scene.getDiagnostics().cameraMoving,
  );
  report.industry = await page.evaluate(async () => {
    const samples = [];
    let previous = null,
      warm = 5;
    await new Promise((resolve) => {
      function tick(now) {
        if (warm > 0) warm--;
        else if (previous !== null) samples.push(now - previous);
        previous = now;
        if (samples.length >= 20) resolve();
        else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    const sorted = [...samples].sort((a, b) => a - b),
      scene = __ATLAS_CITY__.scene,
      r = scene.debug.renderer,
      gl = r.getContext(),
      ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      viewport: [innerWidth, innerHeight],
      internalPixels: [r.domElement.width, r.domElement.height],
      samples,
      medianMs: sorted[10],
      p95Ms: sorted[18],
      gpuRenderer: ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      diagnostics: scene.getDiagnostics(),
    };
  });
  await page.evaluate(() => __ATLAS_CITY__.setDistrict("sales"));
  await page.waitForFunction(
    () => !__ATLAS_CITY__.scene.getDiagnostics().cameraMoving,
  );
  report.ownerLabels = await page.evaluate(async () => {
    const label =
      document.querySelector('.city-owner-label[data-owner-id="owner-ana"]') ||
      document.querySelector(".city-owner-label");
    let styleMutations = 0,
      contentMutations = 0;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "style"
        )
          styleMutations++;
        else if (
          mutation.type === "childList" ||
          mutation.type === "characterData"
        )
          contentMutations++;
      }
    });
    observer.observe(label, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    const frames = [];
    await new Promise((resolve) => {
      function tick(now) {
        frames.push({
          now,
          transform: label.style.transform,
          text: label.textContent,
          visible: !label.hidden,
          owner: __ATLAS_CITY__.scene.debug.people
            .debug()
            .owners.find((o) => o.ownerId === label.dataset.ownerId)?.position,
        });
        if (frames.length >= 20) resolve();
        else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    observer.disconnect();
    return {
      id: label.dataset.ownerId,
      frames,
      styleMutations,
      contentMutations,
      distinctTransforms: new Set(frames.map((frame) => frame.transform)).size,
    };
  });
  console.log(
    `${phase}: industry median ${report.industry.medianMs.toFixed(1)} ms; p95 ${report.industry.p95Ms.toFixed(1)} ms; calls ${report.industry.diagnostics.calls}; triangles ${report.industry.diagnostics.triangles}; owner text mutations ${report.ownerLabels.contentMutations}`,
  );
} finally {
  await browser.close();
  await writeFile(output, JSON.stringify(report, null, 2));
}
