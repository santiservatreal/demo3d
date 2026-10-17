import * as THREE from "three";

export const CONSTRUCTION_DURATION = 12;
export const CONSTRUCTION_OWNER_WAIT_LIMIT = 40;
const clamp = (value) => THREE.MathUtils.clamp(value, 0, 1);
const smooth = (value) => {
  const n = clamp(value);
  return n * n * (3 - 2 * n);
};

// One deterministic choreography represents one CRM transition. It never
// creates inventory, invoices, GPS positions or additional CRM events.
export function phaseAt(elapsed, duration = CONSTRUCTION_DURATION) {
  const progress = duration <= 0 ? 1 : clamp(elapsed / duration);
  if (progress >= 1)
    return {
      phase: "complete",
      progress: 1,
      buildProgress: 1,
      truckProgress: 1,
      completed: true,
    };
  if (progress < 0.28)
    return {
      phase: "deconstruct",
      progress,
      buildProgress: 1 - smooth(progress / 0.28),
      truckProgress: 0,
      completed: false,
    };
  if (progress < 0.68)
    return {
      phase: "transport",
      progress,
      buildProgress: 0,
      truckProgress: smooth((progress - 0.28) / 0.4),
      completed: false,
    };
  return {
    phase: "build",
    progress,
    buildProgress: smooth((progress - 0.68) / 0.32),
    truckProgress: 1,
    completed: false,
  };
}

function accessPoint(plot) {
  const roadZ = Math.abs(plot.z + 9) < Math.abs(plot.z - 9) ? -9 : 9;
  return {
    roadZ,
    point: new THREE.Vector3(
      plot.x,
      0.12,
      plot.z + Math.sign(roadZ - plot.z) * 3.55,
    ),
  };
}

// Routes use the city's two avenues and the connecting streets at x ±25/0.
// Only the short construction access enters the parcel's clear forecourt.
export function constructionRoute(from, to) {
  const origin = accessPoint(from),
    destination = accessPoint(to),
    points = [origin.point],
    add = (x, z) => {
      const last = points.at(-1);
      if (Math.abs(last.x - x) + Math.abs(last.z - z) > 0.001)
        points.push(new THREE.Vector3(x, 0.12, z));
    };
  add(from.x, origin.roadZ);
  if (origin.roadZ !== destination.roadZ) {
    const streetX = [-25, 0, 25].reduce((best, x) =>
      Math.abs(from.x - x) + Math.abs(to.x - x) <
      Math.abs(from.x - best) + Math.abs(to.x - best)
        ? x
        : best,
    );
    add(streetX, origin.roadZ);
    add(streetX, destination.roadZ);
  }
  add(to.x, destination.roadZ);
  add(destination.point.x, destination.point.z);
  if (points.length === 1)
    points.push(points[0].clone().add(new THREE.Vector3(0, 0, 0.01)));

  // Quadratic corner fillets stay inside the 4 m avenue, unlike unrestricted
  // Catmull-Rom splines, which can overshoot into the surrounding buildings.
  const path = new THREE.CurvePath();
  let last = points[0];
  for (let index = 1; index < points.length - 1; index++) {
    const before = points[index - 1],
      corner = points[index],
      after = points[index + 1],
      radius = Math.min(
        0.85,
        before.distanceTo(corner) * 0.3,
        corner.distanceTo(after) * 0.3,
      ),
      enter = corner
        .clone()
        .addScaledVector(before.clone().sub(corner).normalize(), radius),
      exit = corner
        .clone()
        .addScaledVector(after.clone().sub(corner).normalize(), radius);
    if (last.distanceTo(enter) > 0.001)
      path.add(new THREE.LineCurve3(last, enter));
    path.add(new THREE.QuadraticBezierCurve3(enter, corner, exit));
    last = exit;
  }
  path.add(new THREE.LineCurve3(last, points.at(-1)));
  path.updateArcLengths();
  return path;
}

function makeRig(scene, index) {
  const root = new THREE.Group();
  root.name = `Obra CRM ${index + 1} · metáfora visual, sin GPS`;
  root.userData = { construction: true, simulated: true, gps: false };
  root.visible = false;
  scene.add(root);
  const resources = [],
    boxGeometry = new THREE.BoxGeometry(1, 1, 1),
    wheelGeometry = new THREE.CylinderGeometry(0.29, 0.29, 0.16, 14),
    coneGeometry = new THREE.ConeGeometry(0.16, 0.48, 10),
    materials = Object.fromEntries(
      Object.entries({
        yellow: "#ffbf24",
        dark: "#26374b",
        chrome: "#9bafb9",
        glass: "#183f59",
        white: "#f7f4e8",
        tire: "#29333a",
        orange: "#ff6a27",
        cargo: "#4bb5a0",
        plank: "#b98b55",
        light: "#fff1a6",
        red: "#ec573e",
      }).map(([name, color]) => {
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness: name === "glass" ? 0.22 : 0.7,
          metalness: name === "chrome" ? 0.6 : 0,
        });
        resources.push(material);
        return [name, material];
      }),
    );
  resources.push(boxGeometry, wheelGeometry, coneGeometry);
  const dummy = new THREE.Object3D();
  function batch(parent, name, color, parts) {
    const mesh = new THREE.InstancedMesh(
      boxGeometry,
      materials[color],
      parts.length,
    );
    mesh.name = name;
    parts.forEach(([x, y, z, sx, sy, sz, rz = 0], n) => {
      dummy.position.set(x, y, z);
      dummy.scale.set(sx, sy, sz);
      dummy.rotation.set(0, 0, rz);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    resources.push(mesh);
    return mesh;
  }
  function box(parent, name, color, xyz, dimensions) {
    const mesh = new THREE.Mesh(boxGeometry, materials[color]);
    mesh.name = name;
    mesh.position.set(...xyz);
    mesh.scale.set(...dimensions);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const crane = new THREE.Group();
  crane.name = "Grúa torre de montaje y desmontaje";
  root.add(crane);
  const tower = [],
    foundation = [];
  for (const x of [-0.38, 0.38])
    for (const z of [-0.38, 0.38]) {
      tower.push([x, 5.2, z, 0.11, 10.4, 0.11]);
      foundation.push([x * 1.3, 0.18, z * 1.3, 0.42, 0.36, 0.42]);
    }
  for (let y = 0.55; y < 10.4; y += 0.78) {
    tower.push(
      [0, y, -0.38, 0.8, 0.065, 0.065],
      [0, y, 0.38, 0.8, 0.065, 0.065],
    );
    tower.push(
      [0, y + 0.38, -0.38, 0.065, 1.07, 0.065, Math.PI / 4],
      [0, y + 0.38, 0.38, 0.065, 1.07, 0.065, -Math.PI / 4],
    );
  }
  batch(crane, "Celosía amarilla de la torre", "yellow", tower);
  batch(crane, "Zapatas y lastres", "chrome", foundation);
  const jib = new THREE.Group();
  jib.position.y = 10.5;
  jib.name = "Pluma giratoria";
  crane.add(jib);
  const beams = [
    [1.15, 0, 0, 7.8, 0.13, 0.52],
    [1.15, 0.5, 0, 7.8, 0.1, 0.12],
  ];
  for (let x = -2.5; x < 4.8; x += 0.65)
    beams.push([x, 0.25, 0, 0.07, 0.65, 0.065, Math.PI / 4]);
  batch(jib, "Celosía de la pluma", "yellow", beams);
  box(jib, "Contrapeso de la grúa", "dark", [-2.2, -0.2, 0], [1.1, 0.75, 0.75]);
  box(
    jib,
    "Cabina del gruista",
    "white",
    [-0.4, -0.32, 0.48],
    [0.7, 0.68, 0.6],
  );
  box(
    jib,
    "Cristal de la cabina",
    "glass",
    [-0.4, -0.27, 0.79],
    [0.55, 0.35, 0.025],
  );
  const trolley = new THREE.Group();
  trolley.name = "Carro, cable y gancho";
  trolley.position.x = 3;
  jib.add(trolley);
  box(trolley, "Carro", "dark", [0, -0.1, 0], [0.35, 0.2, 0.7]);
  const cable = box(
    trolley,
    "Cable de elevación",
    "dark",
    [0, -2, 0],
    [0.022, 3.7, 0.022],
  );
  const hook = new THREE.Group();
  hook.name = "Gancho con panel reutilizable";
  trolley.add(hook);
  box(hook, "Aparejo", "orange", [0, 0, 0], [0.23, 0.3, 0.23]);
  const lifted = box(
    hook,
    "Panel de obra",
    "cargo",
    [0, -0.46, 0],
    [1.1, 0.14, 0.8],
  );
  const barriers = [];
  for (const sign of [-1, 1]) {
    barriers.push(
      [sign * 2.05, 0.45, 0, 0.09, 0.09, 3.9],
      [0, 0.45, sign * 2.05, 3.9, 0.09, 0.09],
    );
    for (const x of [-1.7, 1.7])
      barriers.push([x, 0.27, sign * 2.05, 0.06, 0.54, 0.06]);
  }
  const site = new THREE.Group();
  site.name = "Perímetro de obra";
  root.add(site);
  batch(site, "Vallas de seguridad", "yellow", barriers);
  for (const x of [-2.25, 2.25])
    for (const z of [-2.25, 2.25]) {
      const cone = new THREE.Mesh(coneGeometry, materials.orange);
      cone.position.set(x, 0.24, z);
      site.add(cone);
    }
  const truck = new THREE.Group();
  truck.name = "Camión de materiales de obra · no edificio transportado";
  root.add(truck);
  batch(truck, "Chasis y estribos", "dark", [
    [0, 0.43, 0, 1.38, 0.2, 3.1],
    [0, 0.77, -0.45, 1.48, 0.16, 1.95],
    [-0.78, 0.45, 0.91, 0.16, 0.13, 0.65],
    [0.78, 0.45, 0.91, 0.16, 0.13, 0.65],
  ]);
  batch(truck, "Cabina blanca", "white", [
    [0, 1.04, 0.95, 1.38, 1.0, 1.0],
    [0, 1.59, 0.91, 1.5, 0.12, 1.05],
  ]);
  batch(truck, "Parabrisas y ventanillas", "glass", [
    [0, 1.23, 1.46, 1.17, 0.4, 0.025],
    [-0.7, 1.25, 0.97, 0.025, 0.38, 0.65],
    [0.7, 1.25, 0.97, 0.025, 0.38, 0.65],
  ]);
  batch(truck, "Parachoques, parrilla y espejos", "chrome", [
    [0, 0.58, 1.54, 1.45, 0.18, 0.12],
    [0, 0.87, 1.475, 0.62, 0.13, 0.03],
    [-0.84, 1.21, 1.09, 0.16, 0.16, 0.07],
    [0.84, 1.21, 1.09, 0.16, 0.16, 0.07],
  ]);
  batch(truck, "Faros", "light", [
    [-0.5, 0.85, 1.49, 0.2, 0.16, 0.04],
    [0.5, 0.85, 1.49, 0.2, 0.16, 0.04],
  ]);
  batch(truck, "Pilotos traseros", "red", [
    [-0.5, 0.57, -1.58, 0.16, 0.12, 0.04],
    [0.5, 0.57, -1.58, 0.16, 0.12, 0.04],
  ]);
  const wheels = [];
  for (const x of [-0.73, 0.73])
    for (const z of [-1.05, 0.91]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.29, z);
      truck.add(pivot);
      const tire = new THREE.Mesh(wheelGeometry, materials.tire);
      tire.rotation.z = Math.PI / 2;
      pivot.add(tire);
      wheels.push(pivot);
      const hub = new THREE.Mesh(wheelGeometry, materials.chrome);
      hub.rotation.z = Math.PI / 2;
      hub.scale.set(0.45, 1.03, 0.45);
      pivot.add(hub);
    }
  const cargo = new THREE.Group();
  cargo.name = "Paquete de paneles, puntales y materiales";
  truck.add(cargo);
  batch(cargo, "Paneles apilados", "cargo", [
    [0, 0.92, -0.55, 1.2, 0.14, 1.63],
    [0, 1.09, -0.55, 1.16, 0.14, 1.58],
    [0, 1.26, -0.55, 1.12, 0.14, 1.54],
  ]);
  batch(cargo, "Correas y listones", "plank", [
    [-0.48, 1.12, -0.55, 0.07, 0.56, 1.64],
    [0.48, 1.12, -0.55, 0.07, 0.56, 1.64],
  ]);
  let previousDistance = 0;
  return {
    root,
    crane,
    jib,
    trolley,
    cable,
    hook,
    lifted,
    site,
    truck,
    cargo,
    materials,
    activate(job) {
      root.visible = true;
      previousDistance = 0;
      materials.cargo.color.set(job.color || "#4bb5a0");
      crane.scale.y = Math.max(0.66, (job.height + 1.7) / 10.5);
      for (const wheel of wheels) wheel.rotation.x = 0;
    },
    draw(job, elapsed) {
      const atOrigin = job.phase === "deconstruct",
        atDestination = job.phase === "build",
        plot = atOrigin ? job.from : job.to,
        side = Math.sign(accessPoint(plot).roadZ - plot.z);
      crane.visible = site.visible = atOrigin || atDestination;
      crane.position.set(plot.x + 1.98, plot.y, plot.z + side * 2.65);
      site.position.copy(plot);
      const swing = (Math.sin(elapsed * 2) + 1) / 2,
        buildingYaw = Math.atan2(side * 2.65, -1.98),
        truckYaw = Math.atan2(-side * 0.9, -1.98),
        turn = Math.atan2(
          Math.sin(truckYaw - buildingYaw),
          Math.cos(truckYaw - buildingYaw),
        ),
        loadHeight = THREE.MathUtils.lerp(
          job.height * job.buildProgress + 0.9,
          1.8,
          swing,
        ),
        length = Math.max(0.75, 10.5 - loadHeight / crane.scale.y - 0.35);
      jib.rotation.y = buildingYaw + turn * swing;
      trolley.position.x = THREE.MathUtils.lerp(
        Math.hypot(1.98, 2.65),
        Math.hypot(1.98, 0.9),
        swing,
      );
      cable.scale.y = length;
      cable.position.y = -length * 0.5 - 0.2;
      hook.position.y = -length - 0.35;
      lifted.rotation.y = Math.sin(elapsed * 2.2) * 0.13;
      lifted.visible = !job.completed && !job.awaitingOwner;
      const k = job.truckProgress,
        position = job.route.getPointAt(k),
        tangent = job.route.getTangentAt(Math.min(0.99999, k));
      truck.position.copy(position);
      truck.rotation.y = Math.atan2(tangent.x, tangent.z);
      cargo.visible =
        job.phase === "transport" ||
        (atOrigin && job.progress > 0.13) ||
        (atDestination && job.buildProgress < 0.5);
      const distance = job.routeLength * k,
        delta = distance - previousDistance;
      for (const wheel of wheels) wheel.rotation.x += delta / 0.29;
      previousDistance = distance;
      if (job.phase === "transport") job.focusPosition.copy(position);
      else job.focusPosition.copy(plot);
      root.updateMatrixWorld(true);
    },
    deactivate() {
      root.visible = false;
    },
    dispose() {
      root.removeFromParent();
      for (const resource of resources) resource.dispose();
    },
  };
}

export function createConstructionDirector({
  scene,
  architecture,
  reducedMotion = false,
  maxActive = 2,
}) {
  const capacity = Math.max(1, Math.min(2, maxActive)),
    rigs = reducedMotion
      ? []
      : Array.from({ length: capacity }, (_, index) => makeRig(scene, index)),
    active = new Map(),
    queue = [],
    history = new Map(),
    pendingFinished = [];
  let disposed = false,
    now = 0,
    attendanceResolver = null;
  function finish(job, status = "complete") {
    architecture.updateEntity(job.id, { position: job.to, buildProgress: 1 });
    job.rig?.deactivate();
    active.delete(job.id);
    Object.assign(job, phaseAt(CONSTRUCTION_DURATION));
    job.status = status;
    job.awaitingOwner = false;
    job.focusPosition.copy(job.to);
    job.rig = null;
    if (status === "complete") pendingFinished.push(job.id);
  }
  function activate(job, elapsed) {
    job.startedAt = elapsed;
    job.status = "active";
    job.phase = "deconstruct";
    job.rig = rigs.find(
      (rig) => ![...active.values()].some((value) => value.rig === rig),
    );
    active.set(job.id, job);
    architecture.updateEntity(job.id, { position: job.from, buildProgress: 1 });
    job.rig.activate(job);
    job.rig.draw(job, elapsed);
  }
  function drain(elapsed) {
    while (queue.length && active.size < capacity) {
      // A representative cannot attend two construction sites at once. A
      // blocked owner's next job does not block another representative's work.
      const index = queue.findIndex(
        (job) =>
          !job.ownerId ||
          ![...active.values()].some(
            (current) => current.ownerId === job.ownerId,
          ),
      );
      if (index < 0) break;
      activate(queue.splice(index, 1)[0], elapsed);
    }
  }
  function cancel(id) {
    const job = history.get(id);
    if (!job || !["active", "queued"].includes(job.status)) return false;
    const index = queue.indexOf(job);
    if (index >= 0) queue.splice(index, 1);
    finish(job, "cancelled");
    drain(now);
    return true;
  }
  function start(spec) {
    if (disposed || !architecture.entities.has(spec.id)) return null;
    const previous = history.get(spec.id);
    if (
      previous &&
      previous.to.distanceToSquared(spec.to) < 0.00001 &&
      previous.status !== "cancelled"
    )
      return previous;
    const from =
      previous && ["active", "queued"].includes(previous.status)
        ? previous.to.clone()
        : spec.from.clone();
    cancel(spec.id);
    const to = spec.to.clone(),
      route = constructionRoute(from, to),
      entity = architecture.entities.get(spec.id),
      job = {
        ...spec,
        from,
        to,
        route,
        routeLength: route.getLength(),
        height: entity.model.height * entity.scaleY,
        requestedAt: spec.startedAt ?? now,
        startedAt: spec.startedAt ?? now,
        duration: reducedMotion ? 0 : CONSTRUCTION_DURATION,
        phase: "queued",
        status: "queued",
        progress: 0,
        buildProgress: 1,
        truckProgress: 0,
        completed: false,
        attendanceGateEnabled: Boolean(attendanceResolver && spec.ownerId),
        awaitingOwner: false,
        attendanceStatus: spec.ownerId ? "not-required" : "unassigned",
        holdSeconds: 0,
        waitingSince: null,
        buildStartedAt: null,
        focusPosition: from.clone(),
        rig: null,
      };
    history.set(job.id, job);
    if (reducedMotion) finish(job);
    else {
      queue.push(job);
      drain(Math.max(now, job.startedAt));
    }
    return job;
  }
  function setAttendanceResolver(resolver) {
    attendanceResolver = typeof resolver === "function" ? resolver : null;
    if (!attendanceResolver) return;
    for (const job of [...active.values(), ...queue]) {
      // Installing a resolver never dismantles a storey that is already built.
      if (job.ownerId && job.progress < 0.68 && !job.completed)
        job.attendanceGateEnabled = true;
    }
  }
  function attendedPhase(job, elapsed) {
    const age = Math.max(0, elapsed - job.startedAt),
      buildBoundary = job.duration * 0.68;
    if (!job.attendanceGateEnabled || age < buildBoundary)
      return phaseAt(age, job.duration);
    if (job.buildStartedAt === null) {
      if (job.waitingSince === null)
        job.waitingSince = job.startedAt + buildBoundary;
      // Let the attendance provider observe the arriving job's build phase on
      // this very frame, rather than only the previous transport frame.
      Object.assign(job, phaseAt(buildBoundary, job.duration));
      const waited = Math.max(0, elapsed - job.waitingSince);
      let ready = !attendanceResolver,
        status = ready ? "resolver-removed" : "waiting";
      if (attendanceResolver) {
        try {
          const attendance = attendanceResolver(job.id, job);
          ready =
            attendance?.readyForBuild === true &&
            (!attendance.ownerId || attendance.ownerId === job.ownerId);
          if (ready) status = "ready";
        } catch {
          // Presentation callbacks cannot break the city render loop or block
          // a job indefinitely. The explicit timeout remains the fallback.
          status = "resolver-error";
        }
      }
      job.holdSeconds = waited;
      job.attendanceStatus = status;
      job.awaitingOwner = !ready && waited < CONSTRUCTION_OWNER_WAIT_LIMIT;
      if (job.awaitingOwner) return phaseAt(buildBoundary, job.duration);
      if (!ready) job.attendanceStatus = "timeout";
      // Starting from the release frame preserves the full 3.84 s assembly,
      // even when the representative arrives after the nominal completion.
      job.buildStartedAt = elapsed;
    }
    return phaseAt(
      buildBoundary + Math.max(0, elapsed - job.buildStartedAt),
      job.duration,
    );
  }
  function update(elapsed) {
    now = elapsed;
    for (const job of [...active.values()]) {
      Object.assign(job, attendedPhase(job, elapsed));
      if (job.completed) {
        finish(job);
        continue;
      }
      // At transport, zero-sized instances may change their origin, but the
      // complete building never travels through the city with the truck.
      const position = job.phase === "deconstruct" ? job.from : job.to;
      architecture.updateEntity(job.id, {
        position,
        buildProgress: job.buildProgress,
      });
      job.rig.draw(job, elapsed);
    }
    drain(elapsed);
    return {
      active: active.size,
      queued: queue.length,
      finished: pendingFinished.splice(0),
      moving: active.size > 0,
    };
  }
  function clear() {
    for (const job of [...active.values(), ...queue]) finish(job, "cancelled");
    queue.length = 0;
    active.clear();
    history.clear();
    pendingFinished.length = 0;
  }
  function snapshot(job) {
    return {
      id: job.id,
      dealId: job.id,
      phase: job.phase,
      status: job.status,
      progress: job.progress,
      buildProgress: job.buildProgress,
      truckProgress: job.truckProgress,
      from: job.from.toArray(),
      to: job.to.toArray(),
      focusPosition: job.focusPosition.toArray(),
      startedAt: job.startedAt,
      requestedAt: job.requestedAt,
      duration: job.duration,
      ownerId: job.ownerId,
      accountId: job.accountId,
      awaitingOwner: job.awaitingOwner,
      attendanceStatus: job.attendanceStatus,
      holdSeconds: job.holdSeconds,
      waitingSince: job.waitingSince,
      buildStartedAt: job.buildStartedAt,
      waitLimitSeconds: CONSTRUCTION_OWNER_WAIT_LIMIT,
      truckPosition: job.rig?.truck.position.toArray(),
    };
  }
  function debug() {
    return {
      active: [...active.values()].map(snapshot),
      queued: queue.map(snapshot),
      completed: [...history.values()]
        .filter((job) => job.status === "complete")
        .map(snapshot),
      count: active.size,
      queueCount: queue.length,
      reducedMotion,
      rigCount: rigs.length,
      visibleRigs: rigs.filter((rig) => rig.root.visible).length,
    };
  }
  return {
    start,
    update,
    cancel,
    clear,
    setAttendanceResolver,
    has: (id) => active.has(id) || queue.some((job) => job.id === id),
    get: (id) => history.get(id) || null,
    debug,
    getDiagnostics: debug,
    dispose() {
      if (disposed) return;
      clear();
      rigs.forEach((rig) => rig.dispose());
      disposed = true;
    },
  };
}
