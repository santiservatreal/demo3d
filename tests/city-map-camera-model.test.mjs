import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  configureMapControls,
  fitMapBounds,
  fixedMapOffset,
  ownerBadgeAnchor,
} from "../src/city/map-camera.js";

test("map controls permit pan and zoom without a mouse or touch rotation path", () => {
  const controls = { mouseButtons: {}, touches: {} };
  configureMapControls(controls);
  assert.equal(controls.enableRotate, false);
  assert.equal(controls.enablePan, true);
  assert.equal(controls.enableZoom, true);
  assert.equal(controls.minPolarAngle, controls.maxPolarAngle);
  assert.equal(controls.minAzimuthAngle, controls.maxAzimuthAngle);
  assert.deepEqual(controls.mouseButtons, {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  });
  assert.equal(controls.touches.ONE, THREE.TOUCH.PAN);
  assert.equal(controls.touches.TWO, THREE.TOUCH.DOLLY_PAN);
});

test("overview and close-up offsets retain the same isometric bearing", () => {
  const canonical = fixedMapOffset().normalize();
  for (const distance of [60, 90, 100, 160]) {
    const offset = fixedMapOffset(distance);
    assert.ok(Math.abs(offset.length() - distance) < 1e-10);
    assert.ok(offset.clone().normalize().distanceTo(canonical) < 1e-10);
  }
  const controls = { mouseButtons: {}, touches: {} };
  configureMapControls(controls);
  const spherical = new THREE.Spherical().setFromVector3(fixedMapOffset());
  assert.ok(Math.abs(spherical.phi - controls.minPolarAngle) < 1e-10);
  assert.ok(Math.abs(spherical.theta - controls.minAzimuthAngle) < 1e-10);
});

test("initials sit on the pavement behind the person without mutating its position", () => {
  const position = new THREE.Vector3(12, 0.32, -7);
  const original = position.clone();
  const anchor = ownerBadgeAnchor(position);
  assert.ok(position.equals(original));
  assert.equal(anchor.y, position.y);
  const towardCamera = fixedMapOffset();
  towardCamera.y = 0;
  assert.ok(anchor.clone().sub(position).dot(towardCamera) < 0);
  const right = new THREE.Vector3(towardCamera.z, 0, -towardCamera.x);
  assert.ok(anchor.clone().sub(position).dot(right) > 0);
});

test("the fixed bearing fits each whole district inside the available desktop, mobile and TV map", () => {
  for (const [minZ, maxZ, maxY] of [
    [-26.5, 26.5, 12],
    [-44, -27, 12],
    [-74, -49, 8],
    [-74, 26.5, 14],
  ]) {
    const bounds = { minX: -38.5, maxX: 38.5, minY: -1.5, maxY, minZ, maxZ };
    for (const [width, height, padding] of [
      [1100, 300, { top: 16, bottom: 40 }],
      [365, 260, { top: 16, bottom: 40 }],
      [1440, 900, { top: 132, bottom: 96 }],
      [390, 844, { top: 210, bottom: 120 }],
    ]) {
      const fit = fitMapBounds(bounds, width, height, padding);
      const camera = new THREE.OrthographicCamera(
        (-fit.vertical * width) / height / 2,
        (fit.vertical * width) / height / 2,
        fit.vertical / 2 + fit.center,
        -fit.vertical / 2 + fit.center,
        0.1,
        350,
      );
      const target = new THREE.Vector3(
        0,
        (bounds.minY + bounds.maxY) / 2,
        (minZ + maxZ) / 2,
      );
      camera.position.copy(target).add(fixedMapOffset());
      camera.lookAt(target);
      camera.updateMatrixWorld();
      for (const x of [bounds.minX, bounds.maxX])
        for (const y of [bounds.minY, bounds.maxY])
          for (const z of [bounds.minZ, bounds.maxZ]) {
            const point = new THREE.Vector3(x, y, z).project(camera);
            const px = (point.x * 0.5 + 0.5) * width;
            const py = (-point.y * 0.5 + 0.5) * height;
            assert.ok(px >= 16 - 1e-8 && px <= width - 16 + 1e-8);
            assert.ok(
              py >= padding.top - 1e-8 && py <= height - padding.bottom + 1e-8,
            );
          }
    }
  }
});
