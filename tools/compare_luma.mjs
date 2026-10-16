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
  await p.goto(base+"/?experience=luma");
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
await b.close();
