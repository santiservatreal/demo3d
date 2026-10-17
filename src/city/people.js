import * as THREE from "three";
import { stageKind } from "./model.js";
import { trafficLightState } from "./traffic.js";

/** Colour, route and pose are explanatory illustrations, never staff tracking. */
export const OWNER_COLORS = ["#007fd6", "#ee7c22", "#a24ed3", "#d43667"];
const GROUND = 0.2;
const STEP = 0.5;
const clamp = THREE.MathUtils.clamp;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const point = (value) => new THREE.Vector3(value.x, GROUND, value.z);
const publicPoint = (value) => [value.x, value.y, value.z];
const near = (a, b) => distance(a, b) < 0.04;
// Construction runs in compressed illustration time. This is never a real
// employee speed or a location feed; paths remain continuous on the pavement.
export const CONSTRUCTION_WALK_SPEED = 20;
export const CONSTRUCTION_OWNER_HOLD = 4;

/** Raised pavement and the painted crossings constitute a walkable graph. */
export function createPedestrianMap(entityPositions = new Map(), state = {}) {
  const lost = new Set(
    (state.deals || [])
      .filter((deal) => stageKind(state, deal.stageId) === "lost")
      .map((deal) => deal.id),
  );
  const footprints = [...entityPositions]
    .filter(([id]) => !lost.has(id))
    .map(([id, data]) => {
      const client =
        id.startsWith("account-") ||
        (state.accounts || []).some((account) => account.id === id);
      return {
        id,
        x: data.target.x,
        z: data.target.z,
        hx: client ? 1.92 : 2.07,
        hz: client ? 1.76 : 2.02,
      };
    });
  // Fountain, tree planters and benches are physical pavement obstructions too.
  const obstacles = [{ x: -9, z: 0.3, hx: 1.92, hz: 1.92 }];
  for (let index = 0; index < 15; index++)
    obstacles.push({ x: -35 + index * 5, z: 24.2, hx: 0.73, hz: 0.73 });
  for (const x of [-36.2, 36.2])
    for (const z of [-20, -11, -2, 7, 16])
      obstacles.push({ x, z, hx: 0.73, hz: 0.73 });
  for (const x of [-21, -9, 9, 21])
    for (const z of [-12.5, 5.2, 12.8])
      obstacles.push({ x, z, hx: 0.73, hz: 0.73 });
  for (const x of [-21.5, -9, 9, 21.5])
    obstacles.push({ x, z: 18.7, hx: 1.02, hz: 0.6 });
  const blockers = [...footprints, ...obstacles];
  const minZ = Math.min(-26, ...footprints.map((entry) => entry.z - 3));
  const bounds = { minX: -37, maxX: 37, minZ: Math.floor(minZ), maxZ: 25 };
  const xCuts = [
    ...new Set([
      -37,
      37,
      -27.6,
      27.6,
      -27.5,
      27.5,
      -22.5,
      22.5,
      -2.5,
      2.5,
      -1.2,
      1.2,
      ...blockers.flatMap((entry) => [entry.x - entry.hx, entry.x + entry.hx]),
    ]),
  ];
  const zCuts = [
    ...new Set([
      bounds.minZ,
      25,
      -12.1,
      12.1,
      -11.5,
      -6.5,
      6.5,
      11.5,
      -9.1,
      9.1,
      -5.15,
      -3.85,
      3.85,
      5.15,
      ...blockers.flatMap((entry) => [entry.z - entry.hz, entry.z + entry.hz]),
    ]),
  ];
  function roadAt(x, z) {
    if (Math.abs(z + 9) < 2.5 && Math.abs(x) < 27.6) return "north";
    if (Math.abs(z - 9) < 2.5 && Math.abs(x) < 27.6) return "south";
    if (Math.abs(Math.abs(x) - 25) < 2.5 && Math.abs(z) < 9.1) return "outer";
    if (Math.abs(x) < 2.5 && Math.abs(z) < 12.1) return "central";
    return null;
  }
  function isWalkable(x, z) {
    if (
      x < bounds.minX ||
      x > bounds.maxX ||
      z < bounds.minZ ||
      z > bounds.maxZ
    )
      return false;
    if (
      blockers.some(
        (entry) =>
          Math.abs(x - entry.x) < entry.hx && Math.abs(z - entry.z) < entry.hz,
      )
    )
      return false;
    const road = roadAt(x, z);
    if (!road) return true;
    // The through route only crosses active avenues at the existing zebra stripes.
    if (road === "north" || road === "south") return Math.abs(x) <= 1.2;
    // The civic spine carries no simulated vehicle lane. Its centre connects
    // the two zebra crossings; the lateral crossings join the central islands.
    if (road === "central")
      return Math.abs(x) <= 1.2 || Math.abs(Math.abs(z) - 4.5) <= 0.65;
    return false;
  }
  function segmentWalkable(a, b) {
    if (!isWalkable(a.x, a.z) || !isWalkable(b.x, b.z)) return false;
    // Walkability changes only at these rectangular boundaries. Testing every
    // interval catches even a very short diagonal cut across a forbidden corner.
    const times = [0, 1];
    for (const value of xCuts) {
      const t = (value - a.x) / (b.x - a.x);
      if (t > 0 && t < 1) times.push(t);
    }
    for (const value of zCuts) {
      const t = (value - a.z) / (b.z - a.z);
      if (t > 0 && t < 1) times.push(t);
    }
    times.sort((x, y) => x - y);
    for (let index = 1; index < times.length; index++) {
      const t = (times[index] + times[index - 1]) / 2;
      if (
        !isWalkable(
          THREE.MathUtils.lerp(a.x, b.x, t),
          THREE.MathUtils.lerp(a.z, b.z, t),
        )
      )
        return false;
    }
    return true;
  }
  return {
    bounds,
    footprints,
    obstacles,
    roadAt,
    isWalkable,
    segmentWalkable,
    step: STEP,
  };
}

/** Deterministic A* over pavement; smoothing never cuts through a building. */
export function planPedestrianRoute(map, origin, destination) {
  const { bounds } = map;
  const width = Math.round((bounds.maxX - bounds.minX) / STEP) + 1;
  const height = Math.round((bounds.maxZ - bounds.minZ) / STEP) + 1;
  const encode = (x, z) => z * width + x;
  const decode = (id) => ({ x: id % width, z: Math.floor(id / width) });
  const world = (id) => {
    const cell = decode(id);
    return new THREE.Vector3(
      bounds.minX + cell.x * STEP,
      GROUND,
      bounds.minZ + cell.z * STEP,
    );
  };
  const grid = (p) => ({
    x: clamp(Math.round((p.x - bounds.minX) / STEP), 0, width - 1),
    z: clamp(Math.round((p.z - bounds.minZ) / STEP), 0, height - 1),
  });
  const clearLine = (a, b) => map.segmentWalkable(a, b);
  const cellFor = (p) => {
    const cell = grid(p);
    let best = null,
      score = Infinity;
    for (let radius = 0; radius <= 7; radius++) {
      for (let dz = -radius; dz <= radius; dz++)
        for (let dx = -radius; dx <= radius; dx++) {
          if (radius && Math.max(Math.abs(dx), Math.abs(dz)) !== radius)
            continue;
          const x = cell.x + dx,
            z = cell.z + dz;
          if (x < 0 || x >= width || z < 0 || z >= height) continue;
          const id = encode(x, z),
            candidate = world(id),
            d = distance(p, candidate);
          if (
            map.isWalkable(candidate.x, candidate.z) &&
            clearLine(p, candidate) &&
            d < score
          ) {
            best = id;
            score = d;
          }
        }
      if (best !== null) return best;
    }
    return null;
  };
  if (
    !map.isWalkable(origin.x, origin.z) ||
    !map.isWalkable(destination.x, destination.z)
  )
    return [];
  if (clearLine(origin, destination))
    return [point(origin), point(destination)];
  const start = cellFor(origin),
    goal = cellFor(destination);
  if (start === null || goal === null) return [];
  const goalCell = decode(goal);
  const heuristic = (id) => {
    const cell = decode(id);
    return Math.abs(cell.x - goalCell.x) + Math.abs(cell.z - goalCell.z);
  };
  const scores = new Map([[start, 0]]),
    parents = new Map(),
    closed = new Set(),
    heap = [];
  const push = (id, score) => {
    let index = heap.length;
    heap.push({ id, score });
    while (index) {
      const parent = (index - 1) >> 1;
      if (heap[parent].score <= score) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = { id, score };
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop();
    if (heap.length) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (
          child + 1 < heap.length &&
          heap[child + 1].score < heap[child].score
        )
          child++;
        if (heap[child].score >= last.score) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = last;
    }
    return first.id;
  };
  push(start, heuristic(start));
  while (heap.length) {
    const id = pop();
    if (closed.has(id)) continue;
    if (id === goal) {
      const route = [point(destination)];
      let cursor = goal;
      while (cursor !== undefined) {
        route.push(world(cursor));
        cursor = parents.get(cursor);
      }
      route.push(point(origin));
      route.reverse();
      const smooth = [route[0]];
      let anchor = 0;
      while (anchor < route.length - 1) {
        let end = route.length - 1;
        while (end > anchor + 1 && !clearLine(route[anchor], route[end])) end--;
        if (!near(smooth.at(-1), route[end])) smooth.push(route[end]);
        anchor = end;
      }
      return smooth;
    }
    closed.add(id);
    const cell = decode(id);
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]) {
      const x = cell.x + dx,
        z = cell.z + dz;
      if (x < 0 || x >= width || z < 0 || z >= height) continue;
      const next = encode(x, z);
      if (closed.has(next)) continue;
      const p = world(next);
      if (!map.isWalkable(p.x, p.z)) continue;
      const score = scores.get(id) + 1;
      if (score >= (scores.get(next) ?? Infinity)) continue;
      scores.set(next, score);
      parents.set(next, id);
      push(next, score + heuristic(next));
    }
  }
  // An unavailable route means waiting; it never justifies a teleport.
  return [];
}

function makeAvatar(owner, index, resources) {
  const root = new THREE.Group();
  root.name = `Comercial ${owner.name}`;
  root.userData.ownerId = owner.id;
  const geometry = (value) => {
    resources.geometries.add(value);
    return value;
  };
  const material = (color, roughness = 0.72) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness });
    resources.materials.add(value);
    return value;
  };
  const suit = material(
    owner.color || OWNER_COLORS[index % OWNER_COLORS.length],
  );
  const trousers = material(index % 2 ? "#26334d" : "#213c43");
  const white = material("#fff8df"),
    skin = material(["#d59572", "#ecc49a", "#bd805c", "#d4a27e"][index % 4]);
  const hair = material(
    ["#382a24", "#3b251c", "#62442c", "#2b2529"][index % 4],
  );
  const shoes = material("#243236", 0.5),
    accessory = material("#334c66", 0.38);
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const rounded = geometry(new THREE.SphereGeometry(1, 10, 8));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 8));
  const part = (parent, geo, mat, pos, scale, name) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    mesh.scale.set(...scale);
    // Static city shadows are cached. A ground ring identifies the moving
    // avatar without leaving a stale shadow behind on the pavement.
    mesh.name = name;
    mesh.castShadow = false;
    mesh.userData.ownerId = owner.id;
    parent.add(mesh);
    return mesh;
  };
  part(
    root,
    rounded,
    skin,
    [0, 1.42, 0],
    [0.16, 0.19, 0.15],
    "Cabeza y rostro",
  );
  part(
    root,
    rounded,
    hair,
    [0, 1.54, -0.025],
    [0.171, 0.11, 0.16],
    "Pelo peinado",
  );
  if (index === 0 || index === 2)
    part(
      root,
      rounded,
      hair,
      [0, 1.37, -0.13],
      [0.11, 0.19, 0.105],
      "Recogido",
    );
  part(root, cylinder, skin, [0, 1.21, 0], [0.07, 0.16, 0.07], "Cuello");
  part(root, box, suit, [0, 1.0, 0], [0.37, 0.48, 0.24], "Chaqueta de equipo");
  part(root, box, white, [0, 1.12, 0.129], [0.1, 0.23, 0.018], "Camisa");
  part(
    root,
    box,
    suit,
    [-0.08, 1.13, 0.15],
    [0.075, 0.2, 0.025],
    "Solapa izquierda",
  ).rotation.z = -0.17;
  part(
    root,
    box,
    suit,
    [0.08, 1.13, 0.15],
    [0.075, 0.2, 0.025],
    "Solapa derecha",
  ).rotation.z = 0.17;
  part(
    root,
    box,
    white,
    [0.105, 1.05, 0.14],
    [0.035, 0.065, 0.016],
    "Acreditación",
  );
  const arms = [],
    legs = [];
  for (const sign of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sign * 0.245, 1.16, 0);
    root.add(arm);
    arms.push(arm);
    part(arm, cylinder, suit, [0, -0.16, 0], [0.065, 0.36, 0.065], "Manga");
    part(arm, rounded, skin, [0, -0.37, 0], [0.071, 0.09, 0.068], "Mano");
    const leg = new THREE.Group();
    leg.position.set(sign * 0.1, 0.78, 0);
    root.add(leg);
    legs.push(leg);
    part(leg, box, trousers, [0, -0.29, 0], [0.137, 0.59, 0.15], "Pantalón");
    part(leg, box, shoes, [0, -0.64, 0.045], [0.16, 0.12, 0.28], "Zapato");
  }
  const tablet = part(
    arms[1],
    box,
    accessory,
    [0, -0.36, 0.08],
    [0.21, 0.28, 0.045],
    "Tablet de propuestas",
  );
  part(
    tablet,
    box,
    white,
    [0, 0, 0.53],
    [0.82, 0.81, 0.07],
    "Pantalla de la propuesta",
  );
  const bag = part(
    arms[0],
    box,
    accessory,
    [0, -0.5, 0],
    [0.15, 0.23, 0.29],
    "Maletín de comercial",
  );
  part(bag, box, shoes, [0, 0.59, 0], [0.55, 0.2, 0.55], "Asa del maletín");
  const ring = new THREE.Mesh(
    geometry(new THREE.RingGeometry(0.26, 0.34, 24)),
    resources.ringMaterial,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  ring.name = "Identidad de responsable";
  root.add(ring);
  root.scale.setScalar(1.13);
  return { root, arms, legs, tablet, ring, owner };
}

export function createPeople({
  scene,
  reducedMotion = false,
  onSelectOwner = () => {},
} = {}) {
  if (!scene) throw new TypeError("People requires a Three.js scene");
  const root = new THREE.Group();
  root.name = "Equipo comercial · recorridos ilustrativos";
  scene.add(root);
  const resources = { geometries: new Set(), materials: new Set() };
  resources.ringMaterial = new THREE.MeshBasicMaterial({
    color: "#fff6cd",
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  resources.materials.add(resources.ringMaterial);
  const actors = new Map(),
    previousStages = new Map();
  let state = null,
    map = null,
    positions = new Map(),
    construction = null;
  let elapsed = 0,
    enabled = true,
    disposed = false,
    presentation = false,
    lastSyncTime = null,
    lastReplayScope = null,
    lastEventCount = 0;
  const previousPositions = new Map();
  const starts = [
    [-17, 12],
    [-11, 12],
    [11, 12],
    [17, 12],
  ];
  const patrols = [
    [-17, 12],
    [-11, 18.4],
    [11, 12],
    [17, 18.4],
    [3.5, 12],
    [-3.5, 12],
  ];

  function frontAt(center, variant = 0) {
    if (!center || !map) return null;
    const candidates = [
      // Front/right is visible from the default [54,55,68] city camera.
      [center.x - 0.8 + (variant % 4) * 0.6, center.z + 2.5],
      [center.x + (variant % 2 ? 0.35 : -0.35), center.z + 2.25],
      [center.x, center.z + 2.5],
      [center.x + 2.5, center.z],
      [center.x - 2.5, center.z],
      [center.x, center.z - 2.5],
    ];
    for (const [x, z] of candidates)
      if (map.isWalkable(x, z)) return new THREE.Vector3(x, GROUND, z);
    return null;
  }
  function frontOf(id, variant = 0) {
    return frontAt(positions.get(id)?.target, variant);
  }
  function beginWalk(actor, destination, arrival = "meeting") {
    if (!destination || !map) {
      actor.phase = "waiting-route";
      actor.activity = "Esperando acceso peatonal";
      return false;
    }
    const route = planPedestrianRoute(
      map,
      actor.avatar.root.position,
      destination,
    );
    if (!route.length) {
      actor.phase = "waiting-route";
      actor.activity = "Esperando acceso peatonal";
      return false;
    }
    actor.route = route;
    actor.routeIndex = 1;
    actor.arrival = arrival;
    actor.phase = near(actor.avatar.root.position, destination)
      ? arrival
      : "walking";
    actor.phaseSince = elapsed;
    return true;
  }
  function setAssignment(actor, deal, isWin = false) {
    actor.attendance = null;
    if (actor.attendanceQueue.length && startNextConstruction(actor)) return;
    actor.dealId = deal?.id || null;
    actor.accountId = deal?.accountId || null;
    actor.win = isWin;
    actor.winStep = isWin ? "client" : null;
    actor.targetEntityId = deal?.accountId || deal?.id || null;
    actor.activity = isWin
      ? "Cierre registrado · visitando al cliente"
      : "Revisando propuesta con el cliente";
    beginWalk(actor, frontOf(actor.targetEntityId, actor.index), "meeting");
    if (reducedMotion && actor.route.length) {
      actor.avatar.root.position.copy(actor.route.at(-1));
      actor.phase = "meeting";
    }
  }
  function patrol(actor) {
    actor.attendance = null;
    if (actor.attendanceQueue.length && startNextConstruction(actor)) return;
    actor.dealId = null;
    actor.accountId = null;
    actor.targetEntityId = null;
    actor.win = false;
    actor.winStep = null;
    actor.activity = "Paseando entre visitas";
    const [x, z] =
      patrols[(actor.patrolIndex++ + actor.index) % patrols.length];
    beginWalk(actor, new THREE.Vector3(x, GROUND, z), "patrol");
  }
  function goToConstruction(actor, step) {
    const attendance = actor.attendance;
    if (!attendance) return;
    attendance.step = step;
    actor.winStep = step;
    actor.targetEntityId = attendance.dealId;
    actor.activity =
      step === "source"
        ? `${attendance.stageName} · acompañando el desmontaje`
        : `${attendance.stageName} · acompañando la reconstrucción`;
    const destination = frontAt(
      step === "source" ? attendance.from : attendance.to,
      actor.index,
    );
    attendance[step === "source" ? "sourcePoint" : "destinationPoint"] =
      destination?.clone() || null;
    const arrivedPhase = step === "source" ? "meeting" : "waiting-build";
    if (reducedMotion && destination) {
      actor.avatar.root.position.copy(destination);
      actor.route = [destination.clone()];
      actor.routeIndex = 1;
      actor.phase = arrivedPhase;
      actor.phaseSince = elapsed;
    } else beginWalk(actor, destination, arrivedPhase);
  }
  function startNextConstruction(actor) {
    while (actor.attendanceQueue.length) {
      const attendance = actor.attendanceQueue.shift();
      const deal = state.deals.find((entry) => entry.id === attendance.dealId);
      const job = construction?.get?.(attendance.dealId);
      if (
        !deal ||
        deal.stageId !== attendance.stageId ||
        !job ||
        job.status === "cancelled"
      )
        continue;
      actor.attendance = attendance;
      actor.dealId = attendance.dealId;
      actor.accountId = deal.accountId;
      actor.win = attendance.kind === "won";
      actor.waitingForCrossing = false;
      const destinationFirst = reducedMotion || job.phase === "complete";
      goToConstruction(actor, destinationFirst ? "destination" : "source");
      return true;
    }
    return false;
  }
  function enqueueConstruction(actor, deal) {
    const job = construction?.get?.(deal.id);
    // A real scene job is required. Loading or Replay reconstruction alone must
    // never invent an attendance job from the snapshot's historical wins.
    if (!job || job.status === "cancelled" || !job.from || !job.to)
      return false;
    const token = `${deal.id}:${deal.stageId}:${deal.lastStageChangedAt || ""}`;
    if (
      actor.attendance?.token === token ||
      actor.attendanceQueue.some((entry) => entry.token === token)
    )
      return false;
    actor.attendanceQueue = actor.attendanceQueue.filter(
      (entry) => entry.dealId !== deal.id,
    );
    if (actor.attendance?.dealId === deal.id) actor.attendance = null;
    actor.attendanceQueue.push({
      token,
      dealId: deal.id,
      stageId: deal.stageId,
      stageName:
        state.stages.find((stage) => stage.id === deal.stageId)?.name ||
        deal.stageId,
      kind: stageKind(state, deal.stageId),
      from: point(job.from || previousPositions.get(deal.id)),
      to: point(job.to),
      step: "queued",
      sourceVisited: false,
      destinationArrivedAt: null,
    });
    if (!actor.attendance) startNextConstruction(actor);
    return true;
  }
  function sync(
    next,
    { entityPositions = positions, construction: director = construction } = {},
  ) {
    if (disposed) return;
    const initial = !state;
    const reset =
      state &&
      (Date.parse(next.now) < lastSyncTime ||
        (next.replay?.scope || null) !== lastReplayScope ||
        (Array.isArray(next.appliedEventIds) &&
          next.appliedEventIds.length < lastEventCount));
    state = next;
    positions = entityPositions || new Map();
    construction = director;
    const navigationPositions = new Map(positions);
    // A CRM record already points at its destination while the old building is
    // being dismantled. Its source remains a physical obstacle during the work.
    for (const deal of state.deals || []) {
      const job = construction?.get?.(deal.id);
      if (
        job?.from &&
        job.phase !== "complete" &&
        job.status !== "complete" &&
        job.status !== "cancelled"
      )
        navigationPositions.set(`construction-source:${deal.id}`, {
          target: job.from,
        });
    }
    map = createPedestrianMap(navigationPositions, state);
    const ownerIds = new Set((state.owners || []).map((owner) => owner.id));
    for (const [id, actor] of actors)
      if (!ownerIds.has(id)) {
        actor.avatar.root.removeFromParent();
        actors.delete(id);
      }
    for (const [index, owner] of (state.owners || []).entries()) {
      let actor = actors.get(owner.id);
      if (!actor) {
        const avatar = makeAvatar(owner, index, resources);
        root.add(avatar.root);
        const [x, z] = starts[index % starts.length];
        avatar.root.position.set(x, GROUND, z);
        actor = {
          avatar,
          owner: {
            ...owner,
            color: owner.color || OWNER_COLORS[index % OWNER_COLORS.length],
          },
          index,
          phase: "patrol",
          phaseSince: elapsed,
          route: [],
          routeIndex: 0,
          patrolIndex: 0,
          assignmentIndex: 0,
          activity: "Preparando visitas",
          win: false,
          winStep: null,
          attendance: null,
          attendanceQueue: [],
        };
        actors.set(owner.id, actor);
      }
      if (reset) {
        actor.attendance = null;
        actor.attendanceQueue = [];
        actor.route = [];
        actor.waitingForCrossing = false;
      }
      const owned = (state.deals || []).filter(
        (deal) => deal.ownerId === owner.id,
      );
      const freshTransitions =
        !initial && !reset
          ? owned.filter(
              (deal) =>
                stageKind(state, deal.stageId) !== "lost" &&
                previousStages.has(deal.id) &&
                previousStages.get(deal.id) !== deal.stageId,
            )
          : [];
      let assignedConstruction = false;
      for (const deal of freshTransitions)
        assignedConstruction =
          enqueueConstruction(actor, deal) || assignedConstruction;
      if (assignedConstruction) continue;
      if (
        initial ||
        reset ||
        (actor.dealId &&
          !owned.some(
            (deal) =>
              deal.id === actor.dealId &&
              stageKind(state, deal.stageId) !== "lost",
          ))
      ) {
        const meeting = owned.filter(
          (deal) =>
            stageKind(state, deal.stageId) === "open" &&
            /negotiat|proposal|negoci|propuesta/i.test(
              `${deal.stageId} ${state.stages.find((stage) => stage.id === deal.stageId)?.name || ""}`,
            ),
        );
        if (meeting.length)
          setAssignment(actor, meeting[index % meeting.length]);
        else patrol(actor);
      } else if (actor.phase === "walking" && actor.route.length) {
        // Stage updates can create a new footprint in a future path. Replan
        // from the current location instead of continuing through the building.
        beginWalk(actor, actor.route.at(-1), actor.arrival);
      }
    }
    previousStages.clear();
    previousPositions.clear();
    for (const deal of state.deals || [])
      previousStages.set(deal.id, deal.stageId);
    for (const [id, entry] of positions)
      previousPositions.set(id, entry.target.clone());
    lastSyncTime = Date.parse(next.now);
    lastReplayScope = next.replay?.scope || null;
    lastEventCount = next.appliedEventIds?.length || 0;
  }
  function crossingBlocked(actor, next) {
    if (!map) return false;
    const currentRoad = map.roadAt(
      actor.avatar.root.position.x,
      actor.avatar.root.position.z,
    );
    const nextRoad = map.roadAt(next.x, next.z);
    if (
      (nextRoad === "north" || nextRoad === "south") &&
      nextRoad !== currentRoad
    ) {
      return (
        trafficLightState(elapsed, nextRoad === "north" ? 0 : 2.5) !== "red"
      );
    }
    return false;
  }
  function move(actor, dt) {
    let remaining =
      dt * (actor.attendance ? CONSTRUCTION_WALK_SPEED : actor.win ? 4.2 : 3.4);
    let moved = 0;
    while (remaining > 0.00001 && actor.routeIndex < actor.route.length) {
      const target = actor.route[actor.routeIndex],
        current = actor.avatar.root.position;
      const length = distance(current, target);
      if (length < 0.005) {
        actor.routeIndex++;
        continue;
      }
      // Bounded substeps still test the zebra's stop line on a slow renderer.
      const travel = Math.min(remaining, length, 0.25),
        k = travel / length;
      const next = current.clone().lerp(target, k);
      // The segment can be smoothed across an avenue, so check its leading point.
      const check = current.clone().lerp(target, Math.min(1, 0.42 / length));
      if (crossingBlocked(actor, check)) {
        actor.waitingForCrossing = true;
        break;
      }
      actor.waitingForCrossing = false;
      const heading = Math.atan2(target.x - current.x, target.z - current.z);
      let turn =
        THREE.MathUtils.euclideanModulo(
          heading - actor.avatar.root.rotation.y + Math.PI,
          Math.PI * 2,
        ) - Math.PI;
      actor.avatar.root.rotation.y += turn * Math.min(1, dt * 10);
      current.copy(next);
      moved += travel;
      remaining -= travel;
      if (travel >= length - 1e-6) actor.routeIndex++;
    }
    if (actor.routeIndex >= actor.route.length) {
      actor.phase = actor.arrival || "meeting";
      actor.phaseSince = elapsed;
    }
    return moved;
  }
  function jobFor(id) {
    return id && construction?.get?.(id);
  }
  function constructionAttendance(actor) {
    const attendance = actor.attendance;
    if (!attendance) return null;
    const job = jobFor(attendance.dealId);
    if (!job || job.status === "cancelled") {
      actor.attendance = null;
      if (!startNextConstruction(actor)) patrol(actor);
      return null;
    }
    if (attendance.step === "source") {
      if (actor.phase === "meeting") {
        attendance.sourceVisited = true;
        attendance.sourceArrivedAt ??= elapsed;
      }
      if (
        attendance.sourceVisited &&
        elapsed - attendance.sourceArrivedAt >= 0.5 &&
        ["transport", "build", "complete"].includes(job.phase)
      )
        goToConstruction(actor, "destination");
    } else if (attendance.step === "destination") {
      const destination = attendance.destinationPoint;
      const atDestination =
        destination && distance(actor.avatar.root.position, destination) < 0.25;
      if (atDestination && actor.phase !== "walking") {
        attendance.destinationArrivedAt ??= elapsed;
        actor.phase = "waiting-build";
        actor.activity = `${attendance.stageName} · presente en la reconstrucción`;
        if (job.phase === "complete" || job.status === "complete") {
          attendance.step = "hold";
          attendance.completedAt = elapsed;
          actor.phase = actor.win ? "celebrating" : "construction-ready";
          actor.activity = actor.win
            ? "Venta cerrada · nueva sede lista"
            : `${attendance.stageName} · reconstrucción lista`;
        }
      }
    } else if (
      attendance.step === "hold" &&
      elapsed - attendance.completedAt >= CONSTRUCTION_OWNER_HOLD
    ) {
      actor.attendance = null;
      if (!startNextConstruction(actor)) patrol(actor);
    }
    return actor.attendance;
  }
  function update(dt, now) {
    if (disposed || !state || !enabled) return;
    const before = elapsed;
    if (Number.isFinite(now)) elapsed = now;
    else if (Number.isFinite(dt) && dt > 0) elapsed += dt;
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Scene dt is capped for camera stability; elapsed is the real visible
    // animation time. Consume it here so software rendering cannot strand an
    // avatar while construction has already advanced several seconds.
    const delta = Math.min(1, Math.max(dt, elapsed - before, 0));
    for (const actor of actors.values()) {
      let moved = 0;
      if (actor.attendance) {
        constructionAttendance(actor);
        if (actor.attendance && actor.phase === "walking" && !reducedMotion)
          moved = move(actor, delta);
        if (actor.attendance) constructionAttendance(actor);
      } else if (reducedMotion) continue;
      else if (actor.phase === "walking") moved = move(actor, delta);
      else if (
        actor.phase === "meeting" &&
        elapsed - actor.phaseSince > (actor.win ? 1.5 : 3.5)
      ) {
        if (actor.win && actor.winStep === "client") {
          actor.winStep = "destination";
          actor.targetEntityId = actor.dealId;
          actor.activity = "Venta cerrada · acompañando la nueva sede";
          beginWalk(actor, frontOf(actor.dealId, actor.index), "waiting-build");
        } else if (actor.win) {
          actor.phase = "celebrating";
          actor.phaseSince = elapsed;
        } else patrol(actor);
      } else if (actor.phase === "waiting-build") {
        const job = jobFor(actor.dealId);
        if (!job || job.phase === "complete" || job.status === "complete") {
          actor.phase = "celebrating";
          actor.phaseSince = elapsed;
          actor.activity = "Venta cerrada · nueva sede lista";
        } else
          actor.activity =
            job.phase === "transport"
              ? "Acompañando el traslado de la venta"
              : "Supervisando la construcción de la venta";
      } else if (
        actor.phase === "celebrating" &&
        elapsed - actor.phaseSince > 3.5
      )
        patrol(actor);
      else if (actor.phase === "patrol" && elapsed - actor.phaseSince > 1.5) {
        const meetings = state.deals.filter(
          (deal) =>
            deal.ownerId === actor.owner.id &&
            stageKind(state, deal.stageId) === "open" &&
            /proposal|negotiat|propuesta|negoci/i.test(deal.stageId),
        );
        if (meetings.length)
          setAssignment(
            actor,
            meetings[actor.assignmentIndex++ % meetings.length],
          );
        else patrol(actor);
      }
      const walk = moved > 0.001;
      actor.moving = walk;
      actor.walkDistance = (actor.walkDistance || 0) + moved;
      const swing = Math.sin(actor.walkDistance * 8.5) * (walk ? 0.43 : 0);
      actor.avatar.legs[0].rotation.x = swing;
      actor.avatar.legs[1].rotation.x = -swing;
      actor.avatar.arms[0].rotation.x = -swing * 0.65;
      actor.avatar.arms[1].rotation.x = [
        "meeting",
        "waiting-build",
        "construction-ready",
      ].includes(actor.phase)
        ? -0.7
        : swing * 0.45;
      actor.avatar.arms[1].rotation.z =
        actor.phase === "celebrating" ? -2.3 : 0;
      actor.avatar.root.position.y =
        GROUND +
        (walk ? Math.abs(Math.sin(actor.walkDistance * 8.5)) * 0.022 : 0);
      actor.avatar.ring.material.opacity = presentation ? 0.7 : 0.9;
    }
  }
  function pickHit(raycaster) {
    if (!enabled || disposed || !root.visible) return null;
    const hit = raycaster.intersectObject(root, true).find((entry) => {
      if (!entry.object.userData.ownerId) return false;
      let object = entry.object;
      while (object) {
        if (!object.visible) return false;
        object = object.parent;
      }
      return true;
    });
    return hit
      ? { ownerId: hit.object.userData.ownerId, distance: hit.distance }
      : null;
  }
  function initialsFor(owner) {
    return (
      owner.initials ||
      String(owner.name || "Comercial")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => [...part][0])
        .join("")
        .toUpperCase()
    );
  }
  function getConstructionAttendance(dealId) {
    for (const actor of actors.values()) {
      if (actor.attendance?.dealId === dealId) {
        const attendance = actor.attendance;
        const source =
          attendance.sourcePoint || frontAt(attendance.from, actor.index);
        const destination = attendance.destinationPoint;
        const atSource = Boolean(
          source && distance(actor.avatar.root.position, source) < 0.35,
        );
        const atDestination = Boolean(
          destination &&
          distance(actor.avatar.root.position, destination) < 0.35,
        );
        return {
          ownerId: actor.owner.id,
          phase: actor.phase,
          atSource,
          atDestination,
          readyForBuild: atDestination,
          queued: false,
          sourceVisited: attendance.sourceVisited,
          position: actor.avatar.root.position.clone(),
        };
      }
      if (actor.attendanceQueue.some((entry) => entry.dealId === dealId))
        return {
          ownerId: actor.owner.id,
          phase: "queued",
          atSource: false,
          atDestination: false,
          readyForBuild: false,
          queued: true,
          sourceVisited: false,
          position: actor.avatar.root.position.clone(),
        };
    }
    return null;
  }
  function getOwnerLabels() {
    if (!enabled || disposed) return [];
    return [...actors.values()].map((actor) => ({
      ownerId: actor.owner.id,
      initials: initialsFor(actor.owner),
      name: actor.owner.name,
      color: actor.owner.color,
      position: actor.avatar.root.position.clone(),
      dealId: actor.dealId || null,
      phase: actor.phase,
      attendingConstruction: Boolean(actor.attendance),
    }));
  }
  return {
    sync,
    update,
    setEnabled(value) {
      enabled = Boolean(value);
      root.visible = enabled;
    },
    setPresentation(value) {
      presentation = Boolean(value);
    },
    setQuality() {},
    getOwnerPosition(id) {
      return actors.get(id)?.avatar.root.position.clone() || null;
    },
    getOwnerLabels,
    getConstructionAttendance,
    pick(raycaster) {
      return pickHit(raycaster)?.ownerId || null;
    },
    pickHit,
    selectOwner(id) {
      if (actors.has(id)) onSelectOwner(id);
    },
    debug() {
      return {
        enabled,
        elapsed,
        source: "simulated-crm-role",
        reducedMotion,
        owners: [...actors.values()].map((actor) => ({
          ownerId: actor.owner.id,
          initials: initialsFor(actor.owner),
          name: actor.owner.name,
          color: actor.owner.color,
          activity: actor.waitingForCrossing
            ? "Esperando el paso peatonal"
            : actor.activity,
          phase: actor.phase,
          dealId: actor.dealId || null,
          accountId: actor.accountId || null,
          targetEntityId: actor.targetEntityId || null,
          position: publicPoint(actor.avatar.root.position),
          moving: Boolean(actor.moving),
          routeLength: actor.route.length,
          routeIndex: actor.routeIndex,
          distance: actor.walkDistance || 0,
          win: Boolean(actor.win),
          winStep: actor.winStep || null,
          attendingConstruction: Boolean(actor.attendance),
          constructionStageId: actor.attendance?.stageId || null,
          constructionStep: actor.attendance?.step || null,
          sourceVisited: Boolean(actor.attendance?.sourceVisited),
          queuedConstructionDeals: actor.attendanceQueue.map(
            (entry) => entry.dealId,
          ),
          movementSource: actor.attendance
            ? "compressed-construction-illustration"
            : "illustrative-pedestrian-route",
        })),
      };
    },
    dispose() {
      disposed = true;
      root.removeFromParent();
      actors.clear();
      for (const geometry of resources.geometries) geometry.dispose();
      for (const material of resources.materials) material.dispose();
    },
  };
}
