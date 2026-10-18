import test from "node:test";
import assert from "node:assert/strict";
import {
  createCityPresentationController,
  isPresentationTarget,
} from "../src/demo/city-controller.js";
import { createDemoState } from "../src/city/model.js";
import { createIndustryState } from "../src/city/industry-model.js";

const snapshot = () => ({
  crm: createDemoState(),
  industry: createIndustryState(),
});
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup({ pending = false, onAction } = {}) {
  let data = snapshot();
  const calls = [],
    waiters = [],
    listeners = new Set();
  const view = {
    version: 1,
    district: "communications",
    target: [0, 1, -35],
    zoom: 1.3,
  };
  const succeed = (method, value) => {
    calls.push([method, value]);
    if (pending && ["focus", "overview"].includes(method))
      return new Promise((resolve) => waiters.push(resolve));
    return { ok: true, code: "completed", businessMutation: false };
  };
  const presentation = {
    captureView() {
      calls.push(["capture"]);
      return structuredClone(view);
    },
    restoreView(value) {
      return succeed("restore", value);
    },
    focusTarget(value) {
      return succeed("focus", value);
    },
    overview(value) {
      return succeed("overview", value);
    },
    highlightTarget(value) {
      return succeed("highlight", value);
    },
    playAnimation(value) {
      return succeed("animation", value);
    },
    cancel(value) {
      calls.push(["cancel", value]);
    },
    onManualNavigation(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const scene = { presentation };
  const controller = createCityPresentationController({
    getScene: () => scene,
    getSnapshot: () => data,
    onAction,
  });
  return {
    controller,
    calls,
    waiters,
    listeners,
    presentation,
    view,
    get data() {
      return data;
    },
    set data(value) {
      data = value;
    },
  };
}

test("presentation validates real IDs by record type without guessing aliases", () => {
  const source = snapshot();
  const before = JSON.stringify(source);
  for (const target of [
    { kind: "district", id: "all" },
    { kind: "sales-stage", id: "proposal" },
    { kind: "sales-stage", id: "clients" },
    { kind: "deal", id: "deal-001" },
    { kind: "account", id: "account-004" },
    { kind: "owner", id: "owner-lucia" },
    { kind: "communication", id: "meeting" },
    { kind: "industry-stage", id: "packing" },
    { kind: "batch", id: "batch-007" },
    { kind: "vehicle", id: "truck-01" },
  ])
    assert.equal(
      isPresentationTarget(target, source),
      true,
      JSON.stringify(target),
    );
  for (const target of [
    { kind: "owner", id: "Lucía" },
    { kind: "deal", id: "deal-999" },
    { kind: "owner", id: "deal-001" },
    { kind: "vehicle", id: "truck-04" },
    { kind: "district", id: "finances" },
    { kind: "anything", id: "all" },
    null,
  ])
    assert.equal(isPresentationTarget(target, source), false);
  assert.equal(JSON.stringify(source), before);
});

test("presentation requires an explicit session and captures the starting view once", async () => {
  const { controller, calls } = setup();
  assert.equal(
    (await controller.executeInternalCommand({ action: "overview" })).code,
    "session_inactive",
  );
  assert.equal(controller.startSession().code, "started");
  assert.equal(controller.startSession().code, "already_started");
  assert.equal(calls.filter(([name]) => name === "capture").length, 1);
  assert.equal(
    (
      await controller.executeInternalCommand({
        action: "overview",
        duration: 4,
      })
    ).ok,
    true,
  );
  assert.deepEqual(calls.find(([name]) => name === "overview")[1], {
    duration: 4,
  });
  controller.dispose();
});

test("presentation serializes camera movement before a queued highlight", async () => {
  const { controller, calls, waiters } = setup({ pending: true });
  controller.startSession();
  const first = controller.executeInternalCommand({
    action: "focus",
    target: { kind: "owner", id: "owner-lucia" },
    duration: 3,
  });
  const second = controller.executeInternalCommand({
    action: "highlight",
    target: { kind: "owner", id: "owner-lucia" },
  });
  assert.equal(calls.filter(([name]) => name === "focus").length, 1);
  assert.equal(
    calls.some(([name]) => name === "highlight"),
    false,
  );
  waiters.shift()({ ok: true, code: "completed" });
  assert.equal((await first).ok, true);
  assert.equal((await second).ok, true);
  assert.deepEqual(
    calls
      .filter(([name]) => ["focus", "highlight"].includes(name))
      .map(([name]) => name),
    ["focus", "highlight"],
  );
  controller.dispose();
});

test("presentation bounds outstanding operations to eight including the camera", async () => {
  const { controller } = setup({ pending: true });
  controller.startSession();
  const commands = Array.from({ length: 8 }, () =>
    controller.executeInternalCommand({ action: "overview" }),
  );
  assert.equal(
    (await controller.executeInternalCommand({ action: "overview" })).code,
    "queue_full",
  );
  assert.deepEqual(controller.getState(), {
    active: true,
    disposed: false,
    queued: 7,
    executing: true,
  });
  controller.endSession();
  assert.ok(
    (await Promise.all(commands)).every(
      (value) => value.code === "session_ended",
    ),
  );
});

test("session end resolves pending commands and restores only the captured visual view", async () => {
  const context = setup({ pending: true });
  const before = JSON.stringify(context.data);
  context.controller.startSession();
  const first = context.controller.executeInternalCommand({
    action: "focus",
    target: { kind: "vehicle", id: "truck-01" },
  });
  const next = context.controller.executeInternalCommand({
    action: "overview",
  });
  assert.equal(context.controller.endSession().ok, true);
  assert.equal((await first).code, "session_ended");
  assert.equal((await next).code, "session_ended");
  assert.deepEqual(
    context.calls.find(([name]) => name === "restore")[1],
    context.view,
  );
  assert.equal(context.listeners.size, 0);
  assert.equal(JSON.stringify(context.data), before);
  assert.equal(context.controller.endSession().code, "already_ended");
});

test("manual navigation interrupts camera and queue without rewinding the user's map", async () => {
  const { controller, calls, listeners } = setup({ pending: true });
  controller.startSession();
  const first = controller.executeInternalCommand({ action: "overview" });
  const second = controller.executeInternalCommand({ action: "overview" });
  [...listeners][0]();
  assert.equal((await first).code, "manual_navigation");
  assert.equal((await second).code, "manual_navigation");
  assert.equal(
    calls.some(([name]) => name === "restore"),
    false,
  );
  assert.equal(controller.getState().active, true);
  controller.dispose();
});

test("cancellation does not leave new commands stuck behind a stopped renderer", async () => {
  const { controller, waiters } = setup({ pending: true });
  controller.startSession();
  const first = controller.executeInternalCommand({ action: "overview" });
  controller.cancel();
  const next = controller.executeInternalCommand({ action: "overview" });
  assert.equal(waiters.length, 2);
  waiters[1]({ ok: true, code: "completed" });
  assert.equal((await first).code, "cancelled");
  assert.equal((await next).ok, true);
  controller.dispose();
});

test("queued targets are rechecked against the latest snapshot", async () => {
  const context = setup({ pending: true });
  context.controller.startSession();
  const first = context.controller.executeInternalCommand({
    action: "overview",
  });
  const next = context.controller.executeInternalCommand({
    action: "focus",
    target: { kind: "owner", id: "owner-lucia" },
  });
  context.data.crm.owners = context.data.crm.owners.filter(
    (owner) => owner.id !== "owner-lucia",
  );
  context.waiters.shift()({ ok: true, code: "completed" });
  await first;
  assert.equal((await next).code, "target_unavailable");
  assert.equal(
    context.calls.some(([name]) => name === "focus"),
    false,
  );
  context.controller.dispose();
});

test("presentation supports illustrative effects and rejects business state changes", async () => {
  const { controller, calls, data } = setup();
  const before = JSON.stringify(data);
  controller.startSession();
  assert.equal(
    (
      await controller.executeInternalCommand({
        action: "animation",
        animation: "pulse",
        target: { kind: "account", id: "account-001" },
      })
    ).ok,
    true,
  );
  assert.equal(
    (
      await controller.executeInternalCommand({
        action: "animation",
        animation: "traffic",
      })
    ).ok,
    true,
  );
  assert.equal(
    (
      await controller.executeInternalCommand({
        action: "animation",
        animation: "machinery",
      })
    ).ok,
    true,
  );
  for (const animation of [
    "construction",
    "transfer",
    "simulateWin",
    "advanceBatch",
  ])
    assert.equal(
      (
        await controller.executeInternalCommand({
          action: "animation",
          animation,
        })
      ).code,
      "unsupported_animation",
    );
  assert.equal(
    (await controller.executeInternalCommand({ action: "changeStage" })).code,
    "unsupported_action",
  );
  assert.equal(calls.filter(([name]) => name === "animation").length, 3);
  assert.equal(JSON.stringify(data), before);
  controller.dispose();
});

test("presentation rejects invalid durations and isolates action observers", async () => {
  const { controller } = setup({
    onAction() {
      throw new Error("observer failed");
    },
  });
  controller.startSession();
  for (const duration of [NaN, Infinity, -1, 0, 13, "2"])
    assert.equal(
      (
        await controller.executeInternalCommand({
          action: "overview",
          duration,
        })
      ).code,
      "invalid_duration",
    );
  assert.equal(
    (
      await controller.executeInternalCommand({
        action: "overview",
        duration: 2.8,
      })
    ).ok,
    true,
  );
  controller.dispose();
  assert.equal(
    (await controller.executeInternalCommand({ action: "overview" })).code,
    "disposed",
  );
  assert.equal(controller.startSession().code, "disposed");
});

test("presentation reports unavailable renderer and handles rejected camera operations", async () => {
  const unavailable = createCityPresentationController({
    getScene: () => null,
    getSnapshot: snapshot,
  });
  assert.equal(unavailable.startSession().code, "scene_unavailable");
  const { controller, presentation } = setup();
  controller.startSession();
  presentation.focusTarget = async () => {
    throw new Error("renderer disposed");
  };
  assert.equal(
    (
      await controller.executeInternalCommand({
        action: "focus",
        target: { kind: "deal", id: "deal-001" },
      })
    ).code,
    "presentation_failed",
  );
  controller.dispose();
  await flush();
});

test("a session closed by an action observer cannot start another camera movement", async () => {
  let controller;
  const context = setup({
    onAction(event) {
      if (event.status === "started") controller.endSession();
    },
  });
  controller = context.controller;
  controller.startSession();
  const outcome = await controller.executeInternalCommand({
    action: "overview",
  });
  assert.equal(outcome.code, "session_ended");
  assert.equal(
    context.calls.some(([name]) => name === "overview"),
    false,
  );
});
