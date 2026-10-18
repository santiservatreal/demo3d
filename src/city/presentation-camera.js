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

/**
 * Presentation-only street photography. The eye travels along the avenue in
 * front of a parcel instead of occupying the neighboring parcel. Wider lenses
 * keep the crane in frame while the eye stays near the building's upper floors.
 * The map and the live agent deliberately retain cinematicTargetShot above.
 */
export function cinematicStoryShot(point, {
  id = "", mode = "street", context = "sales", phase = "", height = 7,
  aspect = 1.5, progress = 0, crane = false,
} = {}) {
  const portrait = clamp(0.9 / Math.max(0.3, aspect), 1, 1.45);
  const t = clamp(Number(progress) || 0, 0, 1);
  const target = point.clone();
  const position = new THREE.Vector3();
  const industrial = context === "industry";
  let fov = 58;

  if (mode === "follow") {
    // Both roads have an unobstructed strip on the side of the vehicles. No
    // orbit around the truck can accidentally take the eye through a block.
    target.y = Math.max(1.25, point.y + 1.1);
    position.copy(point).add(new THREE.Vector3(-7.2 * portrait, 4.6, 3.1));
    if (!industrial) position.z = point.z < 0 ? -6.2 : 11.8;
    position.y = Math.max(4.3, position.y);
    fov = 54;
  } else if (industrial) {
    const forecourt = -53;
    target.y = mode === "celebration" ? 5 : 2.8;
    // The southern factory entrances all face the same clear avenue.
    position.set(point.x + (3.9 - t * 1.5) * portrait, 5.3,
      Math.max(forecourt, point.z + 9.5));
    if (mode === "celebration") {
      position.x = point.x - 8.5 * portrait;
      position.z = point.z + 11;
      position.y = 6.5;
      fov = 62;
    }
  } else if (context === "communications") {
    target.y = 2.3;
    position.copy(point).add(new THREE.Vector3(5.2 * portrait, 4.4, 9.8));
    fov = 52;
  } else {
    const roadZ = point.z < 0 ? -9 : 9;
    const rebuilding = phase === "build" || phase === "complete";
    // Stages are introduced at their first (leftmost) parcel. Approaching from
    // the left keeps its occupied neighbor out of the foreground in portrait.
    const side = rebuilding ? 1 : -1;
    const focusHeight = crane ? 5.45 : Math.max(2, height * 0.48);
    target.y = mode === "celebration" ? Math.max(6.6, height * 0.72) : focusHeight;
    position.set(point.x + side * (7.2 - t * 0.9) * portrait,
      crane ? 6.4 : Math.max(4.2, height * 0.57), roadZ);
    fov = crane ? 70 : 60;
    if (mode === "celebration") {
      // Look across the clear courtyard from the street's opposite side. The
      // extra headroom includes the burst above the roof, not just its base.
      position.x = point.x - 12 * portrait;
      position.y = 8;
      position.z = roadZ;
      fov = 76;
    }
  }

  // A very near parcel needs a little more along-street room for perspective;
  // this changes x only, preserving the safe z corridor and low eye height.
  if (mode !== "follow" && context === "sales") {
    const minimum = (crane ? 10.7 : 9.4) * portrait;
    const dz = Math.abs(position.z - target.z);
    const dx = Math.sqrt(Math.max(0, minimum * minimum - dz * dz));
    const sign = Math.sign(position.x - target.x) || 1;
    position.x = target.x + sign * Math.max(dx, Math.abs(position.x - target.x));
  }
  return { id, kind: "story", mode, context, position, target, fov };
}

/** Pure viewport projection used by the small, contextual DOM district signs. */
export function projectCinematicAnchor(point, camera, {
  width, height, left = 0, top = 0,
} = {}) {
  const projected = point.clone().project(camera);
  const finite = projected.toArray().every(Number.isFinite);
  const behind = point.clone().sub(camera.position)
    .dot(camera.getWorldDirection(new THREE.Vector3())) <= 0;
  return {
    x: left + (projected.x + 1) * width / 2,
    y: top + (1 - projected.y) * height / 2,
    depth: projected.z,
    visible: finite && !behind && projected.z >= -1 && projected.z <= 1 &&
      Math.abs(projected.x) < 1.08 && Math.abs(projected.y) < 1.08,
  };
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
