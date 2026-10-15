import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import {
  loadAssets,
  createMaterials,
  cloneAsset,
  batchAsset,
} from "./assets.js";
import { vehicleState, loadingAnimation } from "./simulation.js";
export const PRESETS = {
  high: { dpr: 1.5, shadow: 4096, ao: true },
  balanced: { dpr: 1.2, shadow: 2048, ao: false },
  light: { dpr: 0.75, shadow: 1024, ao: false },
};
const v3 = (x, y, z) => new T.Vector3(x, y, z);
const ease = (t) => t * t * (3 - 2 * t);
export class LumaScene {
  static async create(container, options) {
    const scene = new LumaScene(container, options);
    try {
      scene.assets = await loadAssets(scene.renderer, options.onProgress);
      scene.build();
      scene.configure("balanced");
      scene.ready = true;
      scene.render();
      return scene;
    } catch (e) {
      scene.dispose();
      throw e;
    }
  }
  constructor(container, { onSelect, onManual = () => {} }) {
    this.container = container;
    this.onSelect = onSelect;
    this.onManual = onManual;
    this.registry = new Map();
    this.trucks = new Map();
    this.loaded = false;
    this.roofOff = false;
    this.follow = false;
    this.selected = null;
    this.filters = {};
    this.view = "campus";
    this.cameraMode = "ortho";
    this.scene = new T.Scene();
    this.scene.background = new T.Color("#e7ebe5");
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.info.autoReset = false;
    container.append(this.renderer.domElement);
    this.camera = new T.OrthographicCamera(-30, 30, 22, -22, 0.2, 250);
    this.camera.position.set(46, 40, 53);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, 1);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.minPolarAngle = 0.2;
    this.controls.maxPolarAngle = 1.35;
    this.controls.minZoom = 0.7;
    this.controls.maxZoom = 7;
    this.controls.maxDistance = 130;
    this.controls.minDistance = 7;
    this.controls.addEventListener("start", () => {
      this.follow = false;
      this.transition = null;
      this.onManual();
      this.invalidate();
    });
    this.controls.addEventListener("change", () => this.invalidate());
    this.light = new T.DirectionalLight("#fff0d9", 3.1);
    this.light.position.set(-24, 38, 20);
    this.light.castShadow = true;
    Object.assign(this.light.shadow.camera, {
      left: -32,
      right: 32,
      top: 28,
      bottom: -28,
      near: 1,
      far: 100,
    });
    this.light.shadow.normalBias = 0.025;
    this.light.shadow.bias = -0.00015;
    this.scene.add(
      this.light,
      new T.HemisphereLight("#eff6fc", "#9baf99", 0.7),
    );
    this.materials = createMaterials(this.renderer);
    this.geomCache = new Map();
    this.labelHost = document.createElement("div");
    this.labelHost.className = "l-label-host";
    container.append(this.labelHost);
    this.tooltip = document.createElement("div");
    this.tooltip.className = "l-tooltip";
    this.tooltip.hidden = true;
    container.append(this.tooltip);
    this.ray = new T.Raycaster();
    this.labelRay = new T.Raycaster();
    this.labelVector = new T.Vector2();
    this.projected = new T.Vector3();
    this.q = new T.Quaternion();
    this.forward = new T.Vector3(0, 0, -1);
    this.samples = [];
    this.info = {};
    this.dirty = true;
    let down;
    container.addEventListener(
      "pointerdown",
      (e) => (down = { x: e.clientX, y: e.clientY }),
    );
    container.addEventListener("pointerup", (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
        const id = this.pick(e);
        if (id) this.onSelect(id);
      }
    });
    container.addEventListener("pointermove", (e) => this.hover(e));
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.last = 0;
    this.renderer.setAnimationLoop((t) => this.frame(t));
    document.addEventListener("visibilitychange", () => {
      this.last = 0;
      this.invalidate();
    });
  }
  invalidate() {
    this.dirty = true;
  }
  rounded(parent, size, pos, mat = "ivory", radius = 0.025) {
    const key = size.join(",") + radius;
    let geo = this.geomCache.get(key);
    if (!geo) {
      geo = new RoundedBoxGeometry(...size, 1, radius);
      this.geomCache.set(key, geo);
    }
    const mesh = new T.Mesh(
      geo,
      typeof mat === "string" ? this.materials[mat] : mat,
    );
    mesh.position.set(...pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  group(id, pos = [0, 0, 0]) {
    const g = new T.Group();
    g.position.set(...pos);
    this.scene.add(g);
    if (id) {
      g.userData.entityId = id;
      this.registry.set(id, g);
    }
    return g;
  }
  addAsset(name, id, pos, rotation = 0) {
    const g = cloneAsset(this.assets[name]);
    g.position.set(...pos);
    g.rotation.y = rotation;
    this.scene.add(g);
    if (id) {
      g.userData.entityId = id;
      this.registry.set(id, g);
    }
    return g;
  }
  label(id, text, position, color = "sage") {
    const el = document.createElement("button");
    el.className = "l-place-label";
    el.dataset.entity = id;
    el.innerHTML = `<span class="${color}"></span>${text}`;
    el.onclick = () => this.onSelect(id);
    this.labelHost.append(el);
    (this.labels ??= []).push({ el, id, pos: v3(...position) });
  }
  build() {
    const { assets } = this;
    this.scene.environment = assets.environment.texture;
    this.scene.environmentIntensity = 0.58;
    this.scene.environmentRotation.y = 0.4;
    // Campus unit is one metre; one continuous paved apron avoids coplanar road junctions.
    const site = this.group(null);
    this.rounded(site, [53, 0.65, 37], [2, -0.43, 1], "concrete", 0.18);
    this.rounded(site, [51.6, 0.12, 35.6], [2, -0.06, 1], "ivory", 0.1);
    this.rounded(site, [50, 0.08, 19], [1, 0.025, 8.5], "asphalt", 0.04);
    const factory = this.addAsset(
      "factory",
      "production",
      [-9, 0.04, -7],
      Math.PI,
    );
    const warehouse = this.addAsset(
      "warehouse",
      "warehouse",
      [10, 0.04, -7],
      Math.PI,
    );
    this.factory = factory;
    this.warehouse = warehouse;
    this.roofs = [];
    for (const g of [factory, warehouse])
      g.traverse((o) => {
        if (o.name === "removable_roof") this.roofs.push(o);
      });
    const office = this.group("office", [-3, 0.1, 1]);
    this.registry.set("office", office);
    this.label("production", "01 / Taller & montaje", [-11, 5.8, -8]);
    this.label(
      "warehouse",
      "02 / Almacén & expediciones",
      [10, 5.9, -7],
      "blue",
    );
    this.label("office", "Luma Studio · Oficina", [-3, 3.8, 3], "sand");
    // Walkways: kerbs, zebra crossing and restrained landscaping; no mesh shares the asphalt plane.
    for (let x = -22; x < 23; x += 2) {
      if (x > -5 && x < 17) continue;
      this.rounded(site, [1.85, 0.15, 0.27], [x, 0.13, 18], "concrete", 0.03);
    }
    for (let i = 0; i < 7; i++)
      this.rounded(
        site,
        [0.5, 0.017, 3],
        [-4 + i * 0.8, 0.078, 6],
        "white",
        0.005,
      );
    for (let x of [-20, -17, -14]) {
      this.rounded(site, [0.07, 0.018, 5], [x, 0.079, 12], "white", 0.003);
      this.rounded(
        site,
        [2.7, 0.018, 0.07],
        [x + 1.4, 0.079, 14.5],
        "white",
        0.003,
      );
    }
    for (let i = 0; i < 3; i++) {
      this.rounded(
        site,
        [0.08, 0.017, 5],
        [4 + i * 4, 0.079, 1.5],
        "yellow",
        0.003,
      );
      this.rounded(
        site,
        [3.4, 0.017, 0.08],
        [6 + i * 4, 0.079, 4.1],
        "yellow",
        0.003,
      );
    }
    // Lane direction arrows and a dashed campus perimeter lane.
    for (let x = -15; x < 20; x += 3)
      this.rounded(site, [1, 0.017, 0.08], [x, 0.08, 10.6], "white", 0.003);
    this.roadArrow(site, 18, 11, 0);
    this.roadArrow(site, 0, 10, Math.PI);
    this.roadArrow(site, 6, 6, Math.PI / 2);
    this.buildProps(site);
    this.buildInterior();
    this.buildRacks();
    const destination = this.group("customer-01", [17, 0.08, 17.7]);
    this.rounded(destination, [5, 0.2, 3.3], [0, 0, 0], "concrete");
    this.rounded(destination, [4.2, 2.4, 2.6], [0, 1.3, 0], "ivory", 0.07);
    this.rounded(destination, [4.6, 0.18, 2.9], [0, 2.6, 0], "sage", 0.04);
    this.rounded(destination, [3.4, 1.5, 0.12], [0, 1.3, 1.36], "petrol", 0.03);
    this.label(
      "customer-01",
      "Destino regional · esquema",
      [17, 3.1, 19.2],
      "sand",
    );
    batchAsset(site);
    this.createTrucks();
    this.createStock();
    this.forklift = this.addAsset("forklift", "forklift", [6, 0.06, -0.3], 0);
    this.forkPallet = cloneAsset(assets.pallet);
    this.forklift.getObjectByName("fork_carriage").add(this.forkPallet);
    this.forkPallet.position.set(0, 0.055, -0.55);
    this.forkPallet.rotation.y = Math.PI / 2;
    this.forkCartons = [];
    for (let i = 0; i < 2; i++) {
      const c = cloneAsset(assets.carton);
      c.position.set((i - 0.5) * 0.55, 0.2, 0);
      this.forkPallet.add(c);
      this.forkCartons.push(c);
    }
    this.selectedRing = new T.Mesh(
      new T.RingGeometry(1.55, 1.6, 64),
      new T.MeshBasicMaterial({
        color: "#88a992",
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    this.selectedRing.rotation.x = -Math.PI / 2;
    this.selectedRing.position.y = 0.115;
    this.selectedRing.visible = false;
    this.scene.add(this.selectedRing);
    this.resize();
    this.presetView("campus", true);
  }
  roadArrow(g, x, z, a) {
    const arrow = this.group(null, [x, 0.095, z]);
    arrow.rotation.y = a;
    this.rounded(arrow, [1.4, 0.014, 0.13], [0, 0, 0], "white", 0.002);
    const a1 = this.rounded(
      arrow,
      [0.65, 0.014, 0.13],
      [0.48, 0, 0.2],
      "white",
      0.002,
    );
    a1.rotation.y = -0.7;
    const a2 = this.rounded(
      arrow,
      [0.65, 0.014, 0.13],
      [0.48, 0, -0.2],
      "white",
      0.002,
    );
    a2.rotation.y = 0.7;
  }
  buildProps(site) {
    // Repeated foliage uses instancing, seeded layout (decorative and explicitly not operational).
    const trunks = new T.InstancedMesh(
        new T.CylinderGeometry(0.085, 0.12, 1.25, 8),
        this.materials.wood,
        18,
      ),
      crowns = new T.InstancedMesh(
        new T.IcosahedronGeometry(0.8, 2),
        this.materials.sage,
        18,
      );
    const m = new T.Matrix4(),
      q = new T.Quaternion(),
      sc = new T.Vector3(1, 1, 1);
    let n = 0;
    for (const [x, z] of [
      [-22, -14],
      [-18, -15],
      [-13, -15],
      [-8, -15],
      [-3, -15],
      [3, -15],
      [8, -15],
      [13, -15],
      [18, -15],
      [23, -14],
      [-22, 4],
      [-22, 8],
      [-22, 12],
      [-22, 16],
      [-13, 17],
      [-10, 17],
      [19, 17],
      [23, 17],
    ]) {
      m.compose(v3(x, 0.65, z), q, sc);
      trunks.setMatrixAt(n, m);
      m.compose(v3(x, 1.8, z), q, sc);
      crowns.setMatrixAt(n++, m);
    }
    trunks.castShadow = true;
    crowns.castShadow = true;
    const foliageLOD = new T.LOD();
    foliageLOD.addLevel(crowns, 0);
    const low = new T.InstancedMesh(
      new T.IcosahedronGeometry(0.8, 1),
      this.materials.sage,
      18,
    );
    low.instanceMatrix = crowns.instanceMatrix;
    low.castShadow = true;
    foliageLOD.addLevel(low, 60);
    site.add(trunks, foliageLOD);
    for (const x of [-19, -12]) {
      this.rounded(site, [5, 0.6, 1.4], [x, 0.35, 17], "concrete", 0.08);
      this.rounded(site, [4.7, 0.08, 1.15], [x, 0.69, 17], "sage", 0.04);
    }
    // Drains, protected pedestrian entrance, charging point, fire extinguisher and utility hardware.
    for (const x of [-7, 6, 14]) {
      this.rounded(site, [0.8, 0.02, 0.4], [x, 0.085, 7.2], "dark");
      for (let j = 0; j < 5; j++)
        this.rounded(
          site,
          [0.04, 0.02, 0.35],
          [x - 0.3 + j * 0.15, 0.102, 7.2],
          "steel",
          0.001,
        );
    }
    for (const x of [-1, 1]) {
      this.rounded(site, [0.11, 2.8, 0.11], [x, 1.45, 6], "steel");
      this.rounded(site, [0.8, 0.08, 0.28], [x, 2.9, 6], "ivory");
    }
    const barrier = this.group(null, [-19, 0.08, 5]);
    this.rounded(barrier, [0.3, 0.9, 0.3], [0, 0.45, 0], "petrol");
    this.rounded(barrier, [3, 0.09, 0.09], [1.4, 0.85, 0], "white");
    for (let i = 0; i < 4; i++)
      this.rounded(
        barrier,
        [0.2, 0.095, 0.1],
        [0.3 + i * 0.65, 0.85, 0],
        "yellow",
      );
    // Static repeated props are batched in the glTF pipeline; close-range detailing stays on the models.
  }
  buildInterior() {
    const floor = this.group("assembly", [-9, 0.3, -7]);
    this.rounded(floor, [17.4, 0.08, 11.4], [0, 0, 0], "concrete");
    this.workPieces = [];
    this.workLamps = [];
    for (let station = 0; station < 3; station++) {
      const x = -5 + station * 5;
      const g = new T.Group();
      g.position.set(x, 0.05, 0);
      floor.add(g);
      g.userData.entityId = ["assembly", "quality", "packing"][station];
      this.registry.set(g.userData.entityId, g);
      this.rounded(
        g,
        [3.3, 0.16, 1.4],
        [0, 1, 0],
        station === 1 ? "petrol" : "ivory",
      );
      for (const xx of [-1.4, 1.4])
        for (const zz of [-0.5, 0.5])
          this.rounded(g, [0.08, 0.9, 0.08], [xx, 0.5, zz], "steel");
      this.rounded(g, [3.5, 0.12, 0.8], [0, 0.65, 2.2], "dark");
      for (let j = 0; j < 9; j++)
        this.rounded(
          g,
          [0.08, 0.06, 0.75],
          [-1.5 + j * 0.36, 0.74, 2.2],
          "steel",
        );
      const lamp = cloneAsset(this.assets.lamp);
      lamp.position.set(0, 1.08, 0);
      if (station === 0) {
        lamp.scale.setScalar(0.9);
        lamp.traverse((o) => {
          if (o.isMesh && ["sage", "white"].includes(o.material.name.split(".")[0]))
            o.visible = false;
        });
      }
      g.add(lamp);
      this.workLamps.push(lamp);
      if (station === 0) {
        for (let j = 0; j < 3; j++)
          this.rounded(g, [0.45, 0.18, 0.35], [-1 + j, 0.13, 1], "sage");
        this.rounded(g, [1.5, 0.8, 0.12], [0, 1.55, -0.75], "petrol");
        for (let j = 0; j < 6; j++)
          this.rounded(
            g,
            [0.04, 0.22, 0.03],
            [-0.6 + j * 0.24, 1.55, -0.65],
            "steel",
          );
      }
      if (station === 1) {
        this.rounded(g, [0.2, 1.7, 0.2], [-1.2, 1.9, 0], "steel");
        this.rounded(g, [0.5, 0.45, 0.12], [1, 1.35, -0.2], "dark");
        this.rounded(g, [0.4, 0.3, 0.02], [1, 1.35, -0.12], "sage");
      }
      if (station === 2) {
        const c = cloneAsset(this.assets.carton);
        c.position.set(0.9, 1.09, 0);
        g.add(c);
      }
      const piece = cloneAsset(
        station === 2 ? this.assets.carton : this.assets.lamp,
      );
      piece.position.set(0, 0.78, 2.2);
      g.add(piece);
      this.workPieces.push(piece);
      // Overhead fixture is non-shadowing and has controlled emissive, without global bloom.
      const lightmat = new T.MeshStandardMaterial({
        color: "#efeddc",
        emissive: "#fff6d9",
        emissiveIntensity: 0.3,
        roughness: 0.7,
      });
      this.rounded(g, [3, 0.08, 0.2], [0, 3.1, 0], lightmat);
    }
    const supplies = this.group(null, [-9, 0.35, -11]);
    for (let bay = 0; bay < 3; bay++) {
      const x = -5 + bay * 5;
      for (const side of [-1, 1])
        this.rounded(
          supplies,
          [0.08, 2.5, 0.08],
          [x + side * 1.5, 1.25, 0],
          "petrol",
        );
      for (const y of [0.35, 1.3, 2.25]) {
        this.rounded(supplies, [3.2, 0.08, 0.9], [x, y, 0], "steel");
        for (let b = 0; b < 4; b++)
          this.rounded(
            supplies,
            [0.55, 0.33, 0.6],
            [x - 1 + b * 0.65, y + 0.22, 0],
            bay === 1 ? "sage" : "ivory",
          );
      }
      this.rounded(supplies, [0.9, 1.1, 0.8], [x, 0.55, 1.6], "petrol");
      for (let j = 0; j < 3; j++)
        this.rounded(
          supplies,
          [0.75, 0.025, 0.02],
          [x, 0.25 + j * 0.28, 2.02],
          "steel",
        );
    }
    batchAsset(supplies);
    this.label("assembly", "Montaje", [-14, 2.4, -6], "sage");
    this.label("quality", "Prueba LED", [-9, 2.4, -6], "sage");
    this.label("packing", "Embalaje", [-4, 2.4, -6], "sand");
  }
  buildRacks() {
    const g = this.group(null, [10, 0.84, -9]);
    for (let x of [-3, 1]) {
      for (let z of [-2, 1])
        for (const xx of [x, x + 3.4])
          this.rounded(g, [0.1, 3.3, 0.1], [xx, 1.65, z], "petrol");
      for (let y of [0.3, 1.6, 2.9]) {
        this.rounded(g, [3.5, 0.12, 3.2], [x + 1.7, y, -0.5], "steel");
      }
    }
    batchAsset(g);
  }
  makeLoads(parent, positions, angle = 0, id = "inventory") {
    const result = [];
    for (const [name, multiplier] of [
      ["pallet", 1],
      ["carton", 2],
    ]) {
      const meshes = [];
      this.assets[name].traverse((o) => {
        if (o.isMesh) meshes.push(o);
      });
      for (const proto of meshes) {
        const instance = new T.InstancedMesh(
          proto.geometry,
          proto.material,
          positions.length * multiplier,
        );
        instance.castShadow = true;
        instance.receiveShadow = true;
        instance.userData.entityId = id;
        let n = 0;
        for (const p of positions) {
          const base = new T.Matrix4().compose(
            v3(...p),
            new T.Quaternion().setFromAxisAngle(v3(0, 1, 0), angle),
            v3(1, 1, 1),
          );
          for (let j = 0; j < multiplier; j++) {
            const offset =
              name === "carton"
                ? new T.Matrix4().makeTranslation((j - 0.5) * 0.55, 0.2, 0)
                : new T.Matrix4();
            instance.setMatrixAt(n++, base.clone().multiply(offset));
          }
        }
        instance.instanceMatrix.needsUpdate = true;
        parent.add(instance);
        result.push({ mesh: instance, multiplier });
      }
    }
    return result;
  }
  createStock() {
    const group = this.group("inventory", [0, 0, 0]);
    const positions = Array.from({ length: 24 }, (_, i) => {
      const col = i % 4,
        row = Math.floor(i / 4) % 2,
        level = Math.floor(i / 8);
      return [
        [7.8, 9.4, 11.8, 13.4][col],
        [1.2, 2.5, 3.8][level],
        [-10.3, -8.7][row],
      ];
    });
    this.stockParts = this.makeLoads(group, positions);
  }
  createTrucks() {
    for (const id of ["LW-01", "LW-02"]) {
      const g = this.addAsset(
        "truck",
        id,
        [id === "LW-01" ? 6 : 14, 0.07, 1.5],
        Math.PI,
      );
      const wheels = [],
        steering = [];
      g.traverse((o) => {
        if (/^wheel_/.test(o.name)) wheels.push(o);
        if (/^steer_/.test(o.name)) steering.push(o);
      });
      const cargo = new T.Group();
      cargo.name = "business-cargo";
      g.add(cargo);
      const cargoParts = this.makeLoads(
        cargo,
        Array.from({ length: 5 }, (_, i) => [
          ((i % 2) - 0.5) * 0.85,
          1.02,
          -0.2 + Math.floor(i / 2) * 1.2,
        ]),
        Math.PI / 2,
        id,
      );
      const parts = {
        g,
        wheels,
        steering,
        cargo,
        cargoParts,
        last: null,
        distance: 0,
        doorL: g.getObjectByName("door_left"),
        doorR: g.getObjectByName("door_right"),
        platform: g.getObjectByName("lift_platform"),
      };
      if (parts.doorL) parts.doorL.userData.base = parts.doorL.rotation.clone();
      if (parts.doorR) parts.doorR.userData.base = parts.doorR.rotation.clone();
      this.trucks.set(id, parts);
    }
    this.routes = {};
    for (const [id, x] of [
      ["LW-01", 6],
      ["LW-02", 14],
    ]) {
      this.routes[id] = {
        outbound: new T.CatmullRomCurve3(
          [
            v3(x, 0.045, 1.5),
            v3(x, 0.045, 7),
            v3(x + 3, 0.045, 11),
            v3(18, 0.045, 13),
            v3(24, 0.045, 14),
            v3(25, 0.045, 12),
            v3(25, 0.045, 9),
          ],
          false,
          "catmullrom",
          0.35,
        ),
        return: new T.CatmullRomCurve3(
          [
            v3(25, 0.045, 9),
            v3(25, 0.045, 5),
            v3(22, 0.045, 3),
            v3(18, 0.045, 4),
            v3(x + 3, 0.045, 5),
            v3(x, 0.045, 7),
            v3(x, 0.045, 9),
          ],
          false,
          "catmullrom",
          0.3,
        ),
      };
      for (const c of Object.values(this.routes[id])) {
        c.arcLengthDivisions = 300;
        c.updateArcLengths();
        const times = [0];
        for (let i = 1; i <= 128; i++) {
          const u = (i - 0.5) / 128,
            a = c.getTangentAt(Math.max(0, u - 0.015)),
            b = c.getTangentAt(Math.min(1, u + 0.015));
          const curvature = Math.acos(T.MathUtils.clamp(a.dot(b), -1, 1));
          times.push(
            times.at(-1) + 1 + curvature * 8 + 0.6 * Math.abs(2 * u - 1) ** 3,
          );
        }
        c.userData = { timeProfile: times.map((t) => t / times.at(-1)) };
      }
    }
  }
  update(state, visualTime = state.now) {
    this.state = state;
    this.visualTime = visualTime;
    this.updateVehicles();
    this.renderer.shadowMap.needsUpdate = true;
    for (const p of this.stockParts)
      p.mesh.count =
        Math.min(24, Math.ceil(state.inventory.finished / 10)) * p.multiplier;
    for (const piece of this.workPieces) piece.visible = true;
    this.invalidate();
  }
  updateVehicles() {
    const s = this.state;
    if (!s) return;
    for (const v of s.vehicles) {
      const part = this.trucks.get(v.id),
        vs = vehicleState({ ...s, now: this.visualTime }, v),
        x = v.id === "LW-01" ? 6 : 14;
      let pos,
        tangent,
        curveU = vs.progress;
      const curve =
        vs.phase === "outbound"
          ? this.routes[v.id].outbound
          : vs.phase === "return"
            ? this.routes[v.id].return
            : null;
      if (curve) {
        const profile = curve.userData.timeProfile;
        let lo = 0,
          hi = 128;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (profile[mid] <= vs.progress) lo = mid;
          else hi = mid;
        }
        const f =
            (vs.progress - profile[lo]) / (profile[hi] - profile[lo] || 1),
          u = (lo + f) / 128;
        curveU = u;
        pos = curve.getPointAt(u);
        tangent = curve.getTangentAt(u);
      } else if (vs.phase === "destination") {
        pos = v3(25, 0.045, 9);
        tangent = v3(0, 0, -1);
      } else if (vs.phase === "reserve_move") {
        pos = v3(x, 0.045, 9 - 7.5 * ease(vs.progress));
        tangent = v3(0, 0, 1);
      } else if (vs.phase === "dock") {
        pos = v3(x, 0.045, 1.5);
        tangent = v3(0, 0, 1);
      } else {
        pos = v3(x, 0.045, 9);
        tangent = v3(0, 0, 1);
      }
      if (part.last) {
        const distance = pos.distanceTo(part.last);
        if (distance < 3) {
          part.distance += v.status === "reserved" ? -distance : distance;
          for (const wheel of part.wheels)
            wheel.rotation.x = -part.distance / 0.47;
        }
      }
      part.g.position.copy(pos);
      this.q.setFromUnitVectors(this.forward, tangent.normalize());
      part.g.quaternion.slerp(
        this.q,
        this.reducedMotion || !this.playing
          ? 1
          : 1 - Math.exp(-10 * (this.frameDelta || 1 / 60)),
      );
      const look = curve
        ? curve.getTangentAt(Math.min(1, curveU + 0.02))
        : tangent;
      const turn = Math.atan2(
        tangent.x * look.z - tangent.z * look.x,
        tangent.dot(look),
      );
      part.steering.forEach(
        (o) => (o.rotation.y = T.MathUtils.clamp(turn * 8, -0.4, 0.4)),
      );
      if (part.last) part.last.copy(pos);
      else part.last = pos.clone();
      part.cargoParts.forEach(
        (p) => (p.mesh.count = Math.round(v.cargo / 10) * p.multiplier),
      );
      const open = ["loading", "unloading"].includes(v.status);
      if (part.doorL) {
        part.doorL.rotation.copy(part.doorL.userData.base);
        part.doorL.rotateY(open ? -1.65 : 0);
        part.doorR.rotation.copy(part.doorR.userData.base);
        part.doorR.rotateY(open ? 1.65 : 0);
      }
      if (part.platform) part.platform.rotation.x = open ? 0 : -Math.PI / 2;
      const allowed =
        (!this.filters.query ||
          `${v.id} ${v.driver}`
            .toLowerCase()
            .includes(this.filters.query.toLowerCase())) &&
        (!this.filters.incident || vs.status === "pending_arrival") &&
        (!this.filters.driver || v.driver === this.filters.driver) &&
        (!this.filters.status || vs.status === this.filters.status);
      part.g.visible = allowed;
      if (this.selected === v.id && this.selectedRing) {
        this.selectedRing.visible = allowed;
        this.selectedRing.position.set(pos.x, 0.115, pos.z);
      }
      if (this.follow && this.selected === v.id) {
        const shift = pos.clone().sub(this.controls.target);
        this.controls.target.copy(pos);
        this.camera.position.add(shift);
      }
    }
    const loading = s.vehicles.find((v) => v.status === "loading"),
      anim = loading
        ? loadingAnimation({ ...s, now: this.visualTime }, loading)
        : null;
    if (anim) {
      const x = loading.id === "LW-01" ? 6 : 14,
        p = anim.phase,
        travel =
          p < 0.45
            ? ease(p / 0.45)
            : p > 0.72
              ? 1 - ease((p - 0.72) / 0.28)
              : 1;
      this.forklift.position.set(x, 0.79, -6.5 + travel * 2.8);
      this.forklift.rotation.y = Math.PI;
      const forks = this.forklift.getObjectByName("fork_carriage");
      if (forks) forks.position.y = 0.08 + (p > 0.2 && p < 0.78 ? 0.14 : 0);
      this.forkPallet.visible = p < 0.72;
    } else {
      this.forklift.position.set(3, 0.07, -0.3);
      this.forkPallet.visible = false;
    }
    for (let i = 0; i < 3; i++) {
      const shutter = this.warehouse.getObjectByName("shutter_" + i);
      if (shutter) {
        const open =
          i === 2
            ? s.vehicles[0].status === "loading"
            : i === 0
              ? s.vehicles[1].status === "loading"
              : false;
        shutter.scale.y = open ? 0.12 : 1;
      }
    }
  }
  setSelection(id) {
    this.selected = id;
    this.selectedRing.visible = false;
    this.invalidate();
  }
  setFilters(filters) {
    this.filters = filters;
    this.updateVehicles();
    this.invalidate();
  }
  setRoof(off) {
    this.roofOff = off;
    this.roofs.forEach((r) => (r.visible = !off));
    this.renderer.shadowMap.needsUpdate = true;
    this.invalidate();
  }
  presetView(name, immediate = false) {
    this.tooltip.hidden = true;
    this.follow = false;
    this.view = name;
    const presets = {
      campus: { target: [1, 0, 1], pos: [46, 40, 53], zoom: 1 },
      production: { target: [-9, 1, -6], pos: [9, 21, 15], zoom: 2.15 },
      dock: { target: [8, 1, -1], pos: [-3, 13, -4], zoom: 2.4 },
      felipe: { target: [6, 1, 4], pos: [18, 10, 19], zoom: 3 },
    };
    let p = presets[name] || presets.campus;
    if (name === "felipe" && this.state) {
      const part = this.trucks.get("LW-01");
      p = {
        target: part.g.position.toArray(),
        pos: part.g.position
          .clone()
          .add(v3(12, 8, 16))
          .toArray(),
        zoom: 3,
      };
      this.selected = "LW-01";
      this.follow = true;
    }
    this.setRoof(name === "production" || name === "dock");
    this.transition = {
      start: performance.now(),
      from: this.camera.position.clone(),
      targetFrom: this.controls.target.clone(),
      zoomFrom: this.camera.zoom,
      to: v3(...p.pos),
      targetTo: v3(...p.target),
      zoomTo: p.zoom,
      duration: this.reducedMotion || immediate ? 0 : 1000,
    };
    this.invalidate();
  }
  setProjection(mode) {
    if (mode === this.cameraMode) return;
    const target = this.controls.target.clone(),
      pos = this.camera.position.clone();
    this.controls.dispose();
    if (mode === "perspective") {
      const dist = pos.distanceTo(target),
        height = (this.camera.top - this.camera.bottom) / this.camera.zoom;
      this.camera = new T.PerspectiveCamera(
        T.MathUtils.radToDeg(2 * Math.atan(height / 2 / dist)),
        this.aspect,
        0.2,
        250,
      );
      this.camera.position.copy(pos);
    } else {
      const h =
        2 *
        pos.distanceTo(target) *
        Math.tan(T.MathUtils.degToRad(this.camera.fov / 2));
      this.camera = new T.OrthographicCamera(
        (-this.aspect * h) / 2,
        (this.aspect * h) / 2,
        h / 2,
        -h / 2,
        0.2,
        250,
      );
      this.camera.position.copy(pos);
    }
    this.cameraMode = mode;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(target);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = 1.35;
    this.controls.minPolarAngle = 0.2;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 130;
    this.controls.minZoom = 0.6;
    this.controls.maxZoom = 7;
    this.controls.addEventListener("start", () => {
      this.follow = false;
      this.transition = null;
      this.onManual();
    });
    this.controls.addEventListener("change", () => this.invalidate());
    if (this.renderPass) this.renderPass.camera = this.camera;
    if (this.ao) this.ao.camera = this.camera;
    this.invalidate();
  }
  configure(name) {
    this.preset = name;
    const p = PRESETS[name];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, p.dpr));
    this.light.shadow.mapSize.set(p.shadow, p.shadow);
    this.light.shadow.map?.dispose();
    this.light.shadow.map = null;
    this.light.shadow.needsUpdate = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.composer?.passes.forEach((pass) => pass.dispose?.());
    this.composer?.dispose();
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(this.renderPass);
    if (p.ao) {
      this.ao = new GTAOPass(
        this.scene,
        this.camera,
        Math.floor(this.width / 2),
        Math.floor(this.height / 2),
      );
      this.ao.blendIntensity = 0.25;
      this.ao.updateGtaoMaterial({
        radius: 0.8,
        thickness: 0.6,
        distanceExponent: 1.4,
      });
      this.composer.addPass(this.ao);
    } else this.ao = null;
    this.composer.addPass(new OutputPass());
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);
    this.resize();
    this.invalidate();
  }
  resize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    if (!this.width || !this.height) return;
    this.aspect = this.width / this.height;
    if (this.camera.isOrthographicCamera) {
      const h = this.aspect < 1 ? 53 / this.aspect : 38;
      this.camera.left = (-h * this.aspect) / 2;
      this.camera.right = (h * this.aspect) / 2;
      this.camera.top = h / 2;
      this.camera.bottom = -h / 2;
    } else this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
    this.composer?.setSize(this.width, this.height);
    const dpr = this.renderer.getPixelRatio();
    this.fxaa?.material.uniforms.resolution.value.set(
      1 / (this.width * dpr),
      1 / (this.height * dpr),
    );
    this.invalidate();
  }
  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new T.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    for (const hit of this.ray.intersectObjects(this.scene.children, true)) {
      let o = hit.object;
      if (!this.visibleAncestors(o)) continue;
      while (o && !o.userData.entityId) o = o.parent;
      if (o) return o.userData.entityId;
    }
    return null;
  }
  visibleAncestors(o) {
    while (o) {
      if (!o.visible) return false;
      o = o.parent;
    }
    return true;
  }
  hover(e) {
    if (!this.ready) return;
    const id = this.pick(e);
    this.renderer.domElement.style.cursor = id ? "pointer" : "grab";
    this.tooltip.hidden = !id;
    if (id) {
      this.tooltip.textContent =
        {
          "LW-01": "Felipe · LW-01",
          "LW-02": "Clara · LW-02",
          production: "Taller de montaje",
          warehouse: "Almacén y muelles",
          inventory: "Stock · cada palé representa 10 lámparas",
          assembly: "Montaje de lámparas",
          quality: "Comprobación LED",
          packing: "Embalaje",
          office: "Oficina integrada",
          forklift: "Carretilla · transferencia de palés",
          "customer-01": "Cliente regional · vista esquemática",
        }[id] || id;
      const r = this.container.getBoundingClientRect();
      this.tooltip.style.left =
        Math.min(e.clientX - r.left + 14, r.width - 240) + "px";
      this.tooltip.style.top = e.clientY - r.top - 34 + "px";
    }
  }
  frame(t) {
    const dt = this.last ? (t - this.last) / 1000 : 0;
    this.last = t;
    if (document.hidden) return;
    this.frameDelta = dt;
    this.onFrame?.(dt);
    if (this.transition) {
      const a = this.transition,
        p = a.duration ? Math.min(1, (t - a.start) / a.duration) : 1,
        f = ease(p);
      this.camera.position.lerpVectors(a.from, a.to, f);
      this.controls.target.lerpVectors(a.targetFrom, a.targetTo, f);
      if (this.camera.isOrthographicCamera)
        this.camera.zoom = T.MathUtils.lerp(a.zoomFrom, a.zoomTo, f);
      this.camera.updateProjectionMatrix();
      if (p === 1) this.transition = null;
      this.dirty = true;
    }
    this.controls.update();
    if (this.playing) {
      this.updateVehicles();
      if (!this.reducedMotion && this.state) {
        for (let i = 0; i < this.workPieces.length; i++)
          if (
            this.visualTime < this.state.production.activityUntil[i] &&
            (!this.state.production.blocked || i !== 1)
          )
            this.workPieces[i].position.x =
              ((this.visualTime / 240000 + i * 0.3) % 1) * 2.2 - 1.1;
      }
      this.dirty = true;
    }
    if (this.dirty || this.playing || this.transition) {
      this.render();
      this.dirty = false;
    }
  }
  render() {
    if (!this.ready && !this.assets) return;
    const start = performance.now();
    this.renderer.info.reset();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.info = {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      renderSubmitMs: performance.now() - start,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
    for (const l of this.labels || []) {
      const inner = ["assembly", "quality", "packing"].includes(l.id);
      l.el.hidden = inner
        ? !this.roofOff
        : l.id === "production" && this.roofOff;
      this.projected.copy(l.pos).project(this.camera);
      l.el.style.left = (this.projected.x * 0.5 + 0.5) * this.width + "px";
      l.el.style.top = (-this.projected.y * 0.5 + 0.5) * this.height + "px";
      let occluded = false;
      if (!l.el.hidden) {
        this.labelVector.set(this.projected.x, this.projected.y);
        this.labelRay.setFromCamera(this.labelVector, this.camera);
        const distance = this.labelRay.ray.origin.distanceTo(l.pos);
        const obstruction = this.labelRay
          .intersectObjects(this.scene.children, true)
          .find(
            (hit) =>
              this.visibleAncestors(hit.object) &&
              hit.distance < distance - 0.2,
          );
        occluded = !!obstruction;
      }
      l.el.style.visibility =
        this.projected.z > 1 || occluded ? "hidden" : "visible";
    }
    this.onRendered?.(this.info);
  }
  dispose() {
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.controls.dispose();
    this.composer?.passes.forEach((pass) => pass.dispose?.());
    this.composer?.dispose();
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          for (const key of ["map", "bumpMap", "normalMap"]) m[key]?.dispose();
          m.dispose();
        }
      }
    });
    this.assets?.environment.dispose();
    this.renderer.dispose();
    this.container.innerHTML = "";
  }
}
