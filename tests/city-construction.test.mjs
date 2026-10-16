import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createArchitecture } from "../src/city/architecture.js";
import {
  CONSTRUCTION_DURATION,
  phaseAt,
  constructionRoute,
  createConstructionDirector,
} from "../src/city/construction.js";

function fixture({ reducedMotion = false, count = 3 } = {}) {
  const scene = new THREE.Scene(),
    architecture = createArchitecture(scene);
  for (let index = 0; index < count; index++)
    architecture.addEntity(
      { id: `deal-${index}`, amount: 10000 + index * 5000, variant: index },
      new THREE.Vector3(-31 + index * 4.2, 0.1, -17),
    );
  architecture.build();
  const director = createConstructionDirector({
    scene,
    architecture,
    reducedMotion,
  });
  const start = (index, overrides = {}) =>
    director.start({
      id: `deal-${index}`,
      from: architecture.entities.get(`deal-${index}`).group.position.clone(),
      to: new THREE.Vector3(15 + index * 4.2, 0.1, 2.6),
      startedAt: 0,
      color: "#e2a930",
      ownerId: "owner-1",
      accountId: "account-1",
      ...overrides,
    });
  return {
    scene,
    architecture,
    director,
    start,
    dispose() {
      director.dispose();
      architecture.dispose();
    },
  };
}
function matrices(architecture, id) {
  return architecture.entities.get(id).refs.map((reference) => {
    const mesh = architecture.meshes.find(
        (candidate) => candidate.name === `city-kit-${reference.key}`,
      ),
      matrix = new THREE.Matrix4();
    mesh.getMatrixAt(reference.index, matrix);
    return matrix.toArray();
  });
}
function visibleMatrices(architecture, id) {
  return matrices(architecture, id).filter(
    (matrix) => Math.hypot(matrix[0], matrix[1], matrix[2]) > 0.00001,
  );
}

test("choreography dismantles, transports materials, then rebuilds; boundaries are deterministic", () => {
  assert.equal(phaseAt(-4).phase, "deconstruct");
  assert.equal(phaseAt(0).buildProgress, 1);
  assert.equal(phaseAt(CONSTRUCTION_DURATION * 0.28).phase, "transport");
  assert.equal(phaseAt(CONSTRUCTION_DURATION * 0.28).buildProgress, 0);
  assert.equal(phaseAt(CONSTRUCTION_DURATION * 0.68).phase, "build");
  assert.equal(phaseAt(CONSTRUCTION_DURATION * 0.68).buildProgress, 0);
  assert.deepEqual(phaseAt(100), {
    phase: "complete",
    progress: 1,
    buildProgress: 1,
    truckProgress: 1,
    completed: true,
  });
  assert.equal(phaseAt(0, 0).completed, true);
  let previous = 1;
  for (let index = 0; index <= 100; index++) {
    const state = phaseAt((index / 100) * 0.28 * CONSTRUCTION_DURATION);
    assert.ok(state.buildProgress <= previous + 1e-12);
    previous = state.buildProgress;
  }
});

test("architecture places individual pieces without shrinking the whole building or replacing identities", () => {
  const f = fixture(),
    entity = f.architecture.entities.get("deal-0"),
    uuid = entity.group.uuid,
    meshes = f.architecture.meshes.map((mesh) => [mesh.uuid, mesh.count]),
    original = matrices(f.architecture, "deal-0");
  f.architecture.updateEntity("deal-0", { buildProgress: 0.45 });
  const partial = visibleMatrices(f.architecture, "deal-0");
  assert.ok(partial.length > 0 && partial.length < original.length);
  assert.deepEqual(entity.group.scale.toArray(), [1, 1, 1]);
  f.architecture.updateEntity("deal-0", { buildProgress: 0 });
  assert.equal(visibleMatrices(f.architecture, "deal-0").length, 0);
  f.architecture.updateEntity("deal-0", { buildProgress: 1 });
  assert.deepEqual(matrices(f.architecture, "deal-0"), original);
  assert.equal(entity.group.uuid, uuid);
  assert.deepEqual(
    f.architecture.meshes.map((mesh) => [mesh.uuid, mesh.count]),
    meshes,
  );
  f.dispose();
});

test("building stays in its parcel during demolition and is wholly absent while the cargo truck travels", () => {
  const f = fixture(),
    job = f.start(0),
    entity = f.architecture.entities.get("deal-0"),
    uuid = entity.group.uuid;
  f.director.update(1.8);
  assert.equal(job.phase, "deconstruct");
  assert.deepEqual(entity.group.position.toArray(), job.from.toArray());
  assert.ok(entity.buildProgress > 0 && entity.buildProgress < 1);
  f.director.update(5.5);
  assert.equal(job.phase, "transport");
  assert.equal(visibleMatrices(f.architecture, "deal-0").length, 0);
  assert.ok(job.focusPosition.distanceTo(job.from) > 3);
  assert.ok(job.focusPosition.distanceTo(job.to) > 3);
  assert.deepEqual(entity.group.position.toArray(), job.to.toArray());
  const truck = f.scene.getObjectByName(
    "Camión de materiales de obra · no edificio transportado",
  );
  assert.ok(truck);
  assert.ok(truck.getObjectByName("Paquete de paneles, puntales y materiales"));
  assert.ok(!truck.getObjectByName("deal-0"));
  f.director.update(10);
  assert.equal(job.phase, "build");
  assert.ok(visibleMatrices(f.architecture, "deal-0").length > 0);
  assert.deepEqual(entity.group.position.toArray(), job.to.toArray());
  const result = f.director.update(12);
  assert.deepEqual(result.finished, ["deal-0"]);
  assert.equal(f.director.has("deal-0"), false);
  assert.equal(f.director.get("deal-0").phase, "complete");
  assert.equal(entity.group.uuid, uuid);
  assert.deepEqual(f.director.update(13).finished, []);
  f.dispose();
});

test("more than two transitions queue without losing destinations, and replayed starts are idempotent", () => {
  const f = fixture(),
    jobs = [f.start(0), f.start(1), f.start(2)];
  assert.equal(f.director.debug().count, 2);
  assert.equal(f.director.debug().queueCount, 1);
  assert.equal(f.director.debug().visibleRigs, 2);
  assert.equal(f.start(0), jobs[0]);
  assert.equal(f.director.debug().queueCount, 1);
  const first = f.director.update(12);
  assert.deepEqual(first.finished.sort(), ["deal-0", "deal-1"]);
  assert.equal(jobs[2].startedAt, 12);
  assert.equal(jobs[2].status, "active");
  assert.equal(f.director.debug().visibleRigs, 1);
  assert.deepEqual(f.director.update(24).finished, ["deal-2"]);
  for (const job of jobs) {
    assert.equal(job.status, "complete");
    assert.deepEqual(
      f.architecture.entities.get(job.id).group.position.toArray(),
      job.to.toArray(),
    );
  }
  assert.equal(f.director.debug().visibleRigs, 0);
  assert.equal(f.director.debug().completed.length, 3);
  f.dispose();
});

test("cancellation and reset synchronously restore final positions and complete pieces", () => {
  const f = fixture(),
    jobs = [f.start(0), f.start(1), f.start(2)];
  f.director.update(5);
  assert.equal(f.director.cancel("deal-0"), true);
  assert.equal(f.director.cancel("deal-0"), false);
  assert.equal(f.architecture.entities.get("deal-0").buildProgress, 1);
  assert.deepEqual(
    f.architecture.entities.get("deal-0").group.position.toArray(),
    jobs[0].to.toArray(),
  );
  f.director.clear();
  assert.equal(f.director.debug().count, 0);
  assert.equal(f.director.debug().queueCount, 0);
  assert.equal(f.director.debug().visibleRigs, 0);
  for (const job of jobs) {
    assert.equal(f.architecture.entities.get(job.id).buildProgress, 1);
    assert.deepEqual(
      f.architecture.entities.get(job.id).group.position.toArray(),
      job.to.toArray(),
    );
  }
  f.dispose();
});

test("reduced motion completes immediately with no cranes, trucks or queued work", () => {
  const f = fixture({ reducedMotion: true }),
    job = f.start(0);
  assert.equal(job.phase, "complete");
  assert.equal(job.status, "complete");
  assert.equal(f.director.has(job.id), false);
  assert.deepEqual(
    f.architecture.entities.get(job.id).group.position.toArray(),
    job.to.toArray(),
  );
  assert.equal(f.director.debug().rigCount, 0);
  assert.equal(
    f.scene.children.some((child) => child.userData.construction),
    false,
  );
  assert.deepEqual(f.director.update(0).finished, [job.id]);
  f.dispose();
});

test("construction route has finite, smooth street corners and stays on arterial network between accesses", () => {
  const from = new THREE.Vector3(-31.25, 0.1, -17),
    to = new THREE.Vector3(29.5, 0.1, 2.6),
    route = constructionRoute(from, to),
    length = route.getLength();
  assert.ok(length > 70 && length < 100);
  assert.equal(route.getPointAt(0).x, from.x);
  assert.equal(route.getPointAt(1).x, to.x);
  assert.ok(Math.abs(route.getPointAt(0).z - from.z) > 3.4);
  for (let index = 0; index <= 200; index++) {
    const point = route.getPointAt(index / 200),
      tangent = route.getTangentAt(Math.min(0.999999, index / 200));
    assert.ok(point.toArray().every(Number.isFinite));
    assert.ok(tangent.toArray().every(Number.isFinite));
    assert.ok(Math.abs(point.y - 0.12) < 1e-9);
    const access =
        Math.abs(point.x - from.x) < 0.9 || Math.abs(point.x - to.x) < 0.9,
      street = [-25, 0, 25].some((x) => Math.abs(point.x - x) < 0.9),
      avenue = [-9, 9].some((z) => Math.abs(point.z - z) < 0.9);
    assert.ok(
      access || street || avenue,
      `Off-road route sample: ${point.toArray()}`,
    );
  }
});

test("disposing removes reusable construction infrastructure without modifying CRM data", () => {
  const f = fixture(),
    job = f.start(0),
    identity = f.architecture.entities.get(job.id).group.uuid;
  f.director.update(4);
  f.director.dispose();
  f.director.dispose();
  assert.equal(
    f.scene.children.some((child) => child.userData.construction),
    false,
  );
  assert.equal(f.architecture.entities.get(job.id).group.uuid, identity);
  assert.equal(f.start(1), null);
  f.architecture.dispose();
});
