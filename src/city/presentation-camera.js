import * as THREE from "three";

export const CINEMATIC_FOV = 35;
const clamp = THREE.MathUtils.clamp;
const directionFor = (id) => new THREE.Vector3(...({
  all: [0.45, 0.92, 1],
  sales: [-0.3, 0.78, 1],
  communications: [0.18, 0.68, 1],
  industry: [0.4, 0.74, 1],
}[id] || [0.48, 0.72, 1])).normalize();

/** Fit the actual box in a perspective camera, including depth foreshortening. */
export function cinematicBoundsShot(bounds, {
  id = "all", aspect = 1.5, clearance = 18, fov = CINEMATIC_FOV,
} = {}) {
  const target = new THREE.Vector3(
    (bounds.minX + bounds.maxX) / 2,
    Math.max(1.5, (bounds.minY + bounds.maxY) / 2),
    (bounds.minZ + bounds.maxZ) / 2,
  );
  const direction = directionFor(id);
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const tanVertical = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const tanHorizontal = tanVertical * Math.max(0.3, aspect);
  let distance = 1;
  for (const x of [bounds.minX, bounds.maxX])
    for (const y of [bounds.minY, bounds.maxY])
      for (const z of [bounds.minZ, bounds.maxZ]) {
        const point = new THREE.Vector3(x, y, z).sub(target);
        const depth = point.dot(direction);
        distance = Math.max(distance,
          depth + Math.abs(point.dot(right)) / tanHorizontal,
          depth + Math.abs(point.dot(up)) / tanVertical);
      }
  distance *= 1.13;
  const position = target.clone().addScaledVector(direction, distance);
  position.y = Math.max(clearance, position.y);
  return { id, kind: "district", position, target, fov };
}

/** Close shots retain roof clearance; they never enter a building or truck. */
export function cinematicTargetShot(point, {
  kind = "deal", id = "", height = 6, radius = 4,
  clearance = 18, aspect = 1.5, fov = CINEMATIC_FOV,
} = {}) {
  const subjectHeight = Math.max(0.8, height);
  const target = point.clone();
  if (kind === "deal" || kind === "account") target.y += subjectHeight * 0.42;
  else if (kind === "owner") target.y += 0.9;
  else if (kind === "industry-stage") target.y = 3.4;
  else if (kind === "communication") target.y = 2.4;
  else target.y = Math.max(1, target.y);
  const direction = directionFor(kind === "industry-stage" ? "industry" : "close");
  const portrait = Math.max(1, 0.9 / Math.max(0.3, aspect));
  const distance = Math.max(kind === "owner" ? 18 : 23,
    subjectHeight * 2.1, radius * 3.8) * portrait;
  const position = target.clone().addScaledVector(direction, distance);
  position.y = Math.max(clearance, target.y + 10, position.y);
  return { id, kind, position, target, fov };
}

export function cinematicRouteLift(from, to) {
  // Long transfers pass above the blocks; close movements remain restrained.
  const horizontal = Math.hypot(to.x - from.x, to.z - from.z);
  return clamp(horizontal * 0.18, 0, 22);
}

export function sampleCinematicPosition(from, to, progress, lift = 0, output = new THREE.Vector3()) {
  const t = clamp(progress, 0, 1);
  const smooth = t * t * t * (t * (t * 6 - 15) + 10);
  output.lerpVectors(from, to, smooth);
  output.y += Math.sin(Math.PI * t) ** 2 * lift;
  return output;
}

export function sampleCinematicIdle(position, target, seconds, output = new THREE.Vector3()) {
  const angle = Math.sin(seconds * 0.07) * 0.022;
  const x = position.x - target.x, z = position.z - target.z;
  output.set(target.x + x * Math.cos(angle) - z * Math.sin(angle),
    position.y + Math.sin(seconds * 0.05) * Math.min(0.5, position.distanceTo(target) * 0.007),
    target.z + x * Math.sin(angle) + z * Math.cos(angle));
  return output;
}
