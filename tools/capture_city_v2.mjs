import { chromium } from "@playwright/test";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

// Evidence from the actual WebGL page; no generated/interpolated source frames.
const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const output = "docs/city/v2";
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
    () => !!window.__ATLAS_CITY__?.scene?.debug?.construction,
  );
  await page.evaluate(() => __ATLAS_CITY__.scene.debug.ready);
  await page.evaluate(() => __ATLAS_CITY__.scene.setQuality("light"));
  await page.locator('[data-action="tv"]').click();
  await page.waitForFunction(
    () => !__ATLAS_CITY__.scene.getDiagnostics().cameraMoving,
  );
  if (process.env.VIDEO_ONLY !== "1") {
    const profile = await page.evaluate(async () => {
      const samples = [];
      let previous = null,
        warmup = 10;
      await new Promise((resolve) => {
        function sample(now) {
          if (warmup <= 0 && previous !== null) samples.push(now - previous);
          else warmup--;
          previous = now;
          if (samples.length >= 30) resolve();
          else requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      const sorted = [...samples].sort((a, b) => a - b),
        canvas = __ATLAS_CITY__.scene.debug.renderer.domElement,
        gl = canvas.getContext("webgl2"),
        ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        viewport: [innerWidth, innerHeight],
        internalPixels: [canvas.width, canvas.height],
        cssPixels: [canvas.clientWidth, canvas.clientHeight],
        samples,
        medianMs: sorted[15],
        p95Ms: sorted[28],
        gpuRenderer: ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        diagnostics: __ATLAS_CITY__.scene.getDiagnostics(),
      };
    });
    fs.writeFileSync(
      `${output}/performance.json`,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          browser: browser.version(),
          physicalGpu: false,
          measurement:
            "30 requestAnimationFrame intervals after 10 warm-up callbacks; headless SwiftShader, not a physical display FPS",
          sourceSha256: Object.fromEntries(
            [
              "app.js",
              "scene.js",
              "style.css",
              "architecture.js",
              "construction.js",
              "people.js",
              "model.js",
            ].map((file) => [
              `src/city/${file}`,
              createHash("sha256")
                .update(fs.readFileSync(`src/city/${file}`))
                .digest("hex"),
            ]),
          ),
          presetRequested: "light",
          mode: "tv",
          profile,
          errors,
        },
        null,
        2,
      ),
    );
    console.log(
      `PROFILE light TV ${profile.medianMs.toFixed(1)} ms median / ${profile.p95Ms.toFixed(1)} ms p95`,
    );
  }
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    __ATLAS_CITY__.scene.setQuality("balanced");
    __ATLAS_CITY__.select("deal-001");
  });
  await page.waitForFunction(
    () => !__ATLAS_CITY__.scene.getDiagnostics().cameraMoving,
  );
  await page.locator('[data-action="close-inspector"]').click();
  await page.evaluate(() =>
    __ATLAS_CITY__.scene.focus("deal-001", { panelWidth: 0 }),
  );
  await page.waitForFunction(
    () => !__ATLAS_CITY__.scene.getDiagnostics().cameraMoving,
  );
  // Flush resizing before accepting frames; inspect the encoded JPEG dimensions.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({ path: "/tmp/atlas-city-v2-video-ready.png" });
  const dir = fs.mkdtempSync("/tmp/atlas-city-v2-frames-");
  const frames = [],
    rejectedFrameSizes = [],
    phases = [];
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
    quality: 90,
    maxWidth: 1280,
    maxHeight: 800,
    everyNthFrame: 1,
  });
  await page.waitForTimeout(500);
  const event = await page.evaluate(() =>
    __ATLAS_CITY__.changeStage("deal-001", "won"),
  );
  const deadline = Date.now() + 45000;
  do {
    const sample = await page.evaluate(() => ({
      construction: __ATLAS_CITY__.scene.debug.construction.debug(),
      people: __ATLAS_CITY__.scene.debug.people.debug(),
    }));
    const job = sample.construction.active.find((job) => job.id === "deal-001");
    if (job && phases.at(-1)?.phase !== job.phase) {
      phases.push({
        phase: job.phase,
        browserTime: Date.now(),
        person: sample.people.owners.find(
          (owner) => owner.ownerId === "owner-ana",
        ),
      });
      await page.screenshot({
        path: `${output}/captures/detail-${job.phase}.png`,
        timeout: 60000,
      });
    }
    if (!job && sample.construction.count === 0) break;
    await page.waitForTimeout(350);
  } while (Date.now() < deadline);
  await page.evaluate(() => __ATLAS_CITY__.scene.focusOwner("owner-ana"));
  await page.waitForFunction(
    () => !__ATLAS_CITY__.scene.getDiagnostics().cameraMoving,
  );
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: `${output}/captures/salesperson-detail.png`,
    timeout: 60000,
  });
  await cdp.send("Page.stopScreencast");
  if (frames.length < 2) throw new Error("Insufficient real compositor frames");
  const concat = [];
  frames.forEach((frame, index) => {
    concat.push(
      `file '${frame.name}'`,
      `duration ${index + 1 < frames.length ? Math.max(0.01, frames[index + 1].timestamp - frame.timestamp) : 0.2}`,
    );
  });
  concat.push(`file '${frames.at(-1).name}'`);
  fs.writeFileSync(`${dir}/frames.txt`, concat.join("\n"));
  const clip = `${output}/captures/construction-demo.mp4`;
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
    clip,
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
        clip,
      ],
      { encoding: "utf8" },
    ),
  );
  const encodedDimensions = [probe.streams[0].width, probe.streams[0].height];
  if (encodedDimensions[0] !== 1280 || encodedDimensions[1] !== 800)
    throw new Error(`Incorrect clip dimensions: ${encodedDimensions}`);
  fs.writeFileSync(
    `${output}/video-capture.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        method:
          "Actual Chromium CDP compositor JPEG frames + installed FFmpeg; original frame timestamps",
        syntheticFrames: false,
        sourceEvent: event,
        phases,
        frames: frames.length,
        durationSeconds: frames.at(-1).timestamp - frames[0].timestamp,
        encodedDurationSeconds: Number(probe.format.duration),
        encodedDimensions,
        viewport: [1280, 800],
        rejectedFrameSizes,
        preset: "balanced",
        physicalGpu: false,
        errors,
      },
      null,
      2,
    ),
  );
  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
  console.log(
    `Recorded ${frames.length} real compositor frames, ${Number(probe.format.duration).toFixed(2)} seconds`,
  );
} finally {
  await browser.close();
}
