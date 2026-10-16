import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

// Integration test against the actual application, including real WebGL raycasting.
// This uses a software GPU and an emulated viewport, not a physical touch device.
const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const captures = process.env.CAPTURE_DIR || "docs/city/captures";
await mkdir(captures, { recursive: true });
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
const results = [];
const record = (name, detail) => {
  results.push({ name, detail, passed: true });
  console.log(`PASS ${name}`);
};
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultTimeout(20000);

async function boot(target = page) {
  await target.goto(base);
  await target.waitForFunction(() => !!window.__ATLAS_CITY__?.provider);
  await expect(target.locator("#city-app")).toBeVisible();
}
async function snapshot(target = page) {
  return target.evaluate(() =>
    structuredClone(__ATLAS_CITY__.provider.getState()),
  );
}
async function metricSnapshot(target = page) {
  return target.evaluate(() => structuredClone(__ATLAS_CITY__.metrics()));
}
async function cameraSettled(target = page) {
  await expect
    .poll(
      () =>
        target.evaluate(
          () => __ATLAS_CITY__.scene.getDiagnostics().cameraMoving,
        ),
      { timeout: 40000 },
    )
    .toBe(false);
}
async function visibleWithinViewport(target, selector) {
  const b = await target.locator(selector).boundingBox();
  const v = target.viewportSize();
  expect(b, `${selector} has a visible box`).toBeTruthy();
  expect(b.x, `${selector} left edge`).toBeGreaterThanOrEqual(-1);
  expect(b.y, `${selector} top edge`).toBeGreaterThanOrEqual(-1);
  expect(b.x + b.width, `${selector} right edge`).toBeLessThanOrEqual(
    v.width + 1,
  );
  expect(b.y + b.height, `${selector} bottom edge`).toBeLessThanOrEqual(
    v.height + 1,
  );
}

try {
  await boot();
  await page.waitForFunction(() => !!__ATLAS_CITY__.scene?.debug?.renderer);
  await page.evaluate(() => __ATLAS_CITY__.scene.debug.ready);
  await expect(page.locator("#city-canvas canvas")).toHaveCount(1);
  await expect(page.locator("#city-app")).toContainText("Datos simulados");
  const initial = await snapshot();
  const initialMetrics = await metricSnapshot();
  expect(initial.deals).toHaveLength(31);
  expect(initial.accounts).toHaveLength(18);
  expect(initialMetrics).toMatchObject({
    openCount: 24,
    openAmount: 120000,
    wonCount: 4,
    wonAmount: 30000,
    lostCount: 3,
    activeClients: 18,
    pendingContacts: 7,
    pendingConversations: 9,
    callsToday: 12,
    overdueTasks: 5,
  });
  expect(initialMetrics.stages.map((stage) => stage.count)).toEqual([
    7, 5, 6, 6, 4,
  ]);
  await page.screenshot({ path: `${captures}/baseline.png`, fullPage: true });
  record("initial-load", {
    deals: initial.deals.length,
    accounts: initial.accounts.length,
    metrics: initialMetrics,
  });

  if (process.env.RESPONSIVE_ONLY !== "1") {
    // Pick actual architecture, not a DOM label or a testing-only selection callback.
    const pick = await page.evaluate(() => {
      const { scene, provider } = __ATLAS_CITY__;
      for (const deal of provider
        .getState()
        .deals.filter((deal) => deal.stageId === "lead")) {
        const point = scene.projectEntity(deal.id);
        if (
          point?.visible &&
          scene.debug.pick(point.x, point.y) === deal.id &&
          document.elementFromPoint(point.x, point.y) ===
            scene.debug.renderer.domElement
        )
          return point;
      }
      return null;
    });
    expect(
      pick,
      "An actual Lead building must be visible and available for picking",
    ).toBeTruthy();
    const pickedId = pick.id;
    const pickedDeal = initial.deals.find((deal) => deal.id === pickedId);
    expect(pick.visible).toBeTruthy();
    await page.mouse.click(pick.x, pick.y);
    await expect(page.locator("#city-inspector")).toContainText(
      pickedDeal.name,
    );
    const identity = await page.evaluate(
      (id) => __ATLAS_CITY__.scene.entityGroups.get(id).uuid,
      pickedId,
    );
    const architectureIdentity = await page.evaluate(() =>
      __ATLAS_CITY__.scene.debug.architecture.meshes.map((mesh) => ({
        mesh: mesh.uuid,
        geometry: mesh.geometry.uuid,
      })),
    );
    record("real-raycast-selection", { id: pickedId, screen: pick });

    // Changing the business state updates the existing visual identity and selection.
    await page.locator("#deal-stage").selectOption("negotiation");
    await expect
      .poll(
        async () =>
          (await snapshot()).deals.find((d) => d.id === pickedId).stageId,
      )
      .toBe("negotiation");
    expect(
      await page.evaluate(
        (id) => __ATLAS_CITY__.scene.entityGroups.get(id).uuid,
        pickedId,
      ),
    ).toBe(identity);
    expect(
      await page.evaluate(() =>
        __ATLAS_CITY__.scene.debug.architecture.meshes.map((mesh) => ({
          mesh: mesh.uuid,
          geometry: mesh.geometry.uuid,
        })),
      ),
    ).toEqual(architectureIdentity);
    await expect(page.locator("#city-inspector")).toContainText(
      pickedDeal.name,
    );
    record("stage-transition-preserves-identity", {
      id: pickedId,
      uuid: identity,
    });

    // Replay the actual generated event. Winning a deal must not create duplicate accounts.
    const accountsBeforeWin = (await snapshot()).accounts
      .map((a) => a.id)
      .sort();
    await page.locator('[data-action="simulate-win"]').first().click();
    const afterWin = await snapshot();
    const wonEvent = afterWin.events.findLast(
      (event) => event.type === "deal.won",
    );
    expect(wonEvent).toBeTruthy();
    expect(afterWin.accounts.map((a) => a.id).sort()).toEqual(
      accountsBeforeWin,
    );
    const winMetrics = await metricSnapshot();
    await page.evaluate(
      (event) => __ATLAS_CITY__.provider.dispatch(event),
      wonEvent,
    );
    expect(await metricSnapshot()).toEqual(winMetrics);
    expect((await snapshot()).accounts.map((a) => a.id).sort()).toEqual(
      accountsBeforeWin,
    );
    await expect
      .poll(
        () =>
          page.evaluate(
            () => __ATLAS_CITY__.scene.getDiagnostics().transitionCount,
          ),
        { timeout: 30000 },
      )
      .toBe(0);
    const duplicatePlots = await page.evaluate(() => {
      const entities = [
        ...__ATLAS_CITY__.scene.debug.architecture.entities.values(),
      ].filter((entity) => entity.visible);
      const collisions = [];
      for (let i = 0; i < entities.length; i++)
        for (let j = i + 1; j < entities.length; j++) {
          const a = entities[i],
            b = entities[j];
          if (
            Math.hypot(
              a.group.position.x - b.group.position.x,
              a.group.position.z - b.group.position.z,
            ) < 0.01
          )
            collisions.push([a.id, b.id]);
        }
      return collisions;
    });
    expect(
      duplicatePlots,
      "Stage changes must reserve an unoccupied destination parcel",
    ).toEqual([]);
    record("win-event-idempotence-and-existing-account", {
      eventId: wonEvent.id,
      metrics: winMetrics,
    });

    // City and table share a provider; filtering and selection must work in both.
    await page.locator('[data-action="view-table"]').first().click();
    await expect(page.locator("#city-table")).toBeVisible();
    expect(await metricSnapshot()).toEqual(winMetrics);
    const rowSum = await page
      .locator("#city-table tbody td[data-amount]")
      .evaluateAll((cells) =>
        cells.reduce((sum, cell) => sum + Number(cell.dataset.amount), 0),
      );
    expect(rowSum).toBe(winMetrics.openAmount + winMetrics.wonAmount);
    expect(
      Number(
        await page.locator("#city-table-total").getAttribute("data-amount"),
      ),
    ).toBe(rowSum);
    expect(
      Number(
        await page.locator('[data-metric="open"]').getAttribute("data-value"),
      ),
    ).toBe(winMetrics.openAmount);
    expect(
      Number(
        await page.locator('[data-metric="won"]').getAttribute("data-value"),
      ),
    ).toBe(winMetrics.wonAmount);
    await page.locator("#city-search").fill(initial.deals[0].name);
    await expect(page.locator("#city-table tbody tr")).toHaveCount(1);
    await expect(page.locator("#city-table tbody")).toContainText(
      initial.deals[0].name,
    );
    await page.locator("#city-search").fill("");
    await page.locator('[data-action="filters"]').click();
    for (const stage of winMetrics.stages) {
      await page.locator("#filter-stage").selectOption(stage.id);
      await expect(page.locator("#city-table tbody tr")).toHaveCount(
        stage.count,
      );
      const stageSum = await page
        .locator("#city-table tbody td[data-amount]")
        .evaluateAll((cells) =>
          cells.reduce((sum, cell) => sum + Number(cell.dataset.amount), 0),
        );
      expect(stageSum).toBe(stage.amount);
      expect(
        Number(
          await page
            .locator(`#city-stage-cards [data-stage="${stage.id}"]`)
            .getAttribute("data-amount"),
        ),
      ).toBe(stageSum);
    }
    await page.locator("#filter-stage").selectOption("");
    await page.locator("#filter-owner").selectOption(initial.deals[0].ownerId);
    const expectedOwnerCount = (await snapshot()).deals.filter(
      (d) => d.status !== "lost" && d.ownerId === initial.deals[0].ownerId,
    ).length;
    await expect(page.locator("#city-table tbody tr")).toHaveCount(
      expectedOwnerCount,
    );
    await page.locator("#filter-owner").selectOption("");
    await page.locator("#filter-attention").check();
    const attentionRows = await page.locator("#city-table tbody tr").count();
    expect(attentionRows).toBeGreaterThan(0);
    expect(attentionRows).toBeLessThan(afterWin.deals.length);
    await page.locator("#filter-attention").uncheck();
    await page.locator("#filter-lost").check();
    await page.locator("#filter-stage").selectOption("lost");
    await expect(page.locator("#city-table tbody tr")).toHaveCount(3);
    await page.locator('[data-action="clear-filters"]').click();
    await page.locator('[data-action="filters"]').click();
    await page.locator('[data-action="view-city"]').first().click();
    record("synced-table-search-owner-attention", { attentionRows });

    await page.locator('[data-action="close-inspector"]').click();
    const stateBeforeModes = await snapshot();
    const uiBeforeModes = await page.evaluate(() =>
      __ATLAS_CITY__.getUiState(),
    );
    await page.locator('[data-action="tv"]').click();
    expect((await page.evaluate(() => __ATLAS_CITY__.getUiState())).mode).toBe(
      "tv",
    );
    await page.waitForTimeout(1000);
    expect(await snapshot()).toEqual(stateBeforeModes);
    await page.locator('.c-mode-tabs [data-action="explore"]').click();
    await page.locator('[data-action="replay"]').click();
    await expect(page.locator("#city-replay")).toBeVisible();
    await page.locator("#city-replay-speed").selectOption("4");
    await page.locator('[data-action="replay-next"]').click();
    expect(
      (await page.evaluate(() => __ATLAS_CITY__.getUiState())).replay.index,
    ).toBe(1);
    await page.locator('[data-action="replay-play"]').click();
    await expect
      .poll(
        () => page.evaluate(() => __ATLAS_CITY__.getUiState().replay.index),
        { timeout: 15000 },
      )
      .toBeGreaterThan(1);
    await page.locator('[data-action="replay-play"]').click();
    const pausedIndex = await page.evaluate(
      () => __ATLAS_CITY__.getUiState().replay.index,
    );
    await page.waitForTimeout(800);
    expect(
      await page.evaluate(() => __ATLAS_CITY__.getUiState().replay.index),
    ).toBe(pausedIndex);
    await page.locator('.c-mode-tabs [data-action="explore"]').click();
    expect(await snapshot()).toEqual(stateBeforeModes);
    expect(
      await page.evaluate(() => __ATLAS_CITY__.getUiState().selectedId),
    ).toBe(uiBeforeModes.selectedId);
    expect(
      await page.evaluate(() => __ATLAS_CITY__.getUiState().filters),
    ).toEqual(uiBeforeModes.filters);
    await expect(
      page.locator('[data-action="simulate-win"]').first(),
    ).toBeEnabled();
    record("tv-immutable-and-replay-pause-speed-restore", { pausedIndex });

    await page.locator('[data-action="layers"]').first().click();
    await page.locator('[data-layer="traffic"]').uncheck();
    expect(
      (await page.evaluate(() => __ATLAS_CITY__.getUiState())).layers.traffic,
    ).toBe(false);
    expect(await snapshot()).toEqual(stateBeforeModes);
    await page.locator('[data-layer="traffic"]').check();
    await page.locator('[data-action="layers"]').first().click();
    record("ambient-traffic-layer-does-not-change-crm", {});

    await page.evaluate(() => {
      const api = __ATLAS_CITY__,
        custom = structuredClone(api.provider.getState());
      const rename = (id) => (id === "won" ? "signed" : id);
      custom.stages = custom.stages.map((stage) => ({
        ...stage,
        id: rename(stage.id),
        name: stage.id === "won" ? "Firmadas" : stage.name,
      }));
      custom.stages.push({
        id: "security-review",
        name: "Revisión de seguridad",
        order: 2.5,
        kind: "open",
        color: "#8b97b3",
      });
      for (const deal of custom.deals) {
        deal.stageId = rename(deal.stageId);
        for (const entry of deal.history) entry.stageId = rename(entry.stageId);
      }
      for (const event of custom.events)
        if (event.payload) {
          event.payload.stageId = rename(event.payload.stageId);
          event.payload.fromStageId = rename(event.payload.fromStageId);
        }
      api.provider.reset(custom);
    });
    await expect(
      page.locator('#filter-stage option[value="security-review"]'),
    ).toHaveCount(1);
    await expect(page.locator("#city-stage-cards [data-stage]")).toHaveCount(6);
    await page.evaluate(() => {
      __ATLAS_CITY__.select("deal-013", { focus: false });
      __ATLAS_CITY__.changeStage("deal-013", "security-review");
    });
    expect(
      (await snapshot()).deals.find((deal) => deal.id === "deal-013").stageId,
    ).toBe("security-review");
    const customWin = await page.evaluate(() => __ATLAS_CITY__.simulateWin());
    expect(customWin.payload.stageId).toBe("signed");
    expect(
      (await snapshot()).deals.find((deal) => deal.id === "deal-013").stageId,
    ).toBe("signed");
    await page.evaluate(() => __ATLAS_CITY__.reset());
    expect((await metricSnapshot()).openAmount).toBe(120000);
    await expect(page.locator("#city-stage-cards [data-stage]")).toHaveCount(5);
    record("configurable-stages-and-custom-won-id", {
      customStageCount: 6,
      wonStageId: "signed",
    });
  }

  if (await page.locator("#city-inspector").isVisible())
    await page.locator('[data-action="close-inspector"]').click();
  await page.locator('[data-action="overview"]').click();
  await cameraSettled();
  await page.screenshot({ path: `${captures}/desktop.png`, fullPage: true });
  for (const [name, width, height] of [
    ["tablet", 768, 1024],
    ["mobile", 390, 844],
    ["mobile-landscape", 844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.evaluate(() => __ATLAS_CITY__.select("deal-003"));
    await cameraSettled();
    await visibleWithinViewport(page, "#city-inspector");
    if (width === 390) {
      const heights = {};
      const worldHeight = (await page.locator("#city-world").boundingBox())
        .height;
      for (const size of ["compact", "half", "full"]) {
        await page
          .locator(
            `#city-inspector [data-action="sheet-size"][data-size="${size}"]`,
          )
          .click();
        const targetHeight =
          size === "compact"
            ? Math.min(170, worldHeight)
            : size === "half"
              ? worldHeight * 0.65
              : worldHeight;
        await expect
          .poll(
            async () =>
              Math.abs(
                (await page.locator("#city-inspector").boundingBox()).height -
                  targetHeight,
              ),
            { timeout: 15000 },
          )
          .toBeLessThan(2);
        await visibleWithinViewport(page, "#city-inspector");
        heights[size] = (
          await page.locator("#city-inspector").boundingBox()
        ).height;
      }
      expect(heights.compact).toBeLessThan(heights.half);
      expect(heights.half).toBeLessThan(worldHeight * 0.8);
      expect(heights.full).toBeGreaterThan(heights.half);
      expect(Math.abs(heights.full - worldHeight)).toBeLessThanOrEqual(2);
      await page
        .locator('#city-inspector [data-action="sheet-size"][data-size="half"]')
        .click();
      await expect
        .poll(
          async () =>
            Math.abs(
              (await page.locator("#city-inspector").boundingBox()).height -
                worldHeight * 0.65,
            ),
          { timeout: 15000 },
        )
        .toBeLessThan(2);
    }
    const focusedPoint = await page.evaluate(() =>
      __ATLAS_CITY__.scene.projectEntity("deal-003"),
    );
    const inspectorBounds = await page.locator("#city-inspector").boundingBox();
    expect(
      focusedPoint.visible,
      "The selected building must remain in the focused camera view",
    ).toBeTruthy();
    if (width === 390)
      expect(
        focusedPoint.y,
        "The selected building must appear above the bottom sheet",
      ).toBeLessThan(inspectorBounds.y);
    else
      expect(
        focusedPoint.x,
        "The selected building must appear beside the inspector",
      ).toBeLessThan(inspectorBounds.x);
    await page.screenshot({ path: `${captures}/${name}.png`, fullPage: true });
    await page.locator('[data-action="close-inspector"]').click();
    record(`viewport-${width}x${height}`, { physicalTouchDevice: false });
  }

  // Browser preference is genuine media emulation; no claim of physical phone gestures.
  const reduced = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    hasTouch: true,
    isMobile: true,
  });
  reduced.on("pageerror", (error) => errors.push(error.message));
  await boot(reduced);
  await reduced.waitForFunction(() => !!__ATLAS_CITY__.scene?.debug?.renderer);
  await reduced.evaluate(() => __ATLAS_CITY__.scene.debug.ready);
  expect(
    await reduced.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBeTruthy();
  expect(
    await reduced.evaluate(
      () => __ATLAS_CITY__.scene.getDiagnostics().reducedMotion,
    ),
  ).toBeTruthy();
  await reduced.evaluate(() => __ATLAS_CITY__.select("deal-002"));
  await cameraSettled(reduced);
  await expect(reduced.locator("#city-inspector")).toBeVisible();
  await reduced.locator('[data-action="close-inspector"]').click();
  const touchPoint = await reduced.evaluate(() =>
    __ATLAS_CITY__.scene.projectEntity("deal-002"),
  );
  await reduced.touchscreen.tap(touchPoint.x, touchPoint.y);
  await expect(reduced.locator("#city-inspector")).toBeVisible();
  await reduced.locator('[data-action="close-inspector"]').click();
  const touchCdp = await reduced.context().newCDPSession(reduced);
  const canvasBox = await reduced.locator("#city-canvas canvas").boundingBox();
  const gesture = {
    x: canvasBox.x + canvasBox.width * 0.4,
    y: canvasBox.y + canvasBox.height * 0.4,
  };
  await touchCdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...gesture, id: 1 }],
  });
  for (let i = 1; i <= 6; i++)
    await touchCdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: gesture.x + i * 12, y: gesture.y + i * 2, id: 1 }],
    });
  await touchCdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(reduced.locator("#city-inspector")).toBeHidden();
  await reduced.evaluate(() => __ATLAS_CITY__.select("deal-002"));
  await reduced.screenshot({
    path: `${captures}/reduced-motion.png`,
    fullPage: true,
  });
  await reduced.close();
  record("prefers-reduced-motion-and-emulated-touch-tap-drag", {
    physicalTouchDevice: false,
  });

  const fallback = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  fallback.on("pageerror", (error) => errors.push(error.message));
  await fallback.addInitScript(() => {
    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return /^webgl|experimental-webgl/.test(kind)
        ? null
        : nativeGetContext.call(this, kind, ...args);
    };
  });
  await boot(fallback);
  await expect(fallback.locator("#city-table")).toBeVisible();
  await expect(fallback.locator("#city-table tbody tr")).toHaveCount(28);
  await fallback.locator("#city-search").fill(initial.deals[0].name);
  await expect(fallback.locator("#city-table tbody tr")).toHaveCount(1);
  await fallback.locator("#city-table tbody tr").first().click();
  await expect(fallback.locator("#city-inspector")).toContainText(
    initial.deals[0].name,
  );
  await fallback.screenshot({
    path: `${captures}/fallback.png`,
    fullPage: true,
  });
  await fallback.close();
  record("no-webgl-functional-table", {});

  expect(errors, "No uncaught browser JS errors").toEqual([]);
  await writeFile(
    "docs/city/browser-validation.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        base,
        browser: browser.version(),
        softwareGpu: "ANGLE SwiftShader",
        physicalTouchDevice: false,
        scope:
          process.env.RESPONSIVE_ONLY === "1"
            ? "responsive-touch-reduced-motion-and-fallback"
            : "full",
        errors,
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS Atlas City: ${results.length} integration checks (${process.env.RESPONSIVE_ONLY === "1" ? "responsive, touch, reduced motion and fallback" : "full integration"}).`,
  );
} finally {
  await browser.close();
}
