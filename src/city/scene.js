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
import {
  configureMapControls,
  fitMapBounds,
  fixedMapOffset,
  ownerBadgeAnchor,
} from "./map-camera.js";

const COLORS = ["#338ee0", "#00a99a", "#f1ab29", "#9468d2", "#31ab64"];
const tmp = new THREE.Object3D(),
  v3 = new THREE.Vector3(),
  ray = new THREE.Raycaster(),
  pointer = new THREE.Vector2();
const clamp = THREE.MathUtils.clamp,
  lerp = THREE.MathUtils.lerp;
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
    ownerLabels = new Map(),
    identity = new Map();
  const w = () => Math.max(1, container.clientWidth),
    h = () => Math.max(1, container.clientHeight);
  let labelSpecs = [],
    labelLayoutDirty = true;
  const presentationNavigationListeners = new Set();
  let presentationNavigation = null,
    presentationHighlight = null,
    presentationFollowing = false;
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
  camera.position.copy(new THREE.Vector3(0, 1, 0).add(fixedMapOffset()));
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
  configureMapControls(controls);
  controls.minZoom = 0.65;
  controls.maxZoom = 5.4;
  controls.maxTargetRadius = 120;
  controls.zoomSpeed = 0.75;
  controls.panSpeed = 0.7;
  controls.addEventListener("start", () => {
    flight = null;
    followFocus = null;
    mode = tvPresentation ? "tv" : "explore";
    pauseTVTour();
    notifyManualNavigation();
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
  // One reusable presentation marker. It shares the selection geometry and
  // stays invisible unless the dedicated demo controller requests a highlight.
  const presentationRingMaterial = ringMaterial.clone();
  presentationRingMaterial.color.set("#139fdd");
  const presentationRing = new THREE.Mesh(
    ringGeometry,
    presentationRingMaterial,
  );
  presentationRing.name = "Read-only demo presentation highlight";
  presentationRing.rotation.x = -Math.PI / 2;
  presentationRing.visible = false;
  scene.add(presentationRing);
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
    return fixedMapOffset();
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
    return fitMapBounds(viewBounds(), width, height, {
      top: portraitTV() ? 210 : tvPresentation ? 132 : 16,
      bottom: portraitTV() ? 120 : tvPresentation ? 96 : 40,
    });
  }
  function resize({ preserveFlight = true } = {}) {
    const interruptedFlight =
      preserveFlight && tvPresentation && flight?.fromFrustum ? flight : null;
    const previousTop = camera.top,
      previousBottom = camera.bottom;
    const width = w(),
      height = h(),
      aspect = width / height;
    const portrait = portraitTV();
    const fit = projectedFit(width, height);
    const vertical = fit.vertical;
    camera.left = (-vertical * aspect) / 2;
    camera.right = (vertical * aspect) / 2;
    camera.top = vertical / 2 + fit.center;
    camera.bottom = -vertical / 2 + fit.center;
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
    return [...cityStages().map((stage) => stage.id), "clients"].map((id) => ({
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
      visible: false,
      presentation: "outside-canvas",
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
    const offset = fixedMapOffset(90);
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
    const offset = fixedMapOffset(90);
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
    const offset = fixedMapOffset(100);
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
    const offset = fixedMapOffset(100);
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
    const bounds = viewBounds();
    const target = new THREE.Vector3(
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
      (bounds.minZ + bounds.maxZ) / 2,
    );
    const position = target.clone().add(viewDirection());
    flight = {
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      fromZoom: camera.zoom,
      toTarget: target,
      toPos: position,
      toZoom: 1,
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
    notifyManualNavigation();
    schedule();
  }
  function panBy(dx, dy) {
    flight = null;
    followFocus = null;
    pauseTVTour();
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(
      camera.matrixWorld,
      0,
    );
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const shift = right
      .multiplyScalar(
        (Number(dx || 0) * (camera.right - camera.left)) / camera.zoom / w(),
      )
      .add(
        up.multiplyScalar(
          (Number(dy || 0) * (camera.top - camera.bottom)) / camera.zoom / h(),
        ),
      );
    camera.position.add(shift);
    controls.target.add(shift);
    controls.update();
    notifyManualNavigation();
    schedule();
  }
  function notifyManualNavigation() {
    cancelPresentation("manual_navigation");
    for (const listener of presentationNavigationListeners) {
      try {
        listener();
      } catch (error) {
        console.info(
          "Atlas: presentation navigation listener failed.",
          error.message,
        );
      }
    }
    onNavigate();
  }
  function settlePresentationNavigation(code) {
    const pending = presentationNavigation;
    if (!pending) return;
    presentationNavigation = null;
    pending.resolve({
      ok: code === "completed",
      code,
      action: pending.action,
      ...(pending.target ? { target: { ...pending.target } } : {}),
      businessMutation: false,
    });
  }
  function cancelPresentation(reason = "cancelled") {
    if (presentationNavigation?.flight === flight) flight = null;
    settlePresentationNavigation(reason);
    presentationHighlight = null;
    presentationRing.visible = false;
    // Preserve normal CRM following when the demo has never taken ownership.
    if (presentationFollowing) followFocus = null;
    presentationFollowing = false;
  }
  function presentationFailure(code, target) {
    return {
      ok: false,
      code,
      ...(target ? { target: { ...target } } : {}),
      businessMutation: false,
    };
  }
  function resolvePresentationTarget(target) {
    if (!target || typeof target.id !== "string") return null;
    const { kind, id } = target;
    if (kind === "district") {
      if (!["all", "sales", "communications", "industry"].includes(id))
        return null;
      return { district: id, point: null };
    }
    if (kind === "deal" || kind === "account") {
      const records = kind === "deal" ? state?.deals : state?.accounts;
      if (!records?.some((entry) => entry.id === id)) return null;
      const entity = architecture.entities.get(id);
      if (!entity?.visible) return null;
      return {
        district: "sales",
        point: entity.group.position.clone(),
        radius: 1,
      };
    }
    if (kind === "owner") {
      if (!layers.activity || !state?.owners?.some((entry) => entry.id === id))
        return null;
      const point = people.getOwnerPosition(id);
      return point ? { district: "sales", point, radius: 0.48 } : null;
    }
    if (kind === "sales-stage") {
      if (id !== "clients" && !state?.stages?.some((entry) => entry.id === id))
        return null;
      const point =
        id === "clients"
          ? new THREE.Vector3(0, 0, 18)
          : districtAnchors.get(id)?.clone();
      if (point && id !== "clients") point.z = -8;
      return point ? { district: "sales", point, radius: 1.8 } : null;
    }
    if (kind === "communication") {
      const place = communications.getPlaces().find((entry) => entry.id === id);
      const point = (place?.groundPosition || place?.position)?.clone();
      return point ? { district: "communications", point, radius: 1.2 } : null;
    }
    if (["industry-stage", "batch", "vehicle"].includes(kind)) {
      const records =
        kind === "industry-stage"
          ? industryState?.stages
          : kind === "batch"
            ? industryState?.batches
            : industryState?.vehicles;
      if (!records?.some((entry) => entry.id === id)) return null;
      const point = industry.focusPoint(id);
      return point
        ? {
            district: "industry",
            point,
            radius: kind === "industry-stage" ? 1.8 : 0.8,
          }
        : null;
    }
    return null;
  }
  function capturePresentationView() {
    return {
      version: 1,
      district,
      cameraPosition: camera.position.toArray(),
      target: controls.target.toArray(),
      zoom: camera.zoom,
      selectedId,
      followFocus,
      followAnchor: followAnchor?.toArray() || null,
      tvTour: { ...tvTour, sequence: [...tvTour.sequence] },
      capturedAt: elapsed,
    };
  }
  function restorePresentationView(snapshot) {
    cancelPresentation("restored");
    const vector = (value) =>
      Array.isArray(value) &&
      value.length === 3 &&
      value.every(Number.isFinite);
    if (
      disposed ||
      !snapshot ||
      snapshot.version !== 1 ||
      !["all", "sales", "communications", "industry"].includes(
        snapshot.district,
      ) ||
      !vector(snapshot.cameraPosition) ||
      !vector(snapshot.target) ||
      !Number.isFinite(snapshot.zoom)
    )
      return presentationFailure("invalid_view");
    setDistrict(snapshot.district);
    flight = null;
    const target = new THREE.Vector3().fromArray(snapshot.target);
    const distance = clamp(
      new THREE.Vector3().fromArray(snapshot.cameraPosition).distanceTo(target),
      1,
      300,
    );
    controls.target.copy(target);
    camera.position.copy(target).add(fixedMapOffset(distance));
    camera.zoom = clamp(snapshot.zoom, controls.minZoom, controls.maxZoom);
    camera.updateProjectionMatrix();
    controls.update();
    select(
      snapshot.selectedId &&
        architecture.entities.get(snapshot.selectedId)?.visible
        ? snapshot.selectedId
        : null,
    );
    followFocus =
      typeof snapshot.followFocus === "string" ? snapshot.followFocus : null;
    followAnchor = vector(snapshot.followAnchor)
      ? new THREE.Vector3().fromArray(snapshot.followAnchor)
      : null;
    if (snapshot.tvTour && Array.isArray(snapshot.tvTour.sequence)) {
      const gap = Math.max(0, elapsed - (Number(snapshot.capturedAt) || 0));
      Object.assign(tvTour, snapshot.tvTour, {
        sequence: [...snapshot.tvTour.sequence],
        nextAt: snapshot.tvTour.nextAt + gap,
        pausedUntil: snapshot.tvTour.pausedUntil + gap,
      });
    }
    schedule();
    return { ok: true, code: "restored", businessMutation: false };
  }
  function navigatePresentation(action, target, duration, navigate) {
    if (disposed || !active || document.hidden)
      return Promise.resolve(presentationFailure("scene_unavailable", target));
    settlePresentationNavigation("superseded");
    presentationFollowing = true;
    tvTour.enabled = false;
    navigate();
    if (!flight)
      return Promise.resolve(presentationFailure("target_unavailable", target));
    const seconds = Number.isFinite(duration) ? clamp(duration, 0.15, 12) : 2.8;
    flight.duration = reducedMotion ? 0.01 : seconds;
    return new Promise((resolve) => {
      presentationNavigation = { flight, action, target, resolve };
      schedule();
    });
  }
  function focusPresentationTarget(target = {}, { duration } = {}) {
    const resolved = resolvePresentationTarget(target);
    if (!resolved)
      return Promise.resolve(presentationFailure("target_unavailable", target));
    return navigatePresentation("focus", target, duration, () => {
      if (target.kind === "district")
        setDistrict(target.id, { tour: true, duration: duration ?? 2.8 });
      else if (target.kind === "deal" || target.kind === "account")
        focus(target.id, { panelWidth: 0 });
      else if (target.kind === "owner") focusOwner(target.id);
      else if (target.kind === "sales-stage") focusDistrict(target.id);
      else if (target.kind === "communication") {
        if (district !== resolved.district) setDistrict(resolved.district);
        focusPoint(resolved.point, { panelWidth: 0 });
      } else {
        if (district !== resolved.district) setDistrict(resolved.district);
        focusPoint(resolved.point, { panelWidth: 0, zoom: 2.35 });
        followFocus = `industry:${target.id}`;
        followAnchor = resolved.point.clone();
      }
    });
  }
  function highlightPresentationTarget(target = {}, { duration } = {}) {
    if (disposed || !active || document.hidden)
      return presentationFailure("scene_unavailable", target);
    const resolved = resolvePresentationTarget(target);
    if (!resolved?.point)
      return presentationFailure("target_unavailable", target);
    if (district !== "all" && district !== resolved.district)
      return presentationFailure("target_outside_view", target);
    const marker = {
      radius: resolved.radius || 1,
      height: resolved.district === "industry" ? 0.62 : 0.38,
      offset: new THREE.Vector3(),
    };
    if (target.kind === "industry-stage") {
      // The existing selection proxy encloses the real station footprint
      // (11.5 × 9 m). Centre the halo on that footprint, not the camera anchor,
      // and keep its entire perimeter outside the building's base slab.
      const footprint = scene.getObjectByName(
        `Selección industria · ${target.id}`,
      );
      if (footprint) {
        const center = footprint.getWorldPosition(new THREE.Vector3());
        marker.offset.copy(center).sub(resolved.point);
        marker.radius =
          (Math.hypot(footprint.scale.x, footprint.scale.z) / 2 + 0.5) /
          ringGeometry.parameters.outerRadius;
      }
      // Stock's slab reaches 0.965 m; the factory/packing slabs reach 0.745 m.
      marker.height = target.id === "warehouse" ? 1.04 : 0.82;
    } else if (target.kind === "deal" || target.kind === "account") {
      const entity = architecture.entities.get(target.id);
      marker.radius =
        Math.max(
          3.5,
          (Math.hypot(entity.model.width, entity.model.depth) *
            entity.scaleXZ) /
            2 +
            0.5,
        ) / ringGeometry.parameters.outerRadius;
    } else if (target.kind === "communication") {
      // Include the widest 4.8 m café foundation and its 0.67 m world top.
      marker.radius =
        (Math.hypot(5.1, 4.05) / 2 + 0.4) / ringGeometry.parameters.outerRadius;
      marker.height = 0.75;
    }
    marker.offset.y = 0;
    presentationHighlight = {
      target: { ...target },
      startedAt: elapsed,
      duration: Number.isFinite(duration) ? clamp(duration, 0.5, 15) : 5,
      ...marker,
    };
    presentationRing.visible = true;
    updatePresentation();
    schedule();
    return {
      ok: true,
      code: "highlighted",
      target: { ...target },
      businessMutation: false,
    };
  }
  function updatePresentation() {
    if (presentationNavigation && presentationNavigation.flight !== flight)
      settlePresentationNavigation(flight ? "interrupted" : "completed");
    if (!presentationHighlight) return;
    const age = elapsed - presentationHighlight.startedAt;
    const resolved = resolvePresentationTarget(presentationHighlight.target);
    if (
      age >= presentationHighlight.duration ||
      !resolved?.point ||
      (district !== "all" && district !== resolved.district)
    ) {
      presentationHighlight = null;
      presentationRing.visible = false;
      return;
    }
    presentationRing.position.set(
      resolved.point.x + presentationHighlight.offset.x,
      presentationHighlight.height,
      resolved.point.z + presentationHighlight.offset.z,
    );
    // Expand from the fitted perimeter; shrinking below it hides the halo
    // inside a station foundation again during half of the pulse cycle.
    const pulse = reducedMotion ? 1 : 1 + (Math.sin(age * 3.5) + 1) * 0.025;
    presentationRing.scale.setScalar(presentationHighlight.radius * pulse);
    presentationRingMaterial.opacity = reducedMotion
      ? 0.9
      : 0.65 + Math.sin(age * 3.5) * 0.25;
  }
  function playPresentationAnimation({ target, kind, duration } = {}) {
    if (disposed || !active || document.hidden)
      return presentationFailure("scene_unavailable", target);
    if (kind === "pulse") {
      const result = highlightPresentationTarget(target, { duration });
      return { ...result, animation: "pulse" };
    }
    if (kind === "traffic") {
      const running = layers.traffic && !reducedMotion && quality !== "light";
      return {
        ok: running,
        code: running ? "already_running" : "animation_disabled",
        animation: kind,
        businessMutation: false,
      };
    }
    if (kind === "machinery") {
      const running = Boolean(
        industryState && industry.debug().machinery.animated,
      );
      return {
        ok: running,
        code: running ? "already_running" : "animation_disabled",
        animation: kind,
        businessMutation: false,
      };
    }
    return {
      ...presentationFailure("unsupported_animation"),
      animation: typeof kind === "string" ? kind : null,
    };
  }
  const presentation = Object.freeze({
    captureView: capturePresentationView,
    restoreView: restorePresentationView,
    focusTarget: ({ duration, ...target } = {}) =>
      focusPresentationTarget(target, { duration }),
    overview: ({ duration } = {}) =>
      navigatePresentation("overview", null, duration, () =>
        setDistrict("all", { tour: true, duration: duration ?? 2.8 }),
      ),
    highlightTarget: ({ duration, ...target } = {}) =>
      highlightPresentationTarget(target, { duration }),
    playAnimation: playPresentationAnimation,
    cancel: cancelPresentation,
    onManualNavigation(listener) {
      if (typeof listener !== "function") return () => {};
      presentationNavigationListeners.add(listener);
      return () => presentationNavigationListeners.delete(listener);
    },
    getState: () => ({
      navigating: Boolean(presentationNavigation),
      highlight: presentationHighlight
        ? { ...presentationHighlight.target }
        : null,
      businessMutation: false,
    }),
  });
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
  function getLabelCache(element) {
    let cache = labelCache.get(element);
    if (!cache) {
      cache = {
        signature: "",
        measuredSignature: "",
        width: 0,
        height: 0,
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
  function ownerBadge(owner) {
    let element = ownerLabels.get(owner.ownerId);
    if (!element) {
      element = document.createElement("button");
      element.type = "button";
      element.className = "city-owner-label";
      element.dataset.ownerId = owner.ownerId;
      element.dataset.anchorMode = "behind-ground";
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
    const signature = [owner.initials, owner.color, owner.name].join("|");
    const cache = getLabelCache(element);
    if (cache.signature === signature) return element;
    cache.signature = signature;
    labelMetrics.contentBuilds++;
    element.textContent = owner.initials;
    element.title = `${owner.name} · Ver comercial`;
    element.setAttribute("aria-label", element.title);
    // Only initials stay in the scene. Detail and deal status belong to the
    // fixed CRM panel, so a change of activity never enlarges the moving badge.
    element.style.cssText = `position:absolute;left:0;top:0;height:20px;min-width:23px;white-space:nowrap;padding:0 4px;border:1.5px solid #fff;border-radius:6px;background:${owner.color || "#237cc1"};box-shadow:0 1px 4px #12384e33;color:white;font:800 9px DM Sans,sans-serif;pointer-events:auto;text-align:center;will-change:transform;line-height:17px;`;
    labelLayoutDirty = true;
    return element;
  }
  // The city is a quiet map: building and district summaries live in the fixed
  // app panel. Only small initial badges follow people, with cached DOM content.
  function refreshLabelContent() {
    if (!labelContainer || !state) return;
    const showingPeople = district === "sales" || district === "all";
    const specs = [],
      present = new Set();
    if (layers.activity && showingPeople)
      for (const owner of people.getOwnerLabels?.() || []) {
        const element = ownerBadge(owner);
        specs.push({ element, ownerId: owner.ownerId });
        present.add(element);
      }
    for (const element of ownerLabels.values())
      if (!present.has(element)) setLabelHidden(element, true);
    for (const spec of specs) {
      const cache = getLabelCache(spec.element);
      if (cache.measuredSignature !== cache.signature || !cache.width) {
        spec.element.hidden = false;
        cache.hidden = false;
        cache.width = spec.element.offsetWidth || 23;
        cache.height = spec.element.offsetHeight || 20;
        cache.measuredSignature = cache.signature;
        labelMetrics.measurements++;
      }
    }
    labelSpecs = specs;
  }
  function projectLabels(allowLayout = false) {
    if (!labelContainer || !state) return;
    const width = w(),
      height = h();
    if (allowLayout && labelLayoutDirty) labelMetrics.layoutPasses++;
    labelMetrics.projectionFrames++;
    for (const spec of labelSpecs) {
      const element = spec.element,
        cache = getLabelCache(element);
      const person = people.getOwnerPosition(spec.ownerId);
      if (!person) {
        setLabelHidden(element, true);
        continue;
      }
      const point = ownerBadgeAnchor(person).project(camera);
      const feet = person.clone().project(camera);
      const personX = (feet.x * 0.5 + 0.5) * width;
      const personY = (-feet.y * 0.5 + 0.5) * height;
      let x = (point.x * 0.5 + 0.5) * width;
      const y = (-point.y * 0.5 + 0.5) * height;
      // A small minimum screen gap keeps the badge clear of the avatar even
      // when zoomed out. There is no collision solver or overhead tether.
      const avatarHalfWidth = Math.max(
        3,
        (0.45 * camera.zoom * width) / (camera.right - camera.left),
      );
      x = Math.max(x, personX + avatarHalfWidth + cache.width / 2 + 4);
      const hidden =
        !layers.labels ||
        point.z <= -1 ||
        point.z >= 1 ||
        x < cache.width / 2 + 5 ||
        x > width - cache.width / 2 - 5 ||
        y < cache.height / 2 + 5 ||
        y > height - cache.height / 2 - 5;
      setLabelHidden(element, hidden);
      if (!hidden) {
        element.style.transform = `translate3d(${x.toFixed(3)}px,${y.toFixed(3)}px,0) translate(-50%,-50%)`;
        element.dataset.labelX = x.toFixed(3);
        element.dataset.labelY = y.toFixed(3);
        element.dataset.personX = personX.toFixed(3);
        element.dataset.personY = personY.toFixed(3);
        element.dataset.avatarHalfWidth = avatarHalfWidth.toFixed(3);
      }
    }
    if (allowLayout) {
      labelLayoutDirty = false;
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
    updatePresentation();
    camera.updateMatrixWorld();
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
      labels: {
        ...labelMetrics,
        cachedCount: labelSpecs.length,
        presentation: "owner-initials-only",
        summaries: "outside-canvas",
      },
      mapView: {
        type: "fixed-isometric",
        rotate: controls.enableRotate,
        pan: controls.enablePan,
        zoom: controls.enableZoom,
        direction: fixedMapOffset().normalize().toArray(),
        quaternion: camera.quaternion.toArray(),
        polar: controls.getPolarAngle(),
        azimuth: controls.getAzimuthalAngle(),
      },
      emphasis: emphasis.debug(),
      portraitTV: portraitTV(),
      cameraMoving: !!flight,
      presentation: presentation.getState(),
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
      placeLabels: communications.getPlaces().map((place) => ({
        id: place.id,
        visible: false,
        presentation: "outside-canvas",
        text: `${place.name} · ${place.todayCompleted || 0} hoy`,
      })),
      industryLabels: industry.getPlaces().map((place) => ({
        id: place.id,
        visible: false,
        presentation: "outside-canvas",
        text: `${place.name} · ${place.count ?? 0} ${place.unit || "uds"}`,
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
    cancelPresentation("disposed");
    presentationNavigationListeners.clear();
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
    presentationRingMaterial.dispose();
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
    for (const el of ownerLabels.values()) el.remove();
  }
  emphasis.install(scene);
  emphasis.setDistrict(district);
  emphasis.update(0, true);
  resize();
  setQuality("auto");
  setLayers(layers);
  schedule();
  return {
    presentation,
    sync,
    select,
    focus,
    overview,
    zoomBy,
    panBy,
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
