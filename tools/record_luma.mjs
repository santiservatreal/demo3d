// Record real compositor frames via CDP; uses the installed system ffmpeg, no browser-binary download.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const dir = "/tmp/luma-video-frames";
fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto((process.env.BASE_URL || "http://127.0.0.1:5173") + "/?experience=luma");
await p.waitForFunction(() => !!window.__luma);
await p.locator("#l-quality").selectOption("light");
await p.locator('[data-action="fullscreen"]').click();
await p.locator("#l-scenario").selectOption("loading");
if (!(await p.evaluate(() => __luma.scene.roofOff)))
  await p.locator('[data-action="roof"]').click();
const cdp = await p.context().newCDPSession(p);
const frames = [];
cdp.on("Page.screencastFrame", (frame) => {
  const name = `frame-${String(frames.length).padStart(5, "0")}.jpg`;
  fs.writeFileSync(dir + "/" + name, Buffer.from(frame.data, "base64"));
  frames.push({ name, time: frame.metadata.timestamp });
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
await p.locator("#l-speed").selectOption("240");
await p.locator('[data-action="play"]').click();
await p.waitForTimeout(5500);
await p.locator('[data-action="play"]').click();
await p.locator('[data-frame="production"]').click();
await p.waitForTimeout(2500);
await p.locator("#l-scenario").selectOption("return");
await p.locator('[data-frame="felipe"]').click();
await p.locator('[data-action="close-inspector"]').click();
await p.locator('[data-action="play"]').click();
await p.waitForTimeout(6500);
await p.locator('[data-action="play"]').click();
await cdp.send("Page.stopScreencast");
await b.close();
if (frames.length < 2) throw new Error("Not enough compositor frames");
const concat = [];
for (let i = 0; i < frames.length; i++) {
  concat.push(`file '${frames[i].name}'`);
  concat.push(
    "duration " +
      (i + 1 < frames.length
        ? Math.max(0.01, frames[i + 1].time - frames[i].time)
        : 0.2),
  );
}
concat.push(`file '${frames.at(-1).name}'`);
fs.writeFileSync(dir + "/frames.txt", concat.join("\n"));
execFileSync("/usr/bin/ffmpeg", [
  "-v",
  "error",
  "-y",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  dir + "/frames.txt",
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
  "docs/luma/captures/luma-demo.mp4",
]);
fs.writeFileSync(
  "docs/luma/video-capture.json",
  JSON.stringify(
    {
      method:
        "Chromium CDP compositor JPEG frames + system FFmpeg, original timestamps",
      frames: frames.length,
      durationSeconds: frames.at(-1).time - frames[0].time,
      preset: "light",
      viewport: [1280, 800],
      syntheticFrames: false,
    },
    null,
    2,
  ),
);
console.log("Recorded real browser clip:", frames.length, "frames");
