import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const TAU = Math.PI * 2;
const wrap = (value, length) => ((value % length) + length) % length;

/** A directed lane loop. Every segment joins with a continuous tangent. */
export function createLaneGraph() {
  const radius = 2.4;
  const right = 24.05;
  const bottom = 8.05;
  const x = right - radius;
  const z = bottom - radius;
  const segments = [];
  let length = 0;
  const line = (id, from, to) => {
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
    segments.push({
      id,
      kind: "line",
      from,
      to,
      length: distance,
      start: length,
    });
    length += distance;
  };
  const arc = (id, center, startAngle) => {
    const distance = (radius * Math.PI) / 2;
    segments.push({
      id,
      kind: "arc",
      center,
      radius,
      startAngle,
      length: distance,
      start: length,
    });
    length += distance;
  };
  line("north-eastbound", [-x, -bottom], [x, -bottom]);
  arc("north-east-corner", [x, -z], -Math.PI / 2);
  line("east-southbound", [right, -z], [right, z]);
  arc("south-east-corner", [x, z], 0);
  line("south-westbound", [x, bottom], [-x, bottom]);
  arc("south-west-corner", [-x, z], Math.PI / 2);
  line("west-northbound", [-right, z], [-right, -z]);
  arc("north-west-corner", [-x, -z], Math.PI);

  const signals = [
    {
      id: "north-crossing",
      s: x - 2.8,
      offset: 0,
      x: -0.9,
      z: -6.35,
      rotation: -Math.PI / 2,
    },
    {
      id: "south-crossing",
      s: segments[4].start + x - 2.8,
      offset: 2.5,
      x: 0.9,
      z: 6.35,
      rotation: Math.PI / 2,
    },
  ];
  return {
    length,
    segments,
    signals,
    nodes: segments.map((segment, index) => ({
      id: segment.id,
      next: segments[(index + 1) % segments.length].id,
    })),
    sample(distance) {
      const s = wrap(distance, length);
      const segment =
        segments.find((entry) => s < entry.start + entry.length) ||
        segments.at(-1);
      const local = s - segment.start;
      if (segment.kind === "arc") {
        const angle = segment.startAngle + local / radius;
        return {
          x: segment.center[0] + Math.cos(angle) * radius,
          z: segment.center[1] + Math.sin(angle) * radius,
          tx: -Math.sin(angle),
          tz: Math.cos(angle),
          curvature: 1 / radius,
          segment: segment.id,
        };
      }
      const tx = (segment.to[0] - segment.from[0]) / segment.length;
      const tz = (segment.to[1] - segment.from[1]) / segment.length;
      return {
        x: segment.from[0] + tx * local,
        z: segment.from[1] + tz * local,
        tx,
        tz,
        curvature: 0,
        segment: segment.id,
      };
    },
  };
}

export function trafficLightState(elapsed, offset = 0) {
  const phase = wrap(elapsed + offset, 22);
  return phase < 10 ? "green" : phase < 12 ? "amber" : "red";
}

/** Deterministic fixed-step traffic. It only represents ambient city activity. */
export class TrafficSimulation {
  constructor({ count = 9, graph = createLaneGraph(), running = true } = {}) {
    this.graph = graph;
    this.elapsed = 0;
    this.running = running;
    this.accumulator = 0;
    this.minimumGap = 0.65;
    const total = Math.max(1, Math.min(10, count));
    this.vehicles = Array.from({ length: total }, (_, index) => ({
      id: `ambient-${index + 1}`,
      kind: index === total - 1 ? "motorcycle" : "car",
      s: wrap((index / total) * graph.length + 4.2, graph.length),
      length: index === total - 1 ? 1.24 : 1.94,
      speed: 0,
      cruise: index === total - 1 ? 3 : 2.5 + (index % 3) * 0.22,
      distance: 0,
      brake: false,
    }));
  }

  setEnabled(enabled) {
    this.running = Boolean(enabled);
  }

  update(dt) {
    if (!this.running || !Number.isFinite(dt) || dt <= 0) return;
    this.accumulator += dt;
    const step = 1 / 60;
    while (this.accumulator >= step - 1e-10) {
      this.step(step);
      this.accumulator -= step;
    }
  }

  step(dt) {
    const graph = this.graph;
    const ordered = [...this.vehicles].sort((a, b) => a.s - b.s);
    const next = ordered.map((vehicle, index) => {
      const ahead = ordered[(index + 1) % ordered.length];
      let limit =
        ordered.length === 1
          ? Infinity
          : wrap(ahead.s - vehicle.s, graph.length) -
            (vehicle.length + ahead.length) / 2 -
            this.minimumGap;
      let target =
        vehicle.cruise * (graph.sample(vehicle.s + 1).curvature ? 0.66 : 1);
      for (const signal of graph.signals) {
        const light = trafficLightState(this.elapsed, signal.offset);
        const distance =
          wrap(signal.s - vehicle.s, graph.length) - vehicle.length / 2 - 0.08;
        const brakingDistance =
          (vehicle.speed * vehicle.speed) / (2 * 3.5) + 0.3;
        if (
          light === "red" ||
          (light === "amber" && distance > brakingDistance)
        ) {
          // Once the front has crossed the line it must clear the junction.
          if (distance >= 0) limit = Math.min(limit, distance);
        }
      }
      target = Math.min(
        target,
        Math.sqrt(Math.max(0, 2 * 2.7 * (limit - 0.12))),
      );
      const acceleration = target < vehicle.speed ? 3.5 : 1.5;
      const speed =
        vehicle.speed +
        Math.max(
          -acceleration * dt,
          Math.min(acceleration * dt, target - vehicle.speed),
        );
      const travel = Math.max(
        0,
        Math.min(((vehicle.speed + speed) * dt) / 2, limit),
      );
      return {
        vehicle,
        travel,
        speed: travel + 1e-8 < ((vehicle.speed + speed) * dt) / 2 ? 0 : speed,
        brake: target < vehicle.speed - 0.05 || speed < 0.15,
      };
    });
    for (const { vehicle, travel, speed, brake } of next) {
      vehicle.s = wrap(vehicle.s + travel, graph.length);
      vehicle.distance += travel;
      vehicle.speed = speed;
      vehicle.brake = brake;
    }
    this.elapsed += dt;
  }

  debug() {
    const vehicles = this.vehicles.map((vehicle) => ({
      ...vehicle,
      ...this.graph.sample(vehicle.s),
    }));
    const ordered = [...vehicles].sort((a, b) => a.s - b.s);
    const clearance = ordered.map((vehicle, index) => {
      const ahead = ordered[(index + 1) % ordered.length];
      return (
        wrap(ahead.s - vehicle.s, this.graph.length) -
        (ahead.length + vehicle.length) / 2
      );
    });
    return {
      enabled: this.running,
      elapsed: this.elapsed,
      laneLength: this.graph.length,
      minimumClearance: ordered.length > 1 ? Math.min(...clearance) : Infinity,
      vehicles,
      signals: this.graph.signals.map((signal) => ({
        ...signal,
        state: trafficLightState(this.elapsed, signal.offset),
      })),
      source: "ambient-demo",
    };
  }
}

export function createTraffic(THREE, { scene, reducedMotion = false } = {}) {
  const simulation = new TrafficSimulation({ running: !reducedMotion });
  const root = new THREE.Group();
  root.name = "ambient-city-traffic";
  scene.add(root);
  const geometries = new Set();
  const materials = new Set();
  const geometry = (value) => {
    geometries.add(value);
    return value;
  };
  const material = (color, roughness = 0.7, metalness = 0) => {
    const value = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
    });
    materials.add(value);
    return value;
  };
  const paints = [
    "#d3b6a1",
    "#b7c4c0",
    "#78939b",
    "#d8d5c8",
    "#746b61",
    "#b5b8be",
    "#e3ded3",
    "#8d9c83",
  ].map((color) => material(color, 0.34, 0.12));
  const glass = material("#34484c", 0.18, 0.35);
  const tire = material("#303330", 0.94);
  const trim = material("#737b78", 0.43, 0.7);
  const cream = material("#f8ecd0", 0.34);
  const rearLight = material("#a95546", 0.45);
  const poleMaterial = material("#68716d", 0.7, 0.3);
  const shellMaterial = material("#3e4843", 0.7);
  const white = material("#e9e7dd", 0.9);
  const dummy = new THREE.Object3D();

  function rounded(width, height, length, bevel = 0.045) {
    const shape = new THREE.Shape();
    const w = width / 2 - bevel;
    const l = length / 2 - bevel;
    shape.moveTo(-w, -l);
    shape.lineTo(w, -l);
    shape.lineTo(w, l);
    shape.lineTo(-w, l);
    shape.closePath();
    const value = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.01, height - bevel * 2),
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: bevel,
      bevelThickness: bevel,
      curveSegments: 1,
    });
    value.rotateX(-Math.PI / 2);
    value.computeBoundingBox();
    value.translate(
      0,
      -(value.boundingBox.min.y + value.boundingBox.max.y) / 2,
      0,
    );
    return geometry(value);
  }
  const box = (w, h, d) => geometry(new THREE.BoxGeometry(w, h, d));
  const sphere = (radius, width = 10, height = 6) =>
    geometry(new THREE.SphereGeometry(radius, width, height));
  function placed(source, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const copy = source.clone();
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    copy.applyMatrix4(dummy.matrix);
    return copy;
  }
  function combined(parts) {
    const result = geometry(mergeGeometries(parts, false));
    parts.forEach((part) => part.dispose());
    return result;
  }
  function mesh(parent, geo, mat) {
    const value = new THREE.Mesh(geo, mat);
    // City sunlight is baked once. Moving meshes use soft ground contact below.
    value.castShadow = false;
    value.receiveShadow = true;
    parent.add(value);
    return value;
  }
  const carBody = combined([
    placed(rounded(0.83, 0.26, 1.82), 0, 0.35),
    placed(rounded(0.71, 0.1, 0.55, 0.025), 0, 0.67, -0.13),
    placed(rounded(0.1, 0.06, 0.16, 0.015), -0.45, 0.53, 0.14),
    placed(rounded(0.1, 0.06, 0.16, 0.015), 0.45, 0.53, 0.14),
  ]);
  const carGlass = rounded(0.68, 0.28, 0.97, 0.035);
  const headlights = combined(
    [-0.28, 0.28].map((x) => placed(box(0.18, 0.085, 0.025), x, 0.37, 0.92)),
  );
  const tailLights = combined(
    [-0.3, 0.3].map((x) => placed(box(0.14, 0.08, 0.025), x, 0.38, -0.92)),
  );
  const details = combined([
    placed(box(0.58, 0.06, 0.025), 0, 0.25, 0.94),
    placed(box(0.58, 0.06, 0.025), 0, 0.25, -0.94),
    placed(box(0.035, 0.24, 0.06), -0.351, 0.54, -0.12),
    placed(box(0.035, 0.24, 0.06), 0.351, 0.54, -0.12),
  ]);

  const wheelGeo = geometry(
    new THREE.CylinderGeometry(0.2, 0.2, 0.11, 12).rotateZ(Math.PI / 2),
  );
  const hubGeo = geometry(
    new THREE.CylinderGeometry(0.092, 0.092, 0.119, 10).rotateZ(Math.PI / 2),
  );
  const wheelCount = simulation.vehicles.reduce(
    (sum, vehicle) => sum + (vehicle.kind === "car" ? 4 : 2),
    0,
  );
  const tires = new THREE.InstancedMesh(wheelGeo, tire, wheelCount);
  const hubs = new THREE.InstancedMesh(hubGeo, trim, wheelCount);
  tires.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  hubs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tires.castShadow = false;
  tires.frustumCulled = false;
  hubs.frustumCulled = false;
  root.add(tires, hubs);

  function cylinderBetween(from, to, radius, mat, parent) {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    const geo = geometry(
      new THREE.CylinderGeometry(radius, radius, direction.length(), 7),
    );
    const part = mesh(parent, geo, mat);
    part.position.copy(a.add(b).multiplyScalar(0.5));
    part.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    return part;
  }

  const shadowSize = 64;
  const shadowPixels = new Uint8Array(shadowSize * shadowSize * 4);
  for (let row = 0; row < shadowSize; row++) {
    for (let col = 0; col < shadowSize; col++) {
      const radiusSquared =
        (((col + 0.5) / shadowSize) * 2 - 1) ** 2 +
        (((row + 0.5) / shadowSize) * 2 - 1) ** 2;
      shadowPixels[(row * shadowSize + col) * 4 + 3] = Math.round(
        110 * Math.max(0, 1 - radiusSquared) ** 1.7,
      );
    }
  }
  const contactTexture = new THREE.DataTexture(
    shadowPixels,
    shadowSize,
    shadowSize,
    THREE.RGBAFormat,
  );
  contactTexture.magFilter = THREE.LinearFilter;
  contactTexture.minFilter = THREE.LinearFilter;
  contactTexture.needsUpdate = true;
  const contactMaterial = new THREE.MeshBasicMaterial({
    map: contactTexture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  materials.add(contactMaterial);
  const contactGeometry = geometry(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  );

  const visuals = simulation.vehicles.map((vehicle, index) => {
    const group = new THREE.Group();
    group.name = vehicle.id;
    root.add(group);
    let wheelOffsets;
    if (vehicle.kind === "car") {
      mesh(group, carBody, paints[index % paints.length]);
      mesh(group, carGlass, glass).position.set(0, 0.53, -0.12);
      mesh(group, headlights, cream);
      mesh(group, tailLights, rearLight);
      mesh(group, details, trim);
      wheelOffsets = [-0.43, 0.43].flatMap((x) =>
        [-0.56, 0.56].map((z) => [x, 0.2, z]),
      );
    } else {
      mesh(group, rounded(0.3, 0.22, 0.55, 0.035), paints[2]).position.set(
        0,
        0.48,
        0.02,
      );
      mesh(group, rounded(0.29, 0.09, 0.43, 0.025), tire).position.set(
        0,
        0.6,
        -0.16,
      );
      cylinderBetween([0, 0.26, -0.43], [0, 0.46, 0.16], 0.045, trim, group);
      cylinderBetween([0, 0.24, 0.47], [0, 0.7, 0.3], 0.035, trim, group);
      cylinderBetween(
        [-0.22, 0.72, 0.31],
        [0.22, 0.72, 0.31],
        0.025,
        trim,
        group,
      );
      mesh(group, sphere(0.1), cream).position.set(0, 0.67, 0.41);
      const coat = material("#6d7971", 0.9);
      mesh(group, rounded(0.3, 0.35, 0.2, 0.025), coat).position.set(
        0,
        0.91,
        -0.1,
      );
      mesh(group, sphere(0.16, 12, 8), white).position.set(0, 1.19, -0.06);
      mesh(group, rounded(0.22, 0.09, 0.05, 0.018), glass).position.set(
        0,
        1.2,
        0.09,
      );
      for (const side of [-1, 1]) {
        cylinderBetween(
          [side * 0.14, 1.0, -0.03],
          [side * 0.18, 0.73, 0.3],
          0.047,
          coat,
          group,
        );
        cylinderBetween(
          [side * 0.12, 0.73, -0.15],
          [side * 0.17, 0.43, 0.06],
          0.063,
          tire,
          group,
        );
      }
      wheelOffsets = [
        [0, 0.22, -0.43],
        [0, 0.22, 0.47],
      ];
    }
    const contactShadow = new THREE.Mesh(contactGeometry, contactMaterial);
    contactShadow.name = `${vehicle.id}-contact-shadow`;
    contactShadow.scale.set(
      vehicle.kind === "car" ? 1.35 : 0.72,
      1,
      vehicle.kind === "car" ? 2.2 : 1.55,
    );
    contactShadow.renderOrder = 1;
    root.add(contactShadow);
    return { group, vehicle, wheelOffsets, contactShadow };
  });

  const signalVisuals = simulation.graph.signals.map((signal, index) => {
    const group = new THREE.Group();
    group.position.set(signal.x, 0.1, signal.z);
    group.rotation.y = signal.rotation;
    root.add(group);
    mesh(
      group,
      geometry(new THREE.CylinderGeometry(0.045, 0.065, 1.87, 8)),
      poleMaterial,
    ).position.y = 0.935;
    mesh(group, rounded(0.31, 0.84, 0.21, 0.035), shellMaterial).position.set(
      0,
      1.91,
      0,
    );
    const lamps = ["red", "amber", "green"].map((state, lampIndex) => {
      const colors = { red: "#e5725f", amber: "#e7b654", green: "#84b08a" };
      const mat = material(colors[state], 0.4);
      mat.emissive.set(colors[state]);
      const lamp = mesh(
        group,
        geometry(new THREE.CircleGeometry(0.075, 12)),
        mat,
      );
      lamp.position.set(0, 2.18 - lampIndex * 0.24, 0.112);
      return { state, mat, baseColor: new THREE.Color(colors[state]) };
    });
    const line = mesh(root, box(0.11, 0.01, 1.7), white);
    line.position.set(
      index === 0 ? -2.8 : 2.8,
      0.095,
      index === 0 ? -8.05 : 8.05,
    );
    line.castShadow = false;
    return { signal, lamps };
  });

  const world = new THREE.Matrix4();
  let quality = "balanced";
  function draw() {
    let wheelIndex = 0;
    for (const visual of visuals) {
      const { vehicle, group } = visual;
      const sample = simulation.graph.sample(vehicle.s);
      group.position.set(sample.x, 0.09, sample.z);
      group.rotation.set(
        0,
        Math.atan2(sample.tx, sample.tz),
        vehicle.kind === "motorcycle"
          ? -sample.curvature * 0.1 * vehicle.speed
          : 0,
      );
      visual.contactShadow.position.set(sample.x, 0.092, sample.z);
      visual.contactShadow.rotation.y = group.rotation.y;
      group.updateMatrix();
      for (const [x, y, z] of visual.wheelOffsets) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(
          vehicle.distance / 0.2,
          z > 0 ? sample.curvature * 0.35 : 0,
          0,
        );
        dummy.scale.setScalar(vehicle.kind === "motorcycle" ? 1.1 : 1);
        dummy.updateMatrix();
        world.multiplyMatrices(group.matrix, dummy.matrix);
        tires.setMatrixAt(wheelIndex, world);
        hubs.setMatrixAt(wheelIndex++, world);
      }
    }
    tires.instanceMatrix.needsUpdate = true;
    hubs.instanceMatrix.needsUpdate = true;
    for (const { signal, lamps } of signalVisuals) {
      const active = trafficLightState(simulation.elapsed, signal.offset);
      for (const { state, mat, baseColor } of lamps) {
        mat.emissiveIntensity = state === active ? 1.1 : 0;
        mat.color.copy(baseColor).multiplyScalar(state === active ? 1 : 0.14);
      }
    }
  }
  draw();
  return {
    update(dt) {
      simulation.update(Math.max(0, Math.min(dt, 0.25)));
      draw();
    },
    setEnabled(enabled) {
      simulation.setEnabled(enabled);
      root.visible = Boolean(enabled);
    },
    setQuality(value) {
      quality = value;
      root.traverse((object) => {
        if (object.isMesh) object.castShadow = false;
      });
    },
    debug() {
      return {
        ...simulation.debug(),
        quality,
        meshes: visuals.length,
        type: "ambient-traffic",
        businessData: false,
      };
    },
    dispose() {
      scene.remove(root);
      geometries.forEach((value) => value.dispose());
      materials.forEach((value) => value.dispose());
      contactTexture.dispose();
      tires.dispose();
      hubs.dispose();
    },
  };
}
