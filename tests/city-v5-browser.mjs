import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const output = process.env.CAPTURE_DIR || "docs/city/v5";
await mkdir(`${output}/captures`, { recursive: true });
const startedAt = new Date().toISOString();
const initialSourceSha256 = await sourceHashes();
const initialHtml = await (await fetch(base)).text();
const builtAssets = await Promise.all(
  [
    ...new Set(
      [...initialHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(
        (match) => match[1],
      ),
    ),
  ].map(async (url) => {
    const response = await fetch(new URL(url, base));
    return {
      url,
      status: response.status,
      sha256: createHash("sha256")
        .update(Buffer.from(await response.arrayBuffer()))
        .digest("hex"),
    };
  }),
);
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
let currentPage = page;
page.setDefaultTimeout(90000);
const errors = [],
  results = [];
const loadedAssetPromises = [],
  loadedAssetUrls = new Set();
function observeAssets(target) {
  target.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.origin !== new URL(base).origin ||
      !/\.(js|css)$/.test(url.pathname) ||
      loadedAssetUrls.has(url.href)
    )
      return;
    loadedAssetUrls.add(url.href);
    loadedAssetPromises.push(
      response
        .body()
        .then((body) => ({
          url: url.pathname,
          status: response.status(),
          sha256: createHash("sha256").update(body).digest("hex"),
        }))
        .catch((error) => ({ url: url.pathname, error: error.message })),
    );
  });
}
observeAssets(page);
page.on("pageerror", (error) => errors.push(error.message));
function record(name, detail) {
  results.push({ name, passed: true, detail });
  console.log(`PASS ${name}`);
}
async function sourceHashes() {
  const names = (await readdir("src/city")).filter((name) =>
    /\.(js|css)$/.test(name),
  );
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        `src/city/${name}`,
        createHash("sha256")
          .update(await readFile(`src/city/${name}`))
          .digest("hex"),
      ]),
    ),
  );
}
async function frames(count = 3, target = page) {
  await target.evaluate(
    (count) =>
      new Promise((resolve) => {
        let seen = 0;
        const tick = () =>
          ++seen >= count ? resolve() : requestAnimationFrame(tick);
        requestAnimationFrame(tick);
      }),
    count,
  );
}
async function settled(target = page) {
  await target.waitForFunction(
    () => !__ATLAS_CITY__.scene.getDiagnostics().cameraMoving,
  );
  await frames(2, target);
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
    timeout: 90000,
  });
}
async function sources(target = page) {
  return target.evaluate(() => ({
    crm: JSON.stringify(__ATLAS_CITY__.provider.getState()),
    industry: JSON.stringify(__ATLAS_CITY__.industryProvider.getState()),
  }));
}
async function camera(target = page) {
  return target.evaluate(() => {
    const { camera, controls } = __ATLAS_CITY__.scene.debug;
    return {
      quaternion: camera.quaternion.toArray(),
      position: camera.position.toArray(),
      target: controls.target.toArray(),
      zoom: camera.zoom,
    };
  });
}
function expectFixed(reference, current) {
  current.quaternion.forEach((value, index) =>
    expect(Math.abs(value - reference.quaternion[index])).toBeLessThan(1e-5),
  );
}
function distance(a, b) {
  return Math.hypot(...a.map((value, index) => value - b[index]));
}
async function district(id, target = page) {
  await target.evaluate((id) => __ATLAS_CITY__.setDistrict(id), id);
  await settled(target);
}
async function summaryRail(target = page) {
  return target.evaluate(() => {
    const rail = document.querySelector("#city-map-summary"),
      world = document.querySelector("#city-world");
    const rb = rail.getBoundingClientRect(),
      cb = document.querySelector("#city-canvas").getBoundingClientRect();
    return {
      district: __ATLAS_CITY__.getUiState().district,
      insideWorld: world.contains(rail),
      text: rail.textContent,
      cards: rail.querySelectorAll("#city-stage-cards > button").length,
      rail: { x: rb.x, y: rb.y, right: rb.right, bottom: rb.bottom },
      canvas: { x: cb.x, y: cb.y, right: cb.right, bottom: cb.bottom },
    };
  });
}
function expectOutside(rail) {
  expect(rail.insideWorld).toBe(false);
  expect(rail.rail.y).toBeGreaterThanOrEqual(rail.canvas.bottom - 1);
  expect(rail.cards).toBeGreaterThanOrEqual(3);
  expect(rail.text.trim().length).toBeGreaterThan(20);
}
async function ask(question, target = page) {
  const count = await target
    .locator(".c-assistant-message.is-assistant")
    .count();
  await target.evaluate(() => {
    const expand = document.querySelector("[data-assistant-action='expand']");
    if (expand?.getAttribute("aria-expanded") !== "true") expand?.click();
  });
  await target.locator("#city-assistant-input").fill(question);
  await target.locator("#city-assistant-input").press("Enter");
  await expect(target.locator(".c-assistant-message.is-assistant")).toHaveCount(
    count + 1,
  );
  return target.locator(".c-assistant-message.is-assistant").last().innerText();
}
async function drag(button, dx, dy) {
  const box = await page.locator("#city-canvas").boundingBox();
  const x = box.x + box.width * 0.5,
    y = box.y + box.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down({ button });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up({ button });
  await frames(4);
}
async function exposedIndustryPick(id) {
  const point = await page.evaluate((id) => {
    const scene = __ATLAS_CITY__.scene;
    const center = scene.projectIndustry(id);
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
        hit.kind === "industry" &&
        document.elementFromPoint(x, y) === scene.debug.renderer.domElement
      )
        return { x, y, hit };
    }
    return null;
  }, id);
  expect(point, `Exposed industrial mesh ${id}`).toBeTruthy();
  await page.mouse.click(point.x, point.y);
  return point;
}

try {
  await boot();
  const initialSources = await sources(),
    fixed = await camera();
  if (process.env.FINAL_TARGET_ONLY !== "1") {
    const navigation = [];
    for (const [button, dx, dy] of [
      ["left", 90, 35],
      ["right", -65, -28],
    ]) {
      const before = await camera();
      await drag(button, dx, dy);
      const after = await camera();
      expectFixed(fixed, after);
      expect(distance(before.target, after.target)).toBeGreaterThan(0.01);
      navigation.push({ button, before, after });
    }
    const beforeZoom = await camera();
    await page.locator('[data-action="zoom-in"]').click();
    await settled();
    const afterZoomIn = await camera();
    expect(afterZoomIn.zoom).toBeGreaterThan(beforeZoom.zoom);
    expectFixed(fixed, afterZoomIn);
    await page.locator('[data-action="zoom-out"]').click();
    await settled();
    const afterZoomOut = await camera();
    expect(afterZoomOut.zoom).toBeLessThan(afterZoomIn.zoom);
    expectFixed(fixed, afterZoomOut);
    const directional = [];
    for (const action of ["pan-up", "pan-down"]) {
      const before = await camera();
      await page.locator(`[data-action="${action}"]`).click();
      await frames(3);
      const after = await camera();
      expectFixed(fixed, after);
      expect(distance(before.target, after.target)).toBeGreaterThan(0.01);
      directional.push({ action, before, after });
    }
    expect(await sources()).toEqual(initialSources);
    record(
      "fixed-bearing-mouse-pan-and-zoom-preserve-perspective-without-writing-crm",
      { fixed, navigation, beforeZoom, afterZoomIn, afterZoomOut, directional },
    );

    await page.evaluate(() => __ATLAS_CITY__.scene.overview());
    await settled();
    const labelPresentation = await page.evaluate(() => {
      const canvas = document
        .querySelector("#city-canvas")
        .getBoundingClientRect();
      const badges = [...document.querySelectorAll(".city-owner-label")]
        .filter((el) => !el.hidden)
        .map((el) => {
          const box = el.getBoundingClientRect();
          return {
            ownerId: el.dataset.ownerId,
            text: el.textContent,
            anchorMode: el.dataset.anchorMode,
            children: el.children.length,
            left: box.left - canvas.left,
            top: box.top - canvas.top,
            width: box.width,
            height: box.height,
            personX: Number(el.dataset.personX),
            personY: Number(el.dataset.personY),
            avatarHalfWidth: Number(el.dataset.avatarHalfWidth),
          };
        });
      return {
        diagnostics: __ATLAS_CITY__.scene.getDiagnostics().labels,
        badges,
        largeLabels: document.querySelectorAll(
          ".city-district-label,.city-place-label,.city-industry-label,.city-entity-label,.city-alert-label,.city-sector-label",
        ).length,
      };
    });
    expect(labelPresentation.largeLabels).toBe(0);
    expect(labelPresentation.diagnostics.presentation).toBe(
      "owner-initials-only",
    );
    expect(labelPresentation.diagnostics.summaries).toBe("outside-canvas");
    expect(labelPresentation.badges.length).toBeGreaterThanOrEqual(2);
    for (const badge of labelPresentation.badges) {
      expect(badge.text).toMatch(/^[A-Z]{2}$/);
      expect(badge.anchorMode).toBe("behind-ground");
      expect(badge.children).toBe(0);
      expect(badge.left).toBeGreaterThanOrEqual(
        badge.personX + badge.avatarHalfWidth + 3,
      );
    }
    const rails = [];
    for (const id of ["sales", "communications", "industry", "all"]) {
      await district(id);
      const rail = await summaryRail();
      expectOutside(rail);
      expectFixed(fixed, await camera());
      rails.push(rail);
    }
    await district("sales");
    await shot("fixed-map-clear-avatars");
    record(
      "large-building-labels-removed-and-initials-clear-the-walking-avatar",
      { ...labelPresentation, rails },
    );

    const beforeQuestions = await sources();
    const invoiceAnswer = await ask("¿Cuál es la facturación total?");
    expect(invoiceAnswer).toMatch(/factur|cobr/i);
    expect(invoiceAnswer).toMatch(
      /no (?:dispongo|hay|tengo)|no est[aá].*disponible|sin factur/i,
    );
    expect(invoiceAnswer.replace(/[\s.]/g, "")).toContain("30000");
    expect(invoiceAnswer).toMatch(/ganad/i);
    const winAnswer = await ask("¿Cuántas ventas ganadas hay?");
    expect(winAnswer).toMatch(/4|cuatro/i);
    const beforeLucia = await camera();
    const luciaAnswer = await ask("¿Dónde está Lucía?");
    await settled();
    const luciaCamera = await camera();
    const luciaUi = await page.evaluate(() => __ATLAS_CITY__.getUiState());
    expect(luciaAnswer).toMatch(/Lucía Ferrer/);
    expect(luciaAnswer).toMatch(/ilustrativ|simulad|GPS/i);
    expect(luciaUi.selectedOwnerId).toBe("owner-lucia");
    expect(luciaUi.district).toBe("sales");
    expect(distance(beforeLucia.target, luciaCamera.target)).toBeGreaterThan(
      0.01,
    );
    expectFixed(fixed, luciaCamera);
    expect(await sources()).toEqual(beforeQuestions);
    await shot("assistant-lucia-and-grounded-answers");
    record(
      "chat-reads-current-crm-distinguishes-invoices-and-focuses-lucia-without-writes",
      {
        invoiceAnswer,
        winAnswer,
        luciaAnswer,
        luciaUi,
        beforeLucia,
        luciaCamera,
      },
    );

    const unsafeQuestion =
      '<img src=x onerror="window.__assistantInjection=1">';
    await ask(unsafeQuestion);
    const safety = await page.evaluate(() => ({
      executed: !!window.__assistantInjection,
      executableElements: document.querySelectorAll(
        "#city-assistant-messages img,#city-assistant-messages script,#city-assistant-messages iframe",
      ).length,
      userText:
        document.querySelector(".c-assistant-message.is-user:last-of-type")
          ?.textContent ||
        [...document.querySelectorAll(".c-assistant-message.is-user")].at(-1)
          ?.textContent,
      debug: __ATLAS_CITY__.assistant.debug(),
    }));
    expect(safety.executed).toBe(false);
    expect(safety.executableElements).toBe(0);
    expect(safety.userText).toContain(unsafeQuestion);
    expect(await sources()).toEqual(beforeQuestions);
    record(
      "chat-renders-untrusted-text-as-text-and-keeps-crm-read-only",
      safety,
    );

    await page.evaluate(() => __ATLAS_CITY__.assistant.reset());
    await page.waitForFunction(
      () => !!__ATLAS_CITY__.assistant.debug().visibleTip,
      null,
      { timeout: 25000 },
    );
    const recommendation = await page.evaluate(() => {
      const debug = __ATLAS_CITY__.assistant.debug(),
        state = __ATLAS_CITY__.provider.getState();
      const tip = debug.visibleTip,
        deal = state.deals.find((deal) => deal.id === tip.action?.id);
      const pending = state.activities.filter(
        (activity) =>
          activity.dealId === deal?.id &&
          activity.status === "pending" &&
          Date.parse(activity.dueAt) < Date.parse(state.now),
      );
      return {
        tip,
        dealId: deal?.id,
        now: state.now,
        pending: pending.map(({ id, dueAt }) => ({ id, dueAt })),
        visibleText: document.querySelector("#city-assistant-tip").textContent,
      };
    });
    expect(recommendation.tip.id).toMatch(/^overdue:/);
    expect(recommendation.pending.length).toBeGreaterThan(0);
    expect(recommendation.tip.sourceLabel).toMatch(/CRM simulado/);
    expect(recommendation.visibleText).toContain(recommendation.tip.title);
    await shot("crm-recommendation");
    await page.evaluate(() =>
      document.querySelector('[data-assistant-action="tip-view"]').click(),
    );
    await settled();
    expect(
      await page.evaluate(() => __ATLAS_CITY__.getUiState().selectedId),
    ).toBe(recommendation.dealId);
    expectFixed(fixed, await camera());
    await page.evaluate(() =>
      document.querySelector('[data-assistant-action="tip-dismiss"]').click(),
    );
    const dismissed = await page.evaluate(() =>
      __ATLAS_CITY__.assistant.debug(),
    );
    expect(dismissed.dismissed).toContain(recommendation.tip.id);
    expect(dismissed.visibleTip).toBeNull();
    await page.evaluate(() =>
      document.querySelector('[data-assistant-action="tips-mute"]').click(),
    );
    const muted = await page.evaluate(() => __ATLAS_CITY__.assistant.debug());
    expect(muted.muted).toBe(true);
    expect(muted.timerActive).toBe(false);
    await expect(page.locator("#city-assistant-tip")).toBeHidden();
    expect(await sources()).toEqual(beforeQuestions);
    await page.evaluate(() =>
      document.querySelector('[data-assistant-action="tips-resume"]').click(),
    );
    record(
      "recommendations-use-recorded-due-tasks-and-support-view-dismiss-and-mute",
      { recommendation, dismissed, muted },
    );

    await district("all");
    const beforeTv = await sources();
    await page.locator('[data-action="tv"]').click();
    const enteredTv = await page.evaluate(() => ({
      assistant: __ATLAS_CITY__.assistant.debug(),
      scene: __ATLAS_CITY__.scene.getDiagnostics(),
    }));
    expect(enteredTv.assistant.hidden).toBe(true);
    expect(enteredTv.assistant.timerActive).toBe(false);
    expect(enteredTv.scene.tvTour.running).toBe(true);
    await expect(page.locator(".c-assistant")).toBeHidden();
    await expect(page.locator("#city-map-summary")).toBeHidden();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => __ATLAS_CITY__.scene.getDiagnostics().tvTour.step,
          ),
        { timeout: 40000 },
      )
      .toBeGreaterThanOrEqual(1);
    const tourFrames = await page.evaluate(async () => {
      const result = [];
      await new Promise((resolve) => {
        const tick = () => {
          const scene = __ATLAS_CITY__.scene;
          result.push({
            quaternion: scene.debug.camera.quaternion.toArray(),
            moving: scene.getDiagnostics().cameraMoving,
            tour: scene.getDiagnostics().tvTour,
          });
          if (result.length >= 3) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return result;
    });
    for (const frame of tourFrames) expectFixed(fixed, frame);
    await shot("fixed-bearing-television");
    await page.keyboard.press("Escape");
    await settled();
    expect(await page.evaluate(() => __ATLAS_CITY__.getUiState().mode)).toBe(
      "explore",
    );
    expect(
      await page.evaluate(() => __ATLAS_CITY__.assistant.debug().hidden),
    ).toBe(false);
    await page.evaluate(() => __ATLAS_CITY__.setReplay(true));
    const replay = await page.evaluate(() => ({
      assistant: __ATLAS_CITY__.assistant.debug(),
      source: JSON.stringify(__ATLAS_CITY__.provider.getState()),
      rejectedAsk: __ATLAS_CITY__.assistant.ask("Dónde está Lucía"),
    }));
    expect(replay.assistant.hidden).toBe(true);
    expect(replay.assistant.timerActive).toBe(false);
    expect(replay.rejectedAsk).toBeNull();
    await page.evaluate(() => __ATLAS_CITY__.setReplay(false));
    expect(await sources()).toEqual(beforeTv);
    record("tv-tour-keeps-fixed-bearing-and-hides-assistant-in-tv-and-replay", {
      enteredTv,
      tourFrames,
      replay,
    });

    await district("industry");
    const selected = await exposedIndustryPick("manufacturing");
    await expect(page.locator("#city-industry-panel")).toBeVisible();
    expect(
      await page.evaluate(() => __ATLAS_CITY__.getUiState().selectedIndustryId),
    ).toBe("manufacturing");
    await page.evaluate(() =>
      document.querySelector('[data-action="close-drawer"]')?.click(),
    );
    await settled();
    const handoff = await page.evaluate(() => {
      const api = __ATLAS_CITY__,
        scene = api.scene;
      const accepted = api.advanceIndustryBatch("batch-001");
      const source = JSON.stringify(api.industryProvider.getState());
      scene.setActive(false);
      const job = scene.debug.industry
        .getTransitions()
        .active.find((job) => job.batchId === "batch-001");
      if (!job) return { accepted, job, state: JSON.parse(source) };
      scene.debug.industry.update(0, job.startedAt + job.duration * 0.5);
      scene.debug.renderer.render(scene.debug.scene, scene.debug.camera);
      return {
        accepted,
        job,
        mid: scene.debug.industry
          .getTransitions()
          .active.find((item) => item.id === job.id),
        unchanged: source === JSON.stringify(api.industryProvider.getState()),
        state: JSON.parse(source),
      };
    });
    expect(handoff.accepted).toBe(true);
    expect(handoff.job).toBeTruthy();
    expect(handoff.mid.progress).toBeCloseTo(0.5, 2);
    expect(handoff.mid.phase).toBe("transfer");
    expect(handoff.unchanged).toBe(true);
    expect(
      handoff.state.batches.reduce((total, batch) => total + batch.quantity, 0),
    ).toBe(1320);
    expect(
      handoff.state.batches.find((batch) => batch.id === "batch-001").stageId,
    ).toBe("packing");
    expectFixed(fixed, await camera());
    await shot("fixed-industry-transfer");
    await page.evaluate(() => __ATLAS_CITY__.scene.setActive(true));
    record(
      "fixed-map-retains-industrial-mesh-selection-and-conserved-visual-transfer",
      { selected, handoff },
    );
  } else {
    const finalRails = [];
    for (const id of ["sales", "communications", "industry", "all"]) {
      await district(id);
      const rail = await summaryRail();
      expectOutside(rail);
      expectFixed(fixed, await camera());
      finalRails.push(rail);
      await shot(`final-${id}-fixed-map`);
    }
    const before = await sources();
    const answer = await ask("Dónde está Lucía");
    await settled();
    expect(answer).toContain("Lucía Ferrer");
    expectFixed(fixed, await camera());
    const composer = await page.locator("#city-assistant-form").boundingBox();
    expect(composer.y).toBeGreaterThanOrEqual(0);
    expect(composer.y + composer.height).toBeLessThanOrEqual(1001);
    expect(await sources()).toEqual(before);
    await shot("final-assistant-composer-visible");
    record(
      "final-layout-keeps-summary-outside-four-fixed-views-and-reveals-chat-composer",
      { rails: finalRails, answer, composer },
    );
  }

  // Close the desktop renderer before starting another WebGL context. This
  // software-GPU environment runs all browser checks in series.
  await page.close();
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await mobileContext.newPage();
  currentPage = mobile;
  observeAssets(mobile);
  mobile.setDefaultTimeout(90000);
  mobile.on("pageerror", (error) => errors.push(error.message));
  await boot(mobile);
  const mobileSource = await sources(mobile),
    mobileFixed = await camera(mobile);
  expectFixed(fixed, mobileFixed);
  const bounds = await mobile.locator("#city-canvas").boundingBox();
  await mobile.evaluate(() => {
    window.__touchEvents = [];
    for (const type of [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
    ])
      document.addEventListener(
        type,
        (event) =>
          window.__touchEvents.push({
            type,
            pointerType: event.pointerType,
            pointerId: event.pointerId,
            trusted: event.isTrusted,
            x: event.clientX,
            y: event.clientY,
            target: event.target.tagName,
          }),
        { capture: true },
      );
  });
  const touch = await mobileContext.newCDPSession(mobile);
  const touchPoint = (id, x, y) => ({
    id,
    x: bounds.x + bounds.width * x,
    y: bounds.y + bounds.height * y,
    radiusX: 4,
    radiusY: 4,
    force: 1,
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchPoint(1, 0.5, 0.3)],
  });
  await frames(1, mobile);
  for (let step = 1; step <= 4; step++) {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [touchPoint(1, 0.5 + 0.045 * step, 0.3 + 0.025 * step)],
    });
    await frames(1, mobile);
  }
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await frames(4, mobile);
  const afterTouchPan = await camera(mobile);
  const touchDiagnostic = await mobile.evaluate(() => ({
    events: window.__touchEvents,
    controls: {
      enabled: __ATLAS_CITY__.scene.debug.controls.enabled,
      enablePan: __ATLAS_CITY__.scene.debug.controls.enablePan,
      touches: __ATLAS_CITY__.scene.debug.controls.touches,
    },
    viewport: {
      width: innerWidth,
      height: innerHeight,
      scale: visualViewport.scale,
    },
    scrollTop: document.querySelector(".c-main").scrollTop,
  }));
  await writeFile(
    `${output}/mobile-gesture-diagnostic.json`,
    JSON.stringify(
      { bounds, before: mobileFixed, after: afterTouchPan, ...touchDiagnostic },
      null,
      2,
    ),
  );
  expectFixed(mobileFixed, afterTouchPan);
  expect(distance(mobileFixed.target, afterTouchPan.target)).toBeGreaterThan(
    0.01,
  );
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchPoint(0, 0.4, 0.48), touchPoint(1, 0.6, 0.52)],
  });
  await frames(1, mobile);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [touchPoint(0, 0.25, 0.38), touchPoint(1, 0.75, 0.62)],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await frames(4, mobile);
  const afterPinch = await camera(mobile);
  expectFixed(mobileFixed, afterPinch);
  expect(afterPinch.zoom).toBeGreaterThan(afterTouchPan.zoom);
  expect(await sources(mobile)).toEqual(mobileSource);
  const mobileAnswer = await ask("Dónde está Lucía", mobile);
  await settled(mobile);
  expect(mobileAnswer).toContain("Lucía Ferrer");
  expectFixed(mobileFixed, await camera(mobile));
  await mobile.locator(".c-assistant").scrollIntoViewIfNeeded();
  const mobileRail = await summaryRail(mobile);
  expectOutside(mobileRail);
  const responsive = await mobile.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return {
        x: box.x,
        y: box.y,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    return {
      documentWidth: document.documentElement.scrollWidth,
      mainScrollWidth: document.querySelector(".c-main").scrollWidth,
      mainClientWidth: document.querySelector(".c-main").clientWidth,
      viewport: innerWidth,
      assistant: rect(".c-assistant"),
      input: rect("#city-assistant-input"),
      canvas: rect("#city-canvas"),
      ui: __ATLAS_CITY__.getUiState(),
    };
  });
  expect(responsive.documentWidth).toBeLessThanOrEqual(390);
  expect(responsive.mainScrollWidth).toBeLessThanOrEqual(
    responsive.mainClientWidth + 1,
  );
  expect(responsive.assistant.x).toBeGreaterThanOrEqual(0);
  expect(responsive.assistant.right).toBeLessThanOrEqual(390);
  expect(responsive.assistant.bottom).toBeLessThanOrEqual(845);
  expect(responsive.canvas.height).toBeGreaterThanOrEqual(150);
  expect(responsive.ui.selectedOwnerId).toBe("owner-lucia");
  expect(await sources(mobile)).toEqual(mobileSource);
  await shot("mobile-fixed-map-and-assistant", mobile);
  record(
    "mobile-one-finger-pan-and-two-finger-pinch-retain-bearing-and-chat-fits-390px",
    {
      mobileFixed,
      afterTouchPan,
      afterPinch,
      mobileAnswer,
      responsive,
      mobileRail,
    },
  );

  expect(errors).toEqual([]);
  await writeFile(
    `${output}/${process.env.FINAL_TARGET_ONLY === "1" ? "final-target-validation" : "browser-validation"}.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        startedAt,
        browser: browser.version(),
        builtAssets,
        loadedAssets: await Promise.all(loadedAssetPromises),
        sourceSha256: initialSourceSha256,
        workingTreeSourceSha256AtCompletion: await sourceHashes(),
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
  await shot("failure", currentPage).catch(() => {});
  await writeFile(
    `${output}/last-failure.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        startedAt,
        builtAssets,
        loadedAssets: await Promise.all(loadedAssetPromises),
        error: error.stack,
        errors,
        results,
        sourceSha256: initialSourceSha256,
        workingTreeSourceSha256AtCompletion: await sourceHashes(),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
