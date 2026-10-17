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
import { createConstructionDirector } from "./construction.js";
import { createPeople } from "./people.js";
import { createCommunicationsDistrict } from "./communications.js";
import { createIndustryDistrict } from "./industry.js";
import { stageKind, needsAttention as modelNeedsAttention } from "./model.js";
import { createSectorEmphasis } from "./sector-emphasis.js";

const COLORS = ["#338ee0", "#00a99a", "#f1ab29", "#9468d2", "#31ab64"];
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
  onSelectOwner = () => {},
  onSelectPlace = () => {},
  onSelectIndustry = () => {},
  onDistrictChange = () => {},
  reducedMotion = false,
}) {
  let disposed = false,
    active = true,
    raf = 0,
    state = null,
    selectedId = null,
    district = "sales",
    industryState = null,
    quality = "balanced",
    qualitySetting = "auto",
    mode = "explore",
    tvPresentation = false,
    lastPortraitTV = false,
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
    followFocus = null,
    followAnchor = null;
  const tvTour = {
    enabled: false,
    sequence: ["all", "sales", "all", "communications", "all", "industry"],
    index: 0,
    nextAt: 0,
    pausedUntil: 0,
    transitionDuration: 7,
    holdDuration: 9,
  };
  const frameTimes = [],
    submitTimes = [],
    entityGroups = new Map(),
    entityData = new Map(),
    positions = new Map(),
    stageLabels = new Map(),
    entityLabels = new Map(),
    ownerLabels = new Map(),
    placeLabels = new Map(),
    industryLabels = new Map(),
    sectorLabels = new Map(),
    identity = new Map();
  const w = () => Math.max(1, container.clientWidth),
    h = () => Math.max(1, container.clientHeight);
  let labelSpecs = [],
    labelLayoutDirty = true,
    lastCameraSignature = "",
    lastLayoutCameraSignature = "",
    lastCameraMotionAt = -1;
  const labelCache = new WeakMap();
  const labelMetrics = {
    contentBuilds: 0,
    measurements: 0,
    projectionFrames: 0,
    layoutPasses: 0,
    occlusionTests: 0,
  };
  const emphasis = createSectorEmphasis();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#e3eef2");
  scene.fog = new THREE.Fog("#e3eef2", 145, 265);
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
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor("#e3eef2");
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
    mode = tvPresentation ? "tv" : "explore";
    pauseTVTour();
    onNavigate();
  });
  controls.addEventListener("change", () => {
    if (active && !raf) schedule();
  });
  scene.add(new THREE.HemisphereLight("#d5e8fa", "#b6aa8f", 1.15));
  const sun = new THREE.DirectionalLight("#fff2d8", 2.35);
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
  scene.environmentIntensity = 0.3;
  pmrem.dispose();
  const architecture = createArchitecture(scene);
  const worldResources = [];
  const world = makeWorld(scene, worldResources);
  const districtRoads = makeDistrictRoads(scene, worldResources);
  let landMinZ = -26.5;
  const overflowBase = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: "#d5d8cb", roughness: 0.86 }),
  );
  const overflowPavement = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: "#e0e2d8", roughness: 0.86 }),
  );
  overflowBase.visible = overflowPavement.visible = false;
  overflowBase.receiveShadow = overflowBase.castShadow = true;
  overflowPavement.receiveShadow = true;
  scene.add(overflowBase, overflowPavement);
  const traffic = createTraffic(THREE, { scene, reducedMotion });
  const construction = createConstructionDirector({
    scene,
    architecture,
    reducedMotion,
  });
  const people = createPeople({ scene, reducedMotion, onSelectOwner });
  construction.setAttendanceResolver?.((id) =>
    people.getConstructionAttendance?.(id),
  );
  const communications = createCommunicationsDistrict({ scene, reducedMotion });
  const industry = createIndustryDistrict({ scene, reducedMotion });
  const districtRoot = new THREE.Group();
  districtRoot.name = "CRM district parcels and front plaques";
  scene.add(districtRoot);
  const districtResources = [];
  const districtAnchors = new Map();
  let districtSignature = "";
  function clearDistrictGeometry() {
    districtRoot.clear();
    for (const resource of districtResources) resource.dispose?.();
    districtResources.length = 0;
  }

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

  function getDistrict() {
    return district;
  }
  function viewBounds() {
    const salesMin = Math.min(
      -26.5,
      ...[...positions.values()]
        .filter((value) => value.stageId !== "clients")
        .map((value) => value.target.z - 3),
    );
    const ranges = {
      sales: [salesMin, 26.5],
      communications: [-44, -27],
      industry: [-74, -49],
      all: [landMinZ, 26.5],
    };
    const [minZ, maxZ] = ranges[district] || ranges.sales;
    return {
      minX: -38.5,
      maxX: 38.5,
      minY: -1.5,
      maxY: district === "industry" ? 8 : district === "all" ? 14 : 12,
      minZ,
      maxZ,
    };
  }
  function viewDirection() {
    if (!portraitTV())
      return district === "industry"
        ? new THREE.Vector3(25, 65, 90)
        : new THREE.Vector3(54, 55, 68);
    const bounds = viewBounds();
    return bounds.maxZ - bounds.minZ > bounds.maxX - bounds.minX
      ? new THREE.Vector3(5, 70, 90)
      : new THREE.Vector3(90, 70, 5);
  }
  function setDistrict(next, { tour = false, duration } = {}) {
    if (!["sales", "communications", "industry", "all"].includes(next))
      return district;
    if (!tour) pauseTVTour();
    const fromFrustum = {
      left: camera.left,
      right: camera.right,
      top: camera.top,
      bottom: camera.bottom,
    };
    const districtChanged = district !== next;
    district = next;
    emphasis.setDistrict(next);
    labelLayoutDirty = true;
    selectedId = null;
    ring.visible = false;
    followFocus = null;
    for (const c of connections) c.line.visible = false;
    const bounds = viewBounds(),
      centerZ = (bounds.minZ + bounds.maxZ) / 2;
    sun.position.set(-30, 65, 25 + centerZ);
    sun.target.position.set(0, 0, centerZ);
    sun.shadow.camera.left = district === "all" ? -68 : -52;
    sun.shadow.camera.right = district === "all" ? 68 : 52;
    sun.shadow.camera.top = district === "all" ? 82 : 48;
    sun.shadow.camera.bottom = district === "all" ? -82 : -48;
    sun.shadow.camera.far = 220;
    sun.shadow.camera.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
    resize({ preserveFlight: false });
    overview({ tour, duration });
    if (tour && flight) {
      flight.fromFrustum = fromFrustum;
      flight.toFrustum = {
        left: camera.left,
        right: camera.right,
        top: camera.top,
        bottom: camera.bottom,
      };
      Object.assign(camera, fromFrustum);
      camera.updateProjectionMatrix();
    }
    lastLabel = 0;
    if (districtChanged) onDistrictChange(district);
    return district;
  }
  function portraitTV() {
    return tvPresentation && w() < 650 && h() > w();
  }
  function projectedFit(width, height) {
    const bounds = viewBounds(),
      direction = viewDirection().normalize();
    const right = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const x of [bounds.minX, bounds.maxX])
      for (const y of [bounds.minY, bounds.maxY])
        for (const z of [bounds.minZ, bounds.maxZ]) {
          const point = new THREE.Vector3(x, y, z),
            px = point.dot(right),
            py = point.dot(up);
          minX = Math.min(minX, px);
          maxX = Math.max(maxX, px);
          minY = Math.min(minY, py);
          maxY = Math.max(maxY, py);
        }
    const top = portraitTV() ? 210 : tvPresentation ? 132 : 20;
    const bottom = portraitTV() ? 120 : tvPresentation ? 96 : 100;
    const scale = Math.min(
      Math.max(100, width - 32) / (maxX - minX),
      Math.max(100, height - top - bottom) / (maxY - minY),
    );
    return { vertical: height / scale, center: (top - bottom) / (2 * scale) };
  }
  function resize({ preserveFlight = true } = {}) {
    const interruptedFlight =
      preserveFlight && tvPresentation && flight?.fromFrustum ? flight : null;
    const previousTop = camera.top,
      previousBottom = camera.bottom;
    const width = w(),
      height = h(),
      aspect = width / height;
    const extra = Math.max(0, -26.5 - viewBounds().minZ);
    const portrait = portraitTV();
    const fit =
      portrait || district !== "sales" ? projectedFit(width, height) : null;
    const vertical = fit
      ? fit.vertical
      : width < 600
        ? Math.max(67 + extra * 0.5, (96 + extra * 0.65) / aspect)
        : Math.max(54 + extra * 0.5, (88 + extra * 0.65) / aspect);
    camera.left = (-vertical * aspect) / 2;
    camera.right = (vertical * aspect) / 2;
    const footerOffset = tvPresentation ? -1.7 : width < 600 ? 0 : 3.6;
    camera.top = vertical / 2 + (fit ? fit.center : -footerOffset);
    camera.bottom = -vertical / 2 + (fit ? fit.center : -footerOffset);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(pixelRatio());
    lastLabel = 0;
    const orientationChanged = portrait !== lastPortraitTV;
    lastPortraitTV = portrait;
    if (interruptedFlight) {
      // Rebase the remaining tour in the new viewport. Reusing the old flight's
      // frustums here would overwrite resize on the next RAF and distort the map.
      const targetFrustum = {
        left: camera.left,
        right: camera.right,
        top: camera.top,
        bottom: camera.bottom,
      };
      const remaining = Math.max(
        0.5,
        interruptedFlight.duration - (elapsed - interruptedFlight.start),
      );
      if (orientationChanged) overview({ tour: true, duration: remaining });
      else
        flight = {
          ...interruptedFlight,
          fromPos: camera.position.clone(),
          fromTarget: controls.target.clone(),
          fromZoom: camera.zoom,
          start: elapsed,
          duration: remaining,
        };
      const previousVertical = previousTop - previousBottom;
      const currentFrustum = {
        left: (-previousVertical * aspect) / 2,
        right: (previousVertical * aspect) / 2,
        top: previousTop,
        bottom: previousBottom,
      };
      flight.fromFrustum = currentFrustum;
      flight.toFrustum = targetFrustum;
      Object.assign(camera, currentFrustum);
      camera.updateProjectionMatrix();
    } else if (orientationChanged && tvPresentation) overview();
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
    people.setQuality?.(quality);
    industry.setQuality?.(quality);
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
    {
      filteredIds: ids,
      selectedId: id,
      layers: nextLayers,
      event,
      animateEvents = true,
      industryState: nextIndustryState,
    } = {},
  ) {
    if (disposed) return;
    const previous = state;
    const reset =
      event?.type === "demo.reset" ||
      event?.type === "snapshot" ||
      event?.type === "replay.reset";
    if (reset) {
      construction.clear();
      transitionList = [];
      celebrations = [];
      positions.clear();
      followFocus = null;
      for (const connection of connections) {
        connection.line.removeFromParent();
        connection.line.geometry.dispose();
        connection.line.material.dispose();
      }
      connections = [];
    }
    state = next;
    if (nextIndustryState !== undefined) industryState = nextIndustryState;
    communications.sync(state);
    if (industryState) industry.sync(industryState, { event, animateEvents });
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
      if (changed && visible && previous && !reset && animateEvents) {
        const from = e.group.position.clone();
        construction.cancel(deal.id);
        const job = construction.start({
          id: deal.id,
          from,
          to: target.clone(),
          startedAt: elapsed,
          color: stageColor(stage),
          won: stageKind(state, stage) === "won",
          ownerId: deal.ownerId,
          accountId: deal.accountId,
        });
        transitionList = transitionList.filter((t) => t.id !== deal.id);
        transitionList.push({ id: deal.id, from, to: target.clone(), job });
      } else if (
        !construction.has(deal.id) ||
        (changed && (!animateEvents || !visible))
      ) {
        if (changed && (!animateEvents || !visible)) {
          construction.cancel(deal.id);
          transitionList = transitionList.filter(
            (transition) => transition.id !== deal.id,
          );
          celebrations = celebrations.filter(
            (celebration) => celebration.id !== deal.id,
          );
        }
        architecture.updateEntity(deal.id, {
          position: target,
          buildProgress: 1,
        });
      }
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
          { id: account.id, client: true, variant: index, accent: "#3d9f88" },
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
    updateDistricts();
    makeStageLabels();
    people.sync(state, { entityPositions: positions, construction });
    updateMarkers();
    if (selectedId) select(selectedId);
    else ring.visible = false;
    renderer.shadowMap.needsUpdate = true;
    emphasis.install(scene);
    lastLabel = 0;
    labelLayoutDirty = true;
    if (!initialReady) {
      initialReady = true;
      onReady({ renderer: "WebGL2", heightScale: HEIGHT_SCALE });
    }
    schedule();
  }
  function updateLand() {
    const required = Math.min(
      -80,
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
    sun.shadow.camera.far = 220;
    sun.shadow.camera.updateProjectionMatrix();
    resize();
    if (!selectedId) overview();
  }
  function updateDistricts() {
    const stages = cityStages();
    const signature = JSON.stringify([
      stages.map((stage) => [stage.id, stageColor(stage.id)]),
      [...positions].map(([id, value]) => [
        id,
        value.stageId,
        value.target.x,
        value.target.z,
      ]),
    ]);
    if (signature === districtSignature) return;
    districtSignature = signature;
    clearDistrictGeometry();
    districtAnchors.clear();
    const box = new THREE.BoxGeometry(1, 1, 1);
    districtResources.push(box);
    const white = new THREE.Color("#ffffff");
    function geometry(material, specs, name) {
      const geometries = specs.map(([x, y, z, width, height, depth]) => {
        tmp.position.set(x, y, z);
        tmp.scale.set(width, height, depth);
        tmp.rotation.set(0, 0, 0);
        tmp.updateMatrix();
        return box.clone().applyMatrix4(tmp.matrix);
      });
      if (!geometries.length) return;
      const merged = mergeGeometries(geometries);
      for (const item of geometries) item.dispose();
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = name;
      mesh.receiveShadow = true;
      districtRoot.add(mesh);
      districtResources.push(merged);
    }
    for (const [index, stage] of stages.entries()) {
      const center = plotFor(stage.id, 1).x;
      const color = new THREE.Color(stageColor(stage.id));
      const tint = new THREE.MeshStandardMaterial({
        color: color.clone().lerp(white, 0.73),
        roughness: 0.9,
      });
      const edge = new THREE.MeshStandardMaterial({ color, roughness: 0.78 });
      districtResources.push(tint, edge);
      const breadth =
        stages.length === 5 ? 13.2 : (63 / Math.max(1, stages.length)) * 0.9;
      const padSpecs = [[center, 0.208, -18.7, breadth, 0.018, 12.4]];
      const edgeSpecs = [
        [center, 0.23, -12.6, breadth, 0.05, 0.28],
        [center - breadth / 2, 0.224, -18.7, 0.13, 0.04, 12.4],
        [center + breadth / 2, 0.224, -18.7, 0.13, 0.04, 12.4],
        [center, 0.224, -24.8, breadth, 0.04, 0.13],
      ];
      for (const [id, position] of positions) {
        if (position.stageId !== stage.id || position.target.z < -12) continue;
        const scale = stages.length > 5 ? 4.1 / stages.length : 1;
        const px = position.target.x,
          pz = position.target.z,
          pw = 4.07 * scale,
          pd = 4.8;
        padSpecs.push([px, 0.212, pz, pw, 0.025, pd]);
        edgeSpecs.push(
          [px, 0.235, pz + pd / 2, pw, 0.04, 0.2],
          [px - pw / 2, 0.23, pz, 0.1, 0.035, pd],
          [px + pw / 2, 0.23, pz, 0.1, 0.035, pd],
        );
      }
      geometry(tint, padSpecs, `District ${stage.id} parcel surfaces`);
      geometry(
        edge,
        edgeSpecs,
        `District ${stage.id} boundary and stage stripe`,
      );
      const numeral = document.createElement("canvas");
      numeral.width = 192;
      numeral.height = 96;
      const context = numeral.getContext("2d");
      context.fillStyle = color.getStyle();
      context.fillRect(0, 0, 192, 96);
      context.fillStyle = "#ffffff";
      context.font = "800 60px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(index + 1).padStart(2, "0"), 96, 50);
      const texture = new THREE.CanvasTexture(numeral);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
      });
      const planeGeometry = new THREE.PlaneGeometry(1.6, 0.8);
      const plaque = new THREE.Mesh(planeGeometry, material);
      plaque.rotation.x = -Math.PI / 2;
      plaque.position.set(center, 0.265, -13.2);
      plaque.name = `Ground stage number ${index + 1}`;
      districtRoot.add(plaque);
      districtResources.push(texture, material, planeGeometry);
      districtAnchors.set(stage.id, new THREE.Vector3(center, 0.4, -12.25));
    }
    const clientColor = new THREE.Color("#178f8c");
    const clientPad = new THREE.MeshStandardMaterial({
      color: clientColor.clone().lerp(white, 0.83),
      roughness: 0.9,
    });
    const clientEdge = new THREE.MeshStandardMaterial({
      color: clientColor,
      roughness: 0.8,
    });
    districtResources.push(clientPad, clientEdge);
    geometry(
      clientPad,
      [[0, 0.208, 18.5, 70.4, 0.018, 12.4]],
      "Customer neighbourhood surface",
    );
    geometry(
      clientEdge,
      [
        [0, 0.235, 24.7, 70.4, 0.05, 0.25],
        [-35.2, 0.23, 18.5, 0.13, 0.04, 12.4],
        [35.2, 0.23, 18.5, 0.13, 0.04, 12.4],
      ],
      "Customer neighbourhood boundary",
    );
    districtAnchors.set("clients", new THREE.Vector3(-1, 0.5, 25.2));
  }
  function districtDiagnostics() {
    return [...stageLabels].map(([id, element]) => ({
      id,
      name:
        id === "clients"
          ? "Clientes activos"
          : state?.stages?.find((stage) => stage.id === id)?.name,
      count:
        id === "clients"
          ? state?.accounts?.length || 0
          : state?.deals?.filter((deal) => deal.stageId === id).length || 0,
      color: id === "clients" ? "#178f8c" : stageColor(id),
      visible: !element.hidden,
      labelX: Number(element.dataset.labelX || 0),
      labelY: Number(element.dataset.labelY || 0),
      anchor: districtAnchors.get(id)?.toArray(),
    }));
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
    pauseTVTour();
    if (district !== "sales") setDistrict("sales");
    const e = architecture.entities.get(id);
    if (!e) return;
    select(id);
    followFocus = id;
    followAnchor = e.group.position.clone();
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
  function focusOwner(ownerId) {
    pauseTVTour();
    if (district !== "sales") setDistrict("sales");
    const point = people.getOwnerPosition(ownerId);
    if (!point) return;
    followFocus = `owner:${ownerId}`;
    followAnchor = point.clone();
    const target = point.clone().add(new THREE.Vector3(0, 1.4, 0));
    const offset = camera.position
      .clone()
      .sub(controls.target)
      .normalize()
      .multiplyScalar(90);
    flight = {
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      fromZoom: camera.zoom,
      toTarget: target,
      toPos: target.clone().add(offset),
      toZoom: w() < 650 ? 3.4 : 3.8,
      start: elapsed,
      duration: reducedMotion ? 0.01 : 0.8,
    };
    schedule();
  }
  function projectOwner(ownerId) {
    const point = people.getOwnerPosition(ownerId);
    if (!point) return null;
    point.y += 0.85;
    point.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      id: ownerId,
      x: rect.left + (point.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-point.y * 0.5 + 0.5) * rect.height,
      visible:
        point.z > -1 &&
        point.z < 1 &&
        Math.abs(point.x) < 1 &&
        Math.abs(point.y) < 1,
    };
  }
  function projectPoint(point, id) {
    if (!point) return null;
    point = point.clone().project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      id,
      x: rect.left + (point.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-point.y * 0.5 + 0.5) * rect.height,
      visible:
        point.z > -1 &&
        point.z < 1 &&
        Math.abs(point.x) < 1 &&
        Math.abs(point.y) < 1,
    };
  }
  function projectPlace(id) {
    const place = communications.getPlaces().find((entry) => entry.id === id);
    if (!place) return null;
    const point = (place.groundPosition || place.position).clone();
    point.y = 2.5;
    return projectPoint(point, id);
  }
  function projectIndustry(id) {
    return projectPoint(industry.focusPoint(id), id);
  }
  function focusPoint(point, { panelWidth = 350, zoom = 2.25 } = {}) {
    pauseTVTour();
    if (!point) return;
    followFocus = null;
    const target = point.clone();
    const offset = camera.position
      .clone()
      .sub(controls.target)
      .normalize()
      .multiplyScalar(100);
    if (w() > 650) {
      const right = new THREE.Vector3().setFromMatrixColumn(
        camera.matrixWorld,
        0,
      );
      const worldPerPixel = (camera.right - camera.left) / zoom / w();
      target.addScaledVector(right, panelWidth * 0.4 * worldPerPixel);
    }
    flight = {
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      fromZoom: camera.zoom,
      toTarget: target,
      toPos: target.clone().add(offset),
      toZoom: zoom,
      start: elapsed,
      duration: reducedMotion ? 0.01 : 0.85,
    };
    schedule();
  }
  function focusPlace(id) {
    const place = communications.getPlaces().find((entry) => entry.id === id);
    if (!place) return;
    if (district !== "communications") setDistrict("communications");
    const point = (place.groundPosition || place.position).clone();
    point.y = 2.5;
    focusPoint(point);
  }
  function focusIndustry(id) {
    const point = industry.focusPoint(id);
    if (!point) return;
    if (district !== "industry") setDistrict("industry");
    focusPoint(point, { zoom: 2.35 });
    followFocus = `industry:${id}`;
    followAnchor = point.clone();
  }
  function focusDistrict(stageId) {
    pauseTVTour();
    // Keep the complete city legible on a portrait TV; there is no room for
    // a zoomed district plus the fixed KPI and salesperson bands.
    if (district !== "sales") setDistrict("sales");
    if (portraitTV()) {
      overview();
      return;
    }
    const point =
      stageId === "clients"
        ? new THREE.Vector3(0, 1, 18)
        : districtAnchors.get(stageId)?.clone();
    if (!point) return;
    followFocus = null;
    point.y = 1;
    if (stageId !== "clients") point.z = -8;
    const offset = new THREE.Vector3(54, 55, 68)
      .normalize()
      .multiplyScalar(100);
    flight = {
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      fromZoom: camera.zoom,
      toTarget: point,
      toPos: point.clone().add(offset),
      toZoom: tvPresentation ? 1.45 : 1.7,
      start: elapsed,
      duration: reducedMotion ? 0.01 : 1.6,
    };
    schedule();
  }
  function overview({ tour = false, duration } = {}) {
    if (!tour) pauseTVTour();
    followFocus = null;
    const portrait = portraitTV();
    const bounds = viewBounds();
    const target = new THREE.Vector3(
      0,
      portrait || district !== "sales" ? (bounds.minY + bounds.maxY) / 2 : 1,
      (bounds.minZ + bounds.maxZ) / 2,
    );
    const position = target.clone().add(viewDirection());
    flight = {
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      fromZoom: camera.zoom,
      toTarget: target,
      toPos: position,
      toZoom: portrait || district !== "sales" ? 1 : tvPresentation ? 0.92 : 1,
      start: elapsed,
      duration: reducedMotion ? 0.01 : (duration ?? 1.1),
    };
    mode = tvPresentation ? "tv" : "explore";
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
    pauseTVTour();
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
    people.setEnabled(layers.activity);
    construction.setAttendanceResolver?.(
      layers.activity ? (id) => people.getConstructionAttendance?.(id) : null,
    );
    lastLabel = 0;
    schedule();
  }
  function getTVTourState() {
    return {
      elapsed,
      nextAt: tvTour.nextAt,
      pausedUntil: tvTour.pausedUntil,
      enabled: tvTour.enabled,
      running:
        tvTour.enabled &&
        tvPresentation &&
        !reducedMotion &&
        elapsed >= tvTour.pausedUntil,
      paused: tvTour.enabled && elapsed < tvTour.pausedUntil,
      step: tvTour.index,
      district: tvTour.sequence[tvTour.index],
      sequence: [...tvTour.sequence],
      nextIn: Math.max(0, tvTour.nextAt - elapsed),
      pausedFor: Math.max(0, tvTour.pausedUntil - elapsed),
      transitionDuration: tvTour.transitionDuration,
      holdDuration: tvTour.holdDuration,
    };
  }
  function pauseTVTour(seconds = 14) {
    if (tvTour.enabled)
      tvTour.pausedUntil = Math.max(tvTour.pausedUntil, elapsed + seconds);
  }
  function setTVTour(enabled) {
    tvTour.enabled = Boolean(enabled) && !reducedMotion;
    tvTour.index = 0;
    tvTour.pausedUntil = 0;
    tvTour.nextAt = elapsed + tvTour.holdDuration;
    if (tvTour.enabled && tvPresentation && district !== "all")
      setDistrict("all", { tour: true, duration: tvTour.transitionDuration });
    schedule();
  }
  function updateTVTour() {
    if (
      !tvTour.enabled ||
      !tvPresentation ||
      reducedMotion ||
      pointerDown ||
      elapsed < tvTour.pausedUntil ||
      elapsed < tvTour.nextAt
    )
      return;
    if (construction.debug().count) {
      tvTour.nextAt = elapsed + 2;
      return;
    }
    tvTour.index = (tvTour.index + 1) % tvTour.sequence.length;
    setDistrict(tvTour.sequence[tvTour.index], {
      tour: true,
      duration: tvTour.transitionDuration,
    });
    tvTour.nextAt = elapsed + tvTour.transitionDuration + tvTour.holdDuration;
  }
  function setTVPresentation(enabled) {
    tvPresentation = !!enabled;
    if (!tvPresentation) setTVTour(false);
    people.setPresentation?.(tvPresentation);
    if (tvPresentation) {
      selectedId = null;
      ring.visible = false;
      followFocus = null;
    }
    resize();
    overview();
    mode = tvPresentation ? "tv" : "explore";
  }
  function setMode(next) {
    const tv = next === "tv";
    if (tvPresentation !== tv) setTVPresentation(tv);
    mode = tv ? "tv" : "explore";
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
      const hit = pickWorld(e.clientX, e.clientY);
      if (tvPresentation) return;
      if (hit?.kind === "owner") {
        onSelectOwner(hit.id);
        focusOwner(hit.id);
      } else if (hit?.kind === "place") {
        onSelectPlace(hit.id);
        focusPlace(hit.id);
      } else if (hit?.kind === "industry") {
        onSelectIndustry(hit.id, hit.industryKind);
        focusIndustry(hit.id);
      } else if (hit?.kind === "entity") {
        select(hit.id);
        onSelect(hit.id);
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
    const hit = pickWorld(e.clientX, e.clientY);
    const id = hit?.kind === "entity" ? hit.id : null;
    renderer.domElement.style.cursor = hit ? "pointer" : "grab";
    onHover(id, id ? entityData.get(id) : null, { x: e.clientX, y: e.clientY });
  }
  function handleLeave() {
    onHover(null);
    renderer.domElement.style.cursor = "grab";
  }
  function pickWorld(x, y) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const candidates = [];
    for (const hit of ray.intersectObjects(
      architecture.meshes.filter(
        (mesh) =>
          mesh.visible &&
          ["city-kit-mass", "city-kit-glass", "city-kit-accent"].includes(
            mesh.name,
          ),
      ),
      false,
    )) {
      const id = architecture.entityId(hit);
      if (id && architecture.entities.get(id)?.visible) {
        candidates.push({ kind: "entity", id, distance: hit.distance });
        break;
      }
    }
    const owner = people.pickHit?.(ray);
    if (owner && layers.activity)
      candidates.push({
        kind: "owner",
        id: owner.ownerId,
        distance: owner.distance,
      });
    const place = communications.pickHit(ray);
    if (place)
      candidates.push({
        kind: "place",
        id: place.id,
        distance: place.distance,
      });
    const factory = industry.pickHit(ray);
    if (factory)
      candidates.push({
        kind: "industry",
        industryKind: factory.kind,
        id: factory.id,
        distance: factory.distance,
      });
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0] || null;
  }
  function pick(x, y) {
    const hit = pickWorld(x, y);
    return hit?.kind === "entity" ? hit.id : null;
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
    for (const [id, element] of stageLabels) {
      if (id !== "clients" && !currentStages.some((stage) => stage.id === id)) {
        element.remove();
        stageLabels.delete(id);
      }
    }
    for (const [index, stage] of currentStages.entries()) {
      let element = stageLabels.get(stage.id);
      if (!element) {
        element = document.createElement("div");
        element.className = "city-district-label";
        element.dataset.districtId = stage.id;
        labelContainer.append(element);
        stageLabels.set(stage.id, element);
      }
      const color = stageColor(stage.id);
      const deals = (state.deals || []).filter(
        (deal) => deal.stageId === stage.id,
      );
      const sourceSignature = JSON.stringify([
        index,
        stage.name,
        color,
        deals.map((deal) => [deal.id, deal.amount]),
      ]);
      if (element.dataset.sourceSignature === sourceSignature) continue;
      element.dataset.sourceSignature = sourceSignature;
      element.dataset.presentation = "";
      getLabelCache(element).signature = sourceSignature;
      getLabelCache(element).measuredSignature = "";
      labelMetrics.contentBuilds++;
      labelLayoutDirty = true;
      element.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;transform:translate(-50%,-50%);text-align:left;color:#243b49;font-family:inherit;padding:7px 9px;border:1px solid #ffffff;border-top:3px solid ${color};border-radius:8px;background:rgba(255,255,255,.97);box-shadow:0 3px 12px #173c4d26;min-width:108px;`;
      element.replaceChildren();
      const title = document.createElement("span");
      title.style.cssText =
        "display:flex;align-items:center;gap:6px;font-size:11px;letter-spacing:0;font-weight:800;";
      const numeral = document.createElement("b");
      numeral.textContent = String(index + 1).padStart(2, "0");
      numeral.style.cssText = `display:inline-grid;place-items:center;min-width:19px;height:19px;color:white;background:${color};border-radius:5px;font-size:10px;`;
      title.append(numeral, document.createTextNode(stage.name));
      const subtitle = document.createElement("span");
      subtitle.textContent = `${deals.length} ${deals.length === 1 ? "deal" : "deals"} · ${deals.every((deal) => typeof deal.amount === "number" && Number.isFinite(deal.amount)) ? euro.format(deals.reduce((sum, deal) => sum + deal.amount, 0)) : "Sin importe"}`;
      subtitle.style.cssText =
        "display:block;margin-top:4px;padding-left:25px;font-size:10px;color:#506572;font-weight:600;";
      element.append(title, subtitle);
    }
    let clients = stageLabels.get("clients");
    if (!clients) {
      clients = document.createElement("div");
      clients.className = "city-district-label city-clients-label";
      clients.dataset.districtId = "clients";
      labelContainer.append(clients);
      stageLabels.set("clients", clients);
    }
    const clientsText = `Clientes activos · ${(state?.accounts || []).length} empresas`;
    if (clients.textContent === clientsText) return;
    getLabelCache(clients).signature = clientsText;
    getLabelCache(clients).measuredSignature = "";
    clients.dataset.presentation = "";
    labelLayoutDirty = true;
    labelMetrics.contentBuilds++;
    clients.style.cssText =
      "position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;text-align:center;padding:8px 13px;border:1px solid white;border-top:3px solid #178f8c;border-radius:8px;background:rgba(255,255,255,.98);box-shadow:0 3px 12px #173c4d26;color:#235353;font-family:inherit;font-weight:800;font-size:11px;letter-spacing:.02em;";
    clients.textContent = clientsText;
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
  const communicationIcons = {
    email: ["M3 5h18v14H3z", "m3 6 9 7 9-7"],
    call: ["M7 3 3 5c0 8 8 16 16 16l2-4-5-3-2 2c-3-1-5-3-6-6l2-2z"],
    message: [
      "M21 11a9 9 0 0 1-9 9H5l-3 2 1-6a9 9 0 1 1 18-5Z",
      "M8 11h.01M12 11h.01M16 11h.01",
    ],
    meeting: [
      "M3 9h13v7a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z",
      "M16 10h2a3 3 0 0 1 0 6h-2M6 3v3M10 2v4M14 3v3M2 23h16",
    ],
  };
  function getLabelCache(element) {
    let cache = labelCache.get(element);
    if (!cache) {
      cache = {
        signature: "",
        measuredSignature: "",
        width: 0,
        height: 0,
        dx: 0,
        dy: 0,
        occluded: false,
        hidden: element.hidden,
      };
      labelCache.set(element, cache);
    }
    return cache;
  }
  function setLabelHidden(element, hidden) {
    const cache = getLabelCache(element);
    if (cache.hidden !== hidden) {
      element.hidden = hidden;
      cache.hidden = hidden;
    }
  }
  function badge(
    map,
    id,
    className,
    title,
    subtitle,
    color,
    onClick,
    communication = null,
  ) {
    let element = map.get(id);
    if (!element) {
      element = document.createElement(onClick ? "button" : "div");
      if (onClick) {
        element.type = "button";
        element.onclick = (event) => {
          event.stopPropagation();
          onClick();
        };
      }
      element.className = className;
      element.dataset.placeId = id;
      labelContainer.append(element);
      map.set(id, element);
    }
    const compact = w() < 650;
    const signature = JSON.stringify([
      title,
      subtitle,
      color,
      compact,
      communication,
    ]);
    const cache = getLabelCache(element);
    if (cache.signature === signature) return element;
    cache.signature = signature;
    labelMetrics.contentBuilds++;
    element.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;pointer-events:${onClick ? "auto" : "none"};font-family:inherit;text-align:left;border:1px solid white;border-top:3px solid ${color};border-radius:8px;background:rgba(255,255,255,.97);box-shadow:0 3px 12px #173c4d26;color:#243b49;padding:${compact ? "5px 7px" : "7px 9px"};will-change:transform;`;
    const heading = document.createElement("b");
    heading.textContent = title;
    heading.style.cssText = `display:block;font-size:${compact ? 9 : 11}px;font-weight:800;`;
    const sub = document.createElement("span");
    sub.textContent = subtitle;
    sub.style.cssText = `display:block;font-size:${compact ? 8 : 10}px;margin-top:3px;color:#526a76;font-weight:600;`;
    if (communication) {
      const row = document.createElement("span"),
        icon = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
        number = document.createElement("strong");
      row.style.cssText =
        "display:flex;align-items:center;gap:7px;margin-bottom:4px;";
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("width", compact ? "22" : "26");
      icon.setAttribute("height", compact ? "22" : "26");
      icon.setAttribute("fill", "none");
      icon.setAttribute("stroke", color);
      icon.setAttribute("stroke-width", "1.8");
      icon.setAttribute("stroke-linecap", "round");
      icon.setAttribute("stroke-linejoin", "round");
      icon.setAttribute("aria-hidden", "true");
      for (const d of communicationIcons[communication.kind] ||
        communicationIcons.message) {
        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );
        path.setAttribute("d", d);
        icon.append(path);
      }
      number.textContent =
        communication.available === false ? "—" : String(communication.count);
      number.style.cssText = `font-size:${compact ? 22 : 27}px;line-height:1;font-weight:800;color:${color};`;
      row.append(icon, number);
      element.replaceChildren(row, heading, sub);
      element.setAttribute(
        "aria-label",
        `${title}: ${communication.available === false ? "sin datos" : communication.count} completadas hoy. ${subtitle}`,
      );
    } else element.replaceChildren(heading, sub);
    labelLayoutDirty = true;
    return element;
  }
  function ownerBadge(owner) {
    let element = ownerLabels.get(owner.ownerId);
    if (!element) {
      element = document.createElement("button");
      element.type = "button";
      element.className = "city-owner-label";
      element.dataset.ownerId = owner.ownerId;
      element.onclick = (event) => {
        event.stopPropagation();
        if (!tvPresentation) {
          onSelectOwner(owner.ownerId);
          focusOwner(owner.ownerId);
        }
      };
      labelContainer.append(element);
      ownerLabels.set(owner.ownerId, element);
    }
    const atWork = owner.attendingConstruction,
      deal = state?.deals?.find((entry) => entry.id === owner.dealId),
      stage = state?.stages?.find((entry) => entry.id === deal?.stageId);
    const text = atWork
      ? `${owner.initials} · ${owner.name.split(" ")[0]} · ${stage?.name || "En obra"}`
      : owner.initials;
    const signature = [text, atWork, owner.color, owner.name, w() < 650].join(
      "|",
    );
    const cache = getLabelCache(element);
    if (cache.signature === signature) return element;
    cache.signature = signature;
    labelMetrics.contentBuilds++;
    element.textContent = text;
    element.title = `${owner.name}${atWork ? ` · ${stage?.name || "Acompañando la obra"}` : " · Ver comercial"}`;
    element.setAttribute("aria-label", element.title);
    element.style.cssText = `position:absolute;left:0;top:0;height:27px;min-width:28px;white-space:nowrap;padding:${atWork ? "0 7px" : "0 4px"};border:2px solid #fff;border-radius:${atWork ? "8px" : "50%"};background:${owner.color || "#237cc1"};box-shadow:0 2px 8px #12384e44;color:white;font:800 ${w() < 650 ? 9 : 10}px DM Sans,sans-serif;pointer-events:auto;text-align:center;will-change:transform;`;
    const line = document.createElement("span"),
      dot = document.createElement("span");
    line.setAttribute("aria-hidden", "true");
    line.style.cssText = `position:absolute;left:calc(50% - .5px);top:100%;width:1px;height:16px;background:${owner.color || "#237cc1"};box-shadow:0 0 0 1px #ffffff99;pointer-events:none;`;
    dot.style.cssText = `position:absolute;left:-2px;bottom:-2px;width:5px;height:5px;border-radius:50%;background:${owner.color || "#237cc1"};border:1px solid white;`;
    line.append(dot);
    element.append(line);
    labelLayoutDirty = true;
    return element;
  }
  // Content and box measurements have a small independent budget. Animation
  // only projects cached anchors; it never rebuilds or measures moving badges.
  function refreshLabelContent() {
    if (!labelContainer || !state) return;
    const mobile = w() < 650,
      showingSales = district === "sales",
      showingPeople = showingSales || district === "all";
    const specs = [],
      present = new Set();
    function add(element, point, options = {}) {
      if (!element) return;
      specs.push({
        element,
        point,
        district: false,
        owner: false,
        marker: false,
        priority: false,
        ...options,
      });
      present.add(element);
    }
    if (layers.activity && showingPeople)
      for (const owner of (people.getOwnerLabels?.() || []).slice(0, 4)) {
        add(
          ownerBadge(owner),
          () =>
            people
              .getOwnerPosition(owner.ownerId)
              ?.add(new THREE.Vector3(0, 2.2, 0)),
          { owner: true, priority: true },
        );
      }
    if (district === "communications")
      for (const place of communications.getPlaces()) {
        const text =
          place.sourceAvailable === false
            ? "Canal no disponible"
            : `${place.todayCompleted || 0} hoy · ${place.pendingCount || 0} pendientes`;
        const kind = /mail|correo|email/.test(place.id)
          ? "email"
          : /call|llamada|phone/.test(place.id)
            ? "call"
            : /meet|cafe|reuni/.test(place.id)
              ? "meeting"
              : "message";
        const element = badge(
          placeLabels,
          place.id,
          "city-place-label",
          place.name,
          text,
          place.color,
          () => {
            if (!tvPresentation) {
              onSelectPlace(place.id);
              focusPlace(place.id);
            }
          },
          {
            kind,
            count: place.todayCompleted || 0,
            available: place.sourceAvailable,
          },
        );
        add(element, place.position, { district: true });
      }
    if (district === "industry")
      for (const place of industry.getPlaces()) {
        const element = badge(
          industryLabels,
          place.id,
          "city-industry-label",
          place.name,
          `${place.count ?? 0} ${place.unit || "uds"}`,
          place.color,
          () => {
            if (!tvPresentation) {
              onSelectIndustry(place.id, "place");
              focusIndustry(place.id);
            }
          },
        );
        add(element, place.position, { district: true });
      }
    if (district === "all") {
      const sectors = [
        {
          id: "sales",
          name: "Ciudad comercial",
          sub: `${state.deals?.length || 0} oportunidades · ${state.accounts?.length || 0} clientes`,
          color: "#238bec",
          point: new THREE.Vector3(0, 1, 23),
        },
        {
          id: "communications",
          name: "Barrio de comunicación",
          sub: `${communications.getPlaces().reduce((sum, place) => sum + (place.todayCompleted || 0), 0)} actividades completadas hoy`,
          color: "#179ca9",
          point: new THREE.Vector3(0, 7, -35),
        },
        {
          id: "industry",
          name: "Distrito industrial",
          sub: "Materiales · producción · distribución",
          color: "#dc9b2e",
          point: new THREE.Vector3(0, 10, -60),
        },
      ];
      for (const sector of sectors)
        add(
          badge(
            sectorLabels,
            sector.id,
            "city-sector-label",
            sector.name,
            sector.sub,
            sector.color,
            () => setDistrict(sector.id),
          ),
          sector.point,
          { district: true },
        );
    }
    if (showingSales)
      for (const stage of cityStages()) {
        const element = stageLabels.get(stage.id),
          anchor = districtAnchors.get(stage.id);
        if (!element || !anchor) continue;
        const compact = portraitTV(),
          signature = `${compact}|${mobile}`;
        if (element.dataset.presentation !== signature) {
          element.dataset.presentation = signature;
          element.style.minWidth = compact ? "88px" : mobile ? "80px" : "108px";
          element.style.padding = compact
            ? "4px 6px"
            : mobile
              ? "5px 6px"
              : "7px 9px";
          element.style.fontSize = compact ? "8px" : mobile ? "9px" : "11px";
          const title = element.firstElementChild,
            subtitle = element.lastElementChild,
            numeral = title?.firstElementChild;
          if (title) {
            title.style.fontSize = compact ? "8px" : "11px";
            title.style.gap = compact ? "4px" : "6px";
          }
          if (subtitle) {
            subtitle.style.fontSize = compact ? "8px" : "10px";
            subtitle.style.paddingLeft = compact ? "0" : "25px";
            subtitle.style.marginTop = compact ? "2px" : "4px";
          }
          if (numeral) {
            numeral.style.minWidth = compact ? "15px" : "19px";
            numeral.style.height = compact ? "15px" : "19px";
            numeral.style.fontSize = compact ? "8px" : "10px";
          }
          getLabelCache(element).measuredSignature = "";
          labelLayoutDirty = true;
        }
        add(element, anchor, { district: true });
      }
    const clients = stageLabels.get("clients");
    if (clients && showingSales && districtAnchors.has("clients")) {
      const signature = String(portraitTV());
      if (clients.dataset.presentation !== signature) {
        clients.dataset.presentation = signature;
        clients.style.fontSize = portraitTV() ? "8px" : "11px";
        clients.style.padding = portraitTV() ? "6px 8px" : "8px 13px";
        getLabelCache(clients).measuredSignature = "";
        labelLayoutDirty = true;
      }
      add(clients, districtAnchors.get("clients"), { district: true });
    }
    const priorities = [];
    if (
      architecture.entities.get(selectedId) &&
      !tvPresentation &&
      showingSales
    )
      priorities.push(selectedId);
    for (const [id, entity] of architecture.entities)
      if (
        showingSales &&
        entity.visible &&
        needsAttention(entityData.get(id) || {}) &&
        !priorities.includes(id)
      )
        priorities.push(id);
    const namedIds = new Set();
    for (const id of priorities.slice(0, tvPresentation ? 0 : mobile ? 2 : 4)) {
      const entity = architecture.entities.get(id),
        data = entityData.get(id);
      if (!entity?.visible) continue;
      let element = entityLabels.get(id);
      if (!element) {
        element = document.createElement("button");
        element.type = "button";
        element.className = "city-entity-label";
        element.style.cssText =
          "position:absolute;top:0;left:0;min-height:30px;border:1px solid #c6d1c4;border-radius:7px;background:rgba(255,255,247,.96);box-shadow:0 3px 9px #455a4415;padding:5px 8px;color:#38584f;font-family:DM Sans,sans-serif;font-size:10px;font-weight:600;pointer-events:auto;white-space:nowrap;will-change:transform;";
        element.onclick = () => {
          select(id);
          onSelect(id);
        };
        labelContainer.append(element);
        entityLabels.set(id, element);
      }
      const attention = needsAttention(data) && layers.activity,
        text = data.name || data.company || id,
        cache = getLabelCache(element),
        signature = `${attention}|${text}`;
      if (cache.signature !== signature) {
        cache.signature = signature;
        labelMetrics.contentBuilds++;
        element.replaceChildren();
        if (attention) {
          const warning = document.createElement("span");
          warning.textContent = "!";
          warning.style.cssText =
            "display:inline-grid;place-items:center;width:13px;height:13px;margin-right:5px;border-radius:50%;background:#b95046;color:white;font:700 9px sans-serif;";
          element.append(warning);
        }
        element.append(document.createTextNode(text));
        labelLayoutDirty = true;
      }
      add(
        element,
        () =>
          entity.group.position
            .clone()
            .add(new THREE.Vector3(0, entity.model.height + 0.7, 0)),
        { priority: id === selectedId },
      );
      namedIds.add(id);
    }
    if (showingSales && layers.activity && !tvPresentation)
      for (const [id, entity] of architecture.entities) {
        if (
          !entity.visible ||
          !needsAttention(entityData.get(id) || {}) ||
          namedIds.has(id)
        )
          continue;
        let element = markerLabels.get(id);
        if (!element) {
          element = document.createElement("span");
          element.className = "city-alert-marker";
          element.textContent = "!";
          element.title = "Tarea vencida";
          element.style.cssText =
            "position:absolute;top:0;left:0;font:bold 10px sans-serif;color:#fff;background:#b95046;border:2px solid #fff8ed;border-radius:50%;width:16px;height:16px;line-height:12px;text-align:center;pointer-events:none;will-change:transform;";
          labelContainer.append(element);
          markerLabels.set(id, element);
        }
        add(
          element,
          () =>
            entity.group.position
              .clone()
              .add(new THREE.Vector3(0, entity.model.height + 0.3, 0)),
          { marker: true },
        );
      }
    for (const map of [
      ownerLabels,
      placeLabels,
      industryLabels,
      sectorLabels,
      stageLabels,
      entityLabels,
      markerLabels,
    ])
      for (const element of map.values())
        if (!present.has(element)) setLabelHidden(element, true);
    // Batch writes first, then measure only new/changed content. No reads occur
    // while animating; hidden nodes are only exposed when their content changes.
    for (const spec of specs) {
      const cache = getLabelCache(spec.element),
        signature = `${cache.signature}|${spec.element.dataset.presentation || ""}|${w()}|${h()}`;
      if (cache.measuredSignature !== signature || !cache.width) {
        spec.element.hidden = false;
        cache.hidden = false;
        cache.width = spec.element.offsetWidth || (spec.owner ? 30 : 120);
        cache.height = spec.element.offsetHeight || 32;
        cache.measuredSignature = signature;
        labelMetrics.measurements++;
        labelLayoutDirty = true;
      }
    }
    labelSpecs = specs;
  }
  function projectLabels(allowLayout = false) {
    if (!labelContainer || !state) return;
    const width = w(),
      height = h(),
      occupied = [],
      max = width < 650 ? 2 : 4;
    let count = 0;
    const moving =
      !!flight || pointerDown || elapsed - lastCameraMotionAt < 0.18;
    const layout =
      allowLayout &&
      (labelLayoutDirty ||
        (!moving && lastLayoutCameraSignature !== lastCameraSignature));
    if (layout) labelMetrics.layoutPasses++;
    labelMetrics.projectionFrames++;
    for (const spec of labelSpecs) {
      const element = spec.element,
        cache = getLabelCache(element),
        point =
          typeof spec.point === "function" ? spec.point() : spec.point?.clone();
      if (!point) {
        setLabelHidden(element, true);
        continue;
      }
      const worldPoint = point.clone();
      point.project(camera);
      let x = (point.x * 0.5 + 0.5) * width,
        y = (-point.y * 0.5 + 0.5) * height;
      const valid =
        layers.labels &&
        point.z > -1 &&
        point.z < 1 &&
        x > 12 &&
        x < width - 12 &&
        y > 10 &&
        y < height - 20 &&
        (spec.district || spec.owner || spec.marker || count < max);
      const collide = (px, py) =>
        occupied.some(
          (box) =>
            Math.abs(px - box.x) < (box.w + cache.width) / 2 + 6 &&
            Math.abs(py - box.y) < (box.h + cache.height) / 2 + 6,
        );
      if (spec.district && valid) {
        const minX = cache.width / 2 + 8,
          maxX = width - cache.width / 2 - 8,
          minY =
            (portraitTV() ? 208 : tvPresentation ? 128 : 8) + cache.height / 2,
          maxY = Math.max(
            minY,
            height -
              cache.height / 2 -
              (portraitTV() ? 120 : tvPresentation ? 86 : 92),
          );
        const ax = clamp(x, minX, maxX),
          ay = clamp(y, minY, maxY);
        if (layout) {
          let best = null;
          for (const dx of [0, -40, 40, -80, 80])
            for (const step of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]) {
              const px = clamp(ax + dx, minX, maxX),
                py = clamp(ay + step * (cache.height + 8), minY, maxY),
                distance = (px - ax) ** 2 + (py - ay) ** 2;
              if ((!best || distance < best.distance) && !collide(px, py))
                best = { x: px, y: py, distance };
            }
          cache.dx = best ? best.x - ax : 0;
          cache.dy = best ? best.y - ay : 0;
        }
        x = clamp(ax + cache.dx, minX, maxX);
        y = clamp(ay + cache.dy, minY, maxY);
      }
      if (
        layout &&
        valid &&
        !spec.priority &&
        !spec.district &&
        !spec.owner &&
        !spec.marker
      ) {
        pointer.set(point.x, point.y);
        ray.setFromCamera(pointer, camera);
        const hit = ray.intersectObjects(
          architecture.meshes.filter(
            (mesh) => mesh.visible && mesh.name === "city-kit-mass",
          ),
          false,
        )[0];
        cache.occluded = !!(
          hit && hit.distance < ray.ray.origin.distanceTo(worldPoint) - 0.35
        );
        labelMetrics.occlusionTests++;
      }
      let hidden = !valid;
      if (!spec.priority && !spec.district && !spec.owner)
        hidden ||= cache.occluded || collide(x, y);
      setLabelHidden(element, hidden);
      if (!hidden) {
        element.style.transform = `translate3d(${x.toFixed(3)}px,${y.toFixed(3)}px,0) translate(-50%,-50%)`;
        element.dataset.labelX = x.toFixed(3);
        element.dataset.labelY = y.toFixed(3);
        occupied.push({ x, y, w: cache.width, h: cache.height });
        if (!spec.district && !spec.owner && !spec.marker) count++;
      }
    }
    if (layout) {
      labelLayoutDirty = false;
      lastLayoutCameraSignature = lastCameraSignature;
    }
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
    const outcome = construction.update(elapsed);
    const moving = outcome.moving || outcome.active > 0;
    const priorTransitions = transitionList.length;
    for (const id of outcome.finished || []) {
      const job = construction.get(id),
        entity = architecture.entities.get(id);
      if (job?.won && entity && !reducedMotion) {
        celebrations.push({
          id,
          position: job.to.clone(),
          height: entity.model.height,
          start: elapsed,
        });
        const account = positions.get(entityData.get(id)?.accountId);
        if (account && layers.connections)
          addConnection(job.to, account.target, "#31ab64", 4.2, "customer");
      }
    }
    transitionList = transitionList.filter((t) => construction.has(t.id));
    if (
      typeof followFocus === "string" &&
      !followFocus.startsWith("owner:") &&
      !followFocus.startsWith("industry:")
    ) {
      const job = construction.get(followFocus);
      const entity = architecture.entities.get(followFocus);
      const point = construction.has(followFocus)
        ? job?.focusPosition
        : entity?.group.position;
      if (point && followAnchor) {
        const shift = point.clone().sub(followAnchor);
        if (flight) {
          flight.toTarget.add(shift);
          flight.toPos.add(shift);
        } else {
          camera.position.add(shift);
          controls.target.add(shift);
        }
        followAnchor.copy(point);
      }
    }
    if (selectedId) {
      const entity = architecture.entities.get(selectedId);
      if (entity)
        ring.position.set(
          entity.group.position.x,
          0.285,
          entity.group.position.z,
        );
    }
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
    updateTVTour();
    if (flight) {
      const k = clamp((elapsed - flight.start) / flight.duration, 0, 1),
        ease = k * k * (3 - 2 * k);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, ease);
      camera.position.lerpVectors(flight.fromPos, flight.toPos, ease);
      camera.zoom = lerp(flight.fromZoom, flight.toZoom, ease);
      if (flight.fromFrustum && flight.toFrustum)
        for (const key of ["left", "right", "top", "bottom"])
          camera[key] = lerp(
            flight.fromFrustum[key],
            flight.toFrustum[key],
            ease,
          );
      camera.updateProjectionMatrix();
      if (k >= 1) flight = null;
    }
    controls.update();
    updateTransitions();
    people.update(delta, elapsed);
    communications.update(delta, elapsed);
    industry.update(delta, elapsed);
    if (followFocus?.startsWith("owner:")) {
      const point = people.getOwnerPosition(followFocus.slice(6));
      if (point && followAnchor) {
        const shift = point.clone().sub(followAnchor);
        if (flight) {
          flight.toTarget.add(shift);
          flight.toPos.add(shift);
        } else {
          camera.position.add(shift);
          controls.target.add(shift);
        }
        followAnchor.copy(point);
      }
    }
    if (followFocus?.startsWith("industry:")) {
      const point = industry.focusPoint(followFocus.slice(9));
      if (point && followAnchor) {
        const shift = point.clone().sub(followAnchor);
        if (flight) {
          flight.toTarget.add(shift);
          flight.toPos.add(shift);
        } else {
          camera.position.add(shift);
          controls.target.add(shift);
        }
        followAnchor.copy(point);
      }
    }
    if (!reducedMotion) traffic.update?.(delta, elapsed);
    camera.updateMatrixWorld();
    const cameraSignature = [
      ...camera.position.toArray(),
      ...controls.target.toArray(),
      camera.zoom,
      camera.left,
      camera.top,
    ]
      .map((value) => value.toFixed(3))
      .join("|");
    if (cameraSignature !== lastCameraSignature) {
      lastCameraMotionAt = elapsed;
      lastCameraSignature = cameraSignature;
    }
    if (elapsed - lastLabel > 0.12 || !lastLabel) {
      refreshLabelContent();
      projectLabels(true);
      lastLabel = elapsed;
    } else projectLabels(false);
    architecture.setDetail(quality !== "light" && camera.zoom > 0.8);
    emphasis.update(delta, reducedMotion);
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
      tvPresentation,
      tvTour: getTVTourState(),
      labels: { ...labelMetrics, cachedCount: labelSpecs.length },
      emphasis: emphasis.debug(),
      portraitTV: portraitTV(),
      cameraMoving: !!flight,
      landMinZ,
      district,
      viewBounds: viewBounds(),
      communications: communications.debug(),
      industry: industry.debug(),
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
      transitionCount:
        construction.debug().count + construction.debug().queueCount,
      construction: construction.debug(),
      people: people.debug(),
      districts: districtDiagnostics(),
      ownerBadges: [...ownerLabels].map(([id, element]) => ({
        id,
        visible: !element.hidden,
        text: element.textContent,
      })),
      placeLabels: [...placeLabels].map(([id, element]) => ({
        id,
        visible: !element.hidden,
        text: element.textContent,
      })),
      industryLabels: [...industryLabels].map(([id, element]) => ({
        id,
        visible: !element.hidden,
        text: element.textContent,
      })),
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
    renderer.domElement.removeEventListener("pointerdown", handleDown);
    renderer.domElement.removeEventListener("pointerup", handleUp);
    renderer.domElement.removeEventListener("pointermove", handleMove);
    renderer.domElement.removeEventListener("pointerleave", handleLeave);
    renderer.domElement.removeEventListener("pointercancel", handleCancel);
    controls.dispose();
    traffic.dispose?.();
    people.dispose?.();
    communications.dispose?.();
    industry.dispose?.();
    construction.dispose?.();
    clearDistrictGeometry();
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
      ...ownerLabels.values(),
      ...placeLabels.values(),
      ...industryLabels.values(),
      ...sectorLabels.values(),
    ])
      el.remove();
  }
  emphasis.install(scene);
  emphasis.setDistrict(district);
  emphasis.update(0, true);
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
    setTVPresentation,
    setTVTour,
    pauseTVTour,
    focusOwner,
    projectOwner,
    focusDistrict,
    setDistrict,
    getDistrict,
    focusPlace,
    focusIndustry,
    projectPlace,
    projectIndustry,
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
      pickWorld,
      entityGroups,
      renderer,
      scene,
      camera,
      controls,
      traffic,
      people,
      communications,
      industry,
      getDistrict,
      setTVTour,
      pauseTVTour,
      getTVTourState,
      projectPlace,
      projectIndustry,
      construction,
      districtRoot,
      projectOwner,
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
    stone: mat("Limestone pavement", "#e0e2d8"),
    base: mat("Warm limestone plinth", "#d5d8cb"),
    asphalt: mat("Quiet asphalt", "#717e83"),
    curb: mat("Limestone curb", "#f1eee2"),
    white: mat("Road paint", "#eae9dd"),
    lawn: mat("Urban planting", "#78ae50"),
    soil: mat("Planter soil", "#9e8d72"),
    wood: mat("Oak street furniture", "#aa916f"),
    metal: mat("Muted street metal", "#466f72"),
    leaf: mat("Tree canopies", "#64a452"),
    trunk: mat("Tree bark", "#9c8c70"),
    water: mat("Civic fountain", "#54b5c3", 0.2),
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

function makeDistrictRoads(scene, resources) {
  const root = new THREE.Group();
  root.name = "Connected avenues to communications and industry";
  scene.add(root);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = {
    asphalt: new THREE.MeshStandardMaterial({
      color: "#717e83",
      roughness: 0.95,
    }),
    paint: new THREE.MeshStandardMaterial({ color: "#f7f5dd", roughness: 0.8 }),
    curb: new THREE.MeshStandardMaterial({ color: "#f1eee2", roughness: 0.9 }),
    lawn: new THREE.MeshStandardMaterial({ color: "#77ad50", roughness: 0.95 }),
  };
  resources.push(geometry, ...Object.values(materials));
  const buckets = new Map();
  function box(key, x, y, z, sx, sy, sz) {
    tmp.position.set(x, y, z);
    tmp.scale.set(sx, sy, sz);
    tmp.rotation.set(0, 0, 0);
    tmp.updateMatrix();
    const copy = geometry.clone().applyMatrix4(tmp.matrix);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(copy);
  }
  // Two slim perimeter accesses clear the existing back-row buildings and
  // planters. The new avenues then join the industrial district's x ±35 loop.
  for (const sign of [-1, 1]) {
    box("asphalt", sign * 25, 0.205, -11.1, 2.4, 0.015, 4.2);
    box("asphalt", sign * 31.05, 0.205, -13.1, 13.8, 0.015, 1.3);
    box("asphalt", sign * 37.55, 0.205, -20.05, 1.3, 0.015, 15.2);
    box("asphalt", sign * 35, 0.205, -39, 2.4, 0.015, 25);
    box("curb", sign * 33.62, 0.247, -39, 0.16, 0.09, 25);
    box("curb", sign * 36.38, 0.247, -39, 0.16, 0.09, 25);
    for (let z = -30; z >= -50; z -= 4)
      box("paint", sign * 35, 0.219, z, 0.08, 0.012, 1.6);
  }
  box("asphalt", 0, 0.205, -27, 76, 0.015, 3);
  box("curb", 0, 0.247, -28.65, 73, 0.09, 0.18);
  for (let x = -33; x <= 33; x += 4)
    box("paint", x, 0.219, -27, 1.6, 0.012, 0.08);
  // Clear pedestrian paths connect the customer city and the four venues.
  for (const z of [-29.15, -41.4]) box("curb", 0, 0.234, z, 68, 0.045, 0.8);
  for (const x of [-18, 0, 18]) box("curb", x, 0.234, -35, 0.8, 0.045, 11.5);
  for (const x of [-27, -9, 9, 27]) {
    box("lawn", x, 0.225, -42.8, 13, 0.045, 0.5);
    for (let stripe = -2; stripe <= 2; stripe++)
      box("paint", x + stripe * 0.3, 0.222, -27, 0.16, 0.014, 2.7);
  }
  for (const [key, parts] of buckets) {
    const merged = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    const mesh = new THREE.Mesh(merged, materials[key]);
    mesh.name = `District connector ${key}`;
    mesh.receiveShadow = true;
    root.add(mesh);
    resources.push(merged);
  }
  return root;
}
