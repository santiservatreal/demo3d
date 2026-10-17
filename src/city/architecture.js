import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Original, reusable architecture. A shared instanced kit keeps geometry and materials
// independent from CRM identities: moving a deal only changes its instance matrices.
export const HEIGHT_SCALE = {
  min: 1.8,
  max: 8.8,
  referenceAmount: 10000,
  referenceHeight: 6,
  unknownHeight: 4,
};
export function dealHeight(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount))
    return HEIGHT_SCALE.unknownHeight;
  return Math.max(
    2.2,
    Math.min(
      8.8,
      1.8 + Math.sqrt(Math.max(0, Number(amount) || 0) / 10000) * 4.2,
    ),
  );
}
const palette = {
  ivory: "#edece2",
  white: "#fcfcf5",
  trim: "#d7ddcf",
  glass: "#76adc2",
  dark: "#526b71",
  metal: "#8f9e96",
  roof: "#b7c8bd",
  soil: "#a98d6a",
  leaf: "#78aa63",
  leafLight: "#a0c778",
  wood: "#b9a17e",
  concrete: "#dedfd4",
  accent: "#37aa9c",
};
const tmp = new THREE.Object3D();
function matrix(p, s, rotation = 0) {
  tmp.position.set(...p);
  tmp.scale.set(...s);
  tmp.rotation.set(0, rotation, 0);
  tmp.updateMatrix();
  return tmp.matrix.clone();
}
function add(parts, key, p, s, color, rotation = 0) {
  parts.push({ key, matrix: matrix(p, s, rotation), color });
}
function box(parts, key, x, y, z, w, h, d, color, rot = 0) {
  add(parts, key, [x, y, z], [w, h, d], color, rot);
}
function planter(parts, x, y, z, w = 0.55, d = 0.45) {
  box(parts, "trim", x, y + 0.12, z, w, 0.24, d, "#e2e4d7");
  box(parts, "soil", x, y + 0.25, z, w * 0.82, 0.045, d * 0.8);
  add(parts, "leaf", [x, y + 0.42, z], [w * 0.58, 0.35, d * 0.58], "#82b46d");
}

export function buildingParts({
  id,
  amount = null,
  client = false,
  variant = 0,
}) {
  const parts = [],
    h = client ? 2.8 + (variant % 3) * 0.65 : dealHeight(amount),
    w = client ? 3.1 : 3.45,
    d = client ? 2.7 : 3.35;
  const n = client ? 2 : Math.max(2, Math.round((h - 0.45) / 1.36)),
    story = (h - 0.45) / n,
    style = variant % 4;
  box(parts, "trim", 0, 0.22, 0, w + 0.22, 0.24, d + 0.22, "#e0e0d3");
  box(
    parts,
    "mass",
    0,
    0.54,
    0,
    w,
    0.48,
    d,
    variant % 2 ? "#f2f0e5" : "#edece2",
  );
  // Recessed ground floor, a door, and a small projecting canopy.
  box(
    parts,
    "glass",
    -0.5,
    0.68,
    d / 2 + 0.035,
    w * 0.43,
    0.76,
    0.055,
    "#5f8185",
  );
  box(parts, "trim", -0.5, 1.09, d / 2 + 0.12, w * 0.49, 0.1, 0.26);
  box(parts, "glass", 0.8, 0.66, d / 2 + 0.045, 0.56, 0.78, 0.065, "#66888b");
  box(parts, "metal", 0.94, 0.66, d / 2 + 0.089, 0.035, 0.62, 0.035);
  box(parts, "accent", 0, 1.13, d / 2 + 0.21, w + 0.18, 0.11, 0.55);
  const topY = 0.45 + n * story;
  for (let floor = 0; floor < n; floor++) {
    const bottom = 0.45 + floor * story,
      cy = bottom + story / 2;
    const setback =
      style === 1 && floor === n - 1
        ? 0.48
        : style === 2 && floor >= n - 2
          ? 0.18
          : 0;
    const fw = w - setback * 2,
      fd = d - setback * 1.6;
    box(
      parts,
      "mass",
      0,
      cy,
      0,
      fw,
      story - 0.085,
      fd,
      variant % 3 === 0 ? "#f5f2e9" : "#edece2",
    );
    box(
      parts,
      "trim",
      0,
      bottom + 0.035,
      0,
      fw + 0.2,
      0.12,
      fd + 0.2,
      "#faf9f1",
    );
    // Thin vertical jambs and deep lintels frame real glass geometry on four sides.
    for (const sign of [-1, 1]) {
      for (const col of [-1, 1]) {
        const wx = col * fw * 0.255,
          wz = sign * (fd / 2 + 0.028),
          wh = Math.max(0.45, story * 0.58),
          wy = cy + 0.035;
        box(parts, "dark", wx, wy, wz, fw * 0.31, wh, 0.065, "#779799");
        box(
          parts,
          "glass",
          wx,
          wy,
          wz + sign * 0.043,
          fw * 0.255,
          wh * 0.83,
          0.035,
          floor % 2 ? "#7eb2c2" : "#93bdd1",
        );
        for (const side of [-1, 1])
          box(
            parts,
            "trim",
            wx + side * fw * 0.169,
            wy,
            wz + sign * 0.065,
            0.075,
            wh + 0.13,
            0.16,
            "#f9f7ed",
          );
        box(
          parts,
          "trim",
          wx,
          wy + wh / 2 + 0.04,
          wz + sign * 0.065,
          fw * 0.36,
          0.08,
          0.18,
        );
        box(
          parts,
          "trim",
          wx,
          wy - wh / 2 - 0.04,
          wz + sign * 0.07,
          fw * 0.36,
          0.08,
          0.23,
        );
        if (style !== 3 && floor > 0 && (floor + col + sign) % 2 === 0) {
          const bz = sign * (fd / 2 + 0.32),
            bw = fw * 0.4;
          box(parts, "trim", wx, bottom + 0.19, bz, bw, 0.115, 0.72, "#f7f5eb");
          box(
            parts,
            "metal",
            wx,
            bottom + 0.59,
            sign * (fd / 2 + 0.65),
            bw,
            0.045,
            0.035,
          );
          for (const k of [-1, 0, 1])
            box(
              parts,
              "metal",
              wx + k * bw * 0.46,
              bottom + 0.4,
              sign * (fd / 2 + 0.65),
              0.025,
              0.37,
              0.025,
            );
          if (floor === n - 1)
            planter(
              parts,
              wx,
              bottom + 0.25,
              sign * (fd / 2 + 0.36),
              0.44,
              0.31,
            );
        }
      }
      for (const col of [-1, 1]) {
        const z = col * fd * 0.255,
          x = sign * (fw / 2 + 0.035),
          wh = story * 0.57;
        box(parts, "dark", x, cy + 0.035, z, 0.06, wh, fd * 0.3, "#7e9b9c");
        box(
          parts,
          "glass",
          x + sign * 0.035,
          cy + 0.035,
          z,
          0.035,
          wh * 0.8,
          fd * 0.24,
          "#93bdd1",
        );
        for (const k of [-1, 1])
          box(
            parts,
            "trim",
            x + sign * 0.06,
            cy + 0.035,
            z + k * fd * 0.164,
            0.16,
            wh + 0.12,
            0.07,
          );
        box(
          parts,
          "trim",
          x + sign * 0.065,
          cy + wh / 2 + 0.07,
          z,
          0.18,
          0.075,
          fd * 0.35,
        );
        box(
          parts,
          "trim",
          x + sign * 0.065,
          cy - wh / 2 - 0.005,
          z,
          0.21,
          0.08,
          fd * 0.35,
        );
      }
    }
    // Stage colour is an accent band, never the complete building.
    if (floor === 1 || floor === n - 1)
      box(
        parts,
        "accent",
        0,
        bottom + 0.12,
        fd / 2 + 0.08,
        fw + 0.08,
        0.09,
        0.12,
      );
  }
  const rw = style === 1 ? w - 0.8 : w + 0.15,
    rd = style === 1 ? d - 0.55 : d + 0.15;
  box(parts, "roof", 0, topY + 0.055, 0, rw, 0.13, rd, "#bac9bc");
  for (const sign of [-1, 1]) {
    box(parts, "trim", 0, topY + 0.24, (sign * rd) / 2, rw + 0.17, 0.32, 0.12);
    box(parts, "trim", (sign * rw) / 2, topY + 0.24, 0, 0.12, 0.32, rd + 0.14);
  }
  // Legible roof silhouettes: pergola, stair enclosure, planted terrace, skylight.
  if (style === 0 || style === 2) {
    box(parts, "mass", -0.55, topY + 0.43, -0.4, 1.08, 0.76, 1.03, "#e8e8db");
    box(parts, "accent", -0.55, topY + 0.85, -0.4, 1.18, 0.11, 1.13);
    box(parts, "glass", 0.62, topY + 0.17, -0.38, 0.84, 0.13, 1.02, "#7b969a");
    for (const x of [-0.9, -0.3, 0.3, 0.9])
      box(parts, "trim", x, topY + 0.14, 0.74, 0.04, 0.14, 0.8);
    planter(parts, -0.86, topY + 0.12, 0.98, 0.75, 0.38);
    planter(parts, 0.55, topY + 0.12, 1.03, 0.72, 0.36);
  } else {
    for (const x of [-0.8, 0.8])
      for (const z of [-0.75, 0.5])
        box(parts, "wood", x, topY + 0.54, z, 0.065, 0.92, 0.065);
    for (const z of [-0.78, -0.46, -0.14, 0.18, 0.5])
      box(parts, "wood", 0, topY + 1.02, z, 1.9, 0.08, 0.08);
    box(parts, "trim", 0, topY + 0.22, -0.18, 0.8, 0.19, 0.8, "#e7e6d8");
    planter(parts, -0.95, topY + 0.13, 0.93, 0.65, 0.42);
    planter(parts, 0.94, topY + 0.13, 0.93, 0.65, 0.42);
  }
  return { parts, height: topY + 1.07, width: w, depth: d };
}

export function createArchitecture(scene) {
  const geometries = {
    mass: new RoundedBoxGeometry(1, 1, 1, 2, 0.035),
    trim: new THREE.BoxGeometry(1, 1, 1),
    glass: new THREE.BoxGeometry(1, 1, 1),
    dark: new THREE.BoxGeometry(1, 1, 1),
    metal: new THREE.BoxGeometry(1, 1, 1),
    roof: new THREE.BoxGeometry(1, 1, 1),
    accent: new THREE.BoxGeometry(1, 1, 1),
    soil: new THREE.BoxGeometry(1, 1, 1),
    leaf: new THREE.IcosahedronGeometry(0.5, 1),
    wood: new THREE.BoxGeometry(1, 1, 1),
    concrete: new THREE.BoxGeometry(1, 1, 1),
  };
  const materials = Object.fromEntries(
    Object.entries(palette).map(([key, color]) => [
      key,
      new THREE.MeshStandardMaterial({
        name: `city-${key}`,
        color: "#ffffff",
        roughness: key === "glass" ? 0.27 : key === "metal" ? 0.55 : 0.84,
        metalness: key === "glass" ? 0.15 : 0,
      }),
    ]),
  );
  const entities = new Map(),
    buckets = new Map(),
    meshes = [],
    idByMesh = new Map();
  let built = false;
  const root = new THREE.Group();
  root.name = "Original modular Atlas architecture";
  scene.add(root);
  function addEntity(spec, position) {
    const model = buildingParts(spec),
      group = new THREE.Group();
    group.name = spec.id;
    group.position.copy(position);
    group.userData = { entityId: spec.id, height: model.height };
    const e = {
      id: spec.id,
      group,
      model,
      baseHeight: dealHeight(spec.amount),
      refs: [],
      spans: new Map(),
      accent: spec.accent || "#73a99a",
      visible: true,
      scaleY: 1,
      scaleXZ: 1,
      buildProgress: 1,
      uploadedWorld: null,
      uploadedAccent: null,
      uploadedBuildProgress: null,
    };
    entities.set(spec.id, e);
    for (const part of model.parts) {
      let bucket = buckets.get(part.key);
      if (!bucket) buckets.set(part.key, (bucket = []));
      const list = Array.isArray(bucket) ? bucket : bucket.entries;
      const index = list.length;
      list.push({ entity: e, part });
      const span = e.spans.get(part.key);
      if (span) span.count++;
      else e.spans.set(part.key, { start: index, count: 1 });
      const localPosition = new THREE.Vector3(),
        localQuaternion = new THREE.Quaternion(),
        localScale = new THREE.Vector3();
      part.matrix.decompose(localPosition, localQuaternion, localScale);
      e.refs.push({
        key: part.key,
        index,
        part,
        localPosition,
        localQuaternion,
        localScale,
      });
      if (built) {
        bucket.mesh.count = list.length;
        idByMesh.get(bucket.mesh).push(e.id);
      }
    }
    if (built) updateEntity(e.id);
    return e;
  }
  function build() {
    for (const [key, entries] of buckets) {
      const mesh = new THREE.InstancedMesh(
        geometries[key],
        materials[key],
        entries.length + 4096,
      );
      mesh.name = `city-kit-${key}`;
      mesh.count = entries.length;
      mesh.instanceMatrix
        .setUsage(THREE.DynamicDrawUsage)
        .onUpload(clearUploadedRanges);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(mesh.instanceMatrix.count * 3).fill(1),
        3,
      )
        .setUsage(THREE.DynamicDrawUsage)
        .onUpload(clearUploadedRanges);
      mesh.castShadow = !["glass", "metal", "leaf", "soil"].includes(key);
      mesh.receiveShadow = true;
      mesh.userData.isArchitecture = true;
      root.add(mesh);
      meshes.push(mesh);
      idByMesh.set(
        mesh,
        entries.map((e) => e.entity.id),
      );
      buckets.set(key, { entries, mesh });
    }
    built = true;
    for (const e of entities.values()) updateEntity(e.id);
    for (const m of meshes) m.computeBoundingSphere();
  }
  function clearUploadedRanges() {
    // Initial WebGL bufferData also invokes this callback; Three only clears
    // updateRanges itself on subsequent bufferSubData uploads.
    this.clearUpdateRanges();
  }
  const world = new THREE.Matrix4(),
    s = new THREE.Vector3(),
    c = new THREE.Color(),
    accentColor = new THREE.Color(),
    partMatrix = new THREE.Matrix4(),
    instanceMatrix = new THREE.Matrix4(),
    piecePosition = new THREE.Vector3();
  function dirtyRange(attribute, start, count) {
    // Three clears these ranges after an upload. Merge pending edits as well, so
    // a paused renderer (or Node consumer) never accumulates a range per frame.
    const ranges = attribute.updateRanges;
    let index = 0,
      end = start + count;
    while (
      index < ranges.length &&
      ranges[index].start + ranges[index].count < start
    )
      index++;
    if (index === ranges.length) attribute.addUpdateRange(start, count);
    else if (end < ranges[index].start) {
      attribute.addUpdateRange(start, count);
      ranges.splice(index, 0, ranges.pop());
    } else {
      const range = ranges[index];
      end = Math.max(end, range.start + range.count);
      range.start = Math.min(start, range.start);
      while (index + 1 < ranges.length && ranges[index + 1].start <= end) {
        const next = ranges[index + 1];
        end = Math.max(end, next.start + next.count);
        ranges.splice(index + 1, 1);
      }
      range.count = end - range.start;
    }
    attribute.needsUpdate = true;
  }
  function updateEntity(id, options = {}) {
    const e = entities.get(id);
    if (!e) return;
    if (options.position) e.group.position.copy(options.position);
    if (options.accent) e.accent = options.accent;
    if (options.visible !== undefined) e.visible = options.visible;
    if (options.scaleY) e.scaleY = options.scaleY;
    if (options.scaleXZ) e.scaleXZ = options.scaleXZ;
    if (options.buildProgress !== undefined)
      e.buildProgress = THREE.MathUtils.clamp(options.buildProgress, 0, 1);
    if (!built) return;
    e.group.scale.set(e.scaleXZ, e.scaleY, e.scaleXZ);
    e.group.updateMatrix();
    world.copy(e.group.matrix);
    if (!e.visible) world.scale(s.set(0, 0, 0));
    const matricesChanged =
        !e.uploadedWorld ||
        !e.uploadedWorld.equals(world) ||
        e.uploadedBuildProgress !== e.buildProgress,
      initializeColors = !e.uploadedAccent;
    accentColor.set(e.accent);
    const accentChanged =
      initializeColors || !e.uploadedAccent.equals(accentColor);
    if (!matricesChanged && !accentChanged) return;
    for (const r of e.refs) {
      if (!matricesChanged && !initializeColors && r.key !== "accent") continue;
      const b = buckets.get(r.key);
      if (matricesChanged) {
        if (e.buildProgress >= 1) partMatrix.copy(r.part.matrix);
        else {
          // Pieces are lowered into place, bottom storeys first. Whole-building
          // height and footprint remain unchanged throughout the work sequence.
          const level = THREE.MathUtils.clamp(
              r.localPosition.y / e.model.height,
              0.02,
              0.97,
            ),
            reveal =
              e.buildProgress <= 0
                ? 0
                : THREE.MathUtils.clamp(
                    (e.buildProgress - level + 0.055) / 0.055,
                    0,
                    1,
                  ),
            smooth = reveal * reveal * (3 - 2 * reveal);
          piecePosition.copy(r.localPosition);
          piecePosition.y += (1 - smooth) * 1.35;
          partMatrix.compose(
            piecePosition,
            r.localQuaternion,
            reveal > 0 ? r.localScale : s.set(0, 0, 0),
          );
        }
        b.mesh.setMatrixAt(
          r.index,
          instanceMatrix.multiplyMatrices(world, partMatrix),
        );
      }
      if (initializeColors || (accentChanged && r.key === "accent")) {
        const color =
          r.key === "accent"
            ? accentColor
            : c.set(r.part.color || palette[r.key]);
        b.mesh.setColorAt(r.index, color);
      }
    }
    for (const [key, span] of e.spans) {
      const mesh = buckets.get(key).mesh;
      if (matricesChanged)
        dirtyRange(mesh.instanceMatrix, span.start * 16, span.count * 16);
      if (initializeColors || (accentChanged && key === "accent"))
        dirtyRange(mesh.instanceColor, span.start * 3, span.count * 3);
    }
    if (matricesChanged) {
      if (!e.uploadedWorld) e.uploadedWorld = new THREE.Matrix4();
      e.uploadedWorld.copy(world);
      e.uploadedBuildProgress = e.buildProgress;
    }
    if (!e.uploadedAccent) e.uploadedAccent = new THREE.Color();
    e.uploadedAccent.copy(accentColor);
  }
  function entityId(hit) {
    return idByMesh.get(hit.object)?.[hit.instanceId];
  }
  function setDetail(enabled) {
    for (const key of ["metal", "soil", "wood"]) {
      const b = buckets.get(key);
      if (b?.mesh) b.mesh.visible = enabled;
    }
  }
  function dispose() {
    root.removeFromParent();
    for (const g of Object.values(geometries)) g.dispose();
    for (const m of Object.values(materials)) m.dispose();
    for (const m of meshes) m.dispose();
  }
  return {
    addEntity,
    build,
    updateEntity,
    entities,
    entityId,
    meshes,
    root,
    setDetail,
    dispose,
  };
}
