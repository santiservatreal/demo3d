import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";

const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const output = process.env.CAPTURE_DIR || "docs/city/v3";
await mkdir(`${output}/captures`, { recursive: true });
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
const errors = [],
  results = [];
const sourceFiles = [
  "app.js",
  "style.css",
  "expansion.css",
  "scene.js",
  "model.js",
  "people.js",
  "construction.js",
  "communications-model.js",
  "communications.js",
  "industry-model.js",
  "industry.js",
];
async function sourceHashes() {
  const hashes = {};
  for (const name of sourceFiles) {
    const file = `src/city/${name}`;
    hashes[file] = createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  }
  return hashes;
}
async function clearFailureArtifacts() {
  await rm(`${output}/last-failure.json`, { force: true });
  await rm(`${output}/captures/failure.png`, { force: true });
}
const record = (name, detail) => {
  results.push({ name, passed: true, detail });
  console.log(`PASS ${name}`);
};
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(30000);
page.on("pageerror", (error) => errors.push(error.message));
const crm = (target = page) =>
  target.evaluate(() => structuredClone(__ATLAS_CITY__.provider.getState()));
const industry = (target = page) =>
  target.evaluate(() =>
    structuredClone(__ATLAS_CITY__.industryProvider.getState()),
  );
const industrialMetrics = (target = page) =>
  target.evaluate(() => structuredClone(__ATLAS_CITY__.industryMetrics()));
const diagnostics = (target = page) =>
  target.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics());
async function settled(target = page) {
  await expect
    .poll(
      () =>
        target.evaluate(
          () => __ATLAS_CITY__.scene.getDiagnostics().cameraMoving,
        ),
      { timeout: 30000 },
    )
    .toBe(false);
}
async function boot(target = page) {
  await target.goto(base);
  await target.waitForFunction(
    () => !!window.__ATLAS_CITY__?.scene?.debug?.industry,
  );
  await target.evaluate(() => __ATLAS_CITY__.scene.debug.ready);
  await settled(target);
}
async function screenshot(name, target = page) {
  await target.screenshot({
    path: `${output}/captures/${name}.png`,
    fullPage: true,
    timeout: 60000,
  });
}
async function closeDrawer(target = page) {
  const close = target.locator('[data-action="close-drawer"]:visible');
  if (await close.count()) await close.first().click();
}
async function inBounds(target, selector) {
  const bounds = await target.locator(selector).evaluate((element) => {
    const b = element.getBoundingClientRect();
    return {
      x: b.x,
      y: b.y,
      right: b.right,
      bottom: b.bottom,
      width: b.width,
      height: b.height,
      viewport: [innerWidth, innerHeight],
    };
  });
  expect(bounds.width).toBeGreaterThan(0);
  expect(bounds.height).toBeGreaterThan(0);
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.y).toBeGreaterThanOrEqual(-1);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewport[0] + 1);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewport[1] + 1);
  return bounds;
}
async function fullCanvas(target = page) {
  const bounds = await inBounds(target, "#city-canvas canvas");
  expect(Math.abs(bounds.width - bounds.viewport[0])).toBeLessThanOrEqual(1);
  expect(Math.abs(bounds.height - bounds.viewport[1])).toBeLessThanOrEqual(1);
  expect(Math.abs(bounds.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(bounds.y)).toBeLessThanOrEqual(1);
  return bounds;
}
async function district(id, target = page) {
  await closeDrawer(target);
  await target.locator(`button[data-district="${id}"]:visible`).first().click();
  await expect(target.locator("#city-app")).toHaveAttribute(
    "data-district",
    id,
  );
  await settled(target);
}
// Check the renderer's real raycast AND that the pointer reaches its canvas.
// Offsets search an exposed part of a building/vehicle rather than clicking a DOM label.
async function pick(id, kind, target = page) {
  const point = await target.evaluate(
    ({ id, kind }) => {
      const scene = __ATLAS_CITY__.scene;
      const center =
        kind === "place" ? scene.projectPlace(id) : scene.projectIndustry(id);
      if (!center?.visible) return null;
      for (const [dx, dy] of [
        [0, 0],
        [0, 8],
        [0, -8],
        [-8, 0],
        [8, 0],
        [-16, 8],
        [16, 8],
        [0, 16],
        [-24, 0],
        [24, 0],
      ]) {
        const x = center.x + dx,
          y = center.y + dy;
        const hit = scene.debug.pickWorld(x, y);
        if (
          hit?.id === id &&
          hit.kind === kind &&
          document.elementFromPoint(x, y) === scene.debug.renderer.domElement
        )
          return { id, x, y, hit };
      }
      return null;
    },
    { id, kind },
  );
  expect(
    point,
    `Exposed 3D ${kind} ${id} must be available to raycasting`,
  ).toBeTruthy();
  await target.mouse.click(point.x, point.y);
  return point;
}
function assertConserved(state) {
  expect(state.batches.reduce((sum, batch) => sum + batch.quantity, 0)).toBe(
    1320,
  );
  expect(new Set(state.batches.map((batch) => batch.id)).size).toBe(
    state.batches.length,
  );
  for (const batch of state.batches) {
    expect(batch.quantity).toBeGreaterThan(0);
    if (batch.stageId === "transit") {
      const truck = state.vehicles.find(
        (vehicle) => vehicle.id === batch.assignedTruckId,
      );
      expect(truck.cargoBatchId).toBe(batch.id);
      expect(truck.status).toBe("outbound");
    } else expect(batch.assignedTruckId).toBeNull();
  }
}

try {
  if (process.env.TV_ONLY === "1") {
    await boot();
    await district("industry");
    await page.locator('[data-action="tv"]').click();
    async function tvLabels() {
      await settled();
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await fullCanvas();
      await expect(page.locator(".city-industry-label:visible")).toHaveCount(5);
      const data = await page.evaluate(() => {
        const rect = (element) => {
          const b = element.getBoundingClientRect();
          return { x: b.x, y: b.y, right: b.right, bottom: b.bottom };
        };
        return {
          viewport: [innerWidth, innerHeight],
          metrics: rect(document.querySelector("#city-metrics")),
          labels: [...document.querySelectorAll(".city-industry-label")]
            .filter((element) => !element.hidden)
            .map((element) => ({
              id: element.dataset.placeId,
              ...rect(element),
            })),
        };
      });
      for (const label of data.labels) {
        expect(label.x).toBeGreaterThanOrEqual(-1);
        expect(label.y).toBeGreaterThanOrEqual(data.metrics.bottom);
        expect(label.right).toBeLessThanOrEqual(data.viewport[0] + 1);
        expect(label.bottom).toBeLessThanOrEqual(data.viewport[1] + 1);
      }
      return data;
    }
    const desktop = await tvLabels();
    await screenshot("tv-industry");
    record(
      "settled-desktop-industry-tv-shows-five-labels-clear-of-metrics",
      desktop,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    const mobile = await tvLabels();
    await screenshot("mobile-industry-tv");
    record(
      "settled-mobile-industry-tv-shows-five-labels-clear-of-metrics",
      mobile,
    );
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => {
      __ATLAS_CITY__.setDistrict("industry");
      __ATLAS_CITY__.advanceIndustryBatch("batch-004");
      __ATLAS_CITY__.scene.focusIndustry("delivered");
    });
    await settled();
    const before = await industry();
    const sampled = await page.evaluate(async () => {
      const api = __ATLAS_CITY__,
        renderer = api.scene.debug.industry;
      const clock = await new Promise((resolve) => {
        const original = renderer.update;
        renderer.update = (dt, elapsed) => {
          renderer.update = original;
          const result = original(dt, elapsed);
          resolve(elapsed);
          return result;
        };
      });
      api.scene.setActive(false);
      renderer.update(0, clock + 3600);
      api.scene.debug.renderer.render(
        api.scene.debug.scene,
        api.scene.debug.camera,
      );
      return { clock, vehicles: renderer.debug().vehicles };
    });
    expect(sampled.vehicles).toHaveLength(3);
    const distances = [];
    for (let i = 0; i < sampled.vehicles.length; i++)
      for (let j = i + 1; j < sampled.vehicles.length; j++) {
        const a = sampled.vehicles[i],
          b = sampled.vehicles[j];
        const distance = Math.hypot(
          a.position[0] - b.position[0],
          a.position[2] - b.position[2],
        );
        expect(distance).toBeGreaterThan(2.5);
        distances.push({ ids: [a.id, b.id], distance });
      }
    const picks = [];
    for (const id of ["truck-01", "truck-02", "truck-03"]) {
      await closeDrawer();
      // Opening a real panel restores the live scene. Reapply the diagnostic
      // pose before the next pick, without changing the ERP model.
      await page.evaluate((clock) => {
        const scene = __ATLAS_CITY__.scene;
        scene.setActive(false);
        scene.debug.industry.update(0, clock + 3600);
        scene.debug.renderer.render(scene.debug.scene, scene.debug.camera);
      }, sampled.clock);
      picks.push(await pick(id, "industry"));
      await expect(page.locator("#city-industry-panel")).toBeVisible();
      expect(
        await page.evaluate(
          () => __ATLAS_CITY__.getUiState().selectedIndustryId,
        ),
      ).toBe(id);
    }
    expect(await industry()).toEqual(before);
    await page.evaluate((clock) => {
      __ATLAS_CITY__.scene.debug.industry.update(0, clock);
      __ATLAS_CITY__.scene.setActive(true);
    }, sampled.clock);
    record(
      "three-trucks-have-distinct-selectable-diagnostic-endpoints-without-erp-arrival",
      {
        distances,
        picks,
        vehicles: sampled.vehicles,
        businessStateUnchanged: true,
      },
    );
    expect(errors).toEqual([]);
    await writeFile(
      `${output}/supplementary-validation.json`,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          browser: browser.version(),
          gpu: "ANGLE SwiftShader",
          physicalPhone: false,
          sourceSha256: await sourceHashes(),
          scope:
            "Final TV settling and truck parking fixes; route endpoint is a renderer diagnostic",
          errors,
          results,
        },
        null,
        2,
      ),
    );
    await clearFailureArtifacts();
    await browser.close();
    process.exit(0);
  }
  await boot();
  const initialCrm = await crm(),
    initialIndustry = await industry();
  await expect(page.locator(".city-owner-label:visible")).toHaveCount(4);
  const badges = await page
    .locator(".city-owner-label:visible")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const b = node.getBoundingClientRect();
        return {
          id: node.dataset.ownerId,
          text: node.textContent,
          rect: { x: b.x, y: b.y, right: b.right, bottom: b.bottom },
        };
      }),
    );
  expect(badges.map((badge) => badge.text).sort()).toEqual([
    "AT",
    "DS",
    "LF",
    "MV",
  ]);
  expect(new Set(badges.map((badge) => badge.id)).size).toBe(4);
  for (let i = 0; i < badges.length; i++)
    for (let j = i + 1; j < badges.length; j++) {
      const a = badges[i].rect,
        b = badges[j].rect;
      expect(
        Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1,
        "Owner badges must not overlap",
      ).toBe(false);
    }
  await screenshot("sales-owner-badges");
  record("four-owner-initials-visible-and-separated", { badges });

  // Supply early overview captures before the longer construction choreography.
  await district("communications");
  await screenshot("communications-overview");
  const communications = await page.evaluate(() =>
    structuredClone(__ATLAS_CITY__.communicationsSummary()),
  );
  const byPlace = Object.fromEntries(
    communications.map((row) => [row.id, row]),
  );
  expect(byPlace.email.todayCompleted).toBe(6);
  expect(byPlace.call.todayCompleted).toBe(12);
  expect(byPlace.messages.channels.whatsapp.todayCompleted).toBe(6);
  expect(byPlace.messages.channels.whatsapp.pendingCount).toBe(2);
  expect(byPlace.messages.channels.conversation.pendingCount).toBe(9);
  expect(byPlace.meeting.todayCompleted).toBe(1);
  expect(byPlace.meeting.pendingCount).toBe(2);
  record("communications-completed-and-pending-use-recorded-channels", {
    places: communications.map(({ records, ...row }) => ({
      ...row,
      recordIds: records.map((record) => record.id),
    })),
  });

  const placePicks = [];
  for (const id of ["email", "call", "messages", "meeting"]) {
    await closeDrawer();
    await page.evaluate((id) => __ATLAS_CITY__.scene.focusPlace(id), id);
    await settled();
    placePicks.push(await pick(id, "place"));
    await expect(page.locator("#city-communications-panel")).toBeVisible();
    expect(
      await page.evaluate(() => __ATLAS_CITY__.getUiState().selectedPlaceId),
    ).toBe(id);
    await expect(
      page.locator("#city-communications-panel .c-communication-record"),
    ).toHaveCount(byPlace[id].records.length);
    if (id === "messages") {
      await expect(
        page.locator('#city-communications-panel [data-channel="whatsapp"]'),
      ).toHaveCount(8);
      await expect(
        page.locator("#city-communications-panel .c-channel-summary"),
      ).toContainText("9 pendientes");
      await screenshot("messages-records");
    }
    if (id === "meeting") {
      await expect(
        page.locator("#city-communications-panel .c-communication-record"),
      ).toHaveCount(3);
      await screenshot("cafeteria-records");
      await closeDrawer();
      await screenshot("cafeteria-detail");
    }
    if (id === "email") await screenshot("email-records");
  }
  expect(await crm()).toEqual(initialCrm);
  record("four-locales-select-through-3d-and-show-source-records", {
    picks: placePicks,
  });

  await district("industry");
  await screenshot("industry-overview");
  const initialIndustrialMetrics = await industrialMetrics();
  expect(initialIndustrialMetrics).toMatchObject({
    totalUnits: 1320,
    stock: 480,
    inTransit: 160,
    delivered: 320,
    inProduction: 240,
    packed: 120,
    batchCount: 10,
  });
  expect(initialIndustrialMetrics.byStage).toEqual({
    manufacturing: 240,
    packing: 120,
    warehouse: 480,
    transit: 160,
    delivered: 320,
  });
  const rendered = await page.evaluate(() =>
    __ATLAS_CITY__.scene.debug.industry.debug(),
  );
  expect(rendered.places).toHaveLength(5);
  expect(
    Object.fromEntries(rendered.places.map((place) => [place.id, place.count])),
  ).toEqual(initialIndustrialMetrics.byStage);
  expect(new Set(rendered.batches.map((batch) => batch.id)).size).toBe(10);
  expect(rendered.batches.reduce((sum, batch) => sum + batch.quantity, 0)).toBe(
    1320,
  );
  assertConserved(await industry());
  record("five-industrial-stages-map-ten-exclusive-batches", {
    metrics: initialIndustrialMetrics,
    renderer: rendered,
  });

  const industryPicks = [];
  for (const id of [
    "manufacturing",
    "packing",
    "warehouse",
    "transit",
    "delivered",
  ]) {
    await closeDrawer();
    await page.evaluate((id) => __ATLAS_CITY__.scene.focusIndustry(id), id);
    await settled();
    industryPicks.push(await pick(id, "industry"));
    await expect(page.locator("#city-industry-panel")).toBeVisible();
    expect(
      await page.evaluate(() => __ATLAS_CITY__.getUiState().selectedIndustryId),
    ).toBe(id);
    const expectedBatches = initialIndustry.batches.filter(
      (batch) => batch.stageId === id,
    ).length;
    await expect(
      page.locator("#city-industry-panel .c-batch-card"),
    ).toHaveCount(expectedBatches);
    if (id === "warehouse") await screenshot("warehouse-ledger");
  }
  record("industrial-installations-select-through-3d-and-filter-lots", {
    picks: industryPicks,
  });

  const crmBeforeIndustry = await crm();
  await closeDrawer();
  await page.evaluate(() => __ATLAS_CITY__.showIndustry("batch-001", "batch"));
  for (const stageId of ["packing", "warehouse", "transit"]) {
    await page.locator('[data-advance-batch="batch-001"]').click();
    expect(
      (await industry()).batches.find((batch) => batch.id === "batch-001")
        .stageId,
    ).toBe(stageId);
    assertConserved(await industry());
  }
  const inTruck = await industry();
  const movingTruck = inTruck.vehicles.find(
    (vehicle) => vehicle.cargoBatchId === "batch-001",
  );
  expect(movingTruck.id).toBe("truck-03");
  expect((await industrialMetrics()).inTransit).toBe(280);
  expect((await industrialMetrics()).stock).toBe(480);
  const movingBefore = await page.evaluate(() =>
    __ATLAS_CITY__.scene.debug.industry
      .debug()
      .vehicles.find((vehicle) => vehicle.id === "truck-03"),
  );
  await expect
    .poll(
      () =>
        page.evaluate((before) => {
          const vehicle = __ATLAS_CITY__.scene.debug.industry
            .debug()
            .vehicles.find((vehicle) => vehicle.id === "truck-03");
          return (
            vehicle &&
            Math.hypot(
              vehicle.position[0] - before[0],
              vehicle.position[2] - before[2],
            ) > 0.05
          );
        }, movingBefore.position),
      { timeout: 20000 },
    )
    .toBeTruthy();
  const movingAfter = await page.evaluate(() =>
    __ATLAS_CITY__.scene.debug.industry
      .debug()
      .vehicles.find((vehicle) => vehicle.id === "truck-03"),
  );
  expect(movingAfter.uuid).toBe(movingBefore.uuid);
  expect(movingAfter.cargoBatchId).toBe("batch-001");
  expect(movingAfter.cargoRepresentativeBoxes).toBeGreaterThan(0);
  await closeDrawer();
  await page.evaluate(() => __ATLAS_CITY__.scene.focusIndustry("truck-03"));
  await settled();
  const truckPick = await pick("truck-03", "industry");
  await expect(page.locator("#city-industry-panel")).toContainText(
    "Pablo Ríos",
  );
  await expect(page.locator("#city-industry-panel")).toContainText("120 uds");
  await screenshot("truck-cargo-record");
  record(
    "explicit-production-packing-stock-dispatch-preserves-units-and-truck-identity",
    { before: movingBefore, after: movingAfter, pick: truckPick },
  );

  // Sampling a renderer endpoint is a diagnostic, not an actual ERP arrival.
  const endpoint = await page.evaluate(async () => {
    const api = __ATLAS_CITY__,
      renderer = api.scene.debug.industry;
    const before = JSON.stringify(api.industryProvider.getState());
    // Observe one existing animation callback; no new application clock API.
    const clock = await new Promise((resolve) => {
      const original = renderer.update;
      renderer.update = (dt, elapsed) => {
        renderer.update = original;
        const result = original(dt, elapsed);
        resolve(elapsed);
        return result;
      };
    });
    api.scene.setActive(false);
    try {
      renderer.update(0, clock + 3600);
      const end = renderer.debug();
      const unchanged =
        before === JSON.stringify(api.industryProvider.getState());
      renderer.update(0, clock);
      return { unchanged, vehicles: end.vehicles };
    } finally {
      api.scene.setActive(true);
    }
  });
  expect(endpoint.unchanged).toBe(true);
  expect(
    endpoint.vehicles.find((vehicle) => vehicle.id === "truck-03"),
  ).toMatchObject({
    progress: 1,
    awaitingConfirmation: true,
    cargoBatchId: "batch-001",
    status: "outbound",
  });
  expect(
    (await industry()).batches.find((batch) => batch.id === "batch-001")
      .stageId,
  ).toBe("transit");
  record("estimated-renderer-endpoint-never-confirms-delivery", endpoint);

  await page.evaluate(() => __ATLAS_CITY__.showIndustry("batch-001", "batch"));
  await page.locator('[data-advance-batch="batch-001"]').click();
  const delivered = await industry();
  const deliveryEvent = delivered.events.at(-1);
  expect(
    delivered.batches.find((batch) => batch.id === "batch-001"),
  ).toMatchObject({
    stageId: "delivered",
    assignedTruckId: null,
    delivery: { quantity: 120, truckId: "truck-03" },
  });
  expect(
    delivered.vehicles.find((vehicle) => vehicle.id === "truck-03"),
  ).toMatchObject({ status: "at_customer", cargoBatchId: null });
  expect((await industrialMetrics()).delivered).toBe(440);
  await page.evaluate(
    (event) => __ATLAS_CITY__.industryProvider.dispatch(event),
    deliveryEvent,
  );
  expect(await industry()).toEqual(delivered);
  expect(await crm()).toEqual(crmBeforeIndustry);
  assertConserved(delivered);
  record("delivery-recorded-once-and-independent-from-commercial-money", {
    event: deliveryEvent,
    metrics: await industrialMetrics(),
  });

  await page.evaluate(() => __ATLAS_CITY__.showIndustry("truck-03", "vehicle"));
  await page.locator('[data-return-truck="truck-03"]').click();
  expect(
    (await industry()).vehicles.find((vehicle) => vehicle.id === "truck-03"),
  ).toMatchObject({ status: "returning", cargoBatchId: null });
  const empty = await page.evaluate(() =>
    __ATLAS_CITY__.scene.debug.industry
      .debug()
      .vehicles.find((vehicle) => vehicle.id === "truck-03"),
  );
  expect(empty.cargoRepresentativeBoxes).toBe(0);
  await screenshot("truck-empty-return");
  await page.locator('[data-arrive-truck="truck-03"]').click();
  expect(
    (await industry()).vehicles.find((vehicle) => vehicle.id === "truck-03"),
  ).toMatchObject({
    status: "available",
    location: "warehouse",
    cargoBatchId: null,
  });
  expect((await industrialMetrics()).totalUnits).toBe(1320);
  record("empty-truck-return-and-confirmed-arrival-are-explicit-events", {
    renderer: empty,
  });

  await district("sales");
  await page.evaluate(() => __ATLAS_CITY__.select("deal-001"));
  await settled();
  await page.locator('[data-action="close-inspector"]').click();
  const beforeNonWin = await page.evaluate(() => __ATLAS_CITY__.metrics());
  const event = await page.evaluate(() =>
    __ATLAS_CITY__.changeStage("deal-001", "qualified"),
  );
  await page.waitForFunction(
    () => {
      const job = __ATLAS_CITY__.scene.debug.construction
        .debug()
        .active.find((job) => job.id === "deal-001");
      return (
        job?.phase === "build" &&
        job.buildProgress > 0.001 &&
        !job.awaitingOwner
      );
    },
    null,
    { timeout: 75000, polling: 50 },
  );
  const attendance = await page.evaluate(() => ({
    job: __ATLAS_CITY__.scene.debug.construction
      .debug()
      .active.find((job) => job.id === "deal-001"),
    person:
      __ATLAS_CITY__.scene.debug.people.getConstructionAttendance("deal-001"),
    owner: __ATLAS_CITY__.scene.debug.people
      .debug()
      .owners.find((person) => person.ownerId === "owner-ana"),
  }));
  expect(attendance.job.attendanceStatus).toBe("ready");
  expect(attendance.person).toMatchObject({
    ownerId: "owner-ana",
    atDestination: true,
    readyForBuild: true,
    sourceVisited: true,
  });
  expect(attendance.owner.attendingConstruction).toBe(true);
  await expect(
    page.locator('.city-owner-label[data-owner-id="owner-ana"]'),
  ).toContainText("AT");
  await screenshot("non-won-construction-with-owner");
  const beforeRepeat = await page.evaluate(() =>
    __ATLAS_CITY__.scene.debug.construction.debug(),
  );
  await page.evaluate(
    (event) => __ATLAS_CITY__.provider.dispatch(event),
    event,
  );
  expect(
    (await page.evaluate(() => __ATLAS_CITY__.scene.debug.construction.debug()))
      .count,
  ).toBe(beforeRepeat.count);
  const afterNonWin = await page.evaluate(() => __ATLAS_CITY__.metrics());
  expect(afterNonWin.wonCount).toBe(beforeNonWin.wonCount);
  expect(afterNonWin.wonAmount).toBe(beforeNonWin.wonAmount);
  await expect
    .poll(
      () =>
        page.evaluate(
          () => __ATLAS_CITY__.scene.getDiagnostics().transitionCount,
        ),
      { timeout: 30000 },
    )
    .toBe(0);
  record(
    "non-won-construction-waits-for-its-assigned-owner-without-duplicate-win",
    { event, attendance },
  );

  await district("all");
  await screenshot("whole-company");
  const all = await diagnostics();
  expect(
    await page.evaluate(
      () => __ATLAS_CITY__.scene.debug.communications.debug().enabled,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => __ATLAS_CITY__.scene.debug.industry.debug().enabled,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => __ATLAS_CITY__.scene.getDistrict())).toBe(
    "all",
  );
  record("company-overview-combines-three-semantic-districts", {
    diagnostics: all,
  });

  await page.evaluate(() => __ATLAS_CITY__.showIndustry("warehouse", "place"));
  const uiBeforeTV = await page.evaluate(() => __ATLAS_CITY__.getUiState());
  const industryBeforeTV = await industry(),
    crmBeforeTV = await crm();
  await page.locator('[data-action="tv"]').click();
  await expect(page.locator("#city-app")).toHaveClass(/c-tv-mode/);
  await settled();
  await fullCanvas();
  await expect(page.locator("#city-industry-panel")).toBeHidden();
  await expect(page.locator("#city-metrics")).toContainText("Stock disponible");
  expect(await page.locator("#city-metrics").textContent()).not.toContain("€");
  await screenshot("tv-industry");
  expect(await industry()).toEqual(industryBeforeTV);
  expect(await crm()).toEqual(crmBeforeTV);
  await page.keyboard.press("Escape");
  await expect(page.locator("#city-industry-panel")).toBeVisible();
  const uiAfterTV = await page.evaluate(() => __ATLAS_CITY__.getUiState());
  expect(uiAfterTV.district).toBe(uiBeforeTV.district);
  expect(uiAfterTV.selectedIndustryId).toBe(uiBeforeTV.selectedIndustryId);
  expect(uiAfterTV.drawer).toBe(uiBeforeTV.drawer);
  await closeDrawer();
  const beforeReplay = await crm();
  await page.locator('[data-action="replay"]').click();
  await expect(page.locator("#city-app")).toHaveAttribute(
    "data-district",
    "sales",
  );
  await expect(page.locator("#city-replay")).toBeVisible();
  await page.locator('[data-action="replay-next"]').click();
  await page.locator('.c-mode-tabs [data-action="explore"]').click();
  await expect(page.locator("#city-app")).toHaveAttribute(
    "data-district",
    "industry",
  );
  expect(await crm()).toEqual(beforeReplay);
  expect(await industry()).toEqual(industryBeforeTV);
  record("industry-tv-and-commercial-replay-restore-sector-and-data", {});

  await closeDrawer();
  await page.setViewportSize({ width: 390, height: 844 });
  await district("industry");
  await page.evaluate(() => __ATLAS_CITY__.scene.focusIndustry("warehouse"));
  await settled();
  const mobilePick = await pick("warehouse", "industry");
  await expect(page.locator("#city-industry-panel")).toBeVisible();
  await inBounds(page, "#city-industry-panel");
  await screenshot("mobile-warehouse");
  await closeDrawer();
  await page.locator('[data-action="tv"]').click();
  await settled();
  await fullCanvas();
  await inBounds(page, "#city-metrics");
  await screenshot("mobile-industry-tv");
  await page.keyboard.press("Escape");
  await district("communications");
  await page.evaluate(() => __ATLAS_CITY__.scene.focusPlace("meeting"));
  await settled();
  await pick("meeting", "place");
  await expect(page.locator("#city-communications-panel")).toBeVisible();
  await inBounds(page, "#city-communications-panel");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await screenshot("mobile-cafeteria");
  record("mobile-industrial-and-communications-picks-panels-and-tv-fit", {
    industrialPick: mobilePick,
    viewport: [390, 844],
    physicalPhone: false,
  });

  await page.evaluate(() => __ATLAS_CITY__.scene.setActive(false));
  const reduced = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  reduced.on("pageerror", (error) => errors.push(error.message));
  await boot(reduced);
  await reduced.evaluate(() =>
    __ATLAS_CITY__.changeStage("deal-001", "qualified"),
  );
  expect(
    await reduced.evaluate(
      () => __ATLAS_CITY__.scene.debug.construction.debug().count,
    ),
  ).toBe(0);
  await reduced.evaluate(() => __ATLAS_CITY__.setDistrict("industry"));
  const reducedBefore = await reduced.evaluate(
    () => __ATLAS_CITY__.scene.debug.industry.debug().vehicles,
  );
  await reduced.waitForTimeout(700);
  const reducedAfter = await reduced.evaluate(
    () => __ATLAS_CITY__.scene.debug.industry.debug().vehicles,
  );
  expect(reducedAfter.map((vehicle) => vehicle.position)).toEqual(
    reducedBefore.map((vehicle) => vehicle.position),
  );
  expect((await industrialMetrics(reduced)).totalUnits).toBe(1320);
  await screenshot("reduced-motion-industry", reduced);
  await reduced.close();
  record(
    "reduced-motion-snaps-construction-and-keeps-industrial-vehicles-still",
    {},
  );

  const fallback = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  fallback.on("pageerror", (error) => errors.push(error.message));
  await fallback.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return /^webgl|experimental-webgl/.test(kind)
        ? null
        : native.call(this, kind, ...args);
    };
  });
  await fallback.goto(base);
  await fallback.waitForFunction(() => window.__ATLAS_CITY__?.noWebGL);
  await fallback.evaluate(() => __ATLAS_CITY__.showCommunications("messages"));
  await expect(fallback.locator("#city-communications-panel")).toBeVisible();
  await expect(
    fallback.locator('#city-communications-panel [data-channel="whatsapp"]'),
  ).toHaveCount(8);
  await fallback.evaluate(() =>
    __ATLAS_CITY__.showIndustry("warehouse", "place"),
  );
  await expect(fallback.locator("#city-industry-panel")).toBeVisible();
  await expect(
    fallback.locator("#city-industry-panel .c-batch-card"),
  ).toHaveCount(3);
  await screenshot("fallback-industry-records", fallback);
  await fallback.close();
  record("new-source-panels-remain-available-without-webgl", {});

  expect(errors, "No uncaught browser JavaScript errors").toEqual([]);
  const sourceSha256 = await sourceHashes();
  await writeFile(
    `${output}/browser-validation.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        base,
        browser: browser.version(),
        gpu: "ANGLE SwiftShader",
        physicalPhone: false,
        physicalTouchDevice: false,
        rendererEndpointSample:
          "Diagnostic only; no ERP time or events advanced",
        sourceSha256,
        errors,
        results,
      },
      null,
      2,
    ),
  );
  await clearFailureArtifacts();
  console.log(`PASS ${results.length} Atlas City v3 integration groups`);
} catch (error) {
  try {
    await screenshot("failure");
  } catch {}
  await writeFile(
    `${output}/last-failure.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        error: error.message,
        errors,
        passed: results,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
