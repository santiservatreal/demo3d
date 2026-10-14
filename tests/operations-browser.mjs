import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir("/tmp/atlas-operations", { recursive: true });
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.BASE_URL || "http://127.0.0.1:5173";
const inspector = page.locator("#op-inspector");
async function scenario(s) {
  await page.locator("#op-scenario").selectOption(s);
}
try {
  await page.goto(base);
  await expect(page.locator(".op-canvas canvas")).toBeVisible();
  await expect(page.locator(".op-place-label")).toHaveCount(9);
  await expect(inspector).toContainText("Felipe García");
  await expect(inspector).toContainText("40 / 60 uds.");
  await expect(inspector).toContainText("Posición estimada");
  // Real canvas interaction: project the known world-space position, then raycast via pointer.
  const point = await page.evaluate(async () => {
    const T = await import("/node_modules/three/build/three.module.js"),
      { createInitialState, vehiclePosition } =
        await import("/src/operations/model.js");
    const r = document
        .querySelector(".op-canvas canvas")
        .getBoundingClientRect(),
      cam = new T.PerspectiveCamera(34, r.width / r.height, 0.1, 400);
    cam.position.set(51, 55, 66).multiplyScalar(Math.max(1, 1.55 / cam.aspect));
    cam.lookAt(1, 0, 0);
    cam.updateMatrixWorld();
    const s = createInitialState(),
      p = vehiclePosition(s.vehicles[0], s.now).position,
      q = new T.Vector3(p.x, 1.5, p.z).project(cam);
    return {
      x: r.x + (q.x * 0.5 + 0.5) * r.width,
      y: r.y + (-q.y * 0.5 + 0.5) * r.height,
    };
  });
  await page.mouse.move(point.x, point.y);
  await expect(page.locator(".op-tooltip")).toContainText("Felipe");
  await page.mouse.click(point.x, point.y);
  await expect(inspector).toContainText("Felipe García");
  await page.locator('[data-action="next-event"]').click();
  await expect(inspector).toContainText("Entrega registrada");
  await expect(inspector).toContainText("0 / 60 uds.");
  await page.locator('[data-view="pipeline"]').click();
  await expect(
    page.locator('.op-order-card[data-select="order-1042"]'),
  ).toBeVisible();
  await expect(page.locator(".op-kanban section").last()).toContainText(
    "Pedido #1042",
  );
  await page.locator('[data-action="next-event"]').click();
  await expect(inspector).toContainText("Volviendo vacío");
  await expect(inspector).toContainText("Posición estimada");
  await scenario("delayed");
  await expect(inspector).toContainText("Llegada pendiente de confirmar");
  await expect(inspector).toContainText("Volviendo vacío");
  await page.locator('[data-action="next-event"]').click();
  await expect(inspector).toContainText("Disponible");
  await expect(inspector).toContainText("Llegada confirmada");
  await page.locator('[data-view="list"]').click();
  await expect(page.locator("tbody tr")).toHaveCount(29);
  await page.locator('td button[data-select="order-1042"]').click();
  await expect(inspector).toContainText("Entregado");
  await expect(inspector.locator('[data-select="truck-01"]')).toBeVisible();
  await inspector.locator('[data-select="truck-01"]').click();
  await expect(inspector).toContainText("Felipe García");
  await scenario("blocked");
  await expect(inspector).toContainText("Bloqueada");
  await expect(page.locator("#op-metrics")).toContainText(
    "Una línea necesita atención",
  );
  await scenario("shortage");
  await expect(inspector).toContainText("Faltan 22 unidades");
  await scenario("stale");
  await expect(inspector).toContainText("Último GPS recibido");
  await expect(inspector).toContainText("120 min");
  await page.locator("#op-search").fill("Iván");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.locator("td button").click();
  await expect(inspector).toContainText("Sin ubicación disponible");
  await expect(inspector.locator('[data-action="follow"]')).toBeDisabled();
  await page.locator('[data-action="clear"]').click();
  await page.locator('[data-action="filters"]').click();
  await page.locator("#op-department").selectOption("transport");
  await page.locator("#op-owner").selectOption("Felipe García");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.locator('[data-view="city"]').click();
  await expect(inspector).toContainText("Iván Mora");
  await expect(page.locator("#op-focus-banner")).toBeVisible();
  await page.locator('[data-action="clear"]').click();
  await page.locator('[data-action="filters"]').click();
  // Permissions eliminate finance from scene labels, records, search and relationships.
  await page.locator('[data-action="permissions"]').click();
  await expect(
    page.locator('.op-place-label[data-entity="finance"]'),
  ).toBeHidden();
  await page.locator('[data-view="list"]').click();
  await expect(page.locator("tbody tr")).toHaveCount(26);
  await page.locator("#op-search").fill("Factura");
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page.locator('[data-action="clear"]').first().click();
  await page.locator('[data-action="permissions"]').click();
  await page.locator('[data-action="configure"]').first().click();
  await expect(page.getByRole("dialog")).toContainText(
    "Sin OAuth ni backend conectado",
  );
  await page.locator("#op-mapping-form button").click();
  await expect(page.locator("#op-mapping-result")).toContainText(
    "Configuración guardada",
  );
  await page.keyboard.press("Escape");
  await page.locator("#op-template").selectOption("services");
  await expect(page.locator("#op-scenario")).toBeDisabled();
  await expect(page.locator(".op-place-label")).toHaveCount(8);
  await expect(page.locator("tbody tr")).toHaveCount(15);
  await expect(page.locator("tbody")).not.toContainText("AT-001");
  await expect(inspector).toContainText("Horas registradas");
  await page.locator('[data-view="pipeline"]').click();
  await expect(page.locator(".op-order-card")).toHaveCount(2);
  await page.locator("#op-template").selectOption("industrial");
  await page.locator('[data-view="city"]').click();
  await scenario("initial");
  await page.locator("#op-speed").selectOption("3600");
  await page.locator('[data-action="play"]').click();
  await expect(page.locator("#op-time")).not.toHaveText("10:35");
  await page.locator('[data-action="play"]').click();
  const paused = await page.locator("#op-time").textContent();
  await page.waitForTimeout(800);
  await expect(page.locator("#op-time")).toHaveText(paused);
  await scenario("returning");
  await page.locator('[data-action="reset-camera"]').click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: "/tmp/atlas-operations/desktop.png",
    fullPage: true,
  });
  await page.locator('[data-action="felipe"]').first().click();
  await page.screenshot({
    path: "/tmp/atlas-operations/felipe.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-action="reset-camera"]').click();
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "No mobile overflow",
  ).toBeTruthy();
  await expect(inspector).toContainText("Felipe García");
  await page.screenshot({
    path: "/tmp/atlas-operations/mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  console.log(
    "PASS: 3D raycast selection, delivery, empty return, arrival confirmation, related records, all incidents, composable filters, restricted finance, field mapping, services, simulation clock, desktop and mobile. No JS errors.",
  );
} finally {
  await browser.close();
}
