import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  CINEMATIC_FOV,
  cinematicBoundsShot,
  cinematicTargetShot,
  cinematicRouteLift,
  sampleCinematicPosition,
  sampleCinematicIdle,
} from "../src/city/presentation-camera.js";

const sectors = {
  all: { minX: -38.5, maxX: 38.5, minY: -1.5, maxY: 14, minZ: -80, maxZ: 26.5 },
  sales: { minX: -38.5, maxX: 38.5, minY: -1.5, maxY: 12, minZ: -26.5, maxZ: 26.5 },
  communications: { minX: -38.5, maxX: 38.5, minY: -1.5, maxY: 12, minZ: -44, maxZ: -27 },
  industry: { minX: -38.5, maxX: 38.5, minY: -1.5, maxY: 8, minZ: -74, maxZ: -49 },
};

test("cinematic aerial shots fit every sector in desktop and portrait perspective", () => {
  for (const [id, bounds] of Object.entries(sectors))
    for (const aspect of [16 / 9, 1.44, 1, 390 / 844]) {
      const shot = cinematicBoundsShot(bounds, { id, aspect, clearance: 21 });
      const camera = new THREE.PerspectiveCamera(shot.fov, aspect, 0.3, 900);
      camera.position.copy(shot.position);
      camera.lookAt(shot.target);
      camera.updateMatrixWorld();
      for (const x of [bounds.minX, bounds.maxX])
        for (const y of [bounds.minY, bounds.maxY])
          for (const z of [bounds.minZ, bounds.maxZ]) {
            const ndc = new THREE.Vector3(x, y, z).project(camera);
            assert.ok(Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1,
              `${id}/${aspect}: ${ndc.toArray()}`);
            assert.ok(ndc.z > -1 && ndc.z < 1);
          }
      assert.ok(shot.position.y >= 21);
      assert.equal(shot.fov, CINEMATIC_FOV);
    }
});

test("presentation uses distinct bearings and perspective without modifying the map camera", () => {
  const first = cinematicBoundsShot(sectors.sales, { id: "sales" });
  const second = cinematicBoundsShot(sectors.industry, { id: "industry" });
  const a = first.position.clone().sub(first.target).normalize();
  const b = second.position.clone().sub(second.target).normalize();
  assert.ok(a.angleTo(b) > 0.2);
  assert.ok(CINEMATIC_FOV >= 25 && CINEMATIC_FOV <= 35);
});

test("close shots remain above rooftops for buildings, people, industry and moving trucks", () => {
  const point = new THREE.Vector3(10, 0.1, -20);
  const before = point.toArray();
  for (const kind of ["deal", "account", "owner", "industry-stage", "communication", "vehicle", "batch"])
    for (const aspect of [16 / 9, 390 / 844]) {
      const shot = cinematicTargetShot(point, { kind, height: kind === "owner" ? 1.8 : 12, radius: 4, clearance: 21, aspect });
      assert.ok(shot.position.y >= 21);
      assert.ok(shot.position.distanceTo(shot.target) > 15);
      assert.ok(shot.position.toArray().every(Number.isFinite));
      const camera = new THREE.PerspectiveCamera(shot.fov, aspect, 0.3, 900);
      camera.position.copy(shot.position);
      camera.lookAt(shot.target);
      camera.updateMatrixWorld();
      const center = shot.target.clone().project(camera);
      assert.ok(Math.abs(center.x) < 1e-8 && Math.abs(center.y) < 1e-8);
    }
  assert.deepEqual(point.toArray(), before);
});

test("cinematic travel preserves exact endpoints and adds roof clearance during long transfers", () => {
  const from = new THREE.Vector3(-22, 22, 8);
  const to = new THREE.Vector3(30, 25, -61);
  const lift = cinematicRouteLift(from, to);
  assert.ok(lift > 10 && lift <= 22);
  assert.ok(sampleCinematicPosition(from, to, 0, lift).distanceTo(from) < 1e-8);
  assert.ok(sampleCinematicPosition(from, to, 1, lift).distanceTo(to) < 1e-8);
  let previous = from.clone();
  for (let step = 0; step <= 100; step++) {
    const position = sampleCinematicPosition(from, to, step / 100, lift);
    assert.ok(position.y >= Math.min(from.y, to.y));
    assert.ok(position.distanceTo(previous) < 3);
    previous = position;
  }
  const epsilon = 0.0001;
  assert.ok(sampleCinematicPosition(from, to, epsilon, lift).distanceTo(from) / epsilon < 0.1);
  assert.ok(sampleCinematicPosition(from, to, 1 - epsilon, lift).distanceTo(to) / epsilon < 0.1);
});

test("idle parallax stays restrained, continuous and allocation-free when passed an output vector", () => {
  const position = new THREE.Vector3(40, 70, 100);
  const target = new THREE.Vector3(0, 2, -20);
  const output = new THREE.Vector3();
  const reference = position.toArray();
  assert.equal(sampleCinematicIdle(position, target, 0, output), output);
  assert.ok(output.distanceTo(position) < 1e-8);
  for (let seconds = 0; seconds < 600; seconds++) {
    sampleCinematicIdle(position, target, seconds, output);
    assert.ok(output.distanceTo(position) / position.distanceTo(target) < 0.025);
    assert.ok(Math.abs(output.y - position.y) <= 0.5);
  }
  assert.deepEqual(position.toArray(), reference);
});
