import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";

const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const output = process.env.CAPTURE_DIR || "docs/city/v4";
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
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(60000);
const errors = [],
  results = [];
page.on("pageerror", (error) => errors.push(error.message));
const record = (name, detail) => {
  results.push({ name, passed: true, detail });
  console.log(`PASS ${name}`);
};
const state = (target = page) =>
  target.evaluate(() => structuredClone(__ATLAS_CITY__.provider.getState()));
const industrial = (target = page) =>
  target.evaluate(() =>
    structuredClone(__ATLAS_CITY__.industryProvider.getState()),
  );
async function settled(target = page) {
  await target.waitForFunction(
    () => !__ATLAS_CITY__.scene.getDiagnostics().cameraMoving,
  );
}
async function boot(target = page) {
  await target.goto(base);
  await target.waitForFunction(
    () => !!window.__ATLAS_CITY__?.scene?.debug?.industry,
  );
  await target.evaluate(() => __ATLAS_CITY__.scene.debug.ready);
  await settled(target);
}
async function shot(name, target = page) {
  await target.screenshot({
    path: `${output}/captures/${name}.png`,
    fullPage: true,
    timeout: 60000,
  });
}
async function district(id, target = page) {
  await target.evaluate((id) => __ATLAS_CITY__.setDistrict(id), id);
  await settled(target);
}
async function sourceHashes() {
  const names = await readdir("src/city");
  return Object.fromEntries(
    await Promise.all(
      names
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
async function closeCelebration(target = page) {
  // Exercise its click handler atomically: waiting for two software-rendered
  // stable frames can outlast this deliberately short-lived animated card.
  await target.evaluate(() =>
    document.querySelector(".c-celebration-close")?.click(),
  );
}
async function observeLabels(target = page) {
  return target.evaluate(async () => {
    const label = document.querySelector(
      '.city-owner-label[data-owner-id="owner-ana"]',
    );
    let contentMutations = 0;
    const observer = new MutationObserver((mutations) => {
      contentMutations += mutations.filter(
        (m) => m.type === "childList" || m.type === "characterData",
      ).length;
    });
    observer.observe(label, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    const initialCounters = __ATLAS_CITY__.scene.getDiagnostics().labels;
    const frames = [];
    await new Promise((resolve) => {
      function tick(now) {
        frames.push({
          now,
          transform: label.style.transform,
          text: label.textContent,
          visible: !label.hidden,
        });
        if (frames.length >= 12) resolve();
        else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    observer.disconnect();
    return {
      frames,
      contentMutations,
      initialCounters,
      transition: getComputedStyle(label).transition,
      diagnostics: __ATLAS_CITY__.scene.getDiagnostics(),
    };
  });
}

async function verifyHandoffs() {
  const industrialCrm = await state(),
    flow = [];
  for (const stage of ["packing", "warehouse", "transit", "delivered"]) {
    const event = await page.evaluate(() => {
      if (!__ATLAS_CITY__.advanceIndustryBatch("batch-001")) return null;
      return __ATLAS_CITY__.industryProvider.getState().events.at(-1);
    });
    expect(event).toBeTruthy();
    const applied = await industrial();
    expect(
      applied.batches.find((batch) => batch.id === "batch-001").stageId,
    ).toBe(stage);
    expect(
      applied.batches.reduce((sum, batch) => sum + batch.quantity, 0),
    ).toBe(1320);
    const stageCounts = Object.fromEntries(
      ["manufacturing", "packing", "warehouse", "transit", "delivered"].map(
        (id) => [
          id,
          applied.batches
            .filter((batch) => batch.stageId === id)
            .reduce((sum, batch) => sum + batch.quantity, 0),
        ],
      ),
    );
    await page.waitForFunction(
      (counts) =>
        Object.entries(counts).every(([id, count]) =>
          document
            .querySelector(`.city-industry-label[data-place-id="${id}"]`)
            ?.textContent.endsWith(`${count} uds`),
        ),
      stageCounts,
    );
    const snapshot = await page.evaluate(() => {
      const api = __ATLAS_CITY__,
        scene = api.scene,
        district = scene.debug.industry;
      const clock = scene.getDiagnostics().tvTour.elapsed;
      scene.setActive(false);
      const job = district
        .getTransitions()
        .active.find((job) => job.batchId === "batch-001");
      if (!job)
        return { job: null, transitions: district.getTransitions(), clock };
      const before = JSON.stringify(api.industryProvider.getState());
      district.update(0, job.startedAt + job.duration * 0.5);
      scene.debug.renderer.render(scene.debug.scene, scene.debug.camera);
      return {
        job,
        mid: district
          .getTransitions()
          .active.find((job) => job.batchId === "batch-001"),
        stateUnchanged:
          before === JSON.stringify(api.industryProvider.getState()),
        clock,
      };
    });
    expect(snapshot.job, `Visual transfer for ${stage}`).toBeTruthy();
    expect(snapshot.mid.id).toBe(snapshot.job.id);
    expect(snapshot.mid.progress).toBeCloseTo(0.5, 2);
    expect(snapshot.mid.phase).toBe("transfer");
    expect(snapshot.stateUnchanged).toBe(true);
    expect(
      Math.hypot(
        ...snapshot.mid.position.map(
          (value, index) => value - snapshot.job.source[index],
        ),
      ),
    ).toBeGreaterThan(0.1);
    await shot(`industry-transfer-${stage}`);
    const finish = await page.evaluate(
      ({ clock, startedAt, duration }) => {
        const api = __ATLAS_CITY__,
          scene = api.scene,
          district = scene.debug.industry;
        const state = JSON.stringify(api.industryProvider.getState());
        district.update(0, startedAt + duration + 0.01);
        const completed = district
          .getTransitions()
          .completed.findLast((job) => job.batchId === "batch-001");
        district.update(0, clock);
        scene.setActive(true);
        return {
          completed,
          stateUnchanged:
            state === JSON.stringify(api.industryProvider.getState()),
        };
      },
      {
        clock: snapshot.clock,
        startedAt: snapshot.job.startedAt,
        duration: snapshot.job.duration,
      },
    );
    expect(finish.completed.phase).toBe("complete");
    expect(finish.stateUnchanged).toBe(true);
    expect(await industrial()).toEqual(applied);
    const transitionsBefore = await page.evaluate(() =>
      __ATLAS_CITY__.scene.debug.industry.getTransitions(),
    );
    await page.evaluate(
      (event) => __ATLAS_CITY__.industryProvider.dispatch(event),
      event,
    );
    expect(await industrial()).toEqual(applied);
    expect(
      (
        await page.evaluate(() =>
          __ATLAS_CITY__.scene.debug.industry.getTransitions(),
        )
      ).completed.length,
    ).toBe(transitionsBefore.completed.length);
    flow.push({
      stage,
      eventId: event.id,
      job: snapshot.job,
      mid: snapshot.mid,
      completed: finish.completed,
    });
    await closeCelebration();
  }
  expect(await state()).toEqual(industrialCrm);
  record(
    "four-explicit-stage-events-produce-bounded-moving-handoffs-without-changing-source-or-ids",
    flow,
  );
}

try {
  await boot();
  if (
    process.env.FINAL_TARGET_ONLY === "1" ||
    process.env.CELEBRATIONS_ONLY === "1" ||
    process.env.CELEBRATION_CAPTURES_ONLY === "1"
  ) {
    const captures = [],
      lifecycle = [];
    for (const kind of ["sale", "delivery"]) {
      await page.evaluate(() => __ATLAS_CITY__.reset());
      await district(kind === "sale" ? "sales" : "industry");
      await page.waitForFunction(() => {
        const e = __ATLAS_CITY__.scene.getDiagnostics().emphasis;
        return e.weights.every(
          (value, index) => Math.abs(value - e.target[index]) < 0.045,
        );
      });
      const before = await page.evaluate((kind) => {
        // Freeze only the background renderer before applying a genuine live
        // provider command. The actual toast and its real timer stay untouched.
        __ATLAS_CITY__.scene.setActive(false);
        const at = performance.now();
        if (kind === "sale") __ATLAS_CITY__.changeStage("deal-001", "won");
        else __ATLAS_CITY__.advanceIndustryBatch("batch-007");
        return {
          at,
          afterCommand: performance.now(),
          card: document.querySelector(".c-celebration")?.textContent,
          debug: __ATLAS_CITY__.celebrations.debug(),
        };
      }, kind);
      const cssPose = await page.evaluate(() => {
        const layer = document.querySelector(".c-celebrations");
        const animations = layer.getAnimations({ subtree: true });
        for (const animation of animations) {
          animation.pause();
          animation.currentTime = 500;
        }
        return {
          sampleMs: 500,
          animations: animations.length,
          particleElements: layer.querySelectorAll(".c-celebration-particle")
            .length,
        };
      });
      await page.evaluate(() => __ATLAS_CITY__.scene.setActive(true));
      await page.waitForFunction((kind) => {
        const api = __ATLAS_CITY__;
        if (kind === "delivery") {
          const batches = api.industryProvider.getState().batches;
          return [
            "manufacturing",
            "packing",
            "warehouse",
            "transit",
            "delivered",
          ].every((id) => {
            const count = batches
              .filter((batch) => batch.stageId === id)
              .reduce((sum, batch) => sum + batch.quantity, 0);
            return document
              .querySelector(`.city-industry-label[data-place-id="${id}"]`)
              ?.textContent.endsWith(`${count} uds`);
          });
        }
        const state = api.provider.getState();
        return [
          ...document.querySelectorAll(
            ".city-district-label[data-district-id]",
          ),
        ]
          .filter((el) => el.dataset.districtId !== "clients")
          .every((el) => {
            const count = state.deals.filter(
              (deal) => deal.stageId === el.dataset.districtId,
            ).length;
            return el.textContent.includes(
              `${count} ${count === 1 ? "deal" : "deals"}`,
            );
          });
      }, kind);
      const synchronizedLabels = await page.evaluate((kind) => {
        const api = __ATLAS_CITY__;
        api.scene.setActive(false);
        const selector =
          kind === "delivery" ? ".city-industry-label" : ".city-district-label";
        return {
          labels: [...document.querySelectorAll(selector)]
            .filter((el) => !el.hidden)
            .map((el) => ({
              id: el.dataset.placeId || el.dataset.districtId,
              text: el.textContent,
            })),
          emphasis: api.scene.getDiagnostics().emphasis,
        };
      }, kind);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const painted = await page.evaluate(() => {
        const card = document.querySelector(".c-celebration"),
          layer = card.parentElement,
          rect = card.getBoundingClientRect(),
          computed = getComputedStyle(card),
          layerComputed = getComputedStyle(layer);
        return {
          at: performance.now(),
          opacity: computed.opacity,
          display: computed.display,
          visibility: computed.visibility,
          bounds: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          layer: {
            hidden: layer.hidden,
            display: layerComputed.display,
            opacity: layerComputed.opacity,
            zIndex: layerComputed.zIndex,
          },
          animations: card.getAnimations().map((a) => ({
            time: a.currentTime,
            state: a.playState,
            start: a.startTime,
          })),
          hit: document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          )?.className,
        };
      });
      const requested = Date.now();
      await shot(`${kind}-celebration`);
      const after = await page.evaluate(() => ({
        at: performance.now(),
        card: document.querySelector(".c-celebration")?.textContent,
        debug: __ATLAS_CITY__.celebrations.debug(),
      }));
      expect(before.debug.particleCount).toBe(36);
      expect(cssPose.particleElements).toBe(36);
      expect(painted.opacity).toBe("1");
      expect(after.card).toBeTruthy();
      captures.push({
        kind,
        before,
        cssPose,
        synchronizedLabels,
        painted,
        after,
        screenshotWallMs: Date.now() - requested,
      });
      await closeCelebration();
      const closed = await page.evaluate(() =>
        __ATLAS_CITY__.celebrations.debug(),
      );
      expect(closed.size).toBe(0);
      expect(closed.timerActive).toBe(false);
      expect(closed.paintPending).toBe(false);
      lifecycle.push({ kind, closed });
      await page.evaluate(() => __ATLAS_CITY__.scene.setActive(true));
    }
    if (process.env.CELEBRATION_CAPTURES_ONLY === "1") {
      expect(errors).toEqual([]);
      const refreshedAt = new Date().toISOString();
      await writeFile(
        `${output}/celebration-pictures-validation.json`,
        JSON.stringify(
          {
            generatedAt: refreshedAt,
            browser: browser.version(),
            scope:
              "Supplementary photos: real provider command, real CSS animation paused at 500ms; one live renderer update until all labels match the provider, emphasis settled, then background paused. Existing six final targeted groups remain in final-target-validation.json.",
            sourceSha256: await sourceHashes(),
            errors,
            captures,
            results: captures.map((c) => ({
              name: `${c.kind}-photo-keeps-live-labels-consistent-with-recorded-state`,
              passed: true,
            })),
          },
          null,
          2,
        ),
      );
      const finalReport = JSON.parse(
        await readFile(`${output}/final-target-validation.json`),
      );
      finalReport.captureRefreshReport = "celebration-pictures-validation.json";
      finalReport.captureRefreshedAt = refreshedAt;
      await writeFile(
        `${output}/final-target-validation.json`,
        JSON.stringify(finalReport, null, 2),
      );
      await rm(`${output}/last-failure.json`, { force: true });
      await rm(`${output}/captures/failure.png`, { force: true });
      await browser.close();
      process.exit(0);
    }
    const pendingReset = await page.evaluate(() => {
      const api = __ATLAS_CITY__;
      api.reset();
      api.scene.setActive(false);
      api.changeStage("deal-001", "won");
      const pending = api.celebrations.debug();
      api.reset();
      return { pending, after: api.celebrations.debug() };
    });
    expect(pendingReset.pending.paintPending).toBe(true);
    expect(pendingReset.after.paintPending).toBe(false);
    expect(pendingReset.after.timerActive).toBe(false);
    expect(pendingReset.after.size).toBe(0);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const afterCancelledPaint = await page.evaluate(() =>
      __ATLAS_CITY__.celebrations.debug(),
    );
    expect(afterCancelledPaint.timerActive).toBe(false);
    expect(afterCancelledPaint.size).toBe(0);
    lifecycle.push({
      kind: "reset-before-paint",
      pendingReset,
      afterCancelledPaint,
    });
    const replayGuards = await page.evaluate(() => {
      const api = __ATLAS_CITY__;
      api.reset();
      for (let index = 0; index < 4; index++)
        if (!api.advanceIndustryBatch("batch-001"))
          throw new Error("Replay guard setup could not advance batch");
      api.showIndustry("truck-03", "vehicle");
      api.setReplay(true);
      const beforeReturn = structuredClone(api.industryProvider.getState()),
        returnButton = document.querySelector('[data-return-truck="truck-03"]');
      if (!returnButton?.isConnected)
        throw new Error("Expected retained real return control in Replay");
      const replayMode = api.getUiState().mode;
      returnButton.click();
      const afterReturn = structuredClone(api.industryProvider.getState());
      api.setReplay(false);
      document.querySelector('[data-return-truck="truck-03"]').click();
      const liveReturn = structuredClone(api.industryProvider.getState());
      api.setReplay(true);
      const beforeArrive = structuredClone(api.industryProvider.getState()),
        arriveButton = document.querySelector('[data-arrive-truck="truck-03"]');
      if (!arriveButton?.isConnected)
        throw new Error("Expected retained real arrival control in Replay");
      arriveButton.click();
      const afterArrive = structuredClone(api.industryProvider.getState());
      api.setReplay(false);
      document.querySelector('[data-arrive-truck="truck-03"]').click();
      return {
        replayMode,
        beforeReturn,
        afterReturn,
        liveReturn,
        beforeArrive,
        afterArrive,
        liveArrival: structuredClone(api.industryProvider.getState()),
      };
    });
    expect(replayGuards.replayMode).toBe("replay");
    expect(replayGuards.afterReturn).toEqual(replayGuards.beforeReturn);
    expect(replayGuards.afterArrive).toEqual(replayGuards.beforeArrive);
    expect(
      replayGuards.liveReturn.vehicles.find((v) => v.id === "truck-03").status,
    ).toBe("returning");
    expect(
      replayGuards.liveArrival.vehicles.find((v) => v.id === "truck-03"),
    ).toMatchObject({
      status: "available",
      location: "warehouse",
      cargoBatchId: null,
    });
    lifecycle.push({
      kind: "replay-keeps-truck-return-and-arrival-readonly",
      ...replayGuards,
    });
    await page.evaluate(() => __ATLAS_CITY__.reset());
    await district("all");
    await page.locator('[data-action="tv"]').click();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => __ATLAS_CITY__.scene.getDiagnostics().tvTour.step,
          ),
        { timeout: 22000 },
      )
      .toBe(1);
    const resizingFrom = await page.evaluate(() => {
      const s = __ATLAS_CITY__.scene;
      return {
        diagnostics: s.getDiagnostics(),
        source: JSON.stringify(__ATLAS_CITY__.provider.getState()),
        industry: JSON.stringify(__ATLAS_CITY__.industryProvider.getState()),
      };
    });
    expect(resizingFrom.diagnostics.cameraMoving).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    const rawAspectFrames = await page.evaluate(async () => {
      const frames = [];
      await new Promise((resolve) => {
        function tick() {
          const s = __ATLAS_CITY__.scene,
            c = s.debug.camera,
            r = s.debug.renderer.domElement.getBoundingClientRect();
          frames.push({
            aspect: (c.right - c.left) / (c.top - c.bottom),
            expected: r.width / r.height,
            finite: c.projectionMatrix.elements.every(Number.isFinite),
            cameraMoving: s.getDiagnostics().cameraMoving,
          });
          if (frames.length >= 3) resolve();
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      return frames;
    });
    // ResizeObserver runs after rAF callbacks but before paint. Wait for the
    // renderer's backing buffer to adopt the new canvas size before asserting
    // the camera's post-resize frames; innerWidth alone is not that signal.
    await page.waitForFunction(() => {
      const scene = __ATLAS_CITY__.scene,
        canvas = scene.debug.renderer.domElement,
        rect = canvas.getBoundingClientRect(),
        dpr = scene.debug.renderer.getPixelRatio();
      return (
        Math.abs(canvas.width - Math.floor(rect.width * dpr)) <= 1 &&
        Math.abs(canvas.height - Math.floor(rect.height * dpr)) <= 1
      );
    });
    const aspectFrames = await page.evaluate(async () => {
      const frames = [];
      await new Promise((resolve) => {
        function tick() {
          const s = __ATLAS_CITY__.scene,
            c = s.debug.camera,
            r = s.debug.renderer.domElement.getBoundingClientRect();
          frames.push({
            aspect: (c.right - c.left) / (c.top - c.bottom),
            expected: r.width / r.height,
            finite: c.projectionMatrix.elements.every(Number.isFinite),
            cameraMoving: s.getDiagnostics().cameraMoving,
          });
          if (frames.length >= 3) resolve();
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      return frames;
    });
    await writeFile(
      `${output}/tv-resize-diagnostic.json`,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          rawBeforeBackingBufferSignal: rawAspectFrames,
          afterBackingBufferSignal: aspectFrames,
        },
        null,
        2,
      ),
    );
    for (const frame of aspectFrames) {
      expect(Math.abs(frame.aspect - frame.expected)).toBeLessThan(1e-5);
      expect(frame.finite).toBe(true);
    }
    await settled();
    await shot("mobile-tv-resized-during-tour");
    expect(
      await page.evaluate(() =>
        JSON.stringify(__ATLAS_CITY__.provider.getState()),
      ),
    ).toBe(resizingFrom.source);
    expect(
      await page.evaluate(() =>
        JSON.stringify(__ATLAS_CITY__.industryProvider.getState()),
      ),
    ).toBe(resizingFrom.industry);
    await page.keyboard.press("Escape");
    lifecycle.push({
      kind: "tv-resize-during-flight-keeps-current-viewport-aspect",
      from: resizingFrom.diagnostics.tvTour,
      rawBeforeBackingBufferSignal: rawAspectFrames,
      frames: aspectFrames,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await boot();
    const reduced = await page.evaluate(() => {
      const api = __ATLAS_CITY__;
      api.scene.setActive(false);
      api.changeStage("deal-001", "won");
      return {
        debug: api.celebrations.debug(),
        opacity: getComputedStyle(document.querySelector(".c-celebration"))
          .opacity,
        particles: document.querySelectorAll(".c-celebration-particle").length,
      };
    });
    expect(reduced.debug.particleCount).toBe(0);
    expect(reduced.particles).toBe(0);
    expect(reduced.opacity).toBe("1");
    await shot("reduced-motion-sale-celebration");
    await closeCelebration();
    const reducedClosed = await page.evaluate(() =>
      __ATLAS_CITY__.celebrations.debug(),
    );
    expect(reducedClosed.paintPending).toBe(false);
    expect(reducedClosed.timerActive).toBe(false);
    expect(reducedClosed.size).toBe(0);
    lifecycle.push({ kind: "reduced-motion", reduced, closed: reducedClosed });
    expect(errors).toEqual([]);
    await writeFile(
      `${output}/final-target-validation.json`,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          browser: browser.version(),
          scope:
            "Real live provider closure; background scene paused and actual CSS animations sampled and paused at 500ms for evidence. DOM markup and provider event are unmodified; real auto-close timer remains active.",
          sourceSha256: await sourceHashes(),
          errors,
          captures,
          lifecycle,
          results: [
            ...captures.map((c) => ({
              name: `${c.kind}-card-visible-with-real-css-confetti-pose`,
              passed: true,
            })),
            ...lifecycle
              .filter((item) => !["sale", "delivery"].includes(item.kind))
              .map((item) => ({ name: item.kind, passed: true })),
          ],
        },
        null,
        2,
      ),
    );
    await rm(`${output}/celebration-capture-validation.json`, { force: true });
    await rm(`${output}/last-failure.json`, { force: true });
    await rm(`${output}/captures/failure.png`, { force: true });
    await browser.close();
    process.exit(0);
  }
  if (process.env.HANDOFF_ONLY === "1") {
    await district("industry");
    await verifyHandoffs();
    expect(errors).toEqual([]);
    await writeFile(
      `${output}/handoff-validation.json`,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          browser: browser.version(),
          scope:
            "Targeted handoff capture after DOM counters catch up; renderer clock sampled at 50%, provider clocks unchanged.",
          sourceSha256: await sourceHashes(),
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
  const initial = await state(),
    initialIndustry = await industrial();
  await expect(page.locator(".city-owner-label:visible")).toHaveCount(4);
  const labels = await observeLabels();
  expect(labels.contentMutations).toBe(0);
  expect(
    labels.diagnostics.labels.projectionFrames -
      labels.initialCounters.projectionFrames,
  ).toBeGreaterThanOrEqual(10);
  expect(labels.diagnostics.labels.contentBuilds).toBe(
    labels.initialCounters.contentBuilds,
  );
  expect(
    labels.frames.some((frame) => /\d+\.\d+px/.test(frame.transform)),
  ).toBe(true);
  expect(labels.frames.every((frame) => frame.text === "AT")).toBe(true);
  await shot("sales-smooth-owner-labels");
  record(
    "owner-labels-use-subpixel-poses-and-preserve-content-between-frames",
    labels,
  );

  await district("communications");
  const communications = await page.evaluate(() =>
    __ATLAS_CITY__.communicationsSummary(),
  );
  const icons = await page
    .locator(".city-place-label")
    .evaluateAll((elements) =>
      elements
        .filter((el) => !el.hidden)
        .map((el) => ({
          id: el.dataset.placeId,
          text: el.textContent,
          svg: el.querySelectorAll("svg").length,
          aria: el.getAttribute("aria-label"),
        })),
    );
  expect(icons).toHaveLength(4);
  for (const icon of icons) {
    expect(icon.svg).toBeGreaterThanOrEqual(1);
    expect(icon.text).toMatch(/\d/);
  }
  await shot("communications-icon-counts");
  record(
    "four-communications-icons-retain-recorded-completed-and-pending-counts",
    { icons, summary: communications },
  );

  const emphasis = [];
  for (const id of ["sales", "communications", "industry", "all"]) {
    await district(id);
    const d = await page.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics());
    const expected =
      id === "all"
        ? [1, 1, 1]
        : ["sales", "communications", "industry"].map((value) =>
            Number(value === id),
          );
    expect(d.emphasis.target).toEqual(expected);
    expect(d.emphasis.passes).toBe(1);
    expect(d.emphasis.materialCount).toBeGreaterThan(10);
    expect(d.emphasis.weights.every((value) => value >= 0 && value <= 1)).toBe(
      true,
    );
    emphasis.push({ district: id, ...d.emphasis });
  }
  await shot("whole-company");
  record(
    "district-focus-uses-subtle-single-pass-material-emphasis-and-restores-all",
    emphasis,
  );

  expect(await state()).toEqual(initial);
  expect(await industrial()).toEqual(initialIndustry);
  await district("industry");
  const surfaceData = await page.evaluate(() => {
    const d = __ATLAS_CITY__.scene.debug.industry.debug();
    return { surfaces: d.surfaces, groundSurfaces: d.groundSurfaces };
  });
  expect(surfaceData.surfaces.ground).toBeGreaterThan(
    surfaceData.surfaces.islandPavementTop,
  );
  expect(surfaceData.surfaces.road).toBeGreaterThan(
    surfaceData.surfaces.ground,
  );
  expect(surfaceData.surfaces.roadPaint).toBeGreaterThan(
    surfaceData.surfaces.road,
  );
  expect(surfaceData.surfaces.plot).toBeGreaterThan(
    surfaceData.surfaces.roadPaint,
  );
  expect(surfaceData.surfaces.parkingPaint).toBeGreaterThan(
    surfaceData.surfaces.plot,
  );
  expect(surfaceData.surfaces.plotAccent).toBeGreaterThan(
    surfaceData.surfaces.parkingPaint,
  );
  await shot("industry-stable-ground");
  record(
    "industrial-ground-road-markings-and-plots-use-separated-heights",
    surfaceData,
  );

  await verifyHandoffs();

  await page.evaluate(() => __ATLAS_CITY__.reset());
  await district("industry");
  const beforeProduction = await industrial();
  await page.locator("#city-production-button").click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            __ATLAS_CITY__.industryProvider
              .getState()
              .batches.find((batch) => batch.id === "batch-001").stageId,
        ),
      { timeout: 20000 },
    )
    .toBe("packing");
  await expect(page.locator("#city-production-button")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#city-production-button").click();
  await expect(page.locator("#city-production-button")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  const afterProduction = await industrial();
  expect(afterProduction.events.length).toBe(
    beforeProduction.events.length + 1,
  );
  expect(
    afterProduction.batches.reduce((sum, batch) => sum + batch.quantity, 0),
  ).toBe(1320);
  expect(await state()).toEqual(initial);
  await shot("industry-production-demo-paused");
  record(
    "explicit-production-play-and-pause-publish-one-conserved-demo-command",
    {
      beforeEvents: beforeProduction.events.length,
      afterEvents: afterProduction.events.length,
      ui: await page.evaluate(() => __ATLAS_CITY__.getUiState()),
    },
  );

  await page.evaluate(() => __ATLAS_CITY__.reset());
  await district("all");
  await page.locator('[data-action="tv"]').click();
  const initialTour = await page.evaluate(
    () => __ATLAS_CITY__.scene.getDiagnostics().tvTour,
  );
  expect(initialTour.running).toBe(true);
  expect(new Set(initialTour.sequence)).toEqual(
    new Set(["all", "sales", "communications", "industry"]),
  );
  expect(initialTour.transitionDuration).toBeGreaterThanOrEqual(6);
  expect(initialTour.holdDuration).toBeGreaterThanOrEqual(6);
  const tourSource = await state(),
    tourIndustry = await industrial();
  await shot("television-whole-company");
  await expect
    .poll(
      () =>
        page.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics().tvTour.step),
      { timeout: 22000 },
    )
    .toBe(1);
  const touring = await page.evaluate(() =>
    __ATLAS_CITY__.scene.getDiagnostics(),
  );
  expect(touring.tvTour.district).toBe("sales");
  expect(touring.cameraMoving).toBe(true);
  await page.evaluate(() => __ATLAS_CITY__.scene.zoomBy(1.01));
  const pausedTour = await page.evaluate(
    () => __ATLAS_CITY__.scene.getDiagnostics().tvTour,
  );
  expect(pausedTour.pausedFor).toBeGreaterThan(10);
  expect(await state()).toEqual(tourSource);
  expect(await industrial()).toEqual(tourIndustry);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => __ATLAS_CITY__.getUiState().district)).toBe(
    "all",
  );
  expect(
    (await page.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics())).tvTour
      .enabled,
  ).toBe(false);
  record(
    "whole-company-tv-tours-calmly-pauses-for-navigation-and-restores-without-business-events",
    {
      initialTour,
      touring: {
        district: touring.district,
        tour: touring.tvTour,
        cameraMoving: touring.cameraMoving,
      },
      pausedTour,
    },
  );

  await district("sales");
  const win = await page.evaluate(() =>
    __ATLAS_CITY__.changeStage("deal-001", "won"),
  );
  await expect(page.locator('.c-celebration[data-kind="sale"]')).toBeVisible();
  const celebration = await page.evaluate(() =>
    __ATLAS_CITY__.celebrations.debug(),
  );
  expect(celebration.particleCount).toBe(36);
  expect(celebration.rememberedClosures).toBe(1);
  await shot("sale-celebration");
  await page.evaluate((event) => __ATLAS_CITY__.provider.dispatch(event), win);
  expect(
    (await page.evaluate(() => __ATLAS_CITY__.celebrations.debug()))
      .rememberedClosures,
  ).toBe(1);
  await closeCelebration();
  await page.evaluate(() => __ATLAS_CITY__.setReplay(true));
  expect(
    (await page.evaluate(() => __ATLAS_CITY__.celebrations.debug())).size,
  ).toBe(0);
  await page.evaluate(() => __ATLAS_CITY__.setReplay(false));
  await page.evaluate(() => __ATLAS_CITY__.reset());
  expect(
    (await page.evaluate(() => __ATLAS_CITY__.celebrations.debug())).size,
  ).toBe(0);
  await district("industry");
  const delivery = await page.evaluate(() => {
    __ATLAS_CITY__.advanceIndustryBatch("batch-007");
    return __ATLAS_CITY__.industryProvider.getState().events.at(-1);
  });
  await expect(
    page.locator('.c-celebration[data-kind="delivery"]'),
  ).toBeVisible();
  const deliveryCelebration = await page.evaluate(() =>
    __ATLAS_CITY__.celebrations.debug(),
  );
  expect(deliveryCelebration.visible.entityId).toBe("batch-007");
  expect(deliveryCelebration.particleCount).toBe(36);
  await shot("delivery-celebration");
  await page.evaluate(
    (event) => __ATLAS_CITY__.industryProvider.dispatch(event),
    delivery,
  );
  expect(
    (await page.evaluate(() => __ATLAS_CITY__.celebrations.debug()))
      .rememberedClosures,
  ).toBe(1);
  record(
    "sale-and-delivery-celebrate-once-and-reset-or-replay-never-replay-popups",
    { sale: celebration, delivery: deliveryCelebration },
  );
  await closeCelebration();

  await page.setViewportSize({ width: 390, height: 844 });
  await district("communications");
  await shot("mobile-communications");
  const mobileCommunications = await page
    .locator(".city-place-label")
    .evaluateAll((elements) =>
      elements
        .filter((el) => !el.hidden)
        .map((el) => {
          const b = el.getBoundingClientRect();
          return {
            id: el.dataset.placeId,
            x: b.x,
            y: b.y,
            right: b.right,
            bottom: b.bottom,
          };
        }),
    );
  expect(mobileCommunications).toHaveLength(4);
  for (const bounds of mobileCommunications) {
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(391);
  }
  await district("industry");
  await page.locator('[data-action="tv"]').click();
  await settled();
  await shot("mobile-industrial-television");
  const mobileCanvas = await page.locator("#city-canvas canvas").boundingBox();
  expect(mobileCanvas.width).toBe(390);
  expect(mobileCanvas.height).toBe(844);
  await page.keyboard.press("Escape");
  record("mobile-icons-and-immersive-industrial-tv-fit-the-viewport", {
    communications: mobileCommunications,
    canvas: mobileCanvas,
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await boot();
  await district("industry");
  await page.evaluate(() => __ATLAS_CITY__.advanceIndustryBatch("batch-001"));
  expect(
    (
      await page.evaluate(() =>
        __ATLAS_CITY__.scene.debug.industry.getTransitions(),
      )
    ).active,
  ).toHaveLength(0);
  await district("sales");
  await page.evaluate(() => __ATLAS_CITY__.changeStage("deal-001", "won"));
  await expect(page.locator('.c-celebration[data-kind="sale"]')).toBeVisible();
  const reducedCelebration = await page.evaluate(() =>
    __ATLAS_CITY__.celebrations.debug(),
  );
  expect(reducedCelebration.particleCount).toBe(0);
  await closeCelebration();
  await district("all");
  await page.locator('[data-action="tv"]').click();
  await settled();
  expect(
    (await page.evaluate(() => __ATLAS_CITY__.scene.getDiagnostics().tvTour))
      .running,
  ).toBe(false);
  await shot("reduced-motion-company-tv");
  record(
    "reduced-motion-keeps-static-status-without-transfer-confetti-or-tv-tour",
    {
      celebration: reducedCelebration,
      tour: await page.evaluate(
        () => __ATLAS_CITY__.scene.getDiagnostics().tvTour,
      ),
    },
  );

  expect(errors).toEqual([]);
  await writeFile(
    `${output}/browser-validation.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        browser: browser.version(),
        gpu: "ANGLE SwiftShader",
        physicalPhone: false,
        sourceSha256: await sourceHashes(),
        errors,
        results,
      },
      null,
      2,
    ),
  );
  await rm(`${output}/last-failure.json`, { force: true });
  await rm(`${output}/captures/failure.png`, { force: true });
} catch (error) {
  await writeFile(
    `${output}/last-failure.json`,
    JSON.stringify(
      { error: String(error.stack || error), errors, results },
      null,
      2,
    ),
  );
  await shot("failure").catch(() => {});
  throw error;
} finally {
  await browser.close();
}
