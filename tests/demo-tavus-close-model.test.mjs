import test from "node:test";
import assert from "node:assert/strict";
import { closeTavusEmbed } from "../src/demo/tavus-close.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

class Embed extends EventTarget {
  attributes = new Map();
  calls = { end: 0, destroy: 0, remove: 0, start: 0 };
  order = [];

  constructor(end = () => Promise.resolve()) {
    super();
    this.end = end;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  endConversation() {
    this.calls.end++;
    this.order.push(`end:${this.calls.end}`);
    return this.end(this.calls.end, this);
  }

  startConversation() {
    this.calls.start++;
  }

  destroy() {
    this.calls.destroy++;
    this.order.push("destroy");
  }

  remove() {
    this.calls.remove++;
    this.order.push("remove");
  }

  emit(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(`tavus:${name}`, { detail }));
  }
}

function observeClose(embed, options = {}) {
  let settled = false;
  const promise = closeTavusEmbed(embed, { timeoutMs: 1000, ...options }).then(
    (result) => {
      settled = true;
      return result;
    },
  );
  return { promise, isSettled: () => settled };
}

function assertRetained(embed, close) {
  assert.equal(close.isSettled(), false);
  assert.equal(embed.calls.destroy, 0);
  assert.equal(embed.calls.remove, 0);
  assert.equal(embed.calls.start, 0);
}

function assertCleaned(embed) {
  assert.equal(embed.calls.destroy, 1);
  assert.equal(embed.calls.remove, 1);
  assert.equal(embed.calls.start, 0);
}

test("connected close awaits first end, both SDK end signals, and the second public backend wait before destroy", async () => {
  const firstEnd = deferred();
  const backendEnd = deferred();
  const embed = new Embed((attempt) =>
    attempt === 1 ? firstEnd.promise : backendEnd.promise,
  );
  const close = observeClose(embed, {
    connected: true,
    conversationId: "this-room",
  });

  assert.equal(embed.attributes.get("inert"), "");
  assert.equal(embed.attributes.get("aria-busy"), "true");
  await tick();
  assert.equal(embed.calls.end, 1);
  assertRetained(embed, close);

  firstEnd.resolve();
  await tick();
  assert.equal(embed.calls.end, 1);
  assertRetained(embed, close);

  embed.emit("conversation-ended", { conversationId: "this-room" });
  await tick();
  assert.equal(embed.calls.end, 1, "call ended alone must not re-enter end");
  assertRetained(embed, close);

  embed.emit("mode-change", { mode: "ended" });
  await tick();
  assert.equal(embed.calls.end, 2);
  assertRetained(embed, close);

  embed.order.push("backend-finished");
  backendEnd.resolve();
  assert.deepEqual(await close.promise, { ok: true });
  assert.deepEqual(embed.order, [
    "end:1",
    "end:2",
    "backend-finished",
    "destroy",
    "remove",
  ]);
  assertCleaned(embed);
});

test("mode ended before call ended cannot trigger the second public end early", async () => {
  const backendEnd = deferred();
  const embed = new Embed((attempt) =>
    attempt === 1 ? Promise.resolve() : backendEnd.promise,
  );
  const close = observeClose(embed, {
    connected: true,
    conversationId: "this-room",
  });
  await tick();

  embed.emit("mode-change", { mode: "ended" });
  await tick();
  assert.equal(embed.calls.end, 1);
  assertRetained(embed, close);

  embed.emit("conversation-ended", { conversationId: "this-room" });
  await tick();
  assert.equal(embed.calls.end, 2);
  assertRetained(embed, close);
  backendEnd.resolve();
  assert.deepEqual(await close.promise, { ok: true });
  assertCleaned(embed);
});

test("synchronous SDK end signals inside the first public end are not lost", async () => {
  const firstEnd = deferred();
  const backendEnd = deferred();
  const embed = new Embed((attempt, element) => {
    if (attempt === 1) {
      element.emit("mode-change", { mode: "ended" });
      element.emit("conversation-ended", { conversationId: "this-room" });
      return firstEnd.promise;
    }
    return backendEnd.promise;
  });
  const close = observeClose(embed, {
    connected: true,
    conversationId: "this-room",
  });
  await tick();
  assert.equal(embed.calls.end, 1, "end signals do not bypass the first promise");
  assertRetained(embed, close);

  firstEnd.resolve();
  await tick();
  assert.equal(embed.calls.end, 2);
  assertRetained(embed, close);
  backendEnd.resolve();
  assert.deepEqual(await close.promise, { ok: true });
  assertCleaned(embed);
});

for (const initial of [
  { callEnded: true, modeEnded: true, remaining: null },
  { callEnded: true, modeEnded: false, remaining: "mode" },
  { callEnded: false, modeEnded: true, remaining: "call" },
]) {
  test(`already observed end signals are retained (call=${initial.callEnded}, mode=${initial.modeEnded})`, async () => {
    const backendEnd = deferred();
    const embed = new Embed((attempt) =>
      attempt === 1 ? Promise.resolve() : backendEnd.promise,
    );
    const close = observeClose(embed, {
      connected: true,
      conversationId: "this-room",
      callEnded: initial.callEnded,
      modeEnded: initial.modeEnded,
    });
    await tick();

    if (initial.remaining) {
      assert.equal(embed.calls.end, 1);
      assertRetained(embed, close);
      if (initial.remaining === "mode") {
        embed.emit("mode-change", { mode: "ended" });
      } else {
        embed.emit("conversation-ended", { conversationId: "this-room" });
      }
      await tick();
    }

    assert.equal(embed.calls.end, 2);
    assertRetained(embed, close);
    backendEnd.resolve();
    assert.deepEqual(await close.promise, { ok: true });
    assertCleaned(embed);
  });
}

test("preview close awaits its public promise without requiring call events or a second end", async () => {
  const discardPreview = deferred();
  const embed = new Embed(() => discardPreview.promise);
  const close = observeClose(embed);
  await tick();
  assert.equal(embed.calls.end, 1);
  assertRetained(embed, close);

  discardPreview.resolve();
  assert.deepEqual(await close.promise, { ok: true });
  assert.equal(embed.calls.end, 1);
  assertCleaned(embed);
});

test("another conversation's ended event does not release this room's close barrier", async () => {
  const backendEnd = deferred();
  const embed = new Embed((attempt) =>
    attempt === 1 ? Promise.resolve() : backendEnd.promise,
  );
  const close = observeClose(embed, {
    connected: true,
    conversationId: "this-room",
  });
  await tick();

  embed.emit("mode-change", { mode: "ended" });
  embed.emit("conversation-ended", { conversationId: "another-room" });
  embed.emit("state-change", { state: "ended" });
  await tick();
  assert.equal(
    embed.calls.end,
    1,
    "a generic ended state cannot acknowledge another conversation's event",
  );
  assertRetained(embed, close);

  embed.emit("conversation-ended", { conversationId: "this-room" });
  await tick();
  assert.equal(embed.calls.end, 2);
  assertRetained(embed, close);
  backendEnd.resolve();
  assert.deepEqual(await close.promise, { ok: true });
  assertCleaned(embed);
});

test("state ended can acknowledge an untracked call after mode ended", async () => {
  const embed = new Embed();
  const close = observeClose(embed, { connected: true });
  await tick();
  embed.emit("mode-change", { mode: "ended" });
  await tick();
  assert.equal(embed.calls.end, 1);

  embed.emit("state-change", { state: "ended" });
  assert.deepEqual(await close.promise, { ok: true });
  assert.equal(embed.calls.end, 2);
  assertCleaned(embed);
});

test("timeout releases local resources once and late SDK completion never starts or ends another call", async () => {
  const lateEnd = deferred();
  const embed = new Embed(() => lateEnd.promise);
  const close = observeClose(embed, {
    connected: true,
    conversationId: "this-room",
    timeoutMs: 25,
  });

  assert.deepEqual(await close.promise, { ok: false, code: "CLOSE_TIMEOUT" });
  assert.equal(embed.calls.end, 1);
  assertCleaned(embed);

  embed.emit("conversation-ended", { conversationId: "this-room" });
  embed.emit("state-change", { state: "ended" });
  embed.emit("mode-change", { mode: "ended" });
  lateEnd.resolve();
  await tick();
  assert.equal(embed.calls.end, 1, "late first end cannot re-enter the SDK");
  assertCleaned(embed);
});

test("timeout during the second backend wait still cleans once after its late resolution", async () => {
  const lateBackendEnd = deferred();
  const embed = new Embed((attempt, element) => {
    if (attempt === 1) {
      element.emit("conversation-ended", { conversationId: "this-room" });
      element.emit("mode-change", { mode: "ended" });
      return Promise.resolve();
    }
    return lateBackendEnd.promise;
  });
  const close = observeClose(embed, {
    connected: true,
    conversationId: "this-room",
    timeoutMs: 25,
  });
  assert.deepEqual(await close.promise, { ok: false, code: "CLOSE_TIMEOUT" });
  assert.equal(embed.calls.end, 2);
  assertCleaned(embed);

  lateBackendEnd.resolve();
  await tick();
  assert.equal(embed.calls.end, 2);
  assertCleaned(embed);
});

for (const failure of ["throw", "reject"]) {
  test(`public end ${failure} reports close failure and releases local resources`, async () => {
    const embed = new Embed(() => {
      if (failure === "throw") throw new Error("SDK close failed");
      return Promise.reject(new Error("SDK close failed"));
    });
    const close = observeClose(embed, { connected: true });
    assert.deepEqual(await close.promise, { ok: false, code: "CLOSE_FAILED" });
    assert.equal(embed.calls.end, 1);
    assertCleaned(embed);
  });
}

test("a rejected second public backend wait is a failure rather than a successful end", async () => {
  const backendEnd = deferred();
  const embed = new Embed((attempt, element) => {
    if (attempt === 1) {
      element.emit("mode-change", { mode: "ended" });
      element.emit("conversation-ended", { conversationId: "this-room" });
      return Promise.resolve();
    }
    return backendEnd.promise;
  });
  const close = observeClose(embed, {
    connected: true,
    conversationId: "this-room",
  });
  await tick();
  assert.equal(embed.calls.end, 2);
  assertRetained(embed, close);

  backendEnd.reject(new Error("backend close failed"));
  assert.deepEqual(await close.promise, { ok: false, code: "CLOSE_FAILED" });
  assertCleaned(embed);
});

test("destroy throwing still removes the embed and does not start a replacement", async () => {
  const embed = new Embed();
  embed.destroy = () => {
    embed.calls.destroy++;
    throw new Error("SDK destroy failed");
  };
  assert.deepEqual(await closeTavusEmbed(embed), { ok: true });
  assertCleaned(embed);
});
