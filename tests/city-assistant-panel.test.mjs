import test from "node:test";
import assert from "node:assert/strict";
import { createCityAssistant } from "../src/city/assistant-panel.js";
import { createDemoState } from "../src/city/model.js";
import { createIndustryState } from "../src/city/industry-model.js";

/** A small DOM and manual timer fixture; no WebGL or network is needed. */
function fixture() {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const documentListeners = new Map();
  class Node {
    constructor(tag, document) {
      this.tagName = tag;
      this.ownerDocument = document;
      this.children = [];
      this.dataset = {};
      this.attributes = {};
      this.listeners = new Map();
      this.hidden = false;
      this.textContent = "";
      this.focusCount = 0;
      this.classList = { add() {}, remove() {}, toggle() {} };
    }
    get firstElementChild() {
      return this.children[0] || null;
    }
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
    append(...nodes) {
      for (const node of nodes) {
        node.remove();
        node.parent = this;
        this.children.push(node);
      }
    }
    replaceChildren(...nodes) {
      for (const child of this.children) child.parent = null;
      this.children.length = 0;
      this.append(...nodes);
    }
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter(
          (node) => node !== this,
        );
      this.parent = null;
    }
    contains(node) {
      return (
        node === this || this.children.some((child) => child.contains(node))
      );
    }
    closest() {
      return this.dataset.assistantAction
        ? this
        : this.parent?.closest() || null;
    }
    focus() {
      this.focusCount += 1;
    }
    addEventListener(name, handler) {
      this.listeners.set(name, handler);
    }
    removeEventListener(name) {
      this.listeners.delete(name);
    }
  }
  const document = {
    hidden: false,
    createElement: (tag) => new Node(tag, document),
    createElementNS: (_namespace, tag) => new Node(tag, document),
    addEventListener: (name, handler) => documentListeners.set(name, handler),
    removeEventListener: (name) => documentListeners.delete(name),
    defaultView: {
      setTimeout(callback, delay) {
        const id = ++nextTimer;
        timers.set(id, { callback, at: now + delay });
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  };
  const container = document.createElement("div");
  const find = (predicate, parent = container) => {
    if (predicate(parent)) return parent;
    for (const child of parent.children) {
      const result = find(predicate, child);
      if (result) return result;
    }
    return null;
  };
  return {
    container,
    timers,
    documentListeners,
    byId: (id) => find((node) => node.id === id),
    action: (name) => find((node) => node.dataset.assistantAction === name),
    click(name) {
      const target = this.action(name);
      assert.ok(target, `action ${name} exists`);
      container.children[0].listeners.get("click")({ target });
    },
    visibility(hidden) {
      document.hidden = hidden;
      documentListeners.get("visibilitychange")?.();
    },
    tick(milliseconds) {
      const end = now + milliseconds;
      let next;
      while (
        (next = [...timers]
          .filter(([, item]) => item.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0])
      ) {
        timers.delete(next[0]);
        now = next[1].at;
        next[1].callback();
      }
      now = end;
    },
  };
}

const context = () => ({
  state: createDemoState(),
  industryState: createIndustryState(),
  people: [],
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const reply = (extra = {}) => ({
  text: "Datos de tu CRM",
  sourceLabel: "CRM simulado",
  mode: "local",
  actions: [],
  ...extra,
});

test("local queries use supplied snapshots, escape text and only request visual actions", () => {
  const dom = fixture();
  const source = context();
  const before = structuredClone(source);
  const actions = [];
  const assistant = createCityAssistant({
    container: dom.container,
    getContext: () => source,
    onAction: (action) => actions.push(action),
  });
  const result = assistant.ask("Dónde está Lucía");
  assert.ok(result.text.includes("Lucía"));
  assert.deepEqual(actions, [{ type: "focus-owner", id: "owner-lucia" }]);
  assistant.ask("<img src=x onerror=alert(1)>");
  assert.equal(
    assistant.debug().history[2].text,
    "<img src=x onerror=alert(1)>",
  );
  assert.equal(
    dom.byId("city-assistant-messages").children[2].children[1].textContent,
    "<img src=x onerror=alert(1)>",
  );
  assert.deepEqual(source, before);
  assert.equal(dom.byId("city-assistant-input").focusCount, 0);
  assistant.dispose();
});

test("an async reply keeps question order and ignores duplicate submissions while pending", async () => {
  const dom = fixture();
  const request = deferred();
  const actions = [];
  const reveals = [];
  const assistant = createCityAssistant({
    container: dom.container,
    getContext: context,
    answerQuestion: () => request.promise,
    onAction: (action) => actions.push(action),
  });
  dom.action("expand").parent.scrollIntoView = (options) =>
    reveals.push(options);
  const first = assistant.ask("Dónde está Lucía");
  assert.equal(
    reveals.length,
    1,
    "expansion reveals the composer without moving focus",
  );
  assert.equal(assistant.debug().pending, true);
  assert.equal(assistant.ask("Otra pregunta"), null);
  assert.equal(assistant.debug().askCount, 1);
  request.resolve(
    reply({
      mode: "ai",
      actions: [
        { type: "focus-owner", id: "owner-lucia" },
        { type: "delete-deal", id: "deal-001" },
      ],
    }),
  );
  await first;
  assert.equal(
    reveals.length,
    2,
    "the reply keeps the composer visible in the page flow",
  );
  assert.deepEqual(reveals[1], {
    block: "nearest",
    inline: "nearest",
    behavior: "auto",
  });
  assert.equal(dom.byId("city-assistant-input").focusCount, 0);
  assert.equal(assistant.debug().pending, false);
  assert.equal(assistant.debug().answerMode, "ai");
  assert.deepEqual(
    assistant.debug().history.map((item) => item.role),
    ["user", "assistant"],
  );
  assert.deepEqual(actions, [{ type: "focus-owner", id: "owner-lucia" }]);
  assistant.dispose();
});

test("reset rejects a late response without changing a newer request or triggering navigation", async () => {
  const dom = fixture();
  const oldRequest = deferred();
  const newRequest = deferred();
  let calls = 0;
  const actions = [];
  const assistant = createCityAssistant({
    container: dom.container,
    getContext: context,
    answerQuestion: () =>
      ++calls === 1 ? oldRequest.promise : newRequest.promise,
    onAction: (action) => actions.push(action),
  });
  const oldReply = assistant.ask("Pregunta anterior");
  assistant.reset();
  const newReply = assistant.ask("Pregunta nueva");
  oldRequest.resolve(
    reply({
      text: "Respuesta antigua",
      actions: [{ type: "district", id: "industry" }],
    }),
  );
  assert.equal(await oldReply, null);
  assert.equal(assistant.debug().pending, true);
  assert.deepEqual(
    assistant.debug().history.map((item) => item.text),
    ["Pregunta nueva"],
  );
  assert.deepEqual(actions, []);
  newRequest.resolve(reply({ text: "Respuesta nueva" }));
  await newReply;
  assert.equal(assistant.debug().pending, false);
  assert.equal(assistant.debug().history[1].text, "Respuesta nueva");
  assistant.dispose();
});

test("disposal clears the only advisory timer and drops late replies and document listeners", async () => {
  const dom = fixture();
  const request = deferred();
  const actions = [];
  const assistant = createCityAssistant({
    container: dom.container,
    answerQuestion: () => request.promise,
    onAction: (action) => actions.push(action),
  });
  const promise = assistant.ask("Consulta pendiente");
  assistant.dispose();
  request.resolve(reply({ actions: [{ type: "district", id: "industry" }] }));
  assert.equal(await promise, null);
  assert.equal(assistant.ask("No debe ejecutarse"), null);
  assert.equal(dom.container.children.length, 0);
  assert.equal(dom.timers.size, 0);
  assert.equal(dom.documentListeners.size, 0);
  assert.deepEqual(actions, []);
});

test("TV, Replay and a hidden tab pause advice and refuse visual chat actions", () => {
  const dom = fixture();
  const assistant = createCityAssistant({
    container: dom.container,
    getContext: context,
  });
  for (const mode of ["tv", "replay"]) {
    assistant.update({ mode });
    assert.equal(assistant.debug().hidden, true);
    assert.equal(assistant.debug().timerActive, false);
    assert.equal(assistant.ask("Dónde está Lucía"), null);
    dom.tick(60000);
    assert.equal(assistant.debug().tipCount, 0);
  }
  assistant.update({ mode: "explore" });
  assert.equal(assistant.debug().timerActive, true);
  dom.visibility(true);
  assert.equal(assistant.debug().timerActive, false);
  dom.tick(60000);
  assert.equal(assistant.debug().tipCount, 0);
  dom.visibility(false);
  dom.tick(12000);
  assert.ok(assistant.debug().visibleTip);
  assert.equal(assistant.debug().tipCount, 1);
  assistant.dispose();
});

test("advice stays a single card, dismissals persist and mute/resume does not steal focus", () => {
  const dom = fixture();
  const assistant = createCityAssistant({
    container: dom.container,
    getContext: context,
  });
  dom.tick(12000);
  const firstId = assistant.debug().visibleTip.id;
  assert.equal(dom.byId("city-assistant-tip").hidden, false);
  dom.click("tip-dismiss");
  assert.equal(dom.byId("city-assistant-tip").hidden, true);
  assert.deepEqual(assistant.debug().dismissed, [firstId]);
  dom.tick(30000);
  assert.notEqual(assistant.debug().visibleTip.id, firstId);
  dom.click("tips-mute");
  assert.equal(assistant.debug().timerActive, false);
  const count = assistant.debug().tipCount;
  dom.tick(90000);
  assert.equal(assistant.debug().tipCount, count);
  dom.click("tips-resume");
  dom.tick(12000);
  assert.notEqual(assistant.debug().visibleTip.id, firstId);
  assert.equal(dom.byId("city-assistant-input").focusCount, 0);
  assistant.dispose();
});

test("data updates remove a resolved recommendation without opening a replacement or restarting its timer", () => {
  const dom = fixture();
  let source = context();
  const assistant = createCityAssistant({
    container: dom.container,
    getContext: () => source,
  });
  dom.tick(12000);
  assert.ok(assistant.debug().visibleTip);
  const timerIds = [...dom.timers.keys()];
  source = {
    ...source,
    state: { ...source.state, tasks: [], deals: [], activities: [] },
  };
  assistant.update({ district: "sales" });
  assert.equal(assistant.debug().visibleTip, null);
  assert.equal(dom.byId("city-assistant-tip").hidden, true);
  assert.equal(assistant.debug().tipCount, 1);
  assert.deepEqual([...dom.timers.keys()], timerIds);
  assistant.dispose();
});
