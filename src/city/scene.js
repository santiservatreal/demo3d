import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  createArchitecture,
  dealHeight,
  HEIGHT_SCALE,
} from "./architecture.js";
import { createTraffic } from "./traffic.js";
import { stageKind, needsAttention as modelNeedsAttention } from "./model.js";

const COLORS = ["#70a1b5", "#77afa5", "#cbb078", "#d49c7c", "#81ab8a"];
const tmp = new THREE.Object3D(),
  v3 = new THREE.Vector3(),
  ray = new THREE.Raycaster(),
  pointer = new THREE.Vector2();
const clamp = THREE.MathUtils.clamp,
  lerp = THREE.MathUtils.lerp;
const euro = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length * 0.5)] || 0;
};
const p95 = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length * 0.95)] || 0;
};
const semanticId = (e) => e.id;
function safeColor(value, fallback) {
  try {
    return new THREE.Color(value || fallback).getStyle();
  } catch {
    return fallback;
  }
}

export async function createCityScene({
  container,
  labelContainer,
  onSelect = () => {},
  onHover = () => {},
  onReady = () => {},
  onError = () => {},
  onNavigate = () => {},
  reducedMotion = false,
}) {
  let disposed = false,
    active = true,
    raf = 0,
    state = null,
    selectedId = null,
    quality = "balanced",
    qualitySetting = "auto",
    mode = "explore",
    lastTime = 0,
    elapsed = 0,
    lastAuto = 0,
    lastLabel = 0;
  let layers = {
      labels: true,
      connections: true,
      activity: true,
      traffic: true,
    },
    filteredIds = null,
    transitionList = [],
    connections = [],
    celebrations = [],
    flight = null,
    followFocus = null;
  const frameTimes = [],
    submitTimes = [],
    entityGroups = new Map(),
    entityData = new Map(),
    positions = new Map(),
    stageLabels = new Map(),
    entityLabels = new Map(),
    identity = new Map();
  const w = () => Math.max(1, container.clientWidth),
    h = () => Math.max(1, container.clientHeight);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#e9eee9");
  scene.fog = new THREE.Fog("#e9eee9", 130, 245);
  const camera = new THREE.OrthographicCamera(-50, 50, 30, -30, 0.1, 350);
  camera.position.set(54, 55, 68);
  camera.lookAt(0, 1, 0);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch (error) {
    onError(error);
    throw error;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor("#e9eee9");
  renderer.domElement.className = "city-webgl";
  renderer.domElement.style.cssText =
    "width:100%;height:100%;display:block;touch-action:none;";
  container.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minPolarAngle = 0.28;
  controls.maxPolarAngle = Math.PI * 0.455;
  controls.minZoom = 0.65;
  controls.maxZoom = 5.4;
  controls.maxTargetRadius = 120;
  controls.zoomSpeed = 0.75;
  controls.panSpeed = 0.7;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  controls.addEventListener("start", () => {
    flight = null;
    followFocus = null;
    mode = "explore";
    onNavigate();
  });
  controls.addEventListener("change", () => {
    if (active && !raf) schedule();
  });
  scene.add(new THREE.HemisphereLight("#e9f0ed", "#b0ad96", 1.4));
  const sun = new THREE.DirectionalLight("#fff3d8", 2.6);
  sun.position.set(-30, 65, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -52;
  sun.shadow.camera.right = 52;
  sun.shadow.camera.top = 42;
  sun.shadow.camera.bottom = -42;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 130;
  sun.shadow.normalBias = 0.04;
  sun.shadow.bias = -0.0002;
  sun.shadow.radius = 3;
  scene.add(sun);
  sun.target.position.set(0, 0, 0);
  scene.add(sun.target);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let env;
  try {
    const hdr = await new RGBELoader().loadAsync("/assets/luma/studio.hdr");
    env = pmrem.fromEquirectangular(hdr);
    hdr.dispose();
  } catch {
    env = pmrem.fromScene(new RoomEnvironment(), 0.04);
  }
  scene.environment = env.texture;
  scene.environmentIntensity = 0.38;
  pmrem.dispose();
  const architecture = createArchitecture(scene);
  const worldResources = [];
  const world = makeWorld(scene, worldResources);
  let landMinZ = -26.5;
  const overflowBase = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: "#d5d8c9", roughness: 0.86 }),
  );
  const overflowPavement = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: "#dedfd2", roughness: 0.86 }),
  );
  overflowBase.visible = overflowPavement.visible = false;
  overflowBase.receiveShadow = overflowBase.castShadow = true;
  overflowPavement.receiveShadow = true;
  scene.add(overflowBase, overflowPavement);
  const traffic = createTraffic(THREE, { scene, reducedMotion });
  const ringGeometry = new THREE.RingGeometry(2.15, 2.23, 64);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: "#255c61",
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.285;
  ring.visible = false;
  scene.add(ring);
  const priorityMesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.18, 0),
    new THREE.MeshStandardMaterial({ color: "#b34d43", roughness: 0.8 }),
    96,
  );
  priorityMesh.count = 0;
  priorityMesh.castShadow = false;
  scene.add(priorityMesh);
  const activityMesh = new THREE.InstancedMesh(
    new THREE.TorusGeometry(0.12, 0.035, 4, 10),
    new THREE.MeshBasicMaterial({ color: "#3e777c" }),
    96,
  );
  activityMesh.count = 0;
  scene.add(activityMesh);
  const celebrationMesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.075, 0),
    new THREE.MeshBasicMaterial({
      color: "#c4b377",
      transparent: true,
      opacity: 0.85,
    }),
    64,
  );
  celebrationMesh.count = 0;
  celebrationMesh.frustumCulled = false;
  scene.add(celebrationMesh);
  const markerLabels = new Map();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  let initialReady = false,
    firstFrameResolve;
  const ready = new Promise((resolve) => (firstFrameResolve = resolve));
  const clickStart = { x: 0, y: 0, time: 0, id: null };
  const activePointers = new Set();
  let pointerDown = false,
    multiTouch = false,
    maxDrag = 0;
  renderer.domElement.addEventListener("pointerdown", handleDown);
  renderer.domElement.addEventListener("pointerup", handleUp);
  renderer.domElement.addEventListener("pointermove", handleMove);
  renderer.domElement.addEventListener("pointerleave", handleLeave);
  renderer.domElement.addEventListener("pointercancel", handleCancel);
  document.addEventListener("visibilitychange", handleVisibility);

  function resize() {
    const width = w(),
      height = h(),
      aspect = width / height;
    const extra = Math.max(0, -26.5 - landMinZ);
    const vertical =
      width < 600
        ? Math.max(67 + extra * 0.5, (96 + extra * 0.65) / aspect)
        : Math.max(54 + extra * 0.5, (88 + extra * 0.65) / aspect);
    camera.left = (-vertical * aspect) / 2;
    camera.right = (vertical * aspect) / 2;
    const footerOffset = width < 600 ? 0 : 3.6;
    camera.top = vertical / 2 - footerOffset;
    camera.bottom = -vertical / 2 - footerOffset;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(pixelRatio());
    lastLabel = 0;
  }
  function pixelRatio() {
    const native = Math.min(window.devicePixelRatio || 1, 2);
    return Math.min(
      native,
      quality === "high" ? 1.8 : quality === "balanced" ? 1.35 : 1,
    );
  }
  function setQuality(next) {
    if (!["high", "balanced", "light", "auto"].includes(next)) return;
    qualitySetting = next;
    applyQuality(next === "auto" ? "balanced" : next);
  }
  function applyQuality(next) {
    quality = next;
    renderer.setPixelRatio(pixelRatio());
    renderer.shadowMap.enabled = next !== "light";
    const shadowSize = next === "high" ? 3072 : 2048;
    if (sun.shadow.mapSize.x !== shadowSize) {
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.mapSize.set(shadowSize, shadowSize);
    }
    renderer.shadowMap.needsUpdate = true;
    architecture.setDetail(next !== "light");
    traffic.setQuality?.(quality);
    traffic.setEnabled?.(
      layers.traffic && !reducedMotion && quality !== "light",
    );
    lastAuto = elapsed;
  }
  function cityStages() {
    return [...(state?.stages || [])]
      .filter((stage) => stageKind(state, stage.id) !== "lost")
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  function plotFor(stageId, index) {
    const stages = cityStages(),
      stageIndex = Math.max(
        0,
        stages.findIndex((stage) => stage.id === stageId),
      ),
      cols = stages.length;
    const centers =
        cols === 5
          ? [-31.25, -15.5, 0, 15.5, 31.25]
          : Array.from(
              { length: cols },
              (_, i) => -31.5 + ((i + 0.5) * 63) / Math.max(1, cols),
            ),
      center = centers[stageIndex] || 0;
    const spacing = cols > 5 ? 63 / cols / 3.5 : 4.2;
    const order = [
      [-1, -17],
      [0, -17],
      [-0.58, -3.4],
      [0.58, -3.4],
      [-0.58, 2.6],
      [0.58, 2.6],
      [1, -17],
      [-1, -22],
      [0, -22],
      [1, -22],
    ];
    let x, z;
    if (index < 10) {
      const [col, row] = order[index];
      x = center + col * spacing;
      z = row;
      if (index >= 2 && index <= 5) {
        if (cols === 5) {
          if (stageIndex === 0) x = col < 0 ? -34 : -29.5;
          if (stageIndex === 4) x = col < 0 ? 29.5 : 34;
          if (Math.abs(x) < 3.8) x = x < 0 ? -5 : 5;
        } else {
          // Reserve two physical columns per district from sidewalk intervals.
          // All candidates clear road edges by the scaled facade half-width.
          const scale = cols > 5 ? 4.1 / cols : 1,
            half = 1.85 * scale,
            pitch = 3.8 * scale,
            candidates = [];
          for (const [a, b] of [
            [-37 + half, -27.4 - half - 0.15],
            [-22.6 + half + 0.15, -2.4 - half - 0.15],
            [2.4 + half + 0.15, 22.6 - half - 0.15],
            [27.4 + half + 0.15, 37 - half],
          ])
            for (let p = a; p <= b + 0.001; p += pitch) candidates.push(p);
          const free = [...candidates],
            columns = [];
          for (const c of centers) {
            free.sort((a, b) => Math.abs(a - c) - Math.abs(b - c));
            columns.push(free.splice(0, 2).sort((a, b) => a - b));
          }
          x = columns[stageIndex]?.[col < 0 ? 0 : 1] ?? center;
        }
      }
    } else {
      x = center + (((index - 10) % 3) - 1) * spacing;
      z = -27.2 - Math.floor((index - 10) / 3) * 5.1;
    }
    return new THREE.Vector3(x, 0.1, z);
  }
  function accountPlot(index) {
    return new THREE.Vector3(
      -32 + (index % 9) * 8,
      0.1,
      index < 9 ? 15.65 : 21.35,
    );
  }
  function stageColor(stageId) {
    const stage = state?.stages?.find((s) => s.id === stageId);
    return safeColor(
      stage?.color,
      COLORS[Math.max(0, state?.stages?.indexOf(stage) || 0) % COLORS.length],
    );
  }
  function needsAttention(deal) {
    return (
      !!state &&
      modelNeedsAttention(deal, {
        ...state,
        activities: state.activities || [],
      })
    );
  }
  function sync(
    next,
    { filteredIds: ids, selectedId: id, layers: nextLayers } = {},
  ) {
    if (disposed) return;
    const previous = state;
    state = next;
    if (ids !== undefined)
      filteredIds = ids instanceof Set ? ids : new Set(ids || []);
    if (id !== undefined) selectedId = id;
    if (nextLayers) setLayers(nextLayers);
    const deals = state.deals || [],
      accounts = state.accounts || [],
      stageCounts = new Map();
    // Prefer immutable CRM plotIndex. New arrivals take a free destination plot;
    // existing deals retain their own parcel until a stage transition occurs.
    const used = new Map();
    for (const deal of deals) {
      const old = positions.get(deal.id);
      if (old && old.stageId === deal.stageId) {
        let set = used.get(deal.stageId);
        if (!set) used.set(deal.stageId, (set = new Set()));
        set.add(old.slot);
      }
    }
    function freeSlot(stageId, preferred) {
      let set = used.get(stageId);
      if (!set) used.set(stageId, (set = new Set()));
      let slot = Number.isInteger(preferred) ? preferred : 0;
      while (set.has(slot)) slot++;
      set.add(slot);
      return slot;
    }
    for (let index = 0; index < deals.length; index++) {
      const deal = deals[index],
        old = positions.get(deal.id),
        stage = deal.stageId,
        changed = old && old.stageId !== stage;
      const slot =
          old && !changed
            ? old.slot
            : freeSlot(stage, changed ? 0 : stageCounts.get(stage) || 0),
        target = plotFor(stage, slot),
        visible =
          stageKind(state, stage) !== "lost" &&
          (!filteredIds || filteredIds.has(deal.id));
      stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);
      entityData.set(deal.id, { ...deal, entityType: "deal" });
      if (!architecture.entities.has(deal.id)) {
        const e = architecture.addEntity(
          {
            id: deal.id,
            amount: deal.amount,
            variant: index,
            accent: stageColor(stage),
          },
          target,
        );
        entityGroups.set(deal.id, e.group);
        identity.set(deal.id, e.group.uuid);
      }
      const e = architecture.entities.get(deal.id);
      if (changed && visible && previous) {
        const from = e.group.position.clone();
        transitionList = transitionList.filter((t) => t.id !== deal.id);
        transitionList.push({
          id: deal.id,
          from,
          to: target.clone(),
          start: elapsed,
          duration: reducedMotion ? 0.01 : 2.1,
          color: stageColor(stage),
          won: stageKind(state, stage) === "won",
        });
        if (layers.connections)
          addConnection(from, target, stageColor(stage), 3.2, "transition");
        if (stageKind(state, stage) === "won" && !reducedMotion)
          celebrations.push({
            position: target.clone(),
            height: e.model.height,
            start: elapsed,
          });
        if (stageKind(state, stage) === "won" && deal.accountId) {
          const a = positions.get(deal.accountId);
          if (a && layers.connections)
            addConnection(target, a.target, "#709f85", 4.2, "customer");
        }
      } else if (!transitionList.some((t) => t.id === deal.id))
        e.group.position.copy(target);
      positions.set(deal.id, {
        stageId: stage,
        slot,
        target,
        height: e.model.height,
      });
      architecture.updateEntity(deal.id, {
        accent: stageColor(stage),
        visible,
        scaleY: dealHeight(deal.amount) / e.baseHeight,
        scaleXZ: cityStages().length > 5 ? 4.1 / cityStages().length : 1,
      });
    }
    for (let index = 0; index < accounts.length; index++) {
      const account = accounts[index],
        target = accountPlot(index);
      entityData.set(account.id, { ...account, entityType: "account" });
      if (!architecture.entities.has(account.id)) {
        const e = architecture.addEntity(
          { id: account.id, client: true, variant: index, accent: "#8cae94" },
          target,
        );
        entityGroups.set(account.id, e.group);
        identity.set(account.id, e.group.uuid);
      }
      positions.set(account.id, {
        stageId: "clients",
        slot: index,
        target,
        height: architecture.entities.get(account.id).model.height,
      });
      architecture.updateEntity(account.id, { visible: true });
    }
    if (!architecture.meshes.length) architecture.build();
    updateLand();
    makeStageLabels();
    updateMarkers();
    if (selectedId) select(selectedId);
    else ring.visible = false;
    renderer.shadowMap.needsUpdate = true;
    lastLabel = 0;
    if (!initialReady) {
      initialReady = true;
      onReady({ renderer: "WebGL2", heightScale: HEIGHT_SCALE });
    }
    schedule();
  }
  function updateLand() {
    const required = Math.min(
      -26.5,
      ...[...positions]
        .filter(([id]) => architecture.entities.get(id)?.visible)
        .map(([, p]) => p.target.z - 3),
      ...transitionList.map((t) => t.from.z - 3),
    );
    if (Math.abs(required - landMinZ) < 0.1) return;
    landMinZ = required;
    const depth = Math.max(0, -26.5 - landMinZ);
    overflowBase.visible = overflowPavement.visible = depth > 0.1;
    overflowBase.position.set(0, -0.7, (-26.5 + landMinZ) / 2);
    overflowBase.scale.set(77, 1.45, depth);
    overflowPavement.position.set(0, 0.12, (-26.5 + landMinZ) / 2);
    overflowPavement.scale.set(75, 0.14, depth);
    controls.maxTargetRadius = Math.max(120, -landMinZ + 65);
    sun.shadow.camera.bottom = -Math.max(42, -landMinZ + 4);
    sun.shadow.camera.updateProjectionMatrix();
    resize();
    if (!selectedId) overview();
  }
  function addConnection(a, b, color, duration, type) {
    if (reducedMotion) return;
    while (connections.length >= 4) {
      const old = connections.shift();
      old.line.removeFromParent();
      old.line.geometry.dispose();
      old.line.material.dispose();
    }
    const points = new THREE.CatmullRomCurve3([
      a.clone().add(new THREE.Vector3(0, 0.5, 0)),
      a
        .clone()
        .lerp(b, 0.5)
        .add(new THREE.Vector3(0, 5.5, 0)),
      b.clone().add(new THREE.Vector3(0, 0.5, 0)),
    ]).getPoints(48);
    const material =
      type === "transition"
        ? new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
          })
        : new THREE.LineDashedMaterial({
            color,
            transparent: true,
            opacity: 0.58,
            depthWrite: false,
            dashSize: 0.32,
            gapSize: 0.2,
          });
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      material,
    );
    line.computeLineDistances();
    line.name = `CRM ${type} relation`;
    scene.add(line);
    connections.push({ line, start: elapsed, duration, type });
  }
  function select(id) {
    if (id !== selectedId) {
      connections = connections.filter((c) => {
        if (c.type !== "selected") return true;
        c.line.removeFromParent();
        c.line.geometry.dispose();
        c.line.material.dispose();
        return false;
      });
    }
    selectedId = id;
    const e = architecture.entities.get(id);
    ring.visible = !!e?.visible;
    if (e) {
      ring.position.set(e.group.position.x, 0.285, e.group.position.z);
      if (layers.connections && entityData.get(id)?.entityType === "deal") {
        const d = entityData.get(id),
          account = architecture.entities.get(d.accountId);
        if (account && !connections.some((c) => c.type === "selected"))
          addConnection(
            e.group.position,
            account.group.position,
            "#799c91",
            3.5,
            "selected",
          );
      }
    }
    lastLabel = 0;
  }
  function focus(id, { panelWidth = 350 } = {}) {
    const e = architecture.entities.get(id);
    if (!e) return;
    select(id);
    followFocus = id;
    const mobile = window.matchMedia("(max-width: 640px)").matches;
    const target = e.group.position.clone();
    target.y = 2;
    const desiredZoom = mobile ? 2.8 : 2.5;
    const offset = camera.position
      .clone()
      .sub(controls.target)
      .normalize()
      .multiplyScalar(90);
    const right = new THREE.Vector3().setFromMatrixColumn(
      camera.matrixWorld,
      0,
    );
    const worldPerPixel = (camera.right - camera.left) / desiredZoom / w();
    target.addScaledVector(
      right,
      mobile ? 0 : panelWidth * 0.42 * worldPerPixel,
    );
    if (mobile) {
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      target.addScaledVector(
        up,
        (-0.24 * (camera.top - camera.bottom)) / desiredZoom,
      );
    }
    flight = {
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      fromZoom: camera.zoom,
      toTarget: target,
      toPos: target.clone().add(offset),
      toZoom: desiredZoom,
      start: elapsed,
      duration: reducedMotion ? 0.01 : 0.9,
    };
    schedule();
  }
  function overview() {
    followFocus = null;
    flight = {
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      fromZoom: camera.zoom,
      toTarget: new THREE.Vector3(0, 1, (landMinZ + 26.5) / 2),
      toPos: new THREE.Vector3(54, 55, 68 + (landMinZ + 26.5) / 2),
      toZoom: 1,
      start: elapsed,
      duration: reducedMotion ? 0.01 : 1.1,
    };
    mode = "explore";
    schedule();
  }
  function zoomBy(factor) {
    flight = null;
    camera.zoom = clamp(
      camera.zoom * factor,
      controls.minZoom,
      controls.maxZoom,
    );
    camera.updateProjectionMatrix();
    controls.update();
    onNavigate();
    schedule();
  }
  function setLayers(next) {
    layers = { ...layers, ...next };
    traffic.setEnabled?.(
      layers.traffic && !reducedMotion && quality !== "light",
    );
    for (const c of connections) c.line.visible = layers.connections;
    activityMesh.visible = layers.activity;
    lastLabel = 0;
    schedule();
  }
  function setMode(next) {
    if (next === "tv") overview();
    mode = next === "tv" ? "tv" : "explore";
  }
  function setActive(next) {
    active = !!next;
    lastTime = 0;
    if (active) schedule();
    else {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  function handleVisibility() {
    lastTime = 0;
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (active) schedule();
  }
  function handleDown(e) {
    activePointers.add(e.pointerId);
    pointerDown = true;
    if (activePointers.size === 1) {
      clickStart.x = e.clientX;
      clickStart.y = e.clientY;
      clickStart.time = performance.now();
      clickStart.id = e.pointerId;
      maxDrag = 0;
      multiTouch = false;
    } else multiTouch = true;
  }
  function handleUp(e) {
    const isTap =
      !multiTouch &&
      activePointers.size === 1 &&
      e.pointerId === clickStart.id &&
      maxDrag < 7 &&
      Math.hypot(e.clientX - clickStart.x, e.clientY - clickStart.y) < 7 &&
      performance.now() - clickStart.time < 650;
    activePointers.delete(e.pointerId);
    pointerDown = activePointers.size > 0;
    if (!pointerDown) {
      multiTouch = false;
      maxDrag = 0;
    }
    if (isTap) {
      const hit = pick(e.clientX, e.clientY);
      if (hit) {
        select(hit);
        onSelect(hit);
      } else {
        onSelect(null);
        select(null);
      }
    }
  }
  function handleCancel(e) {
    activePointers.delete(e.pointerId);
    pointerDown = activePointers.size > 0;
    multiTouch = pointerDown;
    if (!pointerDown) maxDrag = 0;
  }
  function handleMove(e) {
    if (pointerDown) {
      if (e.pointerId === clickStart.id)
        maxDrag = Math.max(
          maxDrag,
          Math.hypot(e.clientX - clickStart.x, e.clientY - clickStart.y),
        );
      return;
    }
    if (e.pointerType === "touch") return;
    const id = pick(e.clientX, e.clientY);
    renderer.domElement.style.cursor = id ? "pointer" : "grab";
    onHover(id, id ? entityData.get(id) : null, { x: e.clientX, y: e.clientY });
  }
  function handleLeave() {
    onHover(null);
    renderer.domElement.style.cursor = "grab";
  }
  function pick(x, y) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      (-(y - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const hits = ray.intersectObjects(
      architecture.meshes.filter(
        (m) =>
          m.visible &&
          ["city-kit-mass", "city-kit-glass", "city-kit-accent"].includes(
            m.name,
          ),
      ),
      false,
    );
    for (const hit of hits) {
      const id = architecture.entityId(hit);
      if (id && architecture.entities.get(id)?.visible) return id;
    }
    return null;
  }
  function projectEntity(id) {
    const e = architecture.entities.get(id);
    if (!e) return null;
    const point = e.group.position
      .clone()
      .add(new THREE.Vector3(0, e.model.height * 0.45, 1.7));
    point.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      id,
      x: rect.left + (point.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-point.y * 0.5 + 0.5) * rect.height,
      visible:
        e.visible &&
        point.z > -1 &&
        point.z < 1 &&
        Math.abs(point.x) < 1 &&
        Math.abs(point.y) < 1,
    };
  }
  function makeStageLabels() {
    if (!labelContainer) return;
    const currentStages = cityStages();
    for (const [id, el] of stageLabels)
      if (id !== "clients" && !currentStages.some((stage) => stage.id === id)) {
        el.remove();
        stageLabels.delete(id);
      }
    for (const [stageIndex, stage] of currentStages.entries()) {
      let el = stageLabels.get(stage.id);
      if (!el) {
        el = document.createElement("div");
        el.className = "city-district-label";
        el.style.cssText =
          "position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;transform:translate(-50%,-50%);text-align:center;color:#314e4b;font-family:inherit;";
        labelContainer.append(el);
        stageLabels.set(stage.id, el);
      }
      const deals = (state.deals || []).filter((d) => d.stageId === stage.id);
      el.innerHTML = "";
      const title = document.createElement("span");
      title.textContent = `${String(stageIndex + 1).padStart(2, "0")}  ${stage.name}`;
      title.style.cssText =
        "display:block;font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:800;";
      const sub = document.createElement("span");
      sub.textContent = `${deals.length} · ${deals.every((d) => typeof d.amount === "number" && Number.isFinite(d.amount)) ? euro.format(deals.reduce((n, d) => n + d.amount, 0)) : "No disponible"}`;
      sub.style.cssText =
        "display:block;font-size:10px;margin-top:3px;color:#6b7d72;";
      el.append(title, sub);
    }
    let clients = stageLabels.get("clients");
    if (!clients) {
      clients = document.createElement("div");
      clients.className = "city-district-label city-clients-label";
      clients.style.cssText =
        "position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;text-align:center;font-size:10px;letter-spacing:.13em;color:#59725f;font-weight:800;";
      labelContainer.append(clients);
      stageLabels.set("clients", clients);
    }
    clients.textContent = `CLIENTES · ${(state?.accounts || []).length} CUENTAS ACTIVAS`;
  }
  function updateMarkers() {
    let p = 0,
      a = 0;
    for (const [id, e] of architecture.entities) {
      const d = entityData.get(id);
      if (!e.visible || d?.entityType !== "deal") continue;
      if (needsAttention(d)) {
        tmp.position
          .copy(e.group.position)
          .add(new THREE.Vector3(0, e.model.height + 0.28, 0));
        tmp.scale.set(1, 1, 1);
        tmp.rotation.set(0, 0, 0);
        tmp.updateMatrix();
        priorityMesh.setMatrixAt(p++, tmp.matrix);
      } else if (
        state.activities?.some((x) => x.dealId === id && x.status === "pending")
      ) {
        tmp.position
          .copy(e.group.position)
          .add(new THREE.Vector3(0, e.model.height + 0.2, 0));
        tmp.scale.set(1, 1, 1);
        tmp.rotation.set(Math.PI / 2, 0, 0);
        tmp.updateMatrix();
        activityMesh.setMatrixAt(a++, tmp.matrix);
      }
    }
    priorityMesh.count = p;
    priorityMesh.instanceMatrix.needsUpdate = true;
    priorityMesh.computeBoundingSphere();
    activityMesh.count = a;
    activityMesh.instanceMatrix.needsUpdate = true;
    activityMesh.computeBoundingSphere();
  }
  function updateLabels() {
    if (!labelContainer || !state) return;
    const width = w(),
      height = h(),
      mobile = width < 650,
      max = mobile ? 4 : 10,
      occupied = [],
      rect = renderer.domElement.getBoundingClientRect();
    let count = 0;
    function position(el, point, labelWidth = 90, priority = false) {
      const worldPoint = point.clone();
      point.project(camera);
      let x = (point.x * 0.5 + 0.5) * width,
        y = (-point.y * 0.5 + 0.5) * height;
      const valid =
        layers.labels &&
        point.z > -1 &&
        point.z < 1 &&
        x > 30 &&
        x < width - 30 &&
        y > 18 &&
        y < height - 35 &&
        count < max;
      const overlap = occupied.some(
        (r) =>
          Math.abs(x - r.x) < (r.w + labelWidth) / 2 && Math.abs(y - r.y) < 29,
      );
      let occluded = false;
      if (valid && !priority) {
        ray.setFromCamera(new THREE.Vector2(point.x, point.y), camera);
        const distance = ray.ray.origin.distanceTo(worldPoint);
        const hit = ray.intersectObjects(
          architecture.meshes.filter(
            (m) => m.visible && m.name === "city-kit-mass",
          ),
          false,
        )[0];
        occluded = !!(hit && hit.distance < distance - 0.35);
      }
      el.hidden = !valid || (!priority && (overlap || occluded));
      if (!el.hidden) {
        el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-50%)`;
        occupied.push({ x, y, w: labelWidth });
        count++;
      }
    }
    const selected = architecture.entities.get(selectedId);
    const priorities = [];
    if (selected) priorities.push(selectedId);
    for (const [id, e] of architecture.entities)
      if (
        e.visible &&
        needsAttention(entityData.get(id) || {}) &&
        !priorities.includes(id)
      )
        priorities.push(id);
    const visibleIds = new Set();
    for (const id of priorities.slice(0, mobile ? 2 : 4)) {
      const e = architecture.entities.get(id),
        d = entityData.get(id);
      if (!e?.visible) continue;
      let el = entityLabels.get(id);
      if (!el) {
        el = document.createElement("button");
        el.type = "button";
        el.className = "city-entity-label";
        el.style.cssText =
          "position:absolute;top:0;left:0;min-height:30px;border:1px solid #c6d1c4;border-radius:7px;background:rgba(255,255,247,.96);box-shadow:0 3px 9px #455a4415;padding:5px 8px;color:#38584f;font-family:DM Sans,sans-serif;font-size:10px;font-weight:600;pointer-events:auto;white-space:nowrap;";
        el.onclick = () => {
          select(id);
          onSelect(id);
        };
        labelContainer.append(el);
        entityLabels.set(id, el);
      }
      el.replaceChildren();
      if (needsAttention(d) && layers.activity) {
        const badge = document.createElement("span");
        badge.textContent = "!";
        badge.style.cssText =
          "display:inline-grid;place-items:center;width:13px;height:13px;margin-right:5px;border-radius:50%;background:#b95046;color:white;font:700 9px sans-serif;";
        el.append(badge);
      }
      el.append(document.createTextNode(d.name || d.company || id));
      const point = e.group.position
        .clone()
        .add(new THREE.Vector3(0, e.model.height + 0.7, 0));
      position(el, point, 120, id === selectedId);
      visibleIds.add(id);
    }
    for (const [id, el] of entityLabels)
      if (!visibleIds.has(id)) el.hidden = true;
    const stages = cityStages();
    for (const [stageIndex, stage] of stages.entries()) {
      const first = plotFor(stage.id, 0),
        last = plotFor(stage.id, 6);
      const point = first.clone().lerp(last, 0.5);
      point.z = -24.8;
      point.y = 0.3;
      position(stageLabels.get(stage.id), point, 105);
    }
    const clientLabel = stageLabels.get("clients");
    if (clientLabel)
      position(clientLabel, new THREE.Vector3(0, 0.3, 24.4), 200);
    // A red exclamation is the non-colour counterpart of the 3D incident marker.
    const attentionIds = new Set();
    for (const [id, e] of architecture.entities) {
      if (!e.visible || !needsAttention(entityData.get(id) || {})) continue;
      attentionIds.add(id);
      let el = markerLabels.get(id);
      if (!el) {
        el = document.createElement("span");
        el.className = "city-alert-marker";
        el.textContent = "!";
        el.title = "Tarea vencida";
        el.style.cssText =
          "position:absolute;top:0;left:0;font:bold 10px sans-serif;color:#fff;background:#b95046;border:2px solid #fff8ed;border-radius:50%;width:16px;height:16px;line-height:12px;text-align:center;pointer-events:none;";
        labelContainer.append(el);
        markerLabels.set(id, el);
      }
      const point = e.group.position
        .clone()
        .add(new THREE.Vector3(0, e.model.height + 0.3, 0))
        .project(camera);
      el.hidden =
        !layers.activity ||
        (entityLabels.has(id) && !entityLabels.get(id).hidden) ||
        point.z > 1 ||
        point.z < -1 ||
        Math.abs(point.x) > 1 ||
        Math.abs(point.y) > 1;
      el.style.transform = `translate(${Math.round((point.x * 0.5 + 0.5) * width)}px,${Math.round((-point.y * 0.5 + 0.5) * height)}px) translate(-50%,-50%)`;
    }
    for (const [id, el] of markerLabels)
      if (!attentionIds.has(id)) el.hidden = true;
  }
  function updateTransitions() {
    let particleCount = 0;
    celebrations = celebrations.filter((c) => {
      const age = elapsed - c.start;
      if (age > 2.3) return false;
      for (let i = 0; i < 20 && particleCount < 64; i++) {
        const angle = i * 2.39996,
          r = 0.5 + age * 0.9;
        tmp.position.set(
          c.position.x + Math.cos(angle) * r,
          c.position.y +
            c.height +
            0.4 +
            Math.sin((age / 2.3) * Math.PI) * (1.2 + (i % 3) * 0.3),
          c.position.z + Math.sin(angle) * r,
        );
        tmp.scale.setScalar(Math.max(0, 1 - age / 2.3));
        tmp.rotation.set(age, angle, age);
        tmp.updateMatrix();
        celebrationMesh.setMatrixAt(particleCount++, tmp.matrix);
      }
      return true;
    });
    celebrationMesh.count = particleCount;
    celebrationMesh.instanceMatrix.needsUpdate = true;
    let moving = false;
    const priorTransitions = transitionList.length;
    transitionList = transitionList.filter((t) => {
      const k = clamp((elapsed - t.start) / t.duration, 0, 1),
        e = architecture.entities.get(t.id);
      if (!e) return false;
      const ease = k * k * (3 - 2 * k);
      const pos = t.from.clone().lerp(t.to, ease);
      pos.y += Math.sin(k * Math.PI) * 0.55;
      if (followFocus === t.id) {
        const shift = pos.clone().sub(e.group.position);
        if (flight) {
          flight.toTarget.add(shift);
          flight.toPos.add(shift);
        } else {
          camera.position.add(shift);
          controls.target.add(shift);
        }
      }
      architecture.updateEntity(t.id, { position: pos });
      if (selectedId === t.id) ring.position.set(pos.x, 0.285, pos.z);
      if (k >= 1) {
        renderer.shadowMap.needsUpdate = true;
        return false;
      }
      moving = true;
      return true;
    });
    if (moving) renderer.shadowMap.needsUpdate = true;
    if (priorTransitions && !transitionList.length) updateLand();
    connections = connections.filter((c) => {
      const k = (elapsed - c.start) / c.duration;
      c.line.material.opacity = 0.65 * Math.min(1, (1 - k) * 3);
      c.line.visible = layers.connections;
      if (k >= 1) {
        c.line.removeFromParent();
        c.line.geometry.dispose();
        c.line.material.dispose();
        return false;
      }
      return true;
    });
    if (moving) updateMarkers();
  }
  function tick(now) {
    raf = 0;
    if (disposed || !active || document.hidden) return;
    const realDelta = lastTime ? (now - lastTime) / 1000 : 0,
      delta = Math.min(realDelta, 0.12);
    if (lastTime && delta > 0) {
      frameTimes.push(now - lastTime);
      if (frameTimes.length > 240) frameTimes.shift();
    }
    lastTime = now;
    elapsed += realDelta;
    const start = performance.now();
    if (flight) {
      const k = clamp((elapsed - flight.start) / flight.duration, 0, 1),
        ease = k * k * (3 - 2 * k);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, ease);
      camera.position.lerpVectors(flight.fromPos, flight.toPos, ease);
      camera.zoom = lerp(flight.fromZoom, flight.toZoom, ease);
      camera.updateProjectionMatrix();
      if (k >= 1) flight = null;
    }
    controls.update();
    updateTransitions();
    if (!reducedMotion) traffic.update?.(delta, elapsed);
    if (elapsed - lastLabel > 0.12 || !lastLabel) {
      updateLabels();
      lastLabel = elapsed;
    }
    architecture.setDetail(quality !== "light" && camera.zoom > 0.8);
    renderer.render(scene, camera);
    submitTimes.push(performance.now() - start);
    if (submitTimes.length > 240) submitTimes.shift();
    firstFrameResolve?.();
    firstFrameResolve = null;
    if (
      qualitySetting === "auto" &&
      frameTimes.length > 90 &&
      elapsed - lastAuto > 14
    ) {
      const m = median(frameTimes);
      if (quality === "balanced" && m > 28) applyQuality("light");
      else if (quality === "light" && m < 18) applyQuality("balanced");
      lastAuto = elapsed;
    }
    schedule();
  }
  function schedule() {
    if (!raf && active && !disposed && !document.hidden)
      raf = requestAnimationFrame(tick);
  }
  function getDiagnostics() {
    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    return {
      renderer: "WebGL2",
      trafficRunning: layers.traffic && !reducedMotion && quality !== "light",
      mode,
      cameraMoving: !!flight,
      landMinZ,
      preset: quality,
      qualitySetting,
      dpr: renderer.getPixelRatio(),
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      cssWidth: w(),
      cssHeight: h(),
      internalWidth: size.x,
      internalHeight: size.y,
      frameSamples: frameTimes.length,
      frameMs: { median: median(frameTimes), p95: p95(frameTimes) },
      submitMs: { median: median(submitTimes), p95: p95(submitTimes) },
      entityCount: architecture.entities.size,
      transitionCount: transitionList.length,
      connectionCount: connections.length,
      traffic: traffic.debug?.() || null,
      visibleLabelCount: labelContainer?.querySelectorAll("[hidden]")
        ? Array.from(labelContainer.children).filter((x) => !x.hidden).length
        : 0,
      heightScale: HEIGHT_SCALE,
      reducedMotion,
      active,
    };
  }
  function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", handleVisibility);
    controls.dispose();
    traffic.dispose?.();
    architecture.dispose();
    for (const r of worldResources) r.dispose?.();
    for (const c of connections) {
      c.line.geometry.dispose();
      c.line.material.dispose();
    }
    ring.geometry.dispose();
    ring.material.dispose();
    priorityMesh.geometry.dispose();
    priorityMesh.material.dispose();
    activityMesh.geometry.dispose();
    activityMesh.material.dispose();
    celebrationMesh.geometry.dispose();
    celebrationMesh.material.dispose();
    overflowBase.geometry.dispose();
    overflowBase.material.dispose();
    overflowPavement.geometry.dispose();
    overflowPavement.material.dispose();
    env.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    for (const el of [
      ...stageLabels.values(),
      ...entityLabels.values(),
      ...markerLabels.values(),
    ])
      el.remove();
  }
  resize();
  setQuality("auto");
  setLayers(layers);
  schedule();
  return {
    sync,
    select,
    focus,
    overview,
    zoomBy,
    setQuality,
    setLayers,
    setMode,
    setActive,
    resize,
    dispose,
    getDiagnostics,
    projectEntity,
    entityGroups,
    debug: {
      ready,
      projectEntity,
      pick,
      entityGroups,
      renderer,
      scene,
      camera,
      controls,
      traffic,
      architecture,
      getDiagnostics,
      identity,
    },
  };
}

function makeWorld(scene, resources) {
  const root = new THREE.Group();
  root.name = "Atlas streets and civic landscape";
  scene.add(root);
  const buckets = new Map();
  const mat = (name, color, roughness = 0.86) => {
    const m = new THREE.MeshStandardMaterial({ name, color, roughness });
    resources.push(m);
    return m;
  };
  const materials = {
    stone: mat("Limestone pavement", "#dedfd2"),
    base: mat("Warm limestone plinth", "#d5d8c9"),
    asphalt: mat("Quiet asphalt", "#a7b0a9"),
    curb: mat("Limestone curb", "#f1eee2"),
    white: mat("Road paint", "#eae9dd"),
    lawn: mat("Urban planting", "#a1b58b"),
    soil: mat("Planter soil", "#9e8d72"),
    wood: mat("Oak street furniture", "#aa916f"),
    metal: mat("Muted street metal", "#64847c"),
    leaf: mat("Tree canopies", "#92aa7d"),
    trunk: mat("Tree bark", "#9c8c70"),
    water: mat("Civic fountain", "#9abfb7", 0.2),
  };
  const noiseCanvas = document.createElement("canvas");
  noiseCanvas.width = noiseCanvas.height = 128;
  const noiseContext = noiseCanvas.getContext("2d");
  const pixels = noiseContext.createImageData(128, 128);
  let seed = 714;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const shade = 238 + (seed % 11);
    pixels.data[i] = shade;
    pixels.data[i + 1] = shade;
    pixels.data[i + 2] = shade;
    pixels.data[i + 3] = 255;
  }
  noiseContext.putImageData(pixels, 0, 0);
  const asphaltTexture = new THREE.CanvasTexture(noiseCanvas);
  asphaltTexture.wrapS = asphaltTexture.wrapT = THREE.RepeatWrapping;
  asphaltTexture.repeat.set(18, 4);
  asphaltTexture.colorSpace = THREE.SRGBColorSpace;
  materials.asphalt.map = asphaltTexture;
  resources.push(asphaltTexture);
  const box = new THREE.BoxGeometry(1, 1, 1),
    round = new RoundedBoxGeometry(1, 1, 1, 2, 0.035),
    cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    leaf = new THREE.IcosahedronGeometry(0.5, 1);
  resources.push(box, round, cylinder, leaf);
  function piece(key, geometry, p, s, rot = 0, color) {
    tmp.position.set(...p);
    tmp.scale.set(...s);
    tmp.rotation.set(0, rot, 0);
    tmp.updateMatrix();
    const g = geometry.clone().applyMatrix4(tmp.matrix);
    if (g.index) g.toNonIndexed();
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(g);
  }
  const b = (key, x, y, z, w, hh, d, rot = 0) =>
    piece(key, box, [x, y, z], [w, hh, d], rot);
  piece("base", round, [0, -0.7, 0], [77, 1.45, 53]);
  b("stone", 0, -0.035, 0, 75, 0.18, 51);
  // Raised sidewalk islands leave the road surfaces physically exposed.
  b("stone", 0, 0.12, -18.75, 74, 0.14, 13.5);
  b("stone", 0, 0.12, 18.55, 74, 0.14, 13.9);
  for (const x of [-12.5, 12.5]) b("stone", x, 0.12, 0, 19.6, 0.14, 12.8);
  for (const x of [-32.5, 32.5]) b("stone", x, 0.12, 0, 9.6, 0.14, 12.8);
  // Two avenues connected by two outer turns and a civic pedestrian cross street.
  for (const z of [-9, 9]) b("asphalt", 0, 0.073, z, 54.8, 0.014, 4.8);
  for (const x of [-25, 25]) b("asphalt", x, 0.074, 0, 4.8, 0.014, 18);
  b("asphalt", 0, 0.075, 0, 4.8, 0.014, 24);
  for (const z of [-11.5, -6.5, 6.5, 11.5])
    for (const [x, width] of [
      [-14, 23.2],
      [14, 23.2],
    ])
      b("curb", x, 0.155, z, width, 0.15, 0.2);
  for (const x of [-27.5, -22.5, 22.5, 27.5])
    b("curb", x, 0.155, 0, 0.2, 0.15, 12.7);
  for (const x of [-2.5, 2.5])
    for (const z of [-16.7, 0, 16.7])
      b("curb", x, 0.155, z, 0.18, 0.15, z === 0 ? 12.5 : 10.4);
  for (const z of [-9, 9])
    for (let x = -20; x <= 20; x += 4.5)
      if (Math.abs(x) > 3) b("white", x, 0.087, z, 1.6, 0.012, 0.075);
  for (const z of [-9, 9])
    for (let i = -3; i <= 3; i++)
      b("white", i * 0.47, 0.091, z, 0.24, 0.014, 4.0);
  for (const z of [-4.5, 4.5])
    for (let i = -3; i <= 3; i++)
      b("white", 0, 0.092, z + i * 0.4, 4, 0.014, 0.22);
  for (const x of [-25, 25])
    for (let z = -3; z <= 3; z += 3) b("white", x, 0.088, z, 0.075, 0.01, 1.2);
  // District courtyards and the customer promenade are deliberately decorative.
  for (const x of [-31.75, -15.75, 0, 15.75, 31.75]) {
    b("lawn", x, 0.19, -23.2, 10, 0.08, 0.85);
    if (x !== 0) b("stone", x, 0.19, -0.3, 10.8, 0.04, 0.9);
  }
  b("curb", 0, 0.17, 18.5, 70, 0.045, 1.1);
  b("lawn", 0, 0.18, 25.1, 71, 0.06, 0.65);
  // The fountain is civic decoration, not an additional CRM record.
  piece("curb", cylinder, [-9, 0.32, 0.3], [3.4, 0.44, 3.4]);
  piece("water", cylinder, [-9, 0.56, 0.3], [2.9, 0.04, 2.9]);
  piece("curb", cylinder, [-9, 0.85, 0.3], [0.65, 0.62, 0.65]);
  function tree(x, z, size = 1) {
    piece("curb", round, [x, 0.24, z], [1.2, 0.16, 1.2]);
    piece("soil", cylinder, [x, 0.34, z], [0.87, 0.08, 0.87]);
    piece("trunk", cylinder, [x, 1.02, z], [0.17, 1.4, 0.17]);
    piece("leaf", leaf, [x, 2.08, z], [1.5 * size, 2.1 * size, 1.5 * size]);
    piece(
      "leaf",
      leaf,
      [x - 0.28, 2.47, z + 0.09],
      [1.2 * size, 1.2 * size, 1.2 * size],
    );
  }
  for (let i = 0; i < 15; i++) {
    const x = -35 + i * 5;
    tree(x, 24.2, 0.75 + (i % 3) * 0.08);
  }
  for (const x of [-36.2, 36.2])
    for (const z of [-20, -11, -2, 7, 16]) tree(x, z, 0.9);
  for (const x of [-21, -9, 9, 21])
    for (const z of [-12.5, 5.2, 12.8]) tree(x, z, 0.8);
  for (const x of [-21.5, -9, 9, 21.5]) {
    const z = 18.7;
    b("wood", x, 0.65, z, 1.6, 0.13, 0.44);
    b("wood", x, 0.99, z - 0.23, 1.6, 0.48, 0.09);
    for (const dx of [-0.6, 0.6]) b("metal", x + dx, 0.43, z, 0.08, 0.43, 0.38);
  }
  for (const x of [-21, -9, 9, 21])
    for (const z of [-6, 6]) {
      piece("metal", cylinder, [x, 1.65, z], [0.065, 3.0, 0.065]);
      b("metal", x + 0.24, 3.08, z, 0.55, 0.06, 0.11);
      b("white", x + 0.37, 3.03, z, 0.27, 0.025, 0.15);
    }
  for (const [key, geometries] of buckets) {
    const nonIndex = geometries.map((g) => {
      if (g.index) {
        const out = g.toNonIndexed();
        g.dispose();
        return out;
      }
      return g;
    });
    const geometry = mergeGeometries(nonIndex);
    for (const g of nonIndex) g.dispose();
    const mesh = new THREE.Mesh(geometry, materials[key]);
    mesh.name = `Landscape ${key}`;
    mesh.receiveShadow = true;
    mesh.castShadow = ["leaf", "trunk", "wood", "metal", "base"].includes(key);
    root.add(mesh);
    resources.push(geometry);
  }
  return root;
}
