import * as THREE from "three";

// Every view uses this single bearing: navigation only translates or scales it.
const direction = new THREE.Vector3(54, 55, 68);
const unitDirection = direction.clone().normalize();
const groundAway = new THREE.Vector3(-54, 0, -68).normalize();
const groundRight = new THREE.Vector3(68, 0, -54).normalize();

export function fixedMapOffset(distance = direction.length()) {
  return unitDirection.clone().multiplyScalar(distance);
}

export function fitMapBounds(
  bounds,
  width,
  height,
  { top = 16, bottom = 40, side = 16 } = {},
) {
  const right = groundRight.clone();
  const up = new THREE.Vector3().crossVectors(unitDirection, right).normalize();
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const x of [bounds.minX, bounds.maxX])
    for (const y of [bounds.minY, bounds.maxY])
      for (const z of [bounds.minZ, bounds.maxZ]) {
        const point = new THREE.Vector3(x, y, z);
        const px = point.dot(right),
          py = point.dot(up);
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
  const scale = Math.min(
    Math.max(1, width - side * 2) / (maxX - minX),
    Math.max(1, height - top - bottom) / (maxY - minY),
  );
  return { vertical: height / scale, center: (top - bottom) / (2 * scale) };
}

export function configureMapControls(controls) {
  const polar = Math.acos(unitDirection.y);
  const azimuth = Math.atan2(unitDirection.x, unitDirection.z);
  controls.enableRotate = false;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.screenSpacePanning = true;
  controls.minPolarAngle = controls.maxPolarAngle = polar;
  controls.minAzimuthAngle = controls.maxAzimuthAngle = azimuth;
  controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
  controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  controls.touches.ONE = THREE.TOUCH.PAN;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
}

export function ownerBadgeAnchor(position) {
  // The badge follows the pavement behind the person, with a small lateral
  // separation. It never follows an elevated head/roof anchor.
  return position
    .clone()
    .addScaledVector(groundAway, 3.1)
    .addScaledVector(groundRight, 1.6);
}
