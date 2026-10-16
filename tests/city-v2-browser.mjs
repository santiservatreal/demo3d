import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

// Real Chromium/WebGL integration. Viewports and touch are emulated; GPU is software.
const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const output = process.env.CAPTURE_DIR || "docs/city/v2";
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
const record = (name, detail) => {
  results.push({ name, passed: true, detail });
  console.log(`PASS ${name}`);
};
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(30000);
page.on("pageerror", (e) => errors.push(e.message));
async function boot(target = page) {
  await target.goto(base);
  await target.waitForFunction(
    () => !!window.__ATLAS_CITY__?.scene?.debug?.construction,
  );
  await target.evaluate(() => __ATLAS_CITY__.scene.debug.ready);
  await expect
    .poll(() =>
      target.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics().cameraMoving),
    )
    .toBe(false);
}
const snapshot = (target = page) =>
  target.evaluate(() => structuredClone(__ATLAS_CITY__.provider.getState()));
const metrics = (target = page) =>
  target.evaluate(() => structuredClone(__ATLAS_CITY__.metrics()));
const performanceRows = (target = page) =>
  target.evaluate(() => structuredClone(__ATLAS_CITY__.ownerPerformance()));
const construction = (target = page) =>
  target.evaluate(() => __ATLAS_CITY__.scene.debug.construction.debug());
const people = (target = page) =>
  target.evaluate(() => __ATLAS_CITY__.scene.debug.people.debug());
async function canvasFillsViewport(target) {
  return target.evaluate(() => {
    const b = document
      .querySelector("#city-canvas canvas")
      .getBoundingClientRect();
    return {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      viewport: [innerWidth, innerHeight],
    };
  });
}
function assertFullCanvas(b) {
  expect(Math.abs(b.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(b.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(b.width - b.viewport[0])).toBeLessThanOrEqual(1);
  expect(Math.abs(b.height - b.viewport[1])).toBeLessThanOrEqual(1);
}
async function visibleWithinViewport(target, selector) {
  const data = await target.locator(selector).evaluate((element) => {
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
  expect(data.width).toBeGreaterThan(0);
  expect(data.height).toBeGreaterThan(0);
  expect(data.x).toBeGreaterThanOrEqual(-1);
  expect(data.y).toBeGreaterThanOrEqual(-1);
  expect(data.right).toBeLessThanOrEqual(data.viewport[0] + 1);
  expect(data.bottom).toBeLessThanOrEqual(data.viewport[1] + 1);
  return data;
}
async function screenshot(name, target = page) {
  await target.screenshot({
    path: `${output}/captures/${name}.png`,
    fullPage: true,
  });
}

try {
  if (process.env.PORTRAIT_ONLY === "1") {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot();
    await page.locator('[data-action="tv"]').click();
    await expect(page.locator("#city-app")).toHaveClass(/c-tv-mode/);
    await expect
      .poll(() =>
        page.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics().cameraMoving),
      )
      .toBe(false);
    assertFullCanvas(await canvasFillsViewport(page));
    await visibleWithinViewport(page, "#city-metrics");
    await visibleWithinViewport(page, "#city-tv-team");
    const projected = await page.evaluate(() => {
      const api = __ATLAS_CITY__,
        state = api.provider.getState();
      const points = [...state.deals, ...state.accounts]
        .map((entity) => api.scene.projectEntity(entity.id))
        .filter((point) => point?.visible);
      return {
        count: points.length,
        height:
          Math.max(...points.map((point) => point.y)) -
          Math.min(...points.map((point) => point.y)),
        viewportHeight: innerHeight,
      };
    });
    expect(
      projected.height,
      "Portrait TV should use the available vertical canvas",
    ).toBeGreaterThan(projected.viewportHeight * 0.25);
    await screenshot("television-mobile");
    record("portrait-tv-city-framing-metrics-team-and-full-canvas", {
      projected,
      diagnostics: await page.evaluate(() =>
        __ATLAS_CITY__.scene.getDiagnostics(),
      ),
    });
    await page.keyboard.press("Escape");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.waitForFunction(
      () => !!window.__ATLAS_CITY__?.scene?.debug?.construction,
    );
    await page.evaluate(() => __ATLAS_CITY__.scene.debug.ready);
    await page.locator('[data-action="tv"]').click();
    await expect
      .poll(() =>
        page.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics().cameraMoving),
      )
      .toBe(false);
    assertFullCanvas(await canvasFillsViewport(page));
    await screenshot("reduced-motion-tv");
    expect(errors).toEqual([]);
    record(
      "portrait-tv-reduced-motion-keeps-complete-city-and-no-js-errors",
      {},
    );
    await writeFile(
      `${output}/portrait-validation.json`,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          browser: browser.version(),
          softwareGpu: true,
          physicalPhone: false,
          errors,
          results,
        },
        null,
        2,
      ),
    );
    await browser.close();
    process.exit(0);
  }
  await boot();
  const initial = await snapshot(),
    initialMetrics = await metrics();
  const initialRows = await performanceRows();
  expect(initialRows).toHaveLength(4);
  expect(initialRows.reduce((n, row) => n + row.wonCount, 0)).toBe(4);
  expect(initialRows.reduce((n, row) => n + row.wonAmount, 0)).toBe(30000);
  const movingBefore = await people();
  expect(movingBefore.owners).toHaveLength(4);
  expect(
    movingBefore.owners.every((owner) =>
      initial.owners.some((record) => record.id === owner.ownerId),
    ),
  ).toBeTruthy();
  await expect
    .poll(
      async () => {
        const next = await people();
        return next.owners.some((owner, index) =>
          owner.position.some(
            (value, axis) =>
              Math.abs(value - movingBefore.owners[index].position[axis]) >
              0.01,
          ),
        );
      },
      { timeout: 20000 },
    )
    .toBeTruthy();
  const movingAfter = await people();
  expect(
    movingAfter.owners.some((owner, index) =>
      owner.position.some(
        (v, axis) =>
          Math.abs(v - movingBefore.owners[index].position[axis]) > 0.01,
      ),
    ),
  ).toBeTruthy();
  expect(await metrics()).toEqual(initialMetrics);
  record("four-identified-salespeople-walk-without-mutating-crm", {
    people: movingAfter,
    ranking: initialRows,
  });

  await screenshot("city-overview");
  await page.evaluate(() => __ATLAS_CITY__.scene.focusOwner("owner-ana"));
  await expect
    .poll(() =>
      page.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics().cameraMoving),
    )
    .toBe(false);
  const ownerPoint = await page.evaluate(() =>
    __ATLAS_CITY__.scene.projectOwner("owner-ana"),
  );
  expect(ownerPoint?.visible).toBeTruthy();
  await page.mouse.click(ownerPoint.x, ownerPoint.y);
  await expect(page.locator("#city-team-panel")).toBeVisible();
  expect(
    await page.evaluate(() => __ATLAS_CITY__.getUiState().selectedOwnerId),
  ).toBe("owner-ana");
  await page.locator('[data-action="close-drawer"]').click();
  await page.evaluate(() => __ATLAS_CITY__.scene.overview());
  await expect
    .poll(() =>
      page.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics().cameraMoving),
    )
    .toBe(false);
  record("real-salesperson-geometry-opens-identified-owner", {
    id: "owner-ana",
    point: ownerPoint,
  });
  // The table and an active selection/filter are intentionally restored on exit.
  await page.evaluate(() =>
    __ATLAS_CITY__.select("deal-003", { focus: false }),
  );
  await page.locator('[data-action="view-table"]').first().click();
  await page.locator("#city-search").fill(initial.deals[2].name);
  const savedUi = await page.evaluate(() => __ATLAS_CITY__.getUiState());
  const beforeTV = await snapshot();
  await page.locator('[data-action="tv"]').click();
  await expect(page.locator("#city-app")).toHaveClass(/c-tv-mode/);
  await expect(page.locator("#city-table")).toBeHidden();
  for (const selector of [
    ".c-rail",
    ".c-header",
    ".c-heading",
    ".c-toolbar",
    ".c-search-row",
    "#city-inspector",
    "#city-stage-cards",
  ])
    await expect(page.locator(selector)).toBeHidden();
  await expect(page.locator("#city-metrics")).toBeVisible();
  await visibleWithinViewport(page, "#city-metrics");
  await expect
    .poll(() => canvasFillsViewport(page))
    .toMatchObject({ x: 0, y: 0 });
  const fullCanvas = await canvasFillsViewport(page);
  assertFullCanvas(fullCanvas);
  await page.waitForTimeout(800);
  expect(await snapshot()).toEqual(beforeTV);
  await screenshot("television-desktop");
  await page.keyboard.press("Escape");
  await expect(page.locator("#city-app")).not.toHaveClass(/c-tv-mode/);
  const restoredUi = await page.evaluate(() => __ATLAS_CITY__.getUiState());
  expect(restoredUi.view).toBe(savedUi.view);
  expect(restoredUi.selectedId).toBe(savedUi.selectedId);
  expect(restoredUi.filters).toEqual(savedUi.filters);
  expect(await snapshot()).toEqual(beforeTV);
  await expect(page.locator("#city-table")).toBeVisible();
  record("tv-full-viewport-metrics-no-navigation-and-escape-restores-state", {
    canvas: fullCanvas,
    restored: {
      view: restoredUi.view,
      selectedId: restoredUi.selectedId,
      filters: restoredUi.filters,
    },
  });

  await page.evaluate(() => {
    document.querySelector("#city-app").requestFullscreen = () =>
      Promise.reject(
        new DOMException("Fullscreen denied in this test", "NotAllowedError"),
      );
  });
  await page.locator('[data-action="tv"]').click();
  await expect(page.locator("#city-app")).toHaveClass(/c-tv-mode/);
  assertFullCanvas(await canvasFillsViewport(page));
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await page.keyboard.press("Escape");
  await page.evaluate(
    () => delete document.querySelector("#city-app").requestFullscreen,
  );
  record("tv-css-presentation-survives-native-fullscreen-refusal", {});

  await page.evaluate(() => {
    __ATLAS_CITY__.reset();
    __ATLAS_CITY__.setView("city");
    __ATLAS_CITY__.scene.setQuality("balanced");
    __ATLAS_CITY__.scene.overview();
  });
  await page.locator("#city-search").fill("");
  await expect
    .poll(() =>
      page.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics().cameraMoving),
    )
    .toBe(false);
  const districts = await page
    .locator(".city-district-label")
    .evaluateAll((elements) =>
      elements.map((e) => {
        const b = e.getBoundingClientRect(),
          css = getComputedStyle(e);
        return {
          id: e.dataset.districtId,
          text: e.textContent,
          hidden: e.hidden,
          rect: { x: b.x, y: b.y, right: b.right, bottom: b.bottom },
          fontSize: css.fontSize,
          background: css.backgroundColor,
        };
      }),
    );
  expect(districts).toHaveLength(6);
  expect(districts.filter((district) => !district.hidden)).toHaveLength(6);
  const overlaps = [];
  for (let i = 0; i < districts.length; i++)
    for (let j = i + 1; j < districts.length; j++) {
      const a = districts[i],
        b = districts[j];
      if (
        Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.x, b.rect.x) >
          1 &&
        Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.y, b.rect.y) >
          1
      )
        overlaps.push([a.id, b.id]);
    }
  await writeFile(
    `${output}/districts-last-check.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        districts,
        overlaps,
        diagnostics: await page.evaluate(() =>
          __ATLAS_CITY__.scene.getDiagnostics(),
        ),
      },
      null,
      2,
    ),
  );
  if (overlaps.length) await screenshot("district-overlap-failure");
  expect(
    overlaps,
    "District headers must not overlap each other in the overview",
  ).toEqual([]);
  record("six-readable-separated-district-headers", { districts });

  // A genuine CRM stage event drives all three visible construction phases.
  const deal = (await snapshot()).deals.find((d) => d.stageId === "lead");
  const groupUuid = await page.evaluate(
    (id) => __ATLAS_CITY__.scene.entityGroups.get(id).uuid,
    deal.id,
  );
  const event = await page.evaluate(
    (id) => __ATLAS_CITY__.changeStage(id, "negotiation"),
    deal.id,
  );
  expect(event).toBeTruthy();
  const stagesSeen = [];
  for (const phase of ["deconstruct", "transport", "build"]) {
    await page.waitForFunction(
      ({ id, phase }) =>
        __ATLAS_CITY__.scene.debug.construction
          .debug()
          .active.some((job) => job.id === id && job.phase === phase),
      { id: deal.id, phase },
      { timeout: 45000, polling: 50 },
    );
    const stage = await page.evaluate((id) => {
      const api = __ATLAS_CITY__,
        job = api.scene.debug.construction
          .debug()
          .active.find((j) => j.id === id),
        entity = api.scene.debug.architecture.entities.get(id);
      return {
        ...job,
        entityPosition: entity.group.position.toArray(),
        visible: entity.visible,
        scaleY: entity.scaleY,
        uuid: entity.group.uuid,
        visibleRigs: api.scene.debug.construction.debug().visibleRigs,
      };
    }, deal.id);
    expect(stage.uuid).toBe(groupUuid);
    expect(stage.visibleRigs).toBeGreaterThan(0);
    // An architectural group remains on a parcel; only the dedicated truck travels.
    const atFrom =
      Math.hypot(
        stage.entityPosition[0] - stage.from[0],
        stage.entityPosition[2] - stage.from[2],
      ) < 0.05;
    const atTo =
      Math.hypot(
        stage.entityPosition[0] - stage.to[0],
        stage.entityPosition[2] - stage.to[2],
      ) < 0.05;
    expect(
      atFrom || atTo,
      `Building must stay at source/destination in ${phase}`,
    ).toBeTruthy();
    stagesSeen.push(stage);
    await screenshot(`construction-${phase}`);
  }
  await expect
    .poll(async () => (await construction()).count, { timeout: 45000 })
    .toBe(0);
  const phaseMetrics = await metrics();
  expect(phaseMetrics.openAmount).toBe(initialMetrics.openAmount);
  expect(phaseMetrics.wonAmount).toBe(initialMetrics.wonAmount);
  await page.evaluate((e) => __ATLAS_CITY__.provider.dispatch(e), event);
  expect((await construction()).count).toBe(0);
  expect(await metrics()).toEqual(phaseMetrics);
  record(
    "real-deconstruction-truck-construction-stable-building-and-idempotent-event",
    { eventId: event.id, phases: stagesSeen, complete: await construction() },
  );

  const beforeWinRows = await performanceRows();
  const ownerBeforeWin = beforeWinRows.find(
    (row) => (row.ownerId || row.id) === deal.ownerId,
  );
  const wonEvent = await page.evaluate(
    (id) => __ATLAS_CITY__.changeStage(id, "won"),
    deal.id,
  );
  expect(wonEvent.type).toBe("deal.won");
  const rowsAfterWin = await performanceRows();
  const ownerAfterWin = rowsAfterWin.find(
    (row) => (row.ownerId || row.id) === deal.ownerId,
  );
  expect(ownerAfterWin.wonCount).toBe(ownerBeforeWin.wonCount + 1);
  expect(ownerAfterWin.wonAmount).toBe(ownerBeforeWin.wonAmount + deal.amount);
  expect(rowsAfterWin.reduce((n, row) => n + row.wonCount, 0)).toBe(5);
  await page.evaluate((e) => __ATLAS_CITY__.provider.dispatch(e), wonEvent);
  expect(await performanceRows()).toEqual(rowsAfterWin);
  const winningPerson = (await people()).owners.find(
    (person) => person.ownerId === deal.ownerId,
  );
  expect(winningPerson.dealId).toBe(deal.id);
  expect(["walking", "meeting", "waiting-build", "celebrating"]).toContain(
    winningPerson.phase,
  );
  await expect
    .poll(async () => (await construction()).count, { timeout: 45000 })
    .toBe(0);
  record("owner-win-ranking-and-visit-derive-once-from-real-event", {
    eventId: wonEvent.id,
    ownerBeforeWin,
    ownerAfterWin,
    person: winningPerson,
  });

  await page.locator('[data-action="team"]:visible').first().click();
  await expect(page.locator("#city-team-panel")).toBeVisible();
  await expect(page.locator("#city-team-panel")).toContainText(
    deal.ownerId === "owner-ana" ? "Ana" : ownerAfterWin.name,
  );
  await visibleWithinViewport(page, "#city-team-panel");
  await screenshot("sales-team-desktop");
  record("sales-team-panel-reflects-business-ranking", {
    owners: rowsAfterWin,
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-action="team"]:visible').first().click();
  await expect(page.locator("#city-team-panel")).toBeVisible();
  await visibleWithinViewport(page, "#city-team-panel");
  await screenshot("sales-team-mobile");
  await page.keyboard.press("Escape");
  await page.locator('[data-action="tv"]').click();
  await expect(page.locator("#city-app")).toHaveClass(/c-tv-mode/);
  assertFullCanvas(await canvasFillsViewport(page));
  await visibleWithinViewport(page, "#city-metrics");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await screenshot("television-mobile");
  await page.keyboard.press("Escape");
  record("mobile-tv-and-sales-team-inbounds", {
    viewport: [390, 844],
    physicalPhone: false,
  });

  const reduced = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  reduced.on("pageerror", (e) => errors.push(e.message));
  await boot(reduced);
  await reduced.evaluate(() =>
    __ATLAS_CITY__.changeStage("deal-001", "negotiation"),
  );
  expect((await construction(reduced)).count).toBe(0);
  const reducedBefore = await people(reduced);
  await reduced.waitForTimeout(800);
  expect((await people(reduced)).owners.map((owner) => owner.position)).toEqual(
    reducedBefore.owners.map((owner) => owner.position),
  );
  await reduced.locator('[data-action="tv"]').click();
  assertFullCanvas(await canvasFillsViewport(reduced));
  await screenshot("reduced-motion-tv", reduced);
  record("reduced-motion-skips-construction-and-walking", {
    people: reducedBefore,
    construction: await construction(reduced),
  });
  await reduced.close();
  expect(errors, "No uncaught browser JavaScript errors").toEqual([]);
  await writeFile(
    `${output}/browser-validation.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        base,
        browser: browser.version(),
        softwareGpu: "ANGLE SwiftShader",
        physicalTouchDevice: false,
        errors,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`PASS ${results.length} Atlas City v2 integration groups`);
} finally {
  await browser.close();
}
