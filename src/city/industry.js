import * as THREE from "three";
import { INDUSTRY_STAGES, getVehicleProgress } from "./industry-model.js";

const STATION_X = [-28, -14, 0, 14, 28];
const BOX_LIMIT = 25;
const BATCH_LIMIT = 64;
const VISUAL_ROUTE_SECONDS = 90;
const UP = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const clamp = (value) => THREE.MathUtils.clamp(value, 0, 1);
const customerSlot = (lane = 0) => [28 + lane * 3.4, -58.1];

// A short, bounded road route. Fillets stay on the paved avenue; an estimate
// reaching its destination never confirms a delivery or changes inventory.
export function industrialRoute(returning = false, lane = 0) {
  const z = -53 + (returning ? -0.62 : 0.62) + lane * 0.16;
  const [customerX, customerZ] = customerSlot(lane);
  const points = returning
    ? [
        [customerX, customerZ],
        [customerX, z],
        [0, z],
        [0, -58.1],
      ]
    : [
        [0, -58.1],
        [0, z],
        [customerX, z],
        [customerX, customerZ],
      ];
  const vector = ([x, depth]) => new THREE.Vector3(x, 0.22, depth);
  const curve = new THREE.CurvePath();
  let previous = vector(points[0]);
  for (let index = 1; index < points.length - 1; index++) {
    const before = vector(points[index - 1]);
    const corner = vector(points[index]);
    const after = vector(points[index + 1]);
    const radius = Math.min(
      1.05,
      before.distanceTo(corner) * 0.3,
      corner.distanceTo(after) * 0.3,
    );
    const enter = corner
      .clone()
      .addScaledVector(before.sub(corner).normalize(), radius);
    const exit = corner
      .clone()
      .addScaledVector(after.sub(corner).normalize(), radius);
    curve.add(new THREE.LineCurve3(previous, enter));
    curve.add(new THREE.QuadraticBezierCurve3(enter, corner, exit));
    previous = exit;
  }
  curve.add(new THREE.LineCurve3(previous, vector(points.at(-1))));
  curve.updateArcLengths();
  return curve;
}

export function createIndustryDistrict({ scene, reducedMotion = false }) {
  const root = new THREE.Group();
  root.name =
    "Distrito industrial · cantidades del CRM, trayectos ilustrativos";
  root.userData = { industry: true, simulated: true, gps: false };
  scene.add(root);

  const resources = [];
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  const sphereGeometry = new THREE.SphereGeometry(0.5, 10, 7);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.5, 0);
  roofShape.lineTo(0.5, 0);
  roofShape.lineTo(-0.5, 1);
  roofShape.closePath();
  const roofGeometry = new THREE.ExtrudeGeometry(roofShape, {
    depth: 1,
    bevelEnabled: false,
  });
  roofGeometry.translate(0, 0, -0.5);
  resources.push(boxGeometry, cylinderGeometry, sphereGeometry, roofGeometry);
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.76,
    metalness: 0.06,
  });
  const glassMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.24,
    metalness: 0.3,
  });
  const roadMaterial = new THREE.MeshStandardMaterial({ roughness: 0.98 });
  const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
  resources.push(material, glassMaterial, roadMaterial, proxyMaterial);
  const geometry = {
    box: boxGeometry,
    cylinder: cylinderGeometry,
    sphere: sphereGeometry,
    roof: roofGeometry,
  };
  const staticParts = new Map();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const wheelTurn = new THREE.Quaternion().setFromAxisAngle(
    AXIS_Z,
    Math.PI / 2,
  );
  const wheelSpin = new THREE.Quaternion();
  const pickables = [];
  const batchProxies = new Map();
  const vehicleActors = new Map();
  let state = null;
  let lastElapsed = 0;
  let enabled = true;
  let disposed = false;

  function add(
    kind,
    x,
    y,
    z,
    width,
    height,
    depth,
    tint,
    rotation = 0,
    surface = "solid",
  ) {
    const key = `${kind}:${surface}`;
    if (!staticParts.has(key)) staticParts.set(key, []);
    staticParts
      .get(key)
      .push({ x, y, z, width, height, depth, tint, rotation });
  }
  function box(x, y, z, width, height, depth, tint, rotation = 0, surface) {
    add("box", x, y, z, width, height, depth, tint, rotation, surface);
  }
  function pillar(x, z, height = 3.7, tint = "#cbd5d5") {
    box(x, height / 2 + 0.3, z, 0.22, height, 0.22, tint);
    box(x, 0.36, z, 0.6, 0.22, 0.6, "#b5bfbc");
  }
  function windows(cx, z, width, height = 1.45, y = 2.6) {
    box(cx, y, z, width, height, 0.1, "#3f9bbf", 0, "glass");
    const count = Math.max(2, Math.round(width / 0.65));
    for (let index = 0; index <= count; index++)
      box(
        cx - width / 2 + (index / count) * width,
        y,
        z + 0.065,
        0.05,
        height + 0.12,
        0.06,
        "#e8f2ed",
      );
    box(cx, y, z + 0.065, width + 0.1, 0.055, 0.06, "#e8f2ed");
  }
  function belt(cx, cz, length, tint = "#4a5c62") {
    box(cx, 0.89, cz, length, 0.22, 1.12, tint);
    for (const side of [-1, 1]) {
      box(cx, 1.04, cz + side * 0.6, length + 0.15, 0.09, 0.08, "#b9c9cb");
      for (const offset of [-0.36, 0.36])
        box(
          cx + length * offset,
          0.58,
          cz + side * 0.4,
          0.12,
          0.6,
          0.12,
          "#75898b",
        );
    }
    for (let x = -length / 2 + 0.2; x < length / 2; x += 0.28)
      add(
        "cylinder",
        cx + x,
        1.025,
        cz,
        0.16,
        1.02,
        0.16,
        "#839d9f",
        Math.PI / 2,
      );
  }
  function tree(x, z) {
    add("cylinder", x, 0.85, z, 0.2, 1.55, 0.2, "#9b714d");
    add("sphere", x, 2.02, z, 1.6, 1.9, 1.6, "#39a75e");
    add("sphere", x + 0.35, 2.5, z - 0.12, 1.05, 1.2, 1.05, "#73c55c");
  }

  // The industrial quarter has its own walkable forecourt and bounded road
  // network. The city scene extends the island beneath it.
  box(0, 0.025, -61, 77, 0.15, 34, "#d8e2d2");
  for (const z of [-72, -53]) {
    box(0, 0.13, z, 72, 0.12, 4.7, "#526671", 0, "road");
    for (let x = -33; x <= 33; x += 3)
      box(x, 0.198, z, 1.25, 0.012, 0.08, "#ecedcf");
    for (const side of [-1, 1])
      box(0, 0.2, z + side * 2.43, 72, 0.2, 0.24, "#d8e1d6");
  }
  for (const x of [-35, 35]) {
    box(x, 0.132, -62.5, 3.7, 0.13, 19, "#526671", 0, "road");
    for (let z = -69; z < -55; z += 2.7)
      box(x, 0.201, z, 0.08, 0.012, 1.15, "#ecedcf");
  }
  for (const [index, x] of STATION_X.entries()) {
    const tint = INDUSTRY_STAGES[index].color;
    box(x, 0.18, -62.2, 12.6, 0.22, 15.9, "#edf0e5");
    box(x, 0.31, -68.9, 12.6, 0.12, 0.22, tint);
    box(x - 6.18, 0.31, -62.2, 0.18, 0.12, 13.2, tint);
    box(x + 6.18, 0.31, -62.2, 0.18, 0.12, 13.2, tint);
    box(x, 0.25, -49.1, 12.5, 0.25, 2.45, "#e8eddf");
    box(x, 0.4, -49.9, 11.6, 0.1, 0.18, tint);
    for (const side of [-1, 1]) tree(x + side * 5.65, -48.8);
    // Dedicated paved access from the avenue, with zebra crossings and bollards.
    box(x, 0.29, -56.6, 3.1, 0.08, 3.25, "#b9c6be");
    for (let offset = -1; offset <= 1; offset += 0.4)
      box(x + offset, 0.208, -53, 0.22, 0.012, 3.6, "#f4f3e8");
  }

  // Manufacturing: north-light sawtooth roof, glazed rear hall, open assembly
  // bay, machine housings, feed hoppers and a physical roller conveyor.
  {
    const x = STATION_X[0];
    box(x, 0.52, -63.2, 10.8, 0.45, 8.3, "#b8c4bc");
    box(x, 2.55, -66.55, 10.7, 4.1, 1.2, "#f4efe1");
    box(x - 5.12, 2.45, -63.4, 0.36, 3.9, 6.5, "#e7e9de");
    for (const offset of [-3.9, -1.3, 1.3, 3.9]) {
      add("roof", x + offset, 4.55, -65, 2.6, 1.35, 4.3, "#e8eee6");
      box(x + offset - 1.24, 5.03, -65, 0.1, 0.85, 4.2, "#4da4c1", 0, "glass");
    }
    windows(x, -65.9, 9.9, 1.3, 3.25);
    for (const offset of [-4.9, 0, 4.9]) pillar(x + offset, -60.9, 4.05);
    box(x, 4.42, -60.8, 10.8, 0.24, 0.25, "#158ebd");
    for (const offset of [-3.5, -0.5, 2.7]) {
      box(
        x + offset,
        1.45,
        -63.3,
        1.85,
        1.95,
        2.1,
        offset === -0.5 ? "#20b9ba" : "#277faf",
      );
      box(x + offset, 2.5, -63.3, 1.55, 0.2, 1.8, "#dce4dc");
      box(
        x + offset + 0.45,
        1.8,
        -62.2,
        0.56,
        0.52,
        0.09,
        "#223e4d",
        0,
        "glass",
      );
      box(x + offset + 0.45, 1.82, -62.13, 0.3, 0.24, 0.025, "#9de8be");
      add("cylinder", x + offset - 0.45, 2.85, -63.4, 0.8, 0.6, 0.8, "#a7bdbf");
    }
    belt(x, -60, 8.9);
    for (const offset of [3.8, 4.7]) {
      add("cylinder", x + offset, 4.5, -66.4, 0.42, 3.1, 0.42, "#8caaac");
      add("cylinder", x + offset, 6.11, -66.4, 0.64, 0.15, 0.64, "#d6e1de");
    }
  }

  // Packing: open-front bay, looping belts, sealing arch and labelled carton
  // stacks. Roof is kept behind the work area so the process remains legible.
  {
    const x = STATION_X[1];
    box(x, 0.52, -63.4, 10.7, 0.42, 8.5, "#c6d0c2");
    box(x, 2.4, -67, 10.5, 3.8, 0.34, "#efeadd");
    box(x, 4.42, -64.9, 11, 0.3, 4.6, "#faf4e7");
    box(x, 4.63, -64.9, 11.1, 0.13, 4.7, "#efaf3d");
    for (const offset of [-4.95, 4.95]) {
      pillar(x + offset, -61.4);
      pillar(x + offset, -66.5);
    }
    windows(x, -66.75, 8.5, 1.1, 2.8);
    belt(x, -61.5, 9.2, "#2d8f94");
    belt(x - 2.5, -64.5, 4.1, "#2d8f94");
    for (const side of [-1, 1]) {
      box(x + side * 1.04, 1.9, -61.5, 0.2, 2.2, 1.5, "#f2b62b");
      box(x + side * 1.04, 0.66, -61.5, 0.5, 0.35, 1.7, "#b8c9c3");
    }
    box(x, 3.02, -61.5, 2.28, 0.35, 1.5, "#f5bd32");
    box(x, 2.84, -60.7, 1.25, 0.09, 0.1, "#234655");
    box(x + 2.9, 1.8, -65.6, 1.9, 2.5, 1.5, "#46aca7");
    add("cylinder", x + 2.9, 3.33, -65.6, 1.2, 0.5, 1.2, "#f3e7cb");
    box(x + 3.92, 2.12, -65.45, 0.16, 0.8, 0.66, "#244d57", 0, "glass");
  }

  // Stock: three orange pallet racks visible through a tall open loading face.
  {
    const x = STATION_X[2];
    box(x, 0.64, -63.3, 10.8, 0.65, 8.4, "#b3c1bd");
    box(x, 2.9, -67.25, 10.7, 4.5, 0.35, "#e6eee7");
    for (const side of [-1, 1])
      box(x + side * 5.18, 2.9, -63.45, 0.28, 4.5, 7.6, "#dce6dc");
    box(x, 5.24, -66.2, 11.1, 0.32, 2.65, "#d2dcd4");
    box(x, 5.44, -66.2, 11.2, 0.12, 2.7, "#45b894");
    box(x, 4.6, -59.8, 10.7, 0.45, 0.25, "#22a885");
    for (const rack of [-3.55, 0, 3.55]) {
      for (const side of [-1, 1]) {
        box(x + rack + side * 1.25, 2.6, -64.1, 0.13, 3.7, 0.13, "#f08e2d");
        box(x + rack + side * 1.25, 2.6, -65.85, 0.13, 3.7, 0.13, "#f08e2d");
      }
      for (const level of [1.1, 2.55, 4]) {
        box(x + rack, level, -65, 2.7, 0.14, 2, "#5b8291");
        for (const col of [-0.7, 0.7]) {
          box(x + rack + col, level + 0.52, -65, 1.1, 0.9, 1.4, "#cba46a");
          box(
            x + rack + col,
            level + 0.52,
            -64.28,
            0.35,
            0.28,
            0.025,
            "#f4edcf",
          );
        }
      }
    }
    for (const offset of [-3.3, 3.3]) {
      box(x + offset, 0.9, -59.2, 2.9, 0.5, 1.5, "#909f9c");
      for (const sign of [-1, 1])
        box(x + offset + sign * 1.12, 1.05, -58.4, 0.18, 0.7, 0.2, "#f2c443");
    }
  }

  // Dispatch: blue control office, sheltered loading bays and marked truck
  // parking; vehicle cargo below is tied to the model's actual assigned batch.
  {
    const x = STATION_X[3];
    box(x - 2.75, 1.9, -65.7, 4.8, 3.1, 4.2, "#f1f1e8");
    box(x - 2.75, 3.6, -65.7, 5.05, 0.25, 4.45, "#3f92ce");
    windows(x - 2.75, -63.54, 3.9, 1.25, 2.2);
    box(x - 4.3, 1.2, -63.47, 0.75, 1.65, 0.13, "#345b70", 0, "glass");
    box(x + 2.7, 4, -64.4, 5.6, 0.23, 6.4, "#90bbca");
    for (const offset of [0.2, 5.2]) {
      pillar(x + offset, -61.5, 3.7);
      pillar(x + offset, -67.2, 3.7);
    }
    for (const offset of [0.6, 2.65, 4.7]) {
      for (const side of [-1, 1])
        box(x + offset + side * 0.86, 0.32, -63, 0.065, 0.018, 6, "#f2e8a8");
      box(x + offset, 0.32, -66, 1.72, 0.018, 0.08, "#f2e8a8");
      box(x + offset, 0.55, -66.8, 1.2, 0.48, 0.4, "#c0cbbf");
    }
    box(x - 4.8, 4.35, -65, 0.08, 2, 0.08, "#9eaead");
    box(x - 4.1, 5.15, -65, 1.4, 0.75, 0.05, "#3a97d9");
  }

  // Final customers: a shop, a small restaurant and an office, rather than a
  // second warehouse. Delivered units remain model counts, not extra sales.
  {
    const x = STATION_X[4];
    for (const [index, offset] of [-3.8, 0, 3.8].entries()) {
      const h = [3.3, 2.8, 4.45][index];
      const z = index === 1 ? -64.2 : -63.8;
      box(
        x + offset,
        h / 2 + 0.4,
        z,
        3.2,
        h,
        4.5,
        ["#f1e9cf", "#f6e3d3", "#e7eee2"][index],
      );
      box(
        x + offset,
        h + 0.48,
        z,
        3.4,
        0.2,
        4.7,
        ["#2a9b84", "#ea7d4e", "#5d8dc1"][index],
      );
      windows(x + offset, z + 2.31, 2.45, 1.12, 1.55);
      box(
        x + offset,
        2.48,
        z + 2.6,
        3.4,
        0.15,
        0.9,
        ["#28b589", "#ef9359", "#4d98cd"][index],
      );
      box(
        x + offset,
        2.85,
        z + 2.33,
        2.4,
        0.35,
        0.09,
        ["#2d9f89", "#d97348", "#487ead"][index],
      );
      if (index === 2) windows(x + offset, z + 2.31, 2.4, 0.9, 3.35);
      box(x + offset, 0.44, z + 2.75, 3.6, 0.22, 1.1, "#c4d1be");
    }
    for (const offset of [-1.7, 1.7]) {
      add("cylinder", x + offset, 0.9, -59.1, 0.8, 0.12, 0.8, "#faf0d7");
      add("cylinder", x + offset, 0.57, -59.1, 0.09, 0.65, 0.09, "#788f85");
      box(x + offset, 1.8, -59.1, 1.9, 0.12, 1.9, "#29ad87");
      add("cylinder", x + offset, 1.14, -59.1, 0.06, 1.4, 0.06, "#b7c6b7");
    }
  }

  for (const [key, parts] of staticParts) {
    const [kind, surface] = key.split(":");
    const mesh = new THREE.InstancedMesh(
      geometry[kind],
      surface === "glass"
        ? glassMaterial
        : surface === "road"
          ? roadMaterial
          : material,
      parts.length,
    );
    mesh.name = `Industria · ${key}`;
    for (const [index, part] of parts.entries()) {
      dummy.position.set(part.x, part.y, part.z);
      dummy.scale.set(part.width, part.height, part.depth);
      dummy.rotation.set(
        kind === "cylinder" ? part.rotation : 0,
        kind === "cylinder" ? 0 : part.rotation,
        0,
      );
      // Cylinders are vertical by default. Conveyor rollers turn on X so their
      // axes cross the belt, perpendicular to the direction of the cartons.
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, color.set(part.tint));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = surface !== "road";
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  staticParts.clear();

  function makeProxy(parent, id, kind, position, size) {
    const mesh = new THREE.Mesh(boxGeometry, proxyMaterial);
    mesh.position.copy(position);
    mesh.scale.set(...size);
    mesh.userData = { industryId: id, industryKind: kind };
    mesh.name = `Selección industria · ${id}`;
    parent.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  for (const [index, stage] of INDUSTRY_STAGES.entries())
    makeProxy(
      root,
      stage.id,
      "place",
      new THREE.Vector3(STATION_X[index], 2.3, -63.4),
      [11.5, 4.4, 9],
    );

  // One shared buffer represents pallets and cartons for all model batches.
  // A carton is a visual sample; quantities always come from the original lot.
  const batchesMesh = new THREE.InstancedMesh(
    boxGeometry,
    material,
    BATCH_LIMIT * (BOX_LIMIT + 7),
  );
  batchesMesh.name =
    "Lotes · muestras visuales limitadas, no una caja por unidad";
  batchesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  batchesMesh.count = 0;
  batchesMesh.castShadow = false;
  batchesMesh.receiveShadow = true;
  batchesMesh.frustumCulled = false;
  root.add(batchesMesh);
  const batchPositions = new Map();
  let batchVisuals = [];

  function batchPart(index, x, y, z, width, height, depth, tint) {
    dummy.position.set(x, y, z);
    dummy.scale.set(width, height, depth);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    batchesMesh.setMatrixAt(index, dummy.matrix);
    batchesMesh.setColorAt(index, color.set(tint));
  }
  function syncBatches() {
    const byStage = new Map(INDUSTRY_STAGES.map((stage) => [stage.id, []]));
    for (const batch of state?.batches || []) {
      if (Number(batch.quantity) > 0) byStage.get(batch.stageId)?.push(batch);
    }
    batchPositions.clear();
    batchVisuals = [];
    for (const proxy of batchProxies.values()) proxy.visible = false;
    let partIndex = 0;
    let represented = 0;
    for (const [stageIndex, stage] of INDUSTRY_STAGES.entries()) {
      const lots = byStage.get(stage.id) || [];
      for (const [index, batch] of lots.entries()) {
        if (represented >= BATCH_LIMIT) break;
        // In-transit loads live inside their assigned vehicle, not on a second
        // ground pallet. Their selection point follows that vehicle below.
        if (stage.id === "transit") continue;
        represented++;
        const x = STATION_X[stageIndex] + ((index % 3) - 1) * 3.05;
        const z = -57.85 - Math.floor(index / 3) * 2.55;
        const count = Math.min(
          BOX_LIMIT,
          Math.max(1, Math.ceil(batch.quantity / 20)),
        );
        batchPositions.set(batch.id, new THREE.Vector3(x, 1.3, z));
        for (const offset of [-0.66, 0, 0.66])
          batchPart(
            partIndex++,
            x + offset,
            0.42,
            z,
            0.15,
            0.19,
            1.8,
            "#ab8256",
          );
        for (const offset of [-0.69, -0.23, 0.23, 0.69])
          batchPart(
            partIndex++,
            x,
            0.57,
            z + offset,
            2.2,
            0.13,
            0.3,
            "#c8a371",
          );
        for (let boxIndex = 0; boxIndex < count; boxIndex++) {
          const bx = boxIndex % 3;
          const bz = Math.floor(boxIndex / 3) % 3;
          const layer = Math.floor(boxIndex / 9);
          batchPart(
            partIndex++,
            x + (bx - 1) * 0.62,
            0.9 + layer * 0.54,
            z + (bz - 1) * 0.48,
            0.58,
            0.5,
            0.44,
            boxIndex % 4 === 0 ? stage.color : "#d6ad70",
          );
        }
        let proxy = batchProxies.get(batch.id);
        if (!proxy) {
          proxy = makeProxy(
            root,
            batch.id,
            "batch",
            new THREE.Vector3(),
            [2.35, 2.1, 1.95],
          );
          batchProxies.set(batch.id, proxy);
        }
        proxy.position.set(x, 1.25, z);
        proxy.visible = true;
        batchVisuals.push({
          id: batch.id,
          stageId: stage.id,
          quantity: batch.quantity,
          representativeBoxes: count,
          position: [x, 1.3, z],
        });
      }
    }
    batchesMesh.count = partIndex;
    batchesMesh.instanceMatrix.needsUpdate = true;
    if (batchesMesh.instanceColor) batchesMesh.instanceColor.needsUpdate = true;
  }

  function makeVehicle(vehicle, index) {
    const group = new THREE.Group();
    group.name = `${vehicle.name} · ruta estimada sin GPS`;
    root.add(group);
    const parts = [];
    const addPart = (x, y, z, w, h, d, tint) =>
      parts.push({ x, y, z, w, h, d, tint });
    const tint = ["#248dce", "#ec8b2a", "#21ad92"][index % 3];
    addPart(0, 0.53, -0.3, 1.55, 0.3, 4.6, "#334d59");
    addPart(0, 1.24, 1.42, 1.7, 1.25, 1.48, tint);
    addPart(0, 1.79, 1.24, 1.62, 0.3, 1.24, tint);
    addPart(0, 1.55, 2.175, 1.37, 0.46, 0.045, "#24546b");
    addPart(0, 1.58, 2.205, 0.06, 0.48, 0.035, "#bbd7dc");
    for (const side of [-1, 1]) {
      addPart(side * 0.869, 1.55, 1.37, 0.035, 0.46, 0.79, "#3b6e80");
      addPart(side * 0.9, 1.16, 1.05, 0.075, 0.08, 0.22, "#b3ced0");
      addPart(side * 1.02, 1.57, 1.9, 0.2, 0.15, 0.24, "#243b48");
      addPart(side * 0.55, 0.95, 2.207, 0.25, 0.15, 0.04, "#fff3b3");
      addPart(side * 0.61, 0.69, -2.5, 0.15, 0.12, 0.06, "#f05c44");
    }
    addPart(0, 0.66, 2.22, 1.72, 0.17, 0.12, "#c3d1cc");
    addPart(0, 0.95, 2.214, 0.62, 0.31, 0.035, "#2b454e");
    addPart(0, 0.91, -0.9, 1.85, 0.18, 3.2, "#aabdb7");
    addPart(0, 1.82, -2.46, 1.8, 1.65, 0.11, "#e0e7df");
    for (const side of [-1, 1]) {
      addPart(side * 0.92, 1.62, -0.95, 0.09, 1.3, 3.1, "#e7eee7");
      addPart(side * 0.974, 1.62, -0.95, 0.025, 0.35, 2.9, tint);
      for (const offset of [-2.3, -0.95, 0.48])
        addPart(side * 0.975, 1.62, offset, 0.025, 1.2, 0.045, "#bbcfc8");
    }
    const body = new THREE.InstancedMesh(boxGeometry, material, parts.length);
    for (const [partIndex, part] of parts.entries()) {
      dummy.position.set(part.x, part.y, part.z);
      dummy.scale.set(part.w, part.h, part.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      body.setMatrixAt(partIndex, dummy.matrix);
      body.setColorAt(partIndex, color.set(part.tint));
    }
    body.castShadow = false;
    body.receiveShadow = true;
    group.add(body);
    const wheelGeometry = new THREE.CylinderGeometry(0.36, 0.36, 0.2, 12);
    resources.push(wheelGeometry);
    const wheels = new THREE.InstancedMesh(wheelGeometry, material, 6);
    const wheelPositions = [];
    for (const z of [-1.8, -1.1, 1.35])
      for (const side of [-1, 1]) wheelPositions.push([side * 0.91, 0.46, z]);
    wheels.castShadow = false;
    for (let wheelIndex = 0; wheelIndex < 6; wheelIndex++)
      wheels.setColorAt(wheelIndex, color.set("#2c3b43"));
    group.add(wheels);
    const cargo = new THREE.InstancedMesh(boxGeometry, material, 12);
    cargo.count = 0;
    cargo.castShadow = false;
    group.add(cargo);
    const proxy = makeProxy(
      group,
      vehicle.id,
      "vehicle",
      new THREE.Vector3(0, 1.2, -0.15),
      [2.15, 2.2, 5.2],
    );
    const actor = {
      group,
      body,
      wheels,
      wheelPositions,
      cargo,
      proxy,
      model: vehicle,
      signature: null,
      baseProgress: 0,
      born: lastElapsed,
      progress: 0,
      index,
      route: industrialRoute(false, index - 1),
      returning: false,
      cargoBatchId: null,
      tangent: new THREE.Vector3(),
      batchPosition: new THREE.Vector3(),
    };
    vehicleActors.set(vehicle.id, actor);
    return actor;
  }

  function syncVehicles() {
    for (const actor of vehicleActors.values()) actor.group.visible = false;
    for (const [index, vehicle] of (state?.vehicles || []).entries()) {
      const actor =
        vehicleActors.get(vehicle.id) || makeVehicle(vehicle, index);
      const signature = JSON.stringify([
        vehicle.status,
        vehicle.cargoBatchId,
        vehicle.route?.startedAt,
        vehicle.route?.origin?.id,
        vehicle.route?.destination?.id,
      ]);
      actor.model = vehicle;
      actor.group.visible = true;
      if (actor.signature !== signature) {
        const estimate = getVehicleProgress(state, vehicle);
        actor.signature = signature;
        actor.baseProgress = clamp(Number(estimate?.progress) || 0);
        actor.born = lastElapsed;
        actor.returning = vehicle.status === "returning";
        actor.route = industrialRoute(actor.returning, actor.index - 1);
      }
      const batch = (state.batches || []).find(
        (item) => item.id === vehicle.cargoBatchId,
      );
      const count = batch
        ? Math.min(12, Math.max(1, Math.ceil(batch.quantity / 20)))
        : 0;
      actor.cargoBatchId = batch?.id || null;
      actor.cargo.count = count;
      for (let partIndex = 0; partIndex < count; partIndex++) {
        dummy.position.set(
          (partIndex % 2 ? 1 : -1) * 0.43,
          1.26 + Math.floor(partIndex / 6) * 0.54,
          -1.95 + (Math.floor(partIndex / 2) % 3) * 0.85,
        );
        dummy.scale.set(0.75, 0.49, 0.72);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        actor.cargo.setMatrixAt(partIndex, dummy.matrix);
        actor.cargo.setColorAt(
          partIndex,
          color.set(partIndex % 3 ? "#d8ae70" : "#f4cb77"),
        );
      }
      actor.cargo.instanceMatrix.needsUpdate = true;
      if (actor.cargo.instanceColor)
        actor.cargo.instanceColor.needsUpdate = true;
    }
  }

  const beltCargo = new THREE.InstancedMesh(boxGeometry, material, 8);
  beltCargo.name = "Animación ilustrativa de fabricación y empacado";
  beltCargo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  beltCargo.castShadow = false;
  beltCargo.frustumCulled = false;
  for (let index = 0; index < 8; index++)
    beltCargo.setColorAt(index, color.set(index < 4 ? "#31bcb1" : "#d5aa6a"));
  root.add(beltCargo);

  function update(_dt, elapsed) {
    if (disposed || !enabled) return false;
    lastElapsed = elapsed;
    const visualElapsed = reducedMotion ? 0 : elapsed;
    for (let index = 0; index < 8; index++) {
      const packing = index >= 4;
      const t = ((index % 4) / 4 + visualElapsed * 0.075) % 1;
      dummy.position.set(
        (packing ? -14 : -28) + (t - 0.5) * 7.5,
        1.37,
        packing ? -61.5 : -60,
      );
      dummy.scale.set(0.72, 0.55, 0.68);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      beltCargo.setMatrixAt(index, dummy.matrix);
    }
    beltCargo.instanceMatrix.needsUpdate = true;
    for (const actor of vehicleActors.values()) {
      const status = actor.model.status;
      if (!actor.group.visible) continue;
      if (status === "outbound" || status === "returning") {
        actor.progress = clamp(
          actor.baseProgress +
            (reducedMotion
              ? 0
              : Math.max(0, elapsed - actor.born) / VISUAL_ROUTE_SECONDS),
        );
        actor.route.getPointAt(actor.progress, actor.group.position);
        const tangent = actor.route.getTangentAt(
          Math.min(0.99999, actor.progress),
          actor.tangent,
        );
        actor.group.rotation.y = Math.atan2(tangent.x, tangent.z);
      } else if (status === "at_customer") {
        actor.progress = 1;
        const [x, z] = customerSlot(actor.index - 1);
        actor.group.position.set(x, 0.22, z);
        actor.group.rotation.y = Math.PI;
      } else {
        actor.progress = 0;
        actor.group.position.set(14.6 + (actor.index % 3) * 2.05, 0.22, -63.2);
        actor.group.rotation.y = 0;
      }
      for (const [index, position] of actor.wheelPositions.entries()) {
        dummy.position.set(...position);
        dummy.scale.set(1, 1, 1);
        dummy.quaternion.copy(wheelTurn);
        if (
          (status === "outbound" || status === "returning") &&
          actor.progress < 1
        )
          dummy.quaternion.multiply(
            wheelSpin.setFromAxisAngle(UP, -visualElapsed * 3),
          );
        dummy.updateMatrix();
        actor.wheels.setMatrixAt(index, dummy.matrix);
      }
      actor.wheels.instanceMatrix.needsUpdate = true;
      if (actor.cargoBatchId) {
        actor.batchPosition.copy(actor.group.position);
        actor.batchPosition.y += 1.4;
        batchPositions.set(actor.cargoBatchId, actor.batchPosition);
      }
    }
    return !reducedMotion;
  }

  function sync(next) {
    if (disposed) return;
    state = next;
    syncBatches();
    syncVehicles();
    update(0, lastElapsed);
  }
  function getPlaces() {
    return INDUSTRY_STAGES.map((stage, index) => ({
      id: stage.id,
      name: stage.name,
      color: stage.color,
      position: new THREE.Vector3(STATION_X[index], 0.55, -50.5),
      count: (state?.batches || [])
        .filter((batch) => batch.stageId === stage.id)
        .reduce((sum, batch) => sum + (Number(batch.quantity) || 0), 0),
      unit: "uds",
    }));
  }
  function focusPoint(id) {
    const vehicle = vehicleActors.get(id);
    if (vehicle?.group.visible)
      return vehicle.group.position.clone().add(new THREE.Vector3(0, 1.6, 0));
    if (batchPositions.has(id)) return batchPositions.get(id).clone();
    const index = INDUSTRY_STAGES.findIndex((stage) => stage.id === id);
    return index < 0 ? null : new THREE.Vector3(STATION_X[index], 2.5, -62.3);
  }
  function pickHit(ray) {
    if (!enabled || disposed) return null;
    root.updateMatrixWorld(true);
    const hits = ray.intersectObjects(
      pickables.filter((mesh) => mesh.visible && mesh.parent.visible),
      false,
    );
    const hit = hits[0];
    return hit
      ? {
          id: hit.object.userData.industryId,
          kind: hit.object.userData.industryKind,
          distance: hit.distance,
        }
      : null;
  }
  function debug() {
    return {
      enabled,
      simulated: true,
      gps: false,
      routeBasis: "Ruta estimada · animación ilustrativa",
      visualRouteSeconds: VISUAL_ROUTE_SECONDS,
      businessMutation: false,
      boxLimitPerBatch: BOX_LIMIT,
      batchLimit: BATCH_LIMIT,
      places: getPlaces().map((place) => ({
        ...place,
        position: place.position.toArray(),
      })),
      batches: [
        ...batchVisuals,
        ...[...vehicleActors.values()]
          .filter((actor) => actor.group.visible && actor.cargoBatchId)
          .map((actor) => {
            const batch = (state?.batches || []).find(
              (item) => item.id === actor.cargoBatchId,
            );
            return {
              id: batch.id,
              stageId: batch.stageId,
              quantity: batch.quantity,
              representativeBoxes: actor.cargo.count,
              position: actor.batchPosition.toArray(),
              vehicleId: actor.model.id,
            };
          }),
      ],
      vehicles: [...vehicleActors.values()]
        .filter((actor) => actor.group.visible)
        .map((actor) => ({
          id: actor.model.id,
          status: actor.model.status,
          driverName: actor.model.driverName,
          cargoBatchId: actor.cargoBatchId,
          cargoRepresentativeBoxes: actor.cargo.count,
          progress: actor.progress,
          sourceProgress: actor.baseProgress,
          awaitingConfirmation:
            actor.progress >= 1 &&
            (actor.model.status === "outbound" ||
              actor.model.status === "returning"),
          position: actor.group.position.toArray(),
          uuid: actor.group.uuid,
          routeEstimated: true,
        })),
    };
  }
  function setEnabled(value) {
    enabled = Boolean(value);
    root.visible = enabled;
  }
  function setQuality(_quality) {
    // Instanced static geometry has a fixed, small draw-call budget. Moving
    // cargo never enters the scene's cached shadow map.
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(root);
    root.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
    });
    for (const resource of resources) resource.dispose();
    vehicleActors.clear();
    batchProxies.clear();
    batchPositions.clear();
  }
  return {
    sync,
    update,
    getPlaces,
    pickHit,
    focusPoint,
    setEnabled,
    setQuality,
    debug,
    dispose,
  };
}
