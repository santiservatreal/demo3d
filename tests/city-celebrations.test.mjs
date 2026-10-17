import test from "node:test";
import assert from "node:assert/strict";
import {
  celebrationKey,
  createCelebrationQueue,
  confettiParticles,
  createCelebrations,
} from "../src/city/celebrations.js";

const sale = (id = "one", extra = {}) => ({
  kind: "sale",
  eventId: `won-${id}`,
  entityId: `deal-${id}`,
  name: "Instalación solar",
  detail: "Hotel Central",
  value: "12.400 €",
  owner: "Ana",
  ...extra,
});

test("live closure queue rejects duplicate events and semantic duplicate sales", () => {
  const queue = createCelebrationQueue();
  assert.equal(queue.enqueue(sale()).accepted, true);
  assert.deepEqual(queue.enqueue(sale()), {
    accepted: false,
    reason: "duplicate",
  });
  assert.deepEqual(
    queue.enqueue(sale("one", { eventId: "same-sale-different-event" })),
    { accepted: false, reason: "duplicate" },
  );
  queue.shift();
  assert.equal(
    queue.enqueue(sale()).reason,
    "duplicate",
    "dismissal does not repeat a closure",
  );
  assert.equal(
    queue.enqueue(sale("another", { eventId: "won-one" })).reason,
    "duplicate",
    "an event cannot announce two entities",
  );
});

test("sale and delivery are separate closure namespaces and have useful accessible titles", () => {
  const queue = createCelebrationQueue();
  queue.enqueue(sale());
  assert.equal(
    queue.enqueue(sale("one", { kind: "delivery", eventId: "delivered-one" }))
      .accepted,
    true,
  );
  assert.equal(queue.shift().title, "¡Venta ganada!");
  assert.equal(queue.shift().title, "¡Entrega completada!");
  assert.equal(
    celebrationKey({ kind: "delivery", entityId: "deal-one" }),
    "delivery:deal-one",
  );
});

test("event floods keep one active card and at most two pending, in source order", () => {
  const queue = createCelebrationQueue();
  for (let index = 0; index < 200; index++) queue.enqueue(sale(String(index)));
  const status = queue.debug();
  assert.equal(status.size, 3);
  assert.equal(status.queued.length, 2);
  assert.equal(status.dropped, 197);
  assert.equal(status.rememberedEvents, 3);
  assert.equal(queue.shift().entityId, "deal-0");
  assert.equal(queue.shift().entityId, "deal-1");
  assert.equal(queue.shift().entityId, "deal-2");
  assert.equal(queue.shift(), null);
});

test("reset starts a fresh demo while disposal releases work and refuses future notifications", () => {
  const queue = createCelebrationQueue();
  queue.enqueue(sale());
  queue.reset();
  assert.equal(queue.debug().size, 0);
  assert.equal(queue.debug().rememberedClosures, 0);
  assert.equal(queue.enqueue(sale()).accepted, true);
  queue.dispose();
  assert.equal(queue.debug().size, 0);
  assert.equal(queue.debug().disposed, true);
  assert.equal(queue.enqueue(sale("two")).reason, "disposed");
});

test("invalid source data cannot produce a closure and public snapshots do not mutate the queue", () => {
  const queue = createCelebrationQueue();
  for (const invalid of [
    {},
    sale("x", { kind: "meeting" }),
    sale("x", { eventId: "" }),
    sale("x", { entityId: "" }),
  ])
    assert.equal(queue.enqueue(invalid).reason, "invalid");
  const source = sale();
  queue.enqueue(source);
  source.name = "changed upstream";
  const snapshot = queue.peek();
  snapshot.name = "changed by observer";
  assert.equal(queue.peek().name, "Instalación solar");
});

test("reduced motion has no particle work and full motion stays bounded with valid trajectories", () => {
  assert.deepEqual(confettiParticles({ reducedMotion: true }), []);
  for (const kind of ["sale", "delivery"]) {
    const pieces = confettiParticles({ kind });
    assert.ok(pieces.length >= 30 && pieces.length <= 48);
    assert.ok(
      pieces.every(
        (piece) =>
          piece.x >= 0 &&
          piece.x <= 100 &&
          piece.fall <= 170 &&
          piece.duration <= 1700,
      ),
    );
    assert.deepEqual(
      pieces,
      confettiParticles({ kind }),
      "a render never invents extra random particle work",
    );
  }
});

/** Minimal DOM keeps lifecycle tests independent of a browser or graphics device. */
function domFixture() {
  class Node {
    constructor(tag, document) {
      this.tagName = tag;
      this.ownerDocument = document;
      this.children = [];
      this.dataset = {};
      this.attributes = {};
      this.listeners = {};
      this.style = { setProperty() {} };
      this.classList = { add() {} };
      this.textContent = "";
    }
    setAttribute(key, value) {
      this.attributes[key] = value;
    }
    append(...children) {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    }
    replaceChildren(...children) {
      this.children = [];
      this.append(...children);
    }
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter(
          (node) => node !== this,
        );
    }
  }
  const document = {
    createElement: (tag) => new Node(tag, document),
    createElementNS: (_namespace, tag) => new Node(tag, document),
  };
  return document.createElement("div");
}

test("dismissal advances the live card, reset and disposal remove DOM and its only timer", () => {
  const container = domFixture();
  const component = createCelebrations({ container, reducedMotion: true });
  component.notify(sale("one", { name: "<script>never HTML</script>" }));
  component.notify(sale("two"));
  assert.equal(component.debug().particleCount, 0);
  assert.equal(component.debug().timerActive, true);
  const layer = container.children[0];
  assert.equal(layer.attributes["aria-live"], "polite");
  const card = layer.children[0];
  assert.equal(
    card.children[1].children[1].textContent,
    "<script>never HTML</script>",
  );
  card.children[2].listeners.click();
  assert.equal(component.debug().visible.entityId, "deal-two");
  component.reset();
  assert.equal(component.debug().timerActive, false);
  assert.equal(layer.hidden, true);
  assert.equal(layer.children.length, 0);
  component.notify(sale("one"));
  component.dispose();
  assert.equal(component.debug().timerActive, false);
  assert.equal(component.debug().disposed, true);
  assert.equal(container.children.length, 0);
  assert.equal(component.notify(sale("three")).reason, "disposed");
  component.dispose();
});

test("reading time starts after a paint opportunity and pending frames are cancelled on reset", () => {
  const container = domFixture();
  const frames = new Map();
  let nextFrame = 0;
  container.ownerDocument.defaultView = {
    requestAnimationFrame(callback) {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
  };
  const tick = () => {
    const ready = [...frames.values()];
    frames.clear();
    ready.forEach((callback) => callback());
  };
  const component = createCelebrations({ container });
  component.notify(sale());
  assert.equal(component.debug().timerActive, false);
  assert.equal(component.debug().paintPending, true);
  tick();
  assert.equal(component.debug().timerActive, false);
  tick();
  assert.equal(component.debug().timerActive, true);
  assert.equal(component.debug().paintPending, false);
  component.reset();
  component.notify(sale("second"));
  tick();
  component.reset();
  assert.equal(frames.size, 0);
  assert.equal(component.debug().timerActive, false);
  assert.equal(component.debug().paintPending, false);
  component.dispose();
});
