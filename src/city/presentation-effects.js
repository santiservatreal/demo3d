import * as THREE from "three";
import { createArchitecture } from "./architecture.js";
import { createConstructionDirector, CONSTRUCTION_DURATION, phaseAt } from "./construction.js";

const clamp = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const smooth = (n) => { const t = clamp(n); return t * t * (3 - 2 * t); };
export const STORY_PARTICLE_LIMIT = 112;
export const STORY_TILE_COUNT = 63;

/** Pure sampling makes pause, seeking and replay independent of the render clock. */
export function sampleStoryPhase(effect, progress, reducedMotion = false) {
  const p = reducedMotion ? 1 : clamp(progress);
  if (["assemble", "assemble-city"].includes(effect)) return { effect: "assemble", progress: p, phase: p >= 1 ? "complete" : "assembling" };
  if (["sale", "sales-transfer", "celebrate-sale"].includes(effect)) {
    const transfer = clamp(p / 0.85);
    return { effect: "sale", progress: p, ...phaseAt(transfer * CONSTRUCTION_DURATION), progress: p, transferProgress: transfer, celebration: clamp((p - 0.84) / 0.16) };
  }
  if (["industry", "production-flow", "delivery"].includes(effect)) return {
    effect: "industry", progress: p,
    phase: p < 0.24 ? "manufacturing" : p < 0.45 ? "packing" : p < 0.63 ? "stored" : p < 0.93 ? "transit" : "delivered",
    travel: smooth((p - 0.60) / 0.33), celebration: clamp((p - 0.91) / 0.09),
  };
  if (["communications", "communications-flow"].includes(effect)) return { effect: "communications", progress: p, phase: "activity" };
  return { effect: "none", progress: p, phase: "idle" };
}

/**
 * An opt-in, bounded presentation layer. It borrows transforms from the city but
 * never changes CRM records, stages, inventory, conversations or event stores.
 * No RAF or renderer is created here; the existing scene samples it explicitly.
 */
export function createPresentationEffects({ scene, architecture, getRoots, getSaleSites, getIndustrySites, reducedMotion = false }) {
  const root = new THREE.Group();
  root.name = "Demo story effects · fictional, read-only choreography";
  root.userData = { presentationOnly: true, simulated: true };
  root.visible = false;
  scene.add(root);
  let disposed = false, current = sampleStoryPhase(null, 0), savedRoots = [], savedEntities = [], sale = null, assets = null;
  let shadowProgress = -1, shadowEffect = "", needsShadowUpdate = false;
  const dummy = new THREE.Object3D();
  const focus = new THREE.Vector3();
  const resources = [];

  function makeAssets() {
    if (assets) return assets;
    const tileGeometry = new THREE.BoxGeometry(1, 1, 1);
    const tileMaterial = new THREE.MeshStandardMaterial({ color: "#e3ebda", roughness: 0.9 });
    const tiles = new THREE.InstancedMesh(tileGeometry, tileMaterial, STORY_TILE_COUNT);
    tiles.name = "63 reusable puzzle foundation tiles";
    tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    tiles.frustumCulled = false;
    tiles.receiveShadow = true;
    tiles.visible = false;
    for (let i = 0; i < STORY_TILE_COUNT; i++) tiles.setColorAt(i, new THREE.Color(i % 3 === 0 ? "#a3d7a0" : i % 3 === 1 ? "#d5e4d0" : "#e9e7db"));
    root.add(tiles);
    const particleGeometry = new THREE.PlaneGeometry(0.18, 0.11);
    const particleMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 1, depthWrite: false });
    const confetti = new THREE.InstancedMesh(particleGeometry, particleMaterial, STORY_PARTICLE_LIMIT);
    confetti.name = "Bounded 3D celebration · 112 reusable pieces";
    confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    confetti.frustumCulled = false;
    confetti.visible = false;
    const colors = ["#ffbd30", "#26dc8b", "#31b5ff", "#ff5995", "#b58aff", "#ffffff"];
    for (let i = 0; i < STORY_PARTICLE_LIMIT; i++) confetti.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    root.add(confetti);
    const overlay = new THREE.Group(); root.add(overlay);
    const featureArchitecture = createArchitecture(overlay);
    const feature = featureArchitecture.addEntity({ id: "__presentation_opportunity__", amount: 24000, variant: 1, accent: "#9875e7" }, new THREE.Vector3());
    featureArchitecture.build();
    featureArchitecture.meshes.forEach((mesh) => { mesh.frustumCulled = false; mesh.userData.presentationOnly = true; });
    const construction = createConstructionDirector({ scene: overlay, architecture: featureArchitecture, reducedMotion, maxActive: 1 });
    overlay.visible = false;
    const representative = new THREE.Group(); representative.name = "Presentation sales representative · fictional"; overlay.add(representative);
    const personGeometry = new THREE.BoxGeometry(1, 1, 1), headGeometry = new THREE.SphereGeometry(0.16, 8, 6);
    const suit = new THREE.MeshStandardMaterial({ color: "#2460af", roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: "#dba988", roughness: 0.8 });
    const hair = new THREE.MeshStandardMaterial({ color: "#39322e", roughness: 0.9 });
    const torso = new THREE.Mesh(personGeometry, suit); torso.position.y = 0.88; torso.scale.set(0.42, 0.62, 0.26); representative.add(torso);
    for (const x of [-0.12, 0.12]) { const leg = new THREE.Mesh(personGeometry, suit); leg.position.set(x, 0.33, 0); leg.scale.set(0.14, 0.65, 0.18); representative.add(leg); }
    const head = new THREE.Mesh(headGeometry, skin); head.position.y = 1.35; representative.add(head);
    const hairstyle = new THREE.Mesh(headGeometry, hair); hairstyle.position.set(0, 1.42, -0.03); hairstyle.scale.set(1.06, 0.65, 1.06); representative.add(hairstyle);
    representative.scale.setScalar(1.3);
    resources.push(personGeometry, headGeometry, suit, skin, hair);

    const industryOverlay = new THREE.Group(); industryOverlay.visible = false; industryOverlay.name = "Fictional production journey · no inventory writes"; root.add(industryOverlay);
    const box = new THREE.BoxGeometry(1, 1, 1), wheel = new THREE.CylinderGeometry(0.25, 0.25, 0.19, 10);
    const truckWhite = new THREE.MeshStandardMaterial({ color: "#faf9ed", roughness: 0.6 });
    const truckBlue = new THREE.MeshStandardMaterial({ color: "#00a6c8", roughness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: "#23383f", roughness: 0.8 });
    const cardboard = new THREE.MeshStandardMaterial({ color: "#dcac66", roughness: 0.85 });
    const glass = new THREE.MeshStandardMaterial({ color: "#78cbe0", roughness: 0.2, metalness: 0.1 });
    const truck = new THREE.Group(); truck.visible = false; industryOverlay.add(truck);
    const meshBox = (group, material, p, scale) => { const m = new THREE.Mesh(box, material); m.position.set(...p); m.scale.set(...scale); m.castShadow = true; group.add(m); return m; };
    meshBox(truck, dark, [0, 0.43, 0], [1.6, 0.22, 3.7]);
    meshBox(truck, truckWhite, [0, 1.11, 1.15], [1.5, 1.25, 1.25]);
    meshBox(truck, glass, [0, 1.4, 1.79], [1.27, 0.45, 0.04]);
    meshBox(truck, truckBlue, [0, 1.35, -0.75], [1.64, 1.5, 2.6]);
    const wheels = [];
    for (const x of [-0.82, 0.82]) for (const z of [-1.2, 1.2]) { const m = new THREE.Mesh(wheel, dark); m.rotation.z = Math.PI / 2; m.position.set(x, 0.32, z); truck.add(m); wheels.push(m); }
    const parcels = new THREE.InstancedMesh(box, cardboard, 12); parcels.instanceMatrix.setUsage(THREE.DynamicDrawUsage); parcels.frustumCulled = false; parcels.castShadow = true; parcels.visible = false; industryOverlay.add(parcels);
    const routeGeometry = new THREE.BufferGeometry();
    const routeMaterial = new THREE.LineBasicMaterial({ color: "#32d4ac", transparent: true, opacity: 0.8, depthTest: true });
    const routeLine = new THREE.Line(routeGeometry, routeMaterial); industryOverlay.add(routeLine);
    const pulseGeometry = new THREE.RingGeometry(2.2, 2.38, 48);
    const pulseMaterial = new THREE.MeshBasicMaterial({ color: "#36dba7", side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false });
    const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial); pulse.rotation.x = -Math.PI / 2; pulse.visible = false; root.add(pulse);
    resources.push(tileGeometry, tileMaterial, particleGeometry, particleMaterial, box, wheel, truckWhite, truckBlue, dark, cardboard, glass, routeGeometry, routeMaterial, pulseGeometry, pulseMaterial);
    assets = { tiles, confetti, overlay, featureArchitecture, feature, construction, representative, industryOverlay, truck, wheels, parcels, routeLine, pulse, industryRoute: null };
    return assets;
  }

  function captureTransforms() {
    savedRoots = getRoots().filter(Boolean).map((object) => ({ object, position: object.position.clone(), scale: object.scale.clone(), visible: object.visible }));
    savedEntities = [...architecture.entities.values()].map((entity, index) => ({ entity, index, position: entity.group.position.clone(), visible: entity.visible, buildProgress: entity.buildProgress, accent: entity.accent }));
  }
  function restoreTransforms() {
    for (const row of savedRoots) { row.object.position.copy(row.position); row.object.scale.copy(row.scale); row.object.visible = row.visible; }
    for (const row of savedEntities) architecture.updateEntity(row.entity.id, { position: row.position, visible: row.visible, buildProgress: row.buildProgress, accent: row.accent });
    savedRoots = []; savedEntities = [];
  }
  function resetVisuals() {
    restoreTransforms();
    if (assets) { assets.construction.clear(); assets.overlay.visible = assets.industryOverlay.visible = assets.tiles.visible = assets.confetti.visible = assets.pulse.visible = false; }
    sale = null;
  }
  function sampleAssembly(p) {
    const { tiles } = makeAssets(); tiles.visible = p < 0.99;
    for (let i = 0; i < STORY_TILE_COUNT; i++) {
      const col = i % 7, row = Math.floor(i / 7), x = (col - 3) * 10.8, z = 21 - row * 12;
      const delay = (Math.abs(col - 3) * 0.07 + row * 0.045);
      const rise = smooth((p - delay * 0.75) / 0.28), settle = smooth((p - 0.52) / 0.4);
      dummy.position.set(x + (1 - rise) * (col - 3) * 4, -18 * (1 - rise) - settle * 0.8, z + (1 - rise) * (row - 4) * 2);
      dummy.scale.set(10.62 * Math.max(0.001, rise), Math.max(0.001, 1.2 * (1 - settle)), 11.82 * Math.max(0.001, rise));
      dummy.rotation.set(0, (1 - rise) * ((i % 3) - 1) * 0.14, 0); dummy.updateMatrix(); tiles.setMatrixAt(i, dummy.matrix);
    }
    tiles.instanceMatrix.needsUpdate = true;
    for (const row of savedRoots) {
      const rise = smooth((p - 0.16) / 0.43);
      row.object.position.y = row.position.y - (1 - rise) * 14;
      row.object.scale.y = row.scale.y * Math.max(0.001, rise);
      row.object.visible = row.visible && rise > 0.001;
    }
    for (const row of savedEntities) {
      const stagger = ((row.position.x + 40) / 80) * 0.14 + ((26 - row.position.z) / 108) * 0.19;
      architecture.updateEntity(row.entity.id, { buildProgress: row.buildProgress * smooth((p - 0.28 - stagger) / 0.35), visible: row.visible });
    }
    focus.set(0, 4, -22);
  }
  function drawConfetti(position, height, progress) {
    const { confetti } = makeAssets();
    confetti.visible = !reducedMotion && progress > 0 && progress < 1;
    if (!confetti.visible) return;
    for (let i = 0; i < STORY_PARTICLE_LIMIT; i++) {
      const angle = i * 2.399963, radius = (0.5 + (i % 13) * 0.12) * (1 + progress * 3.8);
      const local = clamp(progress * 1.25 - (i % 7) * 0.025);
      dummy.position.set(position.x + Math.cos(angle) * radius, position.y + height + 0.5 + Math.sin(local * Math.PI) * (3.5 + i % 5) - local * 3.2, position.z + Math.sin(angle) * radius);
      dummy.rotation.set(i + progress * 9, angle + progress * 6, progress * 8);
      dummy.scale.setScalar(Math.max(0.01, 1 - progress ** 3)); dummy.updateMatrix(); confetti.setMatrixAt(i, dummy.matrix);
    }
    confetti.instanceMatrix.needsUpdate = true;
    confetti.material.opacity = 1 - smooth((progress - 0.8) / 0.2);
  }
  function startSale() {
    const a = makeAssets(), sites = getSaleSites();
    if (!sites) return null;
    sale = { ...sites, lastProgress: -1, job: null };
    a.featureArchitecture.updateEntity(a.feature.id, { position: sale.from, buildProgress: 1, visible: true, accent: "#9875e7" });
    a.overlay.visible = true;
    // The source opportunity is only hidden in this renderer, never in CRM data.
    if (sale.sourceId) architecture.updateEntity(sale.sourceId, { visible: false });
    return sale;
  }
  function sampleSale(sample) {
    const a = makeAssets(); if (!sale && !startSale()) return;
    if (!sale.job || sample.transferProgress < sale.lastProgress) {
      a.construction.clear();
      // This isolated director has no live jobs: reset its clock before seeking.
      a.construction.update(0);
      sale.job = a.construction.start({ id: a.feature.id, from: sale.from, to: sale.to, color: "#2fd18b", startedAt: 0, won: true });
    }
    a.construction.update(sample.transferProgress * CONSTRUCTION_DURATION);
    sale.lastProgress = sample.transferProgress;
    a.featureArchitecture.updateEntity(a.feature.id, { accent: sample.phase === "complete" ? "#2fd18b" : "#9875e7" });
    focus.copy(sale.job.focusPosition);
    if (sample.phase === "transport") {
      const enter = smooth((sample.transferProgress - 0.28) / 0.07);
      focus.lerpVectors(sale.from, focus, enter);
      const arrive = smooth((sample.transferProgress - 0.61) / 0.07);
      focus.lerp(sale.to, arrive);
    }
    const personSite = sample.phase === "deconstruct" ? sale.from : sample.phase === "transport" ? focus : sale.to;
    a.representative.position.copy(personSite); a.representative.position.x -= 2.5; a.representative.position.y += 0.2; a.representative.position.z += 1.9;
    a.representative.rotation.y = sample.progress * 0.8;
    drawConfetti(sale.to, a.feature.model.height, sample.celebration);
    a.pulse.visible = sample.phase === "complete";
    a.pulse.position.set(sale.to.x, 0.32, sale.to.z);
    a.pulse.scale.setScalar(1.3 + Math.sin(sample.celebration * Math.PI) * 0.4);
  }
  function buildIndustryRoute() {
    const a = makeAssets();
    const points = getIndustrySites();
    if (!points?.length) return;
    // Uses the industrial forecourt, never the sales construction street route.
    const controls = points.map((point) => point.clone().setY(0.3));
    a.industryRoute = new THREE.CatmullRomCurve3(controls, false, "centripetal", 0.2);
    a.routeLine.geometry.setFromPoints(a.industryRoute.getPoints(64).map((point) => point.setY(0.49)));
  }
  function sampleIndustry(sample) {
    const a = makeAssets(); a.industryOverlay.visible = true;
    if (!a.industryRoute) buildIndustryRoute(); if (!a.industryRoute) return;
    const flow = smooth(sample.progress), point = a.industryRoute.getPointAt(flow), tangent = a.industryRoute.getTangentAt(Math.min(0.9999, flow));
    const truckPoint = a.industryRoute.getPointAt(0.52 + sample.travel * 0.48);
    const truckTangent = a.industryRoute.getTangentAt(Math.min(0.9999, 0.52 + sample.travel * 0.48));
    a.truck.visible = sample.progress > 0.48;
    a.truck.position.copy(truckPoint); a.truck.rotation.y = Math.atan2(truckTangent.x, truckTangent.z);
    a.wheels.forEach((wheel) => { wheel.rotation.x = sample.travel * 70; });
    a.parcels.visible = sample.progress < 0.68;
    for (let i = 0; i < 12; i++) {
      const itemPoint = a.industryRoute.getPointAt(clamp(flow + (i % 4 - 1.5) * 0.013));
      dummy.position.copy(itemPoint); dummy.position.y += 0.45 + Math.floor(i / 4) * 0.65;
      dummy.position.x += ((i % 2) - 0.5) * 0.85; dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0); dummy.scale.set(0.68, 0.58, 0.68); dummy.updateMatrix(); a.parcels.setMatrixAt(i, dummy.matrix);
    }
    a.parcels.instanceMatrix.needsUpdate = true;
    focus.copy(sample.progress > 0.6 ? truckPoint : point);
    a.pulse.visible = true; a.pulse.position.copy(point); a.pulse.position.y = 0.5; a.pulse.scale.setScalar(1.4 + Math.sin(sample.progress * Math.PI * 8) * 0.12);
    drawConfetti(a.industryRoute.getPointAt(1), 4.2, sample.celebration);
  }
  function sample(frame = {}) {
    if (disposed) return { ok: false, code: "disposed" };
    const next = sampleStoryPhase(frame.effect, frame.progress ?? frame.effectStageProgress ?? frame.effectProgress ?? 0, reducedMotion);
    if (next.effect !== current.effect) { resetVisuals(); if (next.effect !== "none") captureTransforms(); shadowEffect = ""; }
    current = next;
    root.visible = next.effect !== "none";
    if (next.effect === "assemble") sampleAssembly(next.progress);
    else if (next.effect === "sale") sampleSale(next);
    else if (next.effect === "industry") sampleIndustry(next);
    if (shadowEffect !== next.effect || Math.abs(shadowProgress - next.progress) > 0.035) {
      needsShadowUpdate = true; shadowProgress = next.progress; shadowEffect = next.effect;
    }
    return { ok: true, ...getState() };
  }
  function getState() {
    const construction = assets?.construction.debug();
    return { ...current, revealProgress: current.effect === "assemble" ? current.progress : 1,
      geometry: { tilesVisible: Boolean(assets?.tiles.visible && root.visible), tileInstances: assets?.tiles.visible && root.visible ? STORY_TILE_COUNT : 0,
        constructionRigs: construction?.visibleRigs || 0, truckVisible: Boolean(root.visible && (assets?.truck.visible && assets?.industryOverlay.visible || construction?.visibleRigs > 0)),
        representativeVisible: Boolean(root.visible && assets?.overlay.visible), confettiVisible: Boolean(root.visible && assets?.confetti.visible), confettiInstances: root.visible && assets?.confetti.visible ? STORY_PARTICLE_LIMIT : 0,
        industryParcelsVisible: Boolean(root.visible && assets?.industryOverlay.visible && assets?.parcels.visible) },
      active: current.effect !== "none", focus: focus.toArray(), sale: sale ? { from: sale.from.toArray(), to: sale.to.toArray(), sourceId: sale.sourceId, fictional: true } : null,
      resourcesCreated: Boolean(assets), tileCount: assets ? STORY_TILE_COUNT : 0, maxConfetti: assets ? STORY_PARTICLE_LIMIT : 0, rendererCount: 0, animationFrameCount: 0, businessMutation: false };
  }
  function clear() { resetVisuals(); current = sampleStoryPhase(null, 0); root.visible = false; needsShadowUpdate = true; }
  return { sample, clear, getState, getFocus: () => focus, consumeShadowUpdate() { const value = needsShadowUpdate; needsShadowUpdate = false; return value; }, dispose() { if (disposed) return; clear(); assets?.construction.dispose(); assets?.featureArchitecture.dispose(); resources.forEach((resource) => resource.dispose()); root.removeFromParent(); disposed = true; } };
}
