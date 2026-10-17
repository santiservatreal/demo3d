import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createIndustryProvider,
  createIndustryState,
  assertIndustryConservation,
} from "../src/city/industry-model.js";
import {
  createIndustryDistrict,
  INDUSTRIAL_SURFACES,
  INDUSTRIAL_TRANSFER_SECONDS,
} from "../src/city/industry.js";

function setup(options = {}) {
  const scene = new THREE.Scene();
  const provider = createIndustryProvider();
  const renderer = createIndustryDistrict({ scene, ...options });
  renderer.sync(provider.getState());
  provider.subscribe((state, event) => renderer.sync(state, { event }));
  return { scene, provider, renderer };
}
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

test("industrial floors have distinct heights and no overlapping coplanar road/paint rectangles", () => {
  const { renderer } = setup();
  const heights = Object.values(INDUSTRIAL_SURFACES);
  for (let i = 1; i < heights.length; i++)
    assert.ok(heights[i] - heights[i - 1] >= 0.0299);
  const surfaces = renderer.debug().groundSurfaces;
  const overlaps = (a, b) =>
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 - 1e-8 &&
    Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 - 1e-8;
  for (let a = 0; a < surfaces.length; a++)
    for (let b = a + 1; b < surfaces.length; b++)
      if (surfaces[a].top === surfaces[b].top)
        assert.equal(
          overlaps(surfaces[a], surfaces[b]),
          false,
          `Coplanar overlap: ${JSON.stringify([surfaces[a], surfaces[b]])}`,
        );
  assert.ok(surfaces.some(({ layer }) => layer === "parkingPaint"));
  renderer.dispose();
});

test("initial snapshots and repeated syncs do not create transfers or mutate ERP records", () => {
  const { scene, provider, renderer } = setup();
  const before = structuredClone(provider.getState());
  const rootUUIDs = scene.children[0].children.map(({ uuid }) => uuid);
  for (let i = 0; i < 120; i++) renderer.update(1 / 60, i / 60);
  renderer.sync(provider.getState());
  assert.deepEqual(provider.getState(), before);
  assert.equal(renderer.getTransitions().busy, false);
  assert.deepEqual(
    scene.children[0].children.map(({ uuid }) => uuid),
    rootUUIDs,
  );
  assert.equal(renderer.debug().machinery.addedDrawCalls, 3);
  renderer.dispose();
});

test("a same-object provider stage change has one continuous eight-second pallet hand-off", () => {
  const { provider, renderer } = setup();
  renderer.update(0, 10);
  const sameSnapshot = provider.getState();
  const originalQuantity = sameSnapshot.batches.find(
    ({ id }) => id === "batch-001",
  ).quantity;
  assert.equal(provider.advanceBatch("batch-001"), true);
  assert.equal(provider.getState(), sameSnapshot);
  assert.equal(
    sameSnapshot.batches.find(({ id }) => id === "batch-001").stageId,
    "packing",
  );
  let transfer = renderer.getTransitions().active[0];
  const id = transfer.id;
  assert.equal(transfer.phase, "pickup");
  assert.equal(transfer.duration, INDUSTRIAL_TRANSFER_SECONDS);
  assert.equal(transfer.quantity, originalQuantity);
  renderer.sync(sameSnapshot);
  assert.equal(renderer.getTransitions().active[0].id, id);
  renderer.update(0, 14);
  transfer = renderer.getTransitions().active[0];
  assert.equal(transfer.phase, "transfer");
  assert.ok(distance(transfer.position, transfer.source) > 1);
  assert.ok(distance(transfer.position, transfer.destination) > 1);
  renderer.update(0, 17);
  assert.equal(renderer.getTransitions().active[0].phase, "unload");
  renderer.update(0, 18);
  assert.equal(renderer.getTransitions().busy, false);
  assert.equal(renderer.getTransitions().completed[0].id, id);
  assert.equal(
    renderer.debug().batches.filter(({ id }) => id === "batch-001").length,
    1,
  );
  assert.equal(assertIndustryConservation(sameSnapshot), true);
  assert.equal(
    sameSnapshot.batches.reduce((sum, batch) => sum + batch.quantity, 0),
    1320,
  );
  renderer.dispose();
});

test("multiple ERP changes queue behind two fixed rigs and complete without changing quantities", () => {
  const { provider, renderer } = setup();
  renderer.update(0, 20);
  assert.equal(provider.advanceBatch("batch-001"), true);
  assert.equal(provider.advanceBatch("batch-002"), true);
  assert.equal(provider.advanceBatch("batch-003"), true);
  assert.equal(renderer.getTransitions().active.length, 2);
  assert.equal(renderer.getTransitions().queued.length, 1);
  const before = structuredClone(provider.getState());
  const geometryUUIDs = renderer.debug().machinery.geometryUUIDs;
  renderer.update(0, 28);
  assert.equal(renderer.getTransitions().active.length, 1);
  assert.equal(renderer.getTransitions().queued.length, 0);
  renderer.update(0, 36);
  assert.equal(renderer.getTransitions().busy, false);
  assert.equal(renderer.getTransitions().completed.length, 3);
  assert.deepEqual(renderer.debug().machinery.geometryUUIDs, geometryUUIDs);
  assert.deepEqual(provider.getState(), before);
  renderer.dispose();
});

test("truck departure/loading and explicit delivery have continuous positions and one batch sample", () => {
  const { provider, renderer } = setup();
  renderer.update(0, 10);
  const parked = renderer.debug().vehicles.find(({ id }) => id === "truck-03");
  assert.equal(provider.advanceBatch("batch-004"), true);
  let truck = renderer.debug().vehicles.find(({ id }) => id === "truck-03");
  assert.ok(distance(truck.position, parked.position) < 1e-6);
  assert.equal(truck.cargoVisible, false);
  assert.equal(
    renderer.debug().batches.filter(({ id }) => id === "batch-004").length,
    1,
  );
  renderer.update(0, 14);
  const midpoint = renderer
    .debug()
    .vehicles.find(({ id }) => id === "truck-03");
  assert.ok(distance(midpoint.position, parked.position) > 0.1);
  renderer.update(0, 18);
  truck = renderer.debug().vehicles.find(({ id }) => id === "truck-03");
  assert.equal(truck.cargoVisible, true);
  const beforeDelivery = truck.position;
  assert.equal(provider.advanceBatch("batch-004"), true);
  truck = renderer.debug().vehicles.find(({ id }) => id === "truck-03");
  assert.ok(distance(truck.position, beforeDelivery) < 1e-6);
  assert.equal(renderer.getTransitions().active[0].phase, "arrival");
  renderer.update(0, 22);
  assert.equal(renderer.getTransitions().active[0].phase, "transfer");
  renderer.update(0, 26);
  assert.equal(renderer.getTransitions().busy, false);
  assert.equal(
    renderer.debug().batches.filter(({ id }) => id === "batch-004").length,
    1,
  );
  assert.equal(
    provider.getState().batches.find(({ id }) => id === "batch-004").stageId,
    "delivered",
  );
  renderer.dispose();
});

test("reset, replay and reduced motion snap consistently with no pending rigs", () => {
  const { provider, renderer } = setup();
  provider.advanceBatch("batch-001");
  assert.equal(renderer.getTransitions().busy, true);
  provider.reset();
  assert.equal(renderer.getTransitions().busy, false);
  provider.advanceBatch("batch-001");
  renderer.sync(createIndustryState(), { animateEvents: false });
  assert.equal(renderer.getTransitions().busy, false);
  const reduced = setup({ reducedMotion: true });
  reduced.provider.advanceBatch("batch-001");
  assert.equal(reduced.renderer.getTransitions().busy, false);
  assert.equal(reduced.renderer.debug().machinery.animated, false);
  const previous = structuredClone(reduced.provider.getState());
  reduced.renderer.update(0, 500);
  assert.deepEqual(reduced.provider.getState(), previous);
  assert.equal(reduced.renderer.debug().machinery.time, 0);
  renderer.dispose();
  reduced.renderer.dispose();
});
