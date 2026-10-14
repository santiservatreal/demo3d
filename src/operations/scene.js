import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  allEntities,
  vehiclePosition,
  matches,
  departmentNames,
} from "./model.js";
const palette = {
  marketing: "#b0a2d3",
  sales: "#93b4d0",
  finance: "#d3b27f",
  production: "#8eaaa4",
  warehouse: "#9eb1c6",
  transport: "#8fb5a0",
  clients: "#d2ada0",
  delivery: "#97b5ab",
};
export class OperationalScene {
  constructor(container, { onSelect, onHover }) {
    this.container = container;
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.registry = new Map();
    this.targets = [];
    this.labels = [];
    this.materials = new Map();
    this.state = null;
    this.selected = null;
    this.follow = false;
    this.animationTime = 0;
    this.scene = new T.Scene();
    this.scene.background = new T.Color("#edf1ed");
    this.camera = new T.PerspectiveCamera(34, 1, 0.1, 400);
    this.renderer = new T.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    container.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Maqueta operativa 3D. Usa la lista para navegar con teclado.",
    );
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = true;
    this.controls.maxPolarAngle = 1.38;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 230;
    this.controls.target.set(1, 0, 0);
    this.scene.add(new T.HemisphereLight(0xffffff, 0xb2bca6, 2.1));
    const light = new T.DirectionalLight(0xfff8ed, 2.8);
    light.position.set(-24, 50, 25);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, {
      left: -48,
      right: 48,
      top: 40,
      bottom: -40,
      near: 1,
      far: 130,
    });
    light.shadow.normalBias = 0.04;
    this.scene.add(light);
    const floor = new T.Mesh(
      new T.PlaneGeometry(500, 500),
      this.material("#edf1ed"),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.7;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.labelHost = document.createElement("div");
    this.labelHost.className = "op-labels";
    container.append(this.labelHost);
    this.tooltip = document.createElement("div");
    this.tooltip.className = "op-tooltip";
    container.append(this.tooltip);
    this.ray = new T.Raycaster();
    let down;
    container.addEventListener(
      "pointerdown",
      (e) => (down = { x: e.clientX, y: e.clientY }),
    );
    container.addEventListener("pointermove", (e) => this.hover(e));
    container.addEventListener("pointerup", (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
        const id = this.pick(e);
        if (id) this.onSelect(id);
      }
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.reset();
    this.lastTime = 0;
    this.renderer.setAnimationLoop((t) => this.animate(t));
  }
  material(color) {
    if (!this.materials.has(color))
      this.materials.set(
        color,
        new T.MeshStandardMaterial({ color, roughness: 0.8 }),
      );
    return this.materials.get(color);
  }
  box(g, w, h, d, x, y, z, c) {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), this.material(c));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  }
  cylinder(g, r, h, x, y, z, c) {
    const m = new T.Mesh(new T.CylinderGeometry(r, r, h, 12), this.material(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  }
  entity(id, g) {
    g.userData.entityId = id;
    this.registry.set(id, g);
    return g;
  }
  group(id, x = 0, z = 0) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    this.world.add(g);
    if (id) this.entity(id, g);
    return g;
  }
  text(text, w = 6, color = "#5e756b", bg = "#fafcf7") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = color;
    ctx.font = "600 40px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 66);
    const tex = new T.CanvasTexture(canvas);
    tex.colorSpace = T.SRGBColorSpace;
    const mesh = new T.Mesh(
      new T.PlaneGeometry(w, w / 4),
      new T.MeshBasicMaterial({ map: tex }),
    );
    return mesh;
  }
  sign(g, text, x, y, z, w = 6) {
    const m = this.text(text, w);
    m.position.set(x, y, z);
    g.add(m);
  }
  tree(g, x, z, scale = 1) {
    this.cylinder(g, 0.09, 0.8 * scale, x, 0.4 * scale, z, "#a59377");
    const m = new T.Mesh(
      new T.IcosahedronGeometry(0.58 * scale, 1),
      this.material("#94ae8d"),
    );
    m.position.set(x, 1.15 * scale, z);
    m.castShadow = true;
    g.add(m);
  }
  pallet(g, x, z, boxes = 3, id) {
    const p = new T.Group();
    p.position.set(x, 0.12, z);
    g.add(p);
    this.box(p, 1.1, 0.14, 0.9, 0, 0.07, 0, "#b69d78");
    for (let i = 0; i < boxes; i++)
      this.box(
        p,
        0.45,
        0.45,
        0.65,
        ((i % 2) - 0.5) * 0.49,
        0.38 + Math.floor(i / 2) * 0.47,
        0,
        "#cebb97",
      );
    for (let i = 0; i < 2; i++)
      this.box(p, 0.035, 0.47, 0.67, (i - 0.5) * 0.6, 0.39, 0, "#efe6d0");
    if (id) this.entity(id, p);
    return p;
  }
  road(g, points, width = 3) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const m = this.box(
        g,
        width,
        0.045,
        len,
        (a[0] + b[0]) / 2,
        0.12,
        (a[1] + b[1]) / 2,
        "#c0cbc9",
      );
      m.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
      for (let j = 0.6; j < len - 0.5; j += 2) {
        const f = j / len;
        const dash = this.box(
          g,
          0.07,
          0.014,
          0.75,
          a[0] + (b[0] - a[0]) * f,
          0.154,
          a[1] + (b[1] - a[1]) * f,
          "#f4f2df",
        );
        dash.rotation.y = m.rotation.y;
      }
    }
  }
  build(state) {
    this.state = state;
    if (this.world) {
      this.scene.remove(this.world);
      this.world.traverse((o) => {
        o.geometry?.dispose();
        if (o.material?.map) {
          o.material.map.dispose();
          o.material.dispose();
        }
      });
      this.labelHost.innerHTML = "";
      this.registry.clear();
      this.labels = [];
    }
    this.world = new T.Group();
    this.scene.add(this.world);
    this.box(this.world, 69, 0.65, 41, 1, -0.34, 0, "#d3ddd2");
    this.box(this.world, 68.6, 0.08, 40.6, 1, 0.03, 0, "#e2e8dc");
    this.road(this.world, [
      [-31, 2],
      [32, 2],
    ]);
    this.road(this.world, [
      [19, -18],
      [19, 18],
    ]);
    this.road(this.world, [
      [11, -3],
      [11, 15],
    ]);
    this.road(
      this.world,
      [
        [-16, -18],
        [-16, 18],
      ],
      2.5,
    );
    this.road(
      this.world,
      [
        [19, -10],
        [31, -10],
      ],
      2.6,
    );
    this.road(
      this.world,
      [
        [19, 13],
        [31, 13],
      ],
      2.6,
    );
    for (let i = 0; i < 24; i++) {
      const x = -31 + i * 2.8;
      this.tree(this.world, x, -18.8, 0.7);
      if (i % 2 === 0) this.tree(this.world, x, 18.8, 0.8);
    }
    for (let z = -16; z < 18; z += 4) this.tree(this.world, -32, z, 0.9);
    // Site fencing, paths and marked parking, all static scenery.
    for (let x = -14; x < 17; x += 1.6) {
      this.box(this.world, 0.055, 0.8, 0.055, x, 0.5, -17, "#a9b6ad");
      this.box(this.world, 1.6, 0.04, 0.035, x + 0.8, 0.6, -17, "#a9b6ad");
    }
    for (const f of state.facilities) {
      const g = this.group(f.id, ...f.position);
      const color = palette[f.department] || "#b5c1b0";
      if (f.id === "production") {
        this.factory(g, color);
      } else if (f.id === "warehouse") {
        this.warehouse(g, color);
      } else if (f.id === "transport") {
        this.depot(g, color);
      } else if (f.department === "clients") {
        this.client(g, color, f.id);
      } else this.office(g, color, f.id === "studio");
      const label = document.createElement("button");
      label.className = "op-place-label";
      label.dataset.entity = f.id;
      label.innerHTML = `<span style="background:${color}"></span>${f.name}`;
      label.addEventListener("click", () => this.onSelect(f.id));
      this.labelHost.append(label);
      this.labels.push({
        el: label,
        id: f.id,
        pos: new T.Vector3(
          f.position[0],
          0.3,
          f.position[1] +
            (f.id === "warehouse" || f.id === "production" ? 5.8 : 3.5),
        ),
      });
    }
    if (state.template === "industrial") {
      for (const l of state.lines) {
        const g = this.group(l.id, l.id === "line-01" ? -9 : -4, -4.5);
        this.productionLine(g, l);
      }
      for (const i of state.inventory) {
        const g = this.group(i.id, i.id === "product-01" ? 5.5 : 9, -6.8);
        for (let n = 0; n < 4; n++)
          this.pallet(g, (n % 2) * 1.4, Math.floor(n / 2) * 1.3, 4);
      }
      state.orders.forEach((o, i) => {
        const g = this.group(o.id, 4 + i * 2.4, -2.9);
        this.pallet(g, 0, 0, o.status === "delivered" ? 1 : 3);
        const label = this.text(o.name.replace("Pedido ", "P"), 1.3);
        label.position.set(0, 1.2, 0.48);
        g.add(label);
      });
      for (const v of state.vehicles) {
        const g = this.group(v.id);
        this.truck(g, v);
      }
      const forklift = this.group(null, 12, -5);
      this.box(forklift, 0.7, 0.5, 1.1, 0, 0.5, 0, "#d9b966");
      this.box(forklift, 0.55, 0.06, 0.75, 0, 1.4, 0, "#e3c56e");
      this.box(forklift, 0.08, 1.3, 0.08, -0.27, 0.8, 0, "#6c7f76");
      this.box(forklift, 0.08, 1.3, 0.08, 0.27, 0.8, 0, "#6c7f76");
      this.box(forklift, 0.07, 1.2, 0.08, -0.25, 0.7, 0.7, "#75867d");
      this.box(forklift, 0.07, 1.2, 0.08, 0.25, 0.7, 0.7, "#75867d");
      this.box(forklift, 0.7, 0.07, 0.7, 0, 0.2, 1, "#75867d");
      forklift.userData.entityId = "truck-03";
      this.forklift = forklift; // Loading resource points to its assigned dispatch.
    } else
      for (const p of state.projects) {
        const g = this.group(
          p.id,
          p.department === "production" ? -6 : 9,
          p.department === "production" ? -3 : 10,
        );
        this.box(g, 1, 0.3, 1.5, 0, 0.8, 0, "#b6c9b5");
        this.box(g, 0.9, 0.6, 0.08, 0, 1.25, -0.4, "#698c87");
      }
    // Non-operational people are deliberately omitted: avatars are not time tracking.
    for (const r of state.records) {
      const f = state.facilities.find((f) => f.department === r.department);
      if (!f) continue;
      const i = state.records
        .filter((a) => a.department === r.department)
        .findIndex((a) => a.id === r.id);
      const g = this.group(
        r.id,
        f.position[0] - 1 + i * 2,
        f.position[1] + 2.4,
      );
      this.box(g, 0.75, 0.75, 0.6, 0, 0.55, 0, palette[r.department]);
      this.box(g, 0.4, 0.06, 0.4, 0, 0.97, 0, "#f8f6e9");
    }
    this.selectionRing = new T.Mesh(
      new T.RingGeometry(1.65, 1.83, 48),
      new T.MeshBasicMaterial({
        color: "#427d68",
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = 0.2;
    this.selectionRing.visible = false;
    this.world.add(this.selectionRing);
    this.routeLine = null;
    this.routeKey = null;
    this.targets = Array.from(this.registry.values());
    this.update(state, {}, null);
  }
  office(g, color, big = false) {
    this.box(g, 6, 0.18, 6, 0, 0.15, 0, "#d0d9c9");
    this.box(g, 5.2, big ? 3.8 : 4, 4.7, 0, 2.25, 0, "#f6f5eb");
    this.box(g, 5.35, 0.15, 4.85, 0, 4.35, 0, color);
    for (let floor = 0; floor < 2; floor++)
      for (let j = -1; j <= 1; j++) {
        this.box(
          g,
          0.85,
          0.9,
          0.04,
          j * 1.4,
          1.45 + floor * 1.55,
          2.37,
          "#9eb8b5",
        );
        this.box(
          g,
          0.04,
          0.9,
          0.85,
          2.62,
          1.45 + floor * 1.55,
          j * 1.35,
          "#a9bfbb",
        );
      }
    this.box(g, 1, 0.13, 1.1, 0, 1.9, 2.8, color);
    this.box(g, 0.9, 1.5, 0.04, 0, 1, 2.4, "#7f9d92");
    this.sign(
      g,
      big
        ? "STUDIO"
        : g.userData.entityId === "finance"
          ? "FINANCE"
          : g.userData.entityId === "marketing"
            ? "MARKETING"
            : "SALES",
      0,
      3.9,
      2.41,
      3.2,
    );
    this.box(g, 1, 0.35, 1, -1, 4.6, -0.8, "#c3cdbf");
    this.tree(g, -3.1, 2.5, 0.8);
    this.tree(g, 3.1, 2.5, 0.8);
  }
  factory(g, color) {
    this.box(g, 13, 0.22, 11, 0, 0.23, 0, "#cad6c8");
    this.box(g, 12, 3.2, 7.6, 0, 1.95, -0.8, "#f4f2e8");
    this.box(g, 12, 0.2, 8, 0, 3.65, -0.8, color);
    this.box(g, 12, 0.55, 0.07, 0, 2.95, 3.05, "#799f90");
    for (let i = 0; i < 3; i++) {
      const roof = this.box(g, 3.9, 0.18, 7.5, -4 + i * 4, 4, -0.8, "#a8bcb3");
      roof.rotation.z = 0.12;
      for (let j = 0; j < 3; j++)
        this.box(g, 0.9, 0.03, 2, -4 + i * 4, 4.3, -3 + j * 2.2, "#8ca6b1");
    }
    this.box(g, 12, 0.2, 2.5, 0, 3.15, 4, "#c7d3c7");
    this.box(g, 0.2, 2.8, 0.2, -5.8, 1.6, 4.6, color);
    this.box(g, 0.2, 2.8, 0.2, 5.8, 1.6, 4.6, color);
    for (let i = 0; i < 2; i++) {
      this.box(g, 3.5, 2.2, 0.08, -3 + i * 6, 1.45, 3.08, "#6f8b83");
      this.box(g, 3.4, 0.08, 0.08, -3 + i * 6, 2, 3.16, "#b4c8bb");
    }
    this.sign(g, "NORTE / MANUFACTURING", 0, 3.12, 3.36, 8);
    for (let i = 0; i < 2; i++) {
      this.cylinder(g, 0.46, 5, 5 - i * 1.4, 2.75, -4, "#b6bfb1");
      this.cylinder(g, 0.54, 0.2, 5 - i * 1.4, 5.3, -4, "#8b9c90");
    }
    this.box(g, 2, 1.4, 2, -4, 1, -5.2, "#b3beb1");
  }
  warehouse(g, color) {
    this.box(g, 11, 0.22, 11, 0, 0.23, 0, "#ced9cb");
    this.box(g, 10, 3.5, 8, 0, 2, -0.7, "#f4f3eb");
    this.box(g, 10, 0.5, 0.08, 0, 3.25, 3.34, "#8aa9c2");
    const roof = this.box(g, 10.4, 0.2, 8.4, 0, 3.85, -0.7, color);
    for (let i = 0; i < 3; i++) {
      const x = -3 + i * 3;
      this.box(g, 2.1, 2.5, 0.08, x, 1.6, 3.34, "#83988f");
      for (let j = 0; j < 5; j++)
        this.box(g, 1.9, 0.035, 0.04, x, 0.65 + j * 0.4, 3.4, "#adbab0");
      this.box(g, 2.5, 0.2, 1.4, x, 0.38, 4, "#a7b4a9");
      this.box(g, 0.12, 2.8, 0.12, x - 1.2, 1.6, 3.5, "#e1c279");
      this.box(g, 0.12, 2.8, 0.12, x + 1.2, 1.6, 3.5, "#e1c279");
      this.sign(g, `0${i + 1}`, x, 3.2, 3.4, 0.9);
      this.box(g, 0.08, 0.02, 2.3, x - 1.3, 0.2, 5.2, "#efe7ce");
      this.box(g, 0.08, 0.02, 2.3, x + 1.3, 0.2, 5.2, "#efe7ce");
    }
    this.sign(g, "NORTE / LOGISTICS", 0, 3.7, 3.44, 6);
    for (let i = 0; i < 4; i++)
      this.box(g, 1.4, 0.035, 2.1, -3.1 + i * 2, 4, -0.8, "#7f9cab");
  }
  depot(g, color) {
    this.box(g, 10, 0.15, 8, 0, 0.15, 0, "#d0dacd");
    this.box(g, 8, 0.18, 4, 0, 3.1, 0, color);
    for (let x = -3; x <= 3; x += 6)
      for (let z = -1; z <= 1; z += 2)
        this.box(g, 0.13, 3, 0.13, x, 1.6, z, "#9bac9e");
    for (let i = 0; i < 4; i++) {
      this.box(g, 0.06, 0.02, 4, -4 + i * 2.5, 0.26, 1.1, "#f4f0dc");
      this.box(g, 1.9, 0.02, 0.06, -3 + i * 2.5, 0.26, 3.1, "#f4f0dc");
    }
    this.sign(g, "FLEET / 06", 0, 2.8, 2.06, 3);
  }
  client(g, color, id) {
    this.box(g, 6, 0.15, 6, 0, 0.18, 0, "#d6ddce");
    this.box(g, 5, 2.8, 4.6, 0, 1.75, 0, "#f6f1e7");
    this.box(g, 5.2, 0.2, 4.8, 0, 3.25, 0, color);
    for (let x = -1.5; x <= 1.5; x += 1.5)
      this.box(g, 1.1, 1.45, 0.04, x, 1.4, 2.34, "#a7bdb7");
    this.box(g, 5.4, 0.15, 1.2, 0, 2.8, 2.8, color);
    this.sign(
      g,
      id === "client-a" ? "HABITAT" : id === "client-b" ? "NOMA" : "CASA SUR",
      0,
      3.1,
      2.42,
      3.5,
    );
    this.tree(g, -3.2, -1.5, 0.9);
    this.tree(g, 3.1, 2, 0.85);
  }
  productionLine(g, l) {
    this.box(g, 2.5, 0.6, 1, 0, 0.7, 0, "#9cae9f");
    this.box(g, 2.7, 0.13, 1.1, 0, 1.06, 0, "#4e6d64");
    for (let i = 0; i < 6; i++)
      this.box(g, 0.12, 0.05, 1, -1.1 + i * 0.44, 1.15, 0, "#bdccbf");
    this.box(g, 0.4, 1.2, 0.6, -0.7, 1.5, -0.9, "#b0c0b2");
    this.box(g, 1.2, 0.25, 0.5, -0.2, 2.1, -0.9, "#8fa99c");
    const piece = this.box(g, 0.4, 0.3, 0.5, 0, 1.33, 0, "#d4bb8f");
    g.userData.piece = piece;
    const lamp = new T.Mesh(
      new T.SphereGeometry(0.12, 10, 10),
      this.material("#8cb99a"),
    );
    lamp.position.set(1, 1.5, 0);
    g.add(lamp);
    g.userData.lamp = lamp;
  }
  truck(g, v) {
    this.box(g, 1.3, 0.28, 3.3, 0, 0.55, 0, "#657c72");
    this.box(g, 1.55, 0.16, 2.4, 0, 0.77, -0.55, "#d6e0d1");
    this.box(g, 0.09, 0.37, 2.4, -0.75, 1.03, -0.55, "#9bbcb1");
    this.box(g, 0.09, 0.37, 2.4, 0.75, 1.03, -0.55, "#9bbcb1");
    this.box(g, 1.55, 0.37, 0.09, 0, 1.03, -1.72, "#9bbcb1");
    const cargo = new T.Group();
    g.add(cargo);
    for (let n = 0; n < 6; n++) {
      this.box(
        cargo,
        0.6,
        0.66,
        0.65,
        ((n % 2) - 0.5) * 0.67,
        1.19,
        -1.22 + Math.floor(n / 2) * 0.72,
        "#cfbb97",
      );
      this.box(
        cargo,
        0.04,
        0.68,
        0.66,
        ((n % 2) - 0.5) * 0.67,
        1.19,
        -1.22 + Math.floor(n / 2) * 0.72,
        "#ede5cd",
      );
    }
    g.userData.cargo = cargo;
    this.box(g, 1.5, 1.3, 1.1, 0, 1.2, 1.27, "#e8eee5");
    this.box(g, 1.26, 0.47, 0.035, 0, 1.51, 1.84, "#6d9294");
    this.box(g, 0.03, 0.48, 0.66, 0.76, 1.5, 1.25, "#7c9fa0");
    this.box(g, 0.03, 0.48, 0.66, -0.76, 1.5, 1.25, "#7c9fa0");
    this.box(g, 1.35, 0.2, 0.12, 0, 0.65, 1.89, "#b5c3b7");
    this.box(g, 0.3, 0.14, 0.03, -0.49, 0.85, 1.9, "#f4e7ba");
    this.box(g, 0.3, 0.14, 0.03, 0.49, 0.85, 1.9, "#f4e7ba");
    this.box(g, 1.55, 0.09, 1.2, 0, 1.91, 1.26, "#d5dfd2");
    for (let x of [-0.78, 0.78])
      for (let z of [-1.3, -0.45, 1.3]) {
        const w = new T.Mesh(
          new T.CylinderGeometry(0.3, 0.3, 0.16, 12),
          this.material("#4f625b"),
        );
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.43, z);
        g.add(w);
        const hub = new T.Mesh(
          new T.CylinderGeometry(0.14, 0.14, 0.18, 10),
          this.material("#b7c3b7"),
        );
        hub.rotation.z = Math.PI / 2;
        hub.position.copy(w.position);
        g.add(hub);
      }
    const beacon = new T.Mesh(
      new T.SphereGeometry(0.13, 10, 10),
      this.material("#8eb6a0"),
    );
    beacon.position.set(0, 2.15, 1.3);
    g.add(beacon);
    g.userData.beacon = beacon;
  }
  update(state, filters, selected) {
    this.state = state;
    this.filters = filters;
    if (this.forklift)
      this.forklift.visible = state.vehicles.some(
        (v) =>
          v.id === "truck-03" && v.status === "loading" && matches(v, filters),
      );
    const allowed = new Map(allEntities(state).map((e) => [e.id, e]));
    this.selected = selected;
    for (const [id, g] of this.registry) {
      const e = allowed.get(id);
      g.visible = !!e && matches(e, filters);
      if (e?.type === "vehicle") {
        const p = vehiclePosition(e, state.now);
        g.visible = g.visible && p.known;
        if (p.position) {
          g.position.set(p.position.x, 0.15, p.position.z);
          g.rotation.y = p.position.angle;
        }
        if (g.userData.cargo) g.userData.cargo.visible = e.cargo > 0;
        if (g.userData.beacon)
          g.userData.beacon.material = this.material(
            e.incident
              ? "#d99379"
              : p.stale
                ? "#d6b46b"
                : p.pending
                  ? "#d6b46b"
                  : "#8eb6a0",
          );
      }
      if (e?.type === "line" && g.userData.lamp)
        g.userData.lamp.material = this.material(
          e.status === "blocked" ? "#d99379" : "#8eb6a0",
        );
    }
    for (const l of this.labels) {
      const g = this.registry.get(l.id);
      l.el.hidden = !g?.visible;
      l.el.classList.toggle("selected", selected === l.id);
    }
    this.highlight(selected);
  }
  highlight(id) {
    const g = this.registry.get(id);
    this.selectionRing.visible = !!g?.visible;
    if (g) this.selectionRing.position.set(g.position.x, 0.2, g.position.z);
    const v = this.state.vehicles.find((v) => v.id === id);
    const key = v?.route ? JSON.stringify(v.route) : "";
    if (key !== this.routeKey) {
      if (this.routeLine) {
        this.world.remove(this.routeLine);
        this.routeLine.geometry.dispose();
        this.routeLine.material.dispose();
        this.routeLine = null;
      }
      if (v?.route) {
        const points = v.route.map((p) => new T.Vector3(p[0], 0.19, p[1]));
        this.routeLine = new T.Line(
          new T.BufferGeometry().setFromPoints(points),
          new T.LineDashedMaterial({
            color: "#558b79",
            dashSize: 0.6,
            gapSize: 0.3,
          }),
        );
        this.routeLine.computeLineDistances();
        this.world.add(this.routeLine);
      }
      this.routeKey = key;
    }
  }
  focus(id) {
    const g = this.registry.get(id);
    if (!g?.visible) return false;
    this.controls.target.copy(g.position);
    const delta = new T.Vector3(13, 16, 20);
    this.camera.position.copy(g.position).add(delta);
    return true;
  }
  reset() {
    this.follow = false;
    const aspect =
      this.container.clientWidth / Math.max(this.container.clientHeight, 1);
    this.camera.position
      .set(51, 55, 66)
      .multiplyScalar(Math.max(1, 1.55 / aspect));
    this.controls.target.set(1, 0, 0);
  }
  resize() {
    let w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    const old = this.camera.aspect;
    this.camera.aspect = w / h;
    if (old)
      this.camera.position
        .sub(this.controls.target)
        .multiplyScalar(
          Math.max(1, 1.55 / this.camera.aspect) / Math.max(1, 1.55 / old),
        )
        .add(this.controls.target);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
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
    for (const hit of this.ray.intersectObjects(this.world.children, true)) {
      let g = hit.object;
      while (g && !g.userData.entityId) g = g.parent;
      if (g?.visible && g.userData.entityId) {
        const entity = allEntities(this.state).find(
          (e) => e.id === g.userData.entityId,
        );
        if (entity && matches(entity, this.filters)) return entity.id;
      }
    }
    return null;
  }
  hover(e) {
    const id = this.pick(e);
    this.renderer.domElement.style.cursor = id ? "pointer" : "grab";
    const entity = allEntities(this.state).find((e) => e.id === id);
    this.tooltip.hidden = !entity;
    if (entity) {
      this.tooltip.textContent = `${entity.driver || entity.name} · ${departmentNames[entity.department]}`;
      const r = this.container.getBoundingClientRect();
      this.tooltip.style.left =
        Math.min(e.clientX - r.left + 15, r.width - 230) + "px";
      this.tooltip.style.top = e.clientY - r.top - 38 + "px";
    }
  }
  animate(t) {
    const delta = this.lastTime ? Math.min((t - this.lastTime) / 1000, 0.1) : 0;
    this.lastTime = t;
    this.controls.update();
    if (this.state) {
      for (const l of this.state.lines) {
        const g = this.registry.get(l.id);
        if (
          g?.userData.piece &&
          l.status === "active" &&
          !this.paused &&
          !matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          g.userData.piece.position.x = ((t * 0.00035) % 2.1) - 1.05;
        }
      }
      const g = this.registry.get(this.selected);
      if (this.follow && g?.visible) {
        const d = g.position.clone().sub(this.controls.target);
        this.controls.target.copy(g.position);
        this.camera.position.add(d);
      }
      this.highlight(this.selected);
      for (const l of this.labels) {
        const p = l.pos.clone().project(this.camera);
        l.el.style.left = (p.x * 0.5 + 0.5) * this.container.clientWidth + "px";
        l.el.style.top =
          (-p.y * 0.5 + 0.5) * this.container.clientHeight + "px";
        l.el.style.visibility = p.z > 1 ? "hidden" : "visible";
      }
      this.onFrame?.(delta);
    }
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => o.geometry?.dispose());
    this.materials.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.container.innerHTML = "";
  }
}
