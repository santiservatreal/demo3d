import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir("/tmp/luma-captures", { recursive: true });
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const p = await b.newPage({ viewport: { width: 1600, height: 1100 } }),
  errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const url = process.env.BASE_URL || "http://127.0.0.1:5173";
try {
  await p.goto(url);
  await p.waitForFunction(() => !!window.__luma);
  await expect(p.locator("#l-loader")).toBeHidden();
  await expect(p.locator("#l-inspector")).toBeHidden();
  await expect(p.locator("canvas")).toHaveCount(1);
  // Actual raycasting against the detailed truck, using the camera to project its cab.
  const point = await p.evaluate(() => {
    const { scene } = __luma,
      g = scene.trucks.get("LW-01").g,
      point = g.position.clone();
    point.y += 1.5;
    point.project(scene.camera);
    const r = scene.renderer.domElement.getBoundingClientRect();
    return {
      x: r.x + (point.x * 0.5 + 0.5) * r.width,
      y: r.y + (-point.y * 0.5 + 0.5) * r.height,
    };
  });
  await p.mouse.move(point.x, point.y);
  await expect(p.locator(".l-tooltip")).toContainText("Felipe");
  await p.mouse.click(point.x, point.y);
  await expect(p.locator("#l-inspector")).toContainText("Felipe García");
  // Check the actual rendered route geometry against the customer wall envelope (independent SAT).
  const clearance = await p.evaluate(() => {
    const s = __luma.scene,
      mesh = s.registry.get("customer-01").children[1];
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox
        .clone()
        .applyMatrix4(mesh.matrixWorld),
      cx = (box.min.x + box.max.x) / 2,
      cz = (box.min.z + box.max.z) / 2,
      hx = (box.max.x - box.min.x) / 2,
      hz = (box.max.z - box.min.z) / 2;
    let intersections = 0;
    for (const routes of Object.values(s.routes))
      for (const curve of Object.values(routes))
        for (let i = 0; i <= 256; i++) {
          const pt = curve.getPointAt(i / 256),
            t = curve.getTangentAt(i / 256),
            right = { x: t.z, z: -t.x },
            axes = [{ x: 1, z: 0 }, { x: 0, z: 1 }, t, right];
          const overlaps = axes.every(
            (a) =>
              Math.abs((pt.x - cx) * a.x + (pt.z - cz) * a.z) <=
              hx * Math.abs(a.x) +
                hz * Math.abs(a.z) +
                1.4 * Math.abs(right.x * a.x + right.z * a.z) +
                3.25 * Math.abs(t.x * a.x + t.z * a.z),
          );
          if (overlaps) intersections++;
        }
    return intersections;
  });
  expect(clearance, "Vehicle routes must clear the destination building").toBe(
    0,
  );
  // Stable resources: advancing business state never rebuilds meshes.
  await p.evaluate(
    () => (window.meshIdentity = __luma.scene.trucks.get("LW-01").g.uuid),
  );
  await p.locator("#l-scenario").selectOption("delivery");
  await expect(p.locator("#l-inspector")).toContainText("Entrega confirmada");
  await expect(p.locator("#l-inspector")).toContainText("0 / 8 palés");
  await p.locator('#l-inspector [data-select="LW-024"]').click();
  await expect(p.locator("#l-inspector")).toContainText(
    "Pendiente · no se crea un cobro al entregar",
  );
  await p.locator('[data-view="pipeline"]').first().click();
  await expect(
    p.locator(".l-kanban section").last().locator('[data-select="LW-024"]'),
  ).toBeVisible();
  await p.locator('[data-view="city"]').first().click();
  await p.locator("#l-scenario").selectOption("return");
  await expect(p.locator("#l-inspector")).toContainText("Retorno vacío");
  await expect(p.locator("#l-inspector")).toContainText("posición estimada");
  await p.locator('[data-action="follow"]').click();
  expect(await p.evaluate(() => __luma.scene.follow)).toBeTruthy();
  await p.mouse.move(point.x, point.y);
  await p.mouse.down();
  await p.mouse.move(point.x + 40, point.y + 15);
  await p.mouse.up();
  expect(await p.evaluate(() => __luma.scene.follow)).toBeFalsy();
  await p.locator("#l-scenario").selectOption("lost-data");
  await expect(p.locator("#l-inspector")).toContainText(
    "Llegada pendiente de confirmar",
  );
  expect(await p.evaluate(() => __luma.state.vehicles[0].status)).toBe(
    "returning",
  );
  await p.locator("#l-scenario").selectOption("day12");
  await p.locator('[data-action="economics"]').first().click();
  await expect(p.getByRole("dialog")).toContainText("60.000");
  await expect(p.getByRole("dialog")).toContainText("10.800");
  await p.keyboard.press("Escape");
  await p.locator("#l-scenario").selectOption("month");
  await p.locator('[data-action="economics"]').first().click();
  await expect(p.getByRole("dialog")).toContainText("100.000");
  await expect(p.getByRole("dialog")).toContainText("18.000");
  await p.locator('[data-action="permissions"]').click();
  await expect(p.getByRole("dialog")).toContainText("restringida");
  await p.keyboard.press("Escape");
  await expect(p.locator("#l-kpis")).toContainText("Restringido");
  await p.locator('[data-action="economics"]').first().click();
  await p.locator('[data-action="permissions"]').click();
  await p.keyboard.press("Escape");
  await p.locator("#l-scenario").selectOption("base");
  expect(await p.evaluate(() => __luma.scene.trucks.get("LW-01").g.uuid)).toBe(
    await p.evaluate(() => window.meshIdentity),
  );
  await p.locator('[data-action="close-inspector"]').click();
  await p.locator('[data-frame="production"]').click();
  await p.waitForTimeout(1200);
  expect(
    await p.evaluate(() => __luma.scene.roofs.every((r) => !r.visible)),
  ).toBeTruthy();
  await p.screenshot({
    path: "/tmp/luma-captures/production.png",
    fullPage: true,
  });
  await p.locator('[data-frame="dock"]').click();
  await p.waitForTimeout(1200);
  await p.screenshot({ path: "/tmp/luma-captures/dock.png", fullPage: true });
  await p.locator('[data-frame="felipe"]').click();
  await p.waitForTimeout(1200);
  await p.locator('[data-action="close-inspector"]').click();
  await p.screenshot({ path: "/tmp/luma-captures/truck.png", fullPage: true });
  await p.locator('[data-action="presentation"]').click();
  expect(
    await p.evaluate(() => __luma.scene.camera.isPerspectiveCamera),
  ).toBeTruthy();
  await p.locator('[data-action="presentation"]').click();
  expect(
    await p.evaluate(() => __luma.scene.camera.isOrthographicCamera),
  ).toBeTruthy();
  await p.locator('[data-frame="campus"]').click();
  await p.waitForTimeout(1200);
  await p.screenshot({ path: "/tmp/luma-captures/campus.png", fullPage: true });
  await p.locator('[data-action="filters"]').click();
  await p.locator("#l-driver").selectOption("Felipe García");
  await p.locator('[data-view="list"]').first().click();
  await expect(p.locator(".l-list-scroll tbody")).toContainText("Felipe");
  await expect(p.locator(".l-list-scroll tbody")).not.toContainText("Clara");
  await p.locator('[data-action="clear"]').click();
  await p.locator('[data-view="city"]').first().click();
  await p.locator('[data-action="filters"]').click();
  await p.locator("#l-speed").selectOption("240");
  await p.locator('[data-action="play"]').click();
  const before = await p.evaluate(() => __luma.state.now);
  await expect
    .poll(() => p.evaluate(() => __luma.state.now), { timeout: 10000 })
    .toBeGreaterThan(before);
  await p.locator('[data-action="play"]').click();
  const paused = await p.evaluate(() => __luma.state.now);
  await p.waitForTimeout(500);
  expect(await p.evaluate(() => __luma.state.now)).toBe(paused);
  await p.locator("#l-quality").selectOption("light");
  await p.waitForTimeout(500);
  await p.screenshot({ path: "/tmp/luma-captures/light.png", fullPage: true });
  await p.locator("#l-quality").selectOption("high");
  await p.waitForTimeout(600);
  await p.screenshot({ path: "/tmp/luma-captures/high.png", fullPage: true });
  await p.locator("#l-quality").selectOption("balanced");
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(600);
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await p.screenshot({ path: "/tmp/luma-captures/mobile.png", fullPage: true });
  expect(errors).toEqual([]);
  console.log(
    "PASS Luma: real picking, stable IDs, delivery/return/confirmation, pipeline, economics snapshots, permissions, roof, 4 frames, projections, filters, pause/speed, presets and mobile.",
  );
} finally {
  await b.close();
}
