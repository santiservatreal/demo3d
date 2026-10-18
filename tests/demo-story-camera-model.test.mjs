import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { cinematicStoryShot, cinematicTargetShot, projectCinematicAnchor } from "../src/city/presentation-camera.js";

function cameraFor(shot, aspect) {
  const camera = new THREE.PerspectiveCamera(shot.fov, aspect, 0.3, 900);
  camera.position.copy(shot.position);
  camera.lookAt(shot.target);
  camera.updateMatrixWorld();
  return camera;
}

test("construction street shots keep a low eye in the avenue and frame the complete tower", () => {
  for (const aspect of [16 / 9, 390 / 844]) {
    const origin = new THREE.Vector3(11.3, 0.3, -17);
    const shot = cinematicStoryShot(origin, { aspect, crane: true, height: 8.3, phase: "deconstruct" });
    assert.equal(shot.position.z, -9);
    assert.ok(shot.position.y >= 4 && shot.position.y < 8);
    assert.ok(shot.position.distanceTo(shot.target) < 17);
    const camera = cameraFor(shot, aspect);
    for (const y of [0.3, 8.8, 11.2]) {
      const point = new THREE.Vector3(origin.x, y, origin.z).project(camera);
      assert.ok(Math.abs(point.y) < 0.9, `${aspect}: ${point.toArray()}`);
      assert.ok(point.z > -1 && point.z < 1);
    }
    assert.deepEqual(origin.toArray(), [11.3, 0.3, -17]);
  }
});

test("rebuilding is photographed from the other side of the same safe street", () => {
  const point = new THREE.Vector3(29.5, 0.3, -3.4);
  const first = cinematicStoryShot(point, { phase: "deconstruct", crane: true });
  const second = cinematicStoryShot(point, { phase: "build", crane: true });
  assert.equal(first.position.z, -9);
  assert.equal(second.position.z, -9);
  assert.ok(first.position.x < point.x);
  assert.ok(second.position.x > point.x);
  const camera = cameraFor(second, 1.5);
  assert.ok(Math.abs(new THREE.Vector3(point.x, 11.2, point.z).project(camera).y) < 0.9);
});

test("tracking follows the road continuously without orbiting through the parcels", () => {
  let previous;
  for (let index = 0; index <= 100; index++) {
    const point = new THREE.Vector3(11 + index * 0.2, 0.3, -9);
    const shot = cinematicStoryShot(point, { mode: "follow" });
    assert.equal(shot.position.z, -6.2);
    assert.ok(shot.position.y < 6);
    assert.ok(shot.position.distanceTo(shot.target) < 10);
    if (previous) assert.ok(shot.position.distanceTo(previous) < 0.21);
    previous = shot.position;
  }
});

test("industrial entrances and the delivery route retain a close, unobstructed forecourt", () => {
  for (const x of [-28, -14, 0, 14, 28]) {
    const shot = cinematicStoryShot(new THREE.Vector3(x, 2.5, -62.3), { context: "industry" });
    assert.equal(shot.position.z, -52.8);
    assert.equal(shot.position.y, 5.3);
    assert.ok(shot.position.distanceTo(shot.target) < 12);
    assert.equal(shot.target.y, 2.8);
  }
  const truck = cinematicStoryShot(new THREE.Vector3(20, 0.3, -57.5), { context: "industry", mode: "follow" });
  assert.equal(truck.position.z, -54.4);
  assert.ok(truck.position.y < 6);
});

test("celebration includes roof, ground and airborne confetti in desktop and portrait", () => {
  for (const aspect of [16 / 9, 390 / 844]) {
    const point = new THREE.Vector3(29.5, 0.3, -3.4);
    const shot = cinematicStoryShot(point, { mode: "celebration", aspect, height: 8.3, phase: "complete" });
    const camera = cameraFor(shot, aspect);
    for (const y of [0.3, 8.8, 14]) {
      const ndc = new THREE.Vector3(point.x, y, point.z).project(camera);
      assert.ok(Math.abs(ndc.y) < 0.9, `${aspect}: ${ndc.toArray()}`);
    }
  }
});

test("anchor projection uses client coordinates and rejects points behind the camera", () => {
  const camera = new THREE.PerspectiveCamera(60, 2, 0.3, 100);
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 5, 0);
  camera.updateMatrixWorld();
  const viewport = { width: 800, height: 400, left: 10, top: 20 };
  const center = projectCinematicAnchor(new THREE.Vector3(0, 5, 0), camera, viewport);
  assert.equal(center.x, 410);
  assert.equal(center.y, 220);
  assert.equal(center.visible, true);
  assert.equal(projectCinematicAnchor(new THREE.Vector3(0, 5, 12), camera, viewport).visible, false);
  assert.equal(projectCinematicAnchor(new THREE.Vector3(100, 5, 0), camera, viewport).visible, false);
});

test("the live agent close shot keeps its original roof clearance and lens", () => {
  const shot = cinematicTargetShot(new THREE.Vector3(12, 0.3, -17), { clearance: 21 });
  assert.ok(shot.position.y >= 21);
  assert.equal(shot.fov, 35);
  assert.ok(shot.position.distanceTo(shot.target) >= 23);
});
