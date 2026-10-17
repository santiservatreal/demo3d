import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import {
  COMMUNICATION_PLACES,
  communicationsSummary,
} from "./communications-model.js";
export {
  COMMUNICATION_PLACES,
  communicationsSummary,
  createDemoCommunicationActivities,
} from "./communications-model.js";

/** A small original architectural kit: four detailed places, one merged mesh each. */
export function createCommunicationsDistrict({
  scene,
  reducedMotion = false,
} = {}) {
  const root = new THREE.Group();
  root.name = "crm-communications-district";
  scene?.add(root);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.02,
  });
  const templates = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    sphere: new THREE.SphereGeometry(0.5, 10, 7),
    torus: new THREE.TorusGeometry(0.5, 0.11, 6, 16),
    cone: new THREE.ConeGeometry(0.5, 1, 4),
  };
  const parts = [];
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  function part(kind, p, scale, tint, rotation = [0, 0, 0]) {
    const geometry = templates[kind].clone();
    transform.position.set(...p);
    transform.scale.set(...scale);
    transform.rotation.set(...rotation);
    transform.updateMatrix();
    geometry.applyMatrix4(transform.matrix);
    color.set(tint);
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let index = 0; index < colors.length; index += 3)
      color.toArray(colors, index);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    // All templates have matching attributes; shared UVs/normals remain useful.
    parts.push(geometry);
  }
  const box = (x, y, z, w, h, d, tint, rotation) =>
    part("box", [x, y, z], [w, h, d], tint, rotation);
  const cylinder = (x, y, z, w, h, d, tint, rotation) =>
    part("cylinder", [x, y, z], [w, h, d], tint, rotation);
  function plant(x, z, tint = "#62b96d") {
    box(x, 0.45, z, 0.63, 0.35, 0.63, "#e7e7d8");
    part("sphere", [x, 0.9, z], [0.65, 0.8, 0.65], tint);
  }
  function frame(x, y, z, w = 0.85, h = 1) {
    box(x, y, z, w + 0.13, h + 0.13, 0.08, "#fffdf4");
    box(x, y, z + 0.055, w, h, 0.045, "#60b8d1");
    box(x, y, z + 0.09, 0.045, h, 0.035, "#f5f6ee");
  }
  function envelope(x, y, z, scale = 1, tint = "#ffffff") {
    box(x, y, z, 1.7 * scale, 1.03 * scale, 0.16, tint);
    // The raised V and lower folds make the envelope legible without a texture.
    const ink = "#2478b5";
    box(
      x - 0.38 * scale,
      y + 0.1 * scale,
      z + 0.1,
      0.88 * scale,
      0.055 * scale,
      0.045,
      ink,
      [0, 0, -0.48],
    );
    box(
      x + 0.38 * scale,
      y + 0.1 * scale,
      z + 0.1,
      0.88 * scale,
      0.055 * scale,
      0.045,
      ink,
      [0, 0, 0.48],
    );
  }
  function common(place, height, width = 4.5, depth = 3.8) {
    box(0, 0.1, 0.5, 10.5, 0.2, 9.4, "#dae5d9");
    box(0, 0.23, 0.5, 9.8, 0.08, 8.7, "#ecebdf");
    box(0, 0.42, 0, width + 0.3, 0.3, depth + 0.25, "#fdfcf4");
    box(0, height / 2 + 0.45, 0, width, height, depth, "#f7f4e8");
    box(0, 1.4, depth / 2 + 0.07, width + 0.18, 0.19, 0.2, place.color);
    box(0, height + 0.5, 0, width + 0.4, 0.22, depth + 0.35, place.color);
    box(0, height + 0.68, 0, width + 0.1, 0.16, depth + 0.1, "#fdfbf3");
    frame(0, 0.97, depth / 2 + 0.09, 0.76, 1.04);
    box(0.24, 0.97, depth / 2 + 0.2, 0.04, 0.48, 0.05, "#c3d3d4");
    for (const x of [-1.38, 1.38]) frame(x, 2.25, depth / 2 + 0.1, 0.86, 0.92);
    for (const sign of [-1, 1]) {
      box(sign * (width / 2 + 0.035), 2.2, 0, 0.07, 1, 2.4, "#66bbcc");
      box(sign * (width / 2 + 0.07), 2.2, 0, 0.06, 1.12, 0.1, "#ffffff");
      plant(sign * 4.2, 3.7);
      box(sign * 4.2, 0.43, -3.2, 1.1, 0.26, 0.85, "#e1d7bd");
      part("sphere", [sign * 4.2, 0.94, -3.2], [1, 0.85, 0.74], "#49a568");
    }
    box(0, 0.3, 3.65, 1.1, 0.045, 1.8, place.color);
  }
  function postOffice(place) {
    common(place, 3.1);
    box(0, 3.95, 0, 3.2, 0.85, 2.7, place.color);
    envelope(0, 4.23, 1.44, 1.25);
    for (const [x, tint] of [
      [-3.3, "#218dec"],
      [3.3, "#f3b72f"],
    ]) {
      box(x, 0.85, 2.2, 0.66, 1.23, 0.6, tint);
      box(x, 1.5, 2.2, 0.76, 0.14, 0.67, tint);
      box(x, 1.14, 2.53, 0.42, 0.07, 0.04, "#214c68");
      envelope(x, 0.83, 2.55, 0.22);
    }
    for (const x of [-1.4, 1.4]) {
      box(x, 0.7, 2.04, 1.12, 0.57, 0.12, "#eacb80");
      for (const column of [-0.34, 0, 0.34]) {
        box(x + column, 0.7, 2.12, 0.04, 0.53, 0.035, "#fff5ce");
        box(x + column + 0.09, 0.72, 2.14, 0.12, 0.04, 0.02, "#786d47");
      }
    }
  }
  function callCenter(place) {
    common(place, 3.8);
    box(0, 4.45, 0.2, 3.4, 0.35, 2.5, "#334b68");
    // Oversized architectural handset, held by an orange roof cradle.
    part("torus", [0, 5.25, 0.3], [2.2, 2.1, 1.2], place.color, [
      0,
      0,
      Math.PI / 2,
    ]);
    box(0, 4.78, 0.32, 1.5, 0.62, 0.7, "#334b68");
    for (const x of [-1, 1]) {
      part("sphere", [x, 4.94, 0.35], [0.64, 0.8, 0.8], "#f5b751");
      cylinder(x, 4.62, 0.35, 0.45, 0.24, 0.45, "#2d4961");
    }
    cylinder(1.6, 5.04, -1.1, 0.09, 1.4, 0.09, "#809eae");
    part("sphere", [1.6, 5.8, -1.1], [0.21, 0.21, 0.21], place.color);
    for (const x of [-1.2, 0, 1.2]) {
      box(x, 3.52, 2.01, 0.5, 0.34, 0.08, place.color);
      box(x, 3.52, 2.07, 0.31, 0.065, 0.02, "#fffdf3");
    }
    for (const x of [-3.4, 3.4]) {
      box(x, 0.5, 1.1, 0.48, 0.64, 0.48, "#576b79");
      box(x, 1.3, 1.1, 0.78, 1.14, 0.62, "#f7e5b2");
      box(x, 1.41, 1.44, 0.5, 0.58, 0.035, "#5db2ce");
      box(x, 0.98, 1.44, 0.32, 0.09, 0.035, "#586b77");
      box(x, 1.91, 1.1, 0.91, 0.13, 0.78, place.color);
    }
  }
  function messages(place) {
    common(place, 3.3);
    box(-0.65, 4.35, 0.2, 2.8, 1.6, 0.68, place.color);
    box(0.72, 3.99, 0.57, 1.65, 1.02, 0.51, "#77d1a3");
    part("cone", [-1.5, 3.48, 0.25], [0.8, 0.7, 0.7], place.color, [
      0,
      0,
      Math.PI,
    ]);
    for (const x of [-1.3, -0.65, 0])
      part("sphere", [x, 4.38, 0.57], [0.2, 0.2, 0.1], "#f7fff6");
    for (const x of [0.35, 0.75, 1.15])
      part("sphere", [x, 4, 0.87], [0.12, 0.12, 0.08], "#f7fff6");
    for (const [x, z, tint] of [
      [-3.4, 1.5, place.color],
      [3.4, 1.5, "#77d1a3"],
    ]) {
      box(x, 0.8, z, 0.83, 1.1, 0.3, "#294d4b");
      box(x, 0.87, z + 0.18, 0.67, 0.79, 0.045, tint);
      box(x - 0.08, 0.99, z + 0.22, 0.34, 0.045, 0.02, "#f6fff5");
      box(x + 0.08, 0.78, z + 0.22, 0.34, 0.045, 0.02, "#f6fff5");
      box(x, 0.3, z, 0.7, 0.12, 0.62, "#7e9a8c");
    }
  }
  function cafe(place) {
    common(place, 2.8, 4.8, 3.7);
    part("cone", [0, 3.85, 0], [7.2, 1.7, 5.8], "#b76854", [0, Math.PI / 4, 0]);
    box(0, 3.82, 0, 4.9, 0.18, 3.9, "#bd795e");
    // Cup with handle on a roof sign; striped fabric awning below.
    cylinder(0, 4.6, 0.55, 1.2, 0.9, 1.2, "#fffcf1");
    cylinder(0, 5.07, 0.55, 1.03, 0.05, 1.03, "#694f3a");
    part("torus", [0.65, 4.62, 0.55], [0.68, 0.68, 0.4], "#fffcf1");
    for (let stripe = 0; stripe < 9; stripe++) {
      const x = -2.24 + stripe * 0.56;
      box(
        x,
        2.16,
        2.3,
        0.55,
        0.11,
        1.2,
        stripe % 2 ? "#fff6e5" : place.color,
        [-0.18, 0, 0],
      );
      box(
        x,
        2.02,
        2.87,
        0.55,
        0.27,
        0.08,
        stripe % 2 ? "#fff6e5" : place.color,
      );
    }
    for (const x of [-2.58, 2.58])
      cylinder(x, 1.21, 2.77, 0.06, 1.85, 0.06, "#d1b49b");
    for (const [x, z] of [
      [-3.25, 0.4],
      [3.25, 0.4],
      [-2.65, 3.65],
      [2.65, 3.65],
    ]) {
      cylinder(x, 0.77, z, 1.05, 0.11, 1.05, "#cc9c64");
      cylinder(x, 0.49, z, 0.12, 0.52, 0.12, "#6a7771");
      cylinder(x, 0.27, z, 0.63, 0.08, 0.63, "#6a7771");
      for (const side of [-1, 1]) {
        box(x + side * 0.77, 0.49, z, 0.47, 0.09, 0.48, place.color);
        box(x + side * 0.94, 0.75, z, 0.08, 0.52, 0.48, place.color);
        for (const corner of [-1, 1])
          cylinder(
            x + side * 0.77,
            0.33,
            z + corner * 0.16,
            0.045,
            0.29,
            0.045,
            "#737b6c",
          );
      }
      cylinder(x + 0.18, 0.91, z, 0.13, 0.17, 0.13, "#fff9e5");
      cylinder(x - 0.15, 0.91, z, 0.12, 0.17, 0.12, "#fff9e5");
    }
    // A menu board beside the entrance is visual scenery, not a fictional CRM count.
    box(0.91, 0.71, 3, 0.76, 0.85, 0.12, "#c39a68", [-0.13, 0, 0]);
    box(0.91, 0.77, 3.09, 0.61, 0.57, 0.035, "#315c53");
    for (const y of [0.61, 0.76, 0.91])
      box(0.91, y, 3.12, 0.34, 0.025, 0.02, "#e8edce");
  }
  const buildings = new Map();
  for (const place of COMMUNICATION_PLACES) {
    const group = new THREE.Group();
    group.name = `communications-${place.id}`;
    group.position.set(place.x, 0.1, -35);
    group.userData.placeId = place.id;
    ({ email: postOffice, call: callCenter, messages, meeting: cafe })[
      place.id
    ](place);
    const geometry = mergeGeometries(parts, false);
    for (const item of parts) item.dispose();
    parts.length = 0;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.placeId = place.id;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    root.add(group);
    buildings.set(place.id, { group, mesh });
  }
  for (const geometry of Object.values(templates)) geometry.dispose();
  let rows = communicationsSummary({});
  let enabled = true;
  let disposed = false;
  function getPlaces() {
    return rows.map((row) => ({
      ...row,
      position: new THREE.Vector3(row.x, 6.3, -35),
      groundPosition: new THREE.Vector3(row.x, 0.1, -35),
    }));
  }
  return {
    sync(state) {
      if (!disposed) rows = communicationsSummary(state);
    },
    update() {
      /* Source-driven counts; scenery never fabricates activity. */
    },
    getPlaces,
    pickHit(ray) {
      if (disposed || !enabled) return null;
      const hits = ray.intersectObjects(
        [...buildings.values()].map((building) => building.mesh),
        false,
      );
      return hits.length
        ? { id: hits[0].object.userData.placeId, distance: hits[0].distance }
        : null;
    },
    setEnabled(value) {
      enabled = Boolean(value);
      root.visible = enabled;
    },
    debug() {
      return {
        enabled,
        disposed,
        reducedMotion,
        count: buildings.size,
        drawCalls: disposed ? 0 : buildings.size,
        places: getPlaces().map(
          ({ position, groundPosition, records, ...row }) => ({
            ...row,
            recordIds: records.map((record) => record.id),
            position: position.toArray(),
            groundPosition: groundPosition.toArray(),
          }),
        ),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { mesh } of buildings.values()) mesh.geometry.dispose();
      material.dispose();
      root.removeFromParent();
    },
  };
}
