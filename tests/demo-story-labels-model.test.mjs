import test from "node:test";
import assert from "node:assert/strict";
import { selectStoryLabels, layoutStoryLabels } from "../src/demo/story-labels.js";

const sales = ["lead", "qualified", "proposal", "negotiation", "won"];
const industry = ["manufacturing", "packing", "warehouse", "transit", "delivered"];
const frame = (section, activeId, visibleIds, mode = "stage") => ({ section, labels: { section, activeId, visibleIds, mode } });
const viewport = { x: 0, y: 0, width: 1280, height: 800 };
const intersects = (first, second) => first.x < second.x + second.width && first.x + first.width > second.x && first.y < second.y + second.height && first.y + first.height > second.y;

test("floating captions only use names explicitly requested by the presentation", () => {
  assert.deepEqual(selectStoryLabels({}), []);
  assert.deepEqual(selectStoryLabels(frame("sales", "lead", sales, "none")), []);
  assert.deepEqual(selectStoryLabels(frame("sales", "won", ["unknown"])), []);
  const chosen = selectStoryLabels(frame("sales", "proposal", sales));
  assert.deepEqual(chosen.map(({ id }) => id), ["proposal"]);
  assert.equal(chosen[0].text, "Propuestas");
  assert.equal(chosen[0].active, true);
});

test("all five industrial stages and the three districts have readable Spanish captions", () => {
  for (const id of industry) {
    const chosen = selectStoryLabels(frame("industry", id, industry), { maxLabels: 1 });
    assert.equal(chosen[0].id, id);
    assert.equal(chosen[0].section, "industrial");
    assert.match(chosen[0].number, /^0[1-5]$/);
  }
  assert.deepEqual(selectStoryLabels(frame("all", null, ["commercial", "industrial", "communications"], "districts")).map(({ text }) => text), ["Barrio comercial", "Zona industrial", "Comunicaciones"]);
});

test("route captions stay bounded and always prioritize the current stage", () => {
  const chosen = selectStoryLabels(frame("sales", "negotiation", sales, "route"));
  assert.equal(chosen.length, 3);
  assert.equal(chosen[0].id, "negotiation");
  assert.deepEqual(selectStoryLabels(frame("sales", "won", sales), { maxLabels: 1 }).map(({ id }) => id), ["won"]);
  assert.deepEqual(selectStoryLabels(frame("sales", "won", sales), { maxLabels: 0 }), []);
});

test("close-up stage captions identify only the active parcel during rebuilding", () => {
  const chosen = selectStoryLabels(frame("sales", "won", ["negotiation", "won"]), { maxLabels: 3 });
  assert.deepEqual(chosen.map(({ id }) => id), ["won"]);
  assert.deepEqual(selectStoryLabels(frame("sales", "won", ["negotiation"])), []);
  assert.deepEqual(selectStoryLabels(frame("industry", "delivered", industry), { maxLabels: 3 }).map(({ id }) => id), ["delivered"]);
});

test("screen-space captions avoid narrative, indicators, controls and one another", () => {
  const obstacles = [
    { x: 20, y: 100, width: 370, height: 310 },
    { x: 900, y: 80, width: 340, height: 100 },
    { x: 170, y: 700, width: 940, height: 80 },
  ];
  const labels = [
    { id: "proposal", x: 500, y: 420, width: 174, height: 54, active: true },
    { id: "negotiation", x: 515, y: 425, width: 174, height: 54 },
    { id: "won", x: 820, y: 420, width: 174, height: 54 },
  ];
  const result = layoutStoryLabels({ labels, viewport, obstacles });
  assert.equal(result.length, 3);
  for (const caption of result) {
    assert.ok(caption.x >= 12 && caption.y >= 12);
    assert.ok(caption.x + caption.width <= viewport.width - 12);
    assert.ok(caption.y + caption.height <= viewport.height - 12);
    assert.ok(obstacles.every((obstacle) => !intersects(caption, obstacle)));
    assert.ok(result.every((other) => other === caption || !intersects(caption, other)));
  }
});

test("blocked or off-camera captions disappear instead of covering the map interface", () => {
  assert.deepEqual(layoutStoryLabels({ labels: [{ id: "won", x: 600, y: 400, visible: false }], viewport }), []);
  assert.deepEqual(layoutStoryLabels({ labels: [{ id: "won", x: 600, y: 400 }], viewport, obstacles: [viewport] }), []);
  assert.deepEqual(layoutStoryLabels({ labels: [{ id: "won", x: -500, y: 400 }], viewport }), []);
  assert.deepEqual(layoutStoryLabels({ labels: [{ id: "won", x: 100, y: 50 }], viewport: { x: 0, y: 0, width: 100, height: 40 } }), []);
});

test("a moving camera retains a valid label placement rather than hopping between sides", () => {
  const result = layoutStoryLabels({ labels: [{ id: "lead", x: 640, y: 400 }], viewport, previous: { lead: "right" } });
  assert.equal(result[0].placement, "right");
  const moved = layoutStoryLabels({ labels: [{ id: "lead", x: 641.25, y: 400.5 }], viewport, previous: { lead: result[0].placement } });
  assert.equal(moved[0].placement, "right");
  assert.equal(moved[0].x - result[0].x, 1.25);
  assert.equal(moved[0].y - result[0].y, 0.5);
});

test("layout measures each label independently and never changes the supplied CRM-facing frame", () => {
  const inputFrame = frame("industry", "warehouse", industry, "route");
  const before = JSON.stringify(inputFrame);
  const chosen = selectStoryLabels(inputFrame);
  const result = layoutStoryLabels({ labels: chosen.map((label, index) => ({ ...label, x: 500 + index * 210, y: 400, width: index ? 156 : 174, height: 54 })), viewport });
  assert.equal(result.length, 3);
  assert.equal(JSON.stringify(inputFrame), before);
});
