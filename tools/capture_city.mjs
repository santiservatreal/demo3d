import { chromium } from "@playwright/test";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

// Optional real-browser profile/clip. No synthetic renderer or generated frames.
const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const output = "docs/city";
fs.mkdirSync(`${output}/captures`, { recursive: true });
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
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
function jpegSize(bytes) {
  const sof = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset++] !== 0xff) continue;
    let marker = bytes[offset++];
    while (marker === 0xff) marker = bytes[offset++];
    if ([0xd8, 0xd9].includes(marker)) continue;
    if (marker === 0xda) break;
    const length = bytes.readUInt16BE(offset);
    if (sof.has(marker))
      return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
    if (length < 2) break;
    offset += length;
  }
  return null;
}
try {
  await page.goto(base);
  await page.waitForFunction(
    () => !!window.__ATLAS_CITY__?.scene?.debug?.renderer,
  );
  if (process.env.VIDEO_ONLY !== "1") {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => __ATLAS_CITY__.select("deal-003"));
    await page.waitForFunction(
      () => !__ATLAS_CITY__.scene.getDiagnostics().cameraMoving,
    );
    const landscapeInspectorCheck = await page.evaluate(() => {
      const panel = document.querySelector("#city-inspector"),
        body = panel.querySelector(".c-inspector-body");
      const b = panel.getBoundingClientRect(),
        value = panel.querySelector(".c-deal-value").getBoundingClientRect();
      const bodyHeight = body.clientHeight;
      const valueVisible = value.top >= b.top && value.bottom <= b.bottom;
      body.scrollTop = body.scrollHeight;
      const contentScrollable = body.scrollTop > 0;
      body.scrollTop = 0;
      if (
        bodyHeight <= 100 ||
        !valueVisible ||
        !contentScrollable ||
        b.bottom > innerHeight ||
        b.top < 0
      )
        throw new Error(
          `Landscape inspector must show its value and scroll its content: ${JSON.stringify({ bodyHeight, valueVisible, contentScrollable, bottom: b.bottom })}`,
        );
      return {
        bodyHeight,
        valueVisible,
        contentScrollable,
        panelHeight: b.height,
      };
    });
    await page.screenshot({
      path: `${output}/captures/mobile-landscape.png`,
      fullPage: true,
    });
    await page
      .locator("#city-inspector .c-record-activity")
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${output}/captures/mobile-landscape-scroll.png`,
      fullPage: true,
    });
    await page.locator('[data-action="close-inspector"]').click();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate(() => __ATLAS_CITY__.scene.overview());
    await page.waitForFunction(
      () => !__ATLAS_CITY__.scene.getDiagnostics().cameraMoving,
    );
    console.log(
      "PASS landscape inspector value, scrollable content and real close control",
    );
    const trafficLayerCheck = await page.evaluate(() => {
      const api = __ATLAS_CITY__,
        before = JSON.stringify(api.metrics());
      const group = api.scene.debug.scene.getObjectByName(
        "ambient-city-traffic",
      );
      api.scene.setQuality("balanced");
      api.setLayers({ traffic: false });
      const hidden = group.visible === false;
      api.setLayers({ traffic: true });
      const restored = group.visible === true;
      api.scene.setQuality("light");
      const lightHidesTraffic = group.visible === false;
      api.scene.setQuality("high");
      const highRestoresTraffic = group.visible === true;
      api.scene.setQuality("balanced");
      const metricsUnchanged = before === JSON.stringify(api.metrics());
      if (
        !hidden ||
        !restored ||
        !lightHidesTraffic ||
        !highRestoresTraffic ||
        !metricsUnchanged
      )
        throw new Error(
          "Traffic layers and quality presets must hide their real geometry and preserve CRM metrics",
        );
      return {
        hidden,
        restored,
        lightHidesTraffic,
        highRestoresTraffic,
        metricsUnchanged,
      };
    });
    console.log(
      "PASS traffic geometry layer visibility and unchanged CRM metrics",
    );
    const profiles = [];
    const presets = (
      process.env.PROFILE_PRESETS || "balanced,light,high"
    ).split(",");
    const cases = presets.map((preset) => ({
      preset,
      viewport: { width: 1920, height: 1080 },
      capture: `quality-${preset}`,
    }));
    if (process.env.PROFILE_MOBILE !== "0")
      cases.push({
        preset: "light",
        viewport: { width: 390, height: 844 },
        capture: "quality-mobile-light",
      });
    for (const { preset, viewport, capture } of cases) {
      await page.setViewportSize(viewport);
      await page.evaluate(
        (value) => __ATLAS_CITY__.scene.setQuality(value),
        preset,
      );
      await page.waitForTimeout(800);
      const profile = await page.evaluate(async () => {
        const frameTimes = [];
        let previous = null;
        await new Promise((resolve) => {
          let count = 0;
          function sample(now) {
            if (count >= 10 && previous !== null)
              frameTimes.push(now - previous);
            previous = now;
            count++;
            if (frameTimes.length >= 30) resolve();
            else requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        });
        const sorted = [...frameTimes].sort((a, b) => a - b);
        const canvas = __ATLAS_CITY__.scene.debug.renderer.domElement;
        const gl = canvas.getContext("webgl2");
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        return {
          samples: frameTimes,
          medianMs: sorted[Math.floor(sorted.length / 2)],
          p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
          meanMs:
            frameTimes.reduce((sum, value) => sum + value, 0) /
            frameTimes.length,
          internalPixels: [canvas.width, canvas.height],
          cssPixels: [canvas.clientWidth, canvas.clientHeight],
          deviceDpr: devicePixelRatio,
          viewport: [innerWidth, innerHeight],
          gpuRenderer: ext
            ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
          diagnostics: __ATLAS_CITY__.scene.getDiagnostics(),
        };
      });
      profiles.push({ presetRequested: preset, ...profile });
      await page.screenshot({
        path: `${output}/captures/${capture}.png`,
        fullPage: true,
      });
      console.log(
        `${preset}: median ${profile.medianMs.toFixed(1)} ms, p95 ${profile.p95Ms.toFixed(1)} ms, ${profile.internalPixels.join(" × ")}`,
      );
    }
    fs.writeFileSync(
      `${output}/performance.json`,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
            encoding: "utf8",
          }).trim(),
          sourceHasUncommittedChanges: Boolean(
            execFileSync("git", ["status", "--porcelain"], {
              encoding: "utf8",
            }).trim(),
          ),
          sourceFileSha256: Object.fromEntries(
            [
              "app.js",
              "scene.js",
              "architecture.js",
              "traffic.js",
              "model.js",
              "style.css",
            ].map((file) => {
              const path = `src/city/${file}`;
              return [
                path,
                createHash("sha256")
                  .update(fs.readFileSync(path))
                  .digest("hex"),
              ];
            }),
          ),
          browser: browser.version(),
          userAgent: await page.evaluate(() => navigator.userAgent),
          physicalGpu: false,
          physicalTouchDevice: false,
          trafficLayerCheck,
          landscapeInspectorCheck,
          measurement:
            "30 requestAnimationFrame callback intervals after 10 warm-up callbacks while the scene renders; software GPU cadence, not physical display FPS",
          profiles,
          errors,
        },
        null,
        2,
      ),
    );
  }

  if (process.env.RECORD_VIDEO === "1" || process.env.VIDEO_ONLY === "1") {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => __ATLAS_CITY__.scene.setQuality("light"));
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.screenshot({ path: "/tmp/atlas-city-video-viewport.png" });
    const dir = "/tmp/atlas-city-video-frames";
    fs.mkdirSync(dir, { recursive: true });
    const frames = [];
    const rejectedFrameSizes = [];
    const cdp = await page.context().newCDPSession(page);
    cdp.on("Page.screencastFrame", (frame) => {
      const bytes = Buffer.from(frame.data, "base64"),
        size = jpegSize(bytes);
      if (size?.[0] === 1280 && size?.[1] === 800) {
        const name = `frame-${String(frames.length).padStart(5, "0")}.jpg`;
        fs.writeFileSync(`${dir}/${name}`, bytes);
        frames.push({ name, timestamp: frame.metadata.timestamp });
      } else rejectedFrameSizes.push(size);
      cdp
        .send("Page.screencastFrameAck", { sessionId: frame.sessionId })
        .catch(() => {});
    });
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 88,
      maxWidth: 1280,
      maxHeight: 800,
      everyNthFrame: 1,
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => __ATLAS_CITY__.select("deal-013"));
    await page.waitForTimeout(2000);
    await page.evaluate(() => __ATLAS_CITY__.simulateWin());
    await page.waitForTimeout(6000);
    await page.locator('[data-action="view-table"]').first().click();
    await page.waitForTimeout(2000);
    await cdp.send("Page.stopScreencast");
    if (frames.length < 2)
      throw new Error("Insufficient actual browser frames to record a clip");
    const concat = [];
    for (let i = 0; i < frames.length; i++) {
      concat.push(`file '${frames[i].name}'`);
      concat.push(
        `duration ${i + 1 < frames.length ? Math.max(0.01, frames[i + 1].timestamp - frames[i].timestamp) : 0.2}`,
      );
    }
    concat.push(`file '${frames.at(-1).name}'`);
    fs.writeFileSync(`${dir}/frames.txt`, concat.join("\n"));
    execFileSync("/usr/bin/ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      `${dir}/frames.txt`,
      "-vsync",
      "vfr",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "24",
      "-movflags",
      "+faststart",
      `${output}/captures/city-demo.mp4`,
    ]);
    const probe = JSON.parse(
      execFileSync(
        "/usr/bin/ffprobe",
        [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=width,height:format=duration",
          "-of",
          "json",
          `${output}/captures/city-demo.mp4`,
        ],
        { encoding: "utf8" },
      ),
    );
    const encodedDimensions = [probe.streams[0].width, probe.streams[0].height];
    if (encodedDimensions[0] !== 1280 || encodedDimensions[1] !== 800)
      throw new Error(
        `Incorrect encoded clip dimensions: ${encodedDimensions}`,
      );
    fs.writeFileSync(
      `${output}/video-capture.json`,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          method:
            "Chromium CDP compositor JPEG frames + installed system FFmpeg; original timestamps",
          syntheticFrames: false,
          frames: frames.length,
          durationSeconds: frames.at(-1).timestamp - frames[0].timestamp,
          viewport: [1280, 800],
          encodedDimensions,
          encodedDurationSeconds: Number(probe.format.duration),
          rejectedFrameSizes,
          preset: "light",
          physicalGpu: false,
        },
        null,
        2,
      ),
    );
    console.log(`Recorded ${frames.length} real compositor frames`);
  }
} finally {
  await browser.close();
}
