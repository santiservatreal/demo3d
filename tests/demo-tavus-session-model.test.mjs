import test from "node:test";
import assert from "node:assert/strict";
import {
  createTavusDemoSession,
  TAVUS_DEMO_GREETING,
} from "../src/demo/tavus-session.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

class Widget extends EventTarget {
  attributes = new Map();
  calls = { start: 0, close: 0, destroy: 0, remove: 0 };
  messages = [];
  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
  getAttribute(name) {
    return this.attributes.get(name);
  }
  close() {
    this.calls.close++;
  }
  destroy() {
    this.calls.destroy++;
  }
  remove() {
    this.calls.remove++;
  }
  sendMessage(message) {
    this.messages.push(message);
  }
  emit(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(`tavus:${name}`, { detail }));
  }
  ready() {
    this.startConversation = () => {
      this.calls.start++;
      return Promise.resolve();
    };
    this.emit("ready", { deploymentId: this.getAttribute("deployment-id") });
  }
}

function setup(options = {}) {
  const widgets = [];
  const states = [];
  const sceneCalls = { start: 0, end: 0 };
  const container = {
    appendChild(child) {
      options.onAppend?.(child);
    },
  };
  const session = createTavusDemoSession({
    container,
    deploymentId: "real-configured-id",
    context: { simulated: true, entities: [{ id: "deal-001" }] },
    controller: {
      startSession() {
        sceneCalls.start++;
      },
      endSession() {
        sceneCalls.end++;
      },
    },
    onState(value) {
      states.push(value);
    },
    createWidget() {
      const widget = new Widget();
      widgets.push(widget);
      return widget;
    },
    ...options,
  });
  const live = () => {
    assert.equal(session.start(), true);
    const widget = widgets.at(-1);
    widget.ready();
    widget.emit("conversation-started", {
      conversationId: "conversation-real-1",
    });
    return widget;
  };
  return { session, widgets, states, sceneCalls, live };
}

test("import/setup never mounts a widget, creates a room, or requests media before Start", () => {
  const { session, widgets, states, sceneCalls } = setup();
  assert.equal(widgets.length, 0);
  assert.equal(states.length, 0);
  assert.equal(sceneCalls.start, 0);
  assert.equal(session.getWidget(), null);
  assert.deepEqual(session.getState(), {
    status: "idle",
    conversationId: null,
    speech: null,
    microphone: "not-requested",
    error: null,
    disposed: false,
  });
  assert.equal(session.interrupt(), false);
  assert.equal(session.respond("Hola"), false);
  session.dispose();
});

test("missing ID fails clearly before creating widget or capturing the scene", () => {
  const { session, widgets, sceneCalls } = setup({ deploymentId: "" });
  assert.equal(session.start(), false);
  assert.equal(session.getState().status, "error");
  assert.equal(session.getState().error.code, "DEPLOYMENT_ID_MISSING");
  assert.equal(session.getState().microphone, "not-requested");
  assert.equal(widgets.length, 0);
  assert.deepEqual(sceneCalls, { start: 0, end: 0 });
  session.dispose();
});

test("an unavailable scene prevents creating a paid conversation or requesting media", () => {
  let restores = 0;
  const { session, widgets } = setup({
    controller: {
      startSession() {
        return { ok: false, code: "scene_unavailable" };
      },
      endSession() {
        restores++;
      },
    },
  });
  assert.equal(session.start(), false);
  assert.equal(widgets.length, 0);
  assert.equal(session.getState().error.code, "SCENE_UNAVAILABLE");
  assert.equal(session.getState().microphone, "not-requested");
  assert.equal(restores, 1);
  session.dispose();
});

test("Start configures Spanish greeting and fictitious context before mounting, then waits for ready", async () => {
  let mountedAttributes;
  const { session, widgets, sceneCalls } = setup({
    onAppend(widget) {
      mountedAttributes = new Map(widget.attributes);
    },
  });
  assert.equal(session.start(), true);
  assert.equal(session.start(), false);
  const widget = widgets[0];
  assert.equal(widget.calls.start, 0);
  assert.equal(session.getState().status, "initializing");
  assert.equal(mountedAttributes.get("custom-greeting"), TAVUS_DEMO_GREETING);
  assert.equal(mountedAttributes.get("camera-on-start"), "off");
  const context = mountedAttributes.get("conversational-context");
  assert.match(context, /datos.*ficticios/i);
  assert.match(context, /espera la respuesta/i);
  assert.match(context, /comercial o industrial/i);
  assert.match(context, /no modifiques datos del CRM/i);
  assert.match(context, /deal-001/);
  widget.ready();
  await tick();
  assert.equal(widget.calls.start, 1);
  assert.equal(session.getState().status, "connecting");
  assert.equal(session.getState().microphone, "requested");
  // A fulfilled start promise and even this SDK state cannot fake a live call.
  widget.emit("state-change", { state: "connected" });
  assert.equal(session.getState().status, "connecting");
  widget.emit("conversation-started", {
    conversationId: "real/conversation:id",
  });
  assert.equal(session.getState().status, "connected");
  assert.equal(session.getState().conversationId, "real/conversation:id");
  assert.equal(session.getState().microphone, "unknown");
  assert.deepEqual(sceneCalls, { start: 1, end: 0 });
  session.stop();
});

test("an already-ready element starts once without polling or creating a prepared room", () => {
  const { session, widgets } = setup({
    onAppend(widget) {
      widget.createConversation = () => {
        throw new Error("must never prepare a room");
      };
      widget.ready();
    },
  });
  assert.equal(session.start(), true);
  assert.equal(widgets[0].calls.start, 1);
  widgets[0].emit("ready", { deploymentId: "real-configured-id" });
  assert.equal(widgets[0].calls.start, 1);
  session.stop();
});

test("tool calls are serialized, deduplicated and never executed from protocol copies", async () => {
  const pending = deferred();
  const calls = [];
  const { session, live } = setup({
    toolBridge: {
      async handle(payload) {
        calls.push(payload);
        if (calls.length === 1) await pending.promise;
        return {
          ok: true,
          code: "VISUALIZED",
          message: "Vista aplicada.",
          businessMutation: false,
        };
      },
    },
  });
  const widget = live();
  const first = {
    name: "highlight_building",
    arguments: '{"id":"deal-001"}',
    tool_call_id: "call:real.1",
    seq: 1,
  };
  const second = {
    name: "trigger_3d_camera_movement",
    arguments: "{}",
    tool_call_id: "call-real-2",
    seq: 2,
  };
  widget.emit("tool-call", first);
  widget.emit("tool-call", first);
  widget.emit("protocol-message", {
    kind: "tool_call",
    event_type: "conversation.tool_call",
    properties: second,
  });
  widget.emit("tool-call", second);
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(widget.messages.length, 0);
  pending.resolve();
  await tick();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls, [first, second]);
  assert.equal(widget.messages.length, 2);
  assert.deepEqual(
    widget.messages.map((message) => message.properties.tool_call_id),
    ["call:real.1", "call-real-2"],
  );
  assert.ok(
    widget.messages.every(
      (message) =>
        message.event_type === "conversation.tool_result" &&
        message.properties.status === "success",
    ),
  );
  session.stop();
});

test("tool calls without an ID execute once with sequence/content fallback and never fabricate a response ID", async () => {
  const calls = [];
  const { session, live } = setup({
    toolBridge: {
      async handle(payload) {
        calls.push(payload);
        return { ok: true, code: "OK", message: "Hecho." };
      },
    },
  });
  const widget = live();
  const bySequence = {
    name: "highlight_building",
    arguments: "{}",
    seq: 1,
    turn_idx: 2,
  };
  const byContent = {
    name: "highlight_building",
    arguments: '{"id":"deal-001"}',
  };
  for (const payload of [bySequence, bySequence, byContent, byContent])
    widget.emit("tool-call", payload);
  await tick();
  assert.equal(calls.length, 2);
  assert.equal(widget.messages.length, 0);
  session.stop();
});

test("uncorrelated identical requests coalesce briefly and can be repeated later intentionally", async () => {
  let timestamp = 1000;
  let calls = 0;
  const { session, live } = setup({
    now: () => timestamp,
    toolBridge: {
      async handle() {
        calls++;
        return { ok: true, code: "OK", message: "Hecho." };
      },
    },
  });
  const widget = live();
  const payload = { name: "trigger_3d_camera_movement", arguments: "{}" };
  widget.emit("tool-call", payload);
  timestamp += 499;
  widget.emit("tool-call", payload);
  await tick();
  assert.equal(calls, 1);
  timestamp += 1;
  widget.emit("tool-call", payload);
  await tick();
  assert.equal(calls, 2);
  assert.equal(widget.messages.length, 0);
  session.stop();
});

test("the official inline embed is ended before destruction when no close method exists", () => {
  const order = [];
  const { session, live, sceneCalls } = setup({
    onAppend(widget) {
      widget.close = undefined;
      widget.endConversation = () => {
        order.push("end");
        return Promise.resolve();
      };
      widget.destroy = () => {
        order.push("destroy");
      };
    },
  });
  live();
  session.stop();
  session.stop();
  assert.deepEqual(order, ["end", "destroy"]);
  assert.equal(sceneCalls.end, 1);
});

test("missing real tool contracts, malformed calls and bridge errors return errors with the real call ID", async () => {
  const { session, live } = setup();
  const widget = live();
  widget.emit("tool-call", {
    name: "highlight_building",
    arguments: "{}",
    tool_call_id: "real-id",
  });
  widget.emit("tool-call", {
    name: "highlight_building",
    arguments: {},
    tool_call_id: "invalid-id",
  });
  await tick();
  assert.equal(widget.messages.length, 2);
  const real = widget.messages.find(
    (message) => message.properties.tool_call_id === "real-id",
  );
  const invalid = widget.messages.find(
    (message) => message.properties.tool_call_id === "invalid-id",
  );
  assert.equal(real.properties.output.code, "TOOL_SCHEMA_UNAVAILABLE");
  assert.equal(invalid.properties.output.code, "INVALID_TOOL_CALL");
  assert.equal(real.properties.status, "error");
  session.stop();

  const failing = setup({
    toolBridge: {
      async handle() {
        throw new Error("private details");
      },
    },
  });
  const failingWidget = failing.live();
  failingWidget.emit("tool-call", {
    name: "highlight_building",
    arguments: "{}",
    tool_call_id: "actual-id",
  });
  await tick();
  assert.equal(
    failingWidget.messages[0].properties.output.code,
    "TOOL_EXECUTION_FAILED",
  );
  assert.equal(
    JSON.stringify(failingWidget.messages).includes("private details"),
    false,
  );
  failing.session.stop();
});

test("session tool memory is bounded and rejected overflow cannot repeat older actions", async () => {
  let calls = 0;
  const { session, live } = setup({
    toolBridge: {
      async handle() {
        calls++;
        return { ok: true, code: "OK", message: "Hecho." };
      },
    },
  });
  const widget = live();
  for (let index = 0; index < 258; index++)
    widget.emit("tool-call", {
      name: "highlight_building",
      arguments: "{}",
      tool_call_id: `actual-${index}`,
    });
  await tick();
  widget.emit("tool-call", {
    name: "highlight_building",
    arguments: "{}",
    tool_call_id: "actual-0",
  });
  await tick();
  assert.equal(calls, 256);
  assert.equal(
    widget.messages.filter(
      (message) => message.properties.output.code === "SESSION_TOOL_LIMIT",
    ).length,
    2,
  );
  session.stop();
});

test("stop cancels queued tools, ignores stale results/events and restores the visual scene once", async () => {
  const pending = deferred();
  const calls = [];
  const { session, live, sceneCalls } = setup({
    toolBridge: {
      async handle(payload) {
        calls.push(payload.name);
        await pending.promise;
        return { ok: true, code: "OK", message: "Hecho." };
      },
    },
  });
  const widget = live();
  widget.emit("tool-call", {
    name: "first",
    arguments: "{}",
    tool_call_id: "id-1",
  });
  widget.emit("tool-call", {
    name: "second",
    arguments: "{}",
    tool_call_id: "id-2",
  });
  await tick();
  session.stop();
  session.stop();
  pending.resolve();
  await tick();
  widget.emit("conversation-started", { conversationId: "ghost" });
  widget.emit("error", { code: "ghost", message: "must not reach state" });
  assert.deepEqual(calls, ["first"]);
  assert.equal(widget.messages.length, 0);
  assert.equal(widget.calls.close, 1);
  assert.equal(widget.calls.destroy, 1);
  assert.equal(widget.calls.remove, 1);
  assert.deepEqual(sceneCalls, { start: 1, end: 1 });
  assert.equal(session.getState().status, "ended");
  assert.equal(session.getWidget(), null);
  session.dispose();
  session.dispose();
  assert.equal(session.start(), false);
  assert.equal(sceneCalls.end, 1);
});

test("session restart accepts new calls without allowing a previous session to reply into it", async () => {
  const pending = deferred();
  let count = 0;
  const { session, live } = setup({
    toolBridge: {
      async handle() {
        if (++count === 1) await pending.promise;
        return { ok: true, code: "OK", message: "Hecho." };
      },
    },
  });
  const firstWidget = live();
  const payload = {
    name: "highlight_building",
    arguments: "{}",
    tool_call_id: "same-real-id",
  };
  firstWidget.emit("tool-call", payload);
  await tick();
  session.stop();
  const secondWidget = live();
  secondWidget.emit("tool-call", payload);
  await tick();
  pending.resolve();
  await tick();
  assert.equal(count, 2);
  assert.equal(firstWidget.messages.length, 0);
  assert.equal(secondWidget.messages.length, 1);
  session.stop();
});

test("microphone denial and unavailable agent are real terminal errors with no automatic retry", async () => {
  const { session, live, sceneCalls } = setup();
  const widget = live();
  widget.emit("error", {
    code: "CONVERSATION_ERROR",
    message: "NotAllowedError: Permission denied",
  });
  assert.equal(session.getState().status, "error");
  assert.equal(session.getState().microphone, "denied");
  assert.match(session.getState().error.message, /permisos/i);
  await tick();
  assert.equal(widget.calls.start, 1);
  assert.equal(sceneCalls.end, 1);
  assert.equal(session.getWidget(), null);
  session.dispose();

  const unavailable = setup();
  const unavailableWidget = unavailable.live();
  unavailableWidget.emit("mode-change", { mode: "unavailable" });
  assert.equal(unavailable.session.getState().status, "error");
  assert.equal(unavailable.session.getState().error.code, "AGENT_UNAVAILABLE");
  assert.equal(unavailableWidget.calls.start, 1);
  unavailable.session.dispose();
});

test("ready timeout removes the widget and restores the scene without claiming connection", async () => {
  const { session, widgets, sceneCalls } = setup({ readyTimeoutMs: 10 });
  session.start();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(session.getState().status, "error");
  assert.equal(session.getState().error.code, "WIDGET_READY_TIMEOUT");
  assert.equal(session.getState().microphone, "not-requested");
  assert.equal(widgets[0].calls.start, 0);
  assert.deepEqual(sceneCalls, { start: 1, end: 1 });
  session.dispose();
});

test("speaking indicators never infer microphone mute or expose transcript text", () => {
  const { session, live, states } = setup();
  const widget = live();
  widget.emit("protocol-message", {
    event_type: "conversation.replica_started_speaking",
    properties: { state: "started" },
  });
  assert.equal(session.getState().speech, "guide");
  widget.emit("protocol-message", {
    event_type: "conversation.user_started_speaking",
    properties: { state: "started" },
  });
  widget.emit("protocol-message", {
    event_type: "conversation.replica_stopped_speaking",
    properties: { state: "stopped" },
  });
  assert.equal(session.getState().speech, "user");
  widget.emit("protocol-message", {
    event_type: "conversation.utterance",
    properties: { role: "user", speech: "private transcript" },
  });
  assert.equal(JSON.stringify(states).includes("private transcript"), false);
  assert.equal(session.getState().microphone, "unknown");
  widget.emit("protocol-message", {
    event_type: "conversation.user_stopped_speaking",
    properties: { state: "stopped" },
  });
  assert.equal(session.getState().speech, null);
  session.stop();
});

test("interrupt and optional text respond use documented live interactions only", () => {
  const { session, live } = setup();
  const widget = live();
  assert.equal(session.interrupt(), true);
  assert.equal(session.respond("  Muéstrame la fábrica  "), true);
  assert.equal(session.respond(" "), false);
  assert.equal(session.respond("x".repeat(2001)), false);
  assert.deepEqual(widget.messages, [
    { event_type: "conversation.interrupt" },
    {
      event_type: "conversation.respond",
      properties: { text: "Muéstrame la fábrica" },
    },
  ]);
  widget.emit("conversation-ended", { conversationId: "conversation-real-1" });
  assert.equal(session.interrupt(), false);
  assert.equal(session.respond("Hola"), false);
  assert.equal(session.getState().status, "ended");
});

test("initialization and SDK promise failures release scene ownership without optimistic success", async () => {
  let restored = 0;
  const failing = setup({
    controller: {
      startSession() {
        throw new Error("capture failed");
      },
      endSession() {
        restored++;
      },
    },
  });
  assert.equal(failing.session.start(), false);
  assert.equal(
    failing.session.getState().error.code,
    "WIDGET_INITIALIZATION_FAILED",
  );
  assert.equal(restored, 1);
  failing.session.dispose();

  const rejected = setup({
    onAppend(widget) {
      widget.startConversation = () => Promise.reject(new Error("network"));
    },
  });
  rejected.session.start();
  await tick();
  assert.equal(rejected.session.getState().status, "error");
  assert.equal(
    rejected.session.getState().error.code,
    "CONVERSATION_START_FAILED",
  );
  assert.equal(rejected.sceneCalls.end, 1);
  rejected.session.dispose();
});
