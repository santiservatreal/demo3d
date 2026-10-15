import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
const animated =
  /^(steer_|rear_|wheel_|door_|lift_platform|fork_carriage|removable_roof|shutter_)/;
// Merge static surfaces by material, preserving semantic animation pivots and their local coordinates.
export function batchAsset(root) {
  root.updateMatrixWorld(true);
  const boundaries = [];
  root.traverse((o) => {
    if (o !== root && animated.test(o.name)) boundaries.push(o);
  });
  for (const group of [...boundaries.reverse(), root]) {
    group.updateWorldMatrix(true, true);
    const inverse = group.matrixWorld.clone().invert(),
      meshes = [];
    group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      let parent = o.parent;
      while (parent && parent !== group) {
        if (animated.test(parent.name)) return;
        parent = parent.parent;
      }
      if (o !== group) meshes.push(o);
    });
    const buckets = new Map();
    for (const m of meshes) {
      if (Array.isArray(m.material)) continue;
      const geo = m.geometry
        .clone()
        .applyMatrix4(inverse.clone().multiply(m.matrixWorld))
        .toNonIndexed();
      for (const name of Object.keys(geo.attributes))
        if (!["position", "normal"].includes(name)) geo.deleteAttribute(name);
      geo.clearGroups();
      let list = buckets.get(m.material);
      if (!list) buckets.set(m.material, (list = []));
      list.push(geo);
      m.removeFromParent();
    }
    for (const [material, geos] of buckets) {
      const geometry = mergeGeometries(geos);
      geos.forEach((g) => g.dispose());
      const mesh = new T.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = "batch-" + material.name;
      group.add(mesh);
    }
  }
  return root;
}
export async function loadAssets(renderer, onProgress = () => {}) {
  const loader = new GLTFLoader(),
    names = [
      "truck",
      "factory",
      "warehouse",
      "forklift",
      "pallet",
      "carton",
      "lamp",
    ],
    assets = {};
  let done = 0;
  await Promise.all(
    names.map(async (name) => {
      const gltf = await loader.loadAsync(`/assets/luma/${name}.glb`);
      if (name === "truck") {
        const replaced = new Map();
        gltf.scene.traverse((o) => {
          if (o.isMesh && o.material.name === "ivory") {
            if (!replaced.has(o.material))
              replaced.set(
                o.material,
                new T.MeshPhysicalMaterial({
                  name: "truck-paint",
                  color: o.material.color,
                  roughness: 0.34,
                  clearcoat: 0.28,
                  clearcoatRoughness: 0.3,
                }),
              );
            o.material = replaced.get(o.material);
          }
        });
      }
      assets[name] = batchAsset(gltf.scene);
      onProgress(++done / (names.length + 1));
    }),
  );
  const hdr = await new RGBELoader().loadAsync("/assets/luma/studio.hdr");
  const pmrem = new T.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(hdr);
  hdr.dispose();
  pmrem.dispose();
  assets.environment = env;
  onProgress(1);
  return assets;
}
export function createMaterials(renderer) {
  function noiseTexture(seed, scale, contrast) {
    let r = seed;
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d"),
      im = x.createImageData(128, 128);
    for (let i = 0; i < im.data.length; i += 4) {
      r = (r * 1664525 + 1013904223) >>> 0;
      const v = 128 + (r / 4294967296 - 0.5) * contrast;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
      im.data[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(scale, scale);
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  const concrete = new T.MeshStandardMaterial({
    color: "#b9b9ac",
    roughness: 0.92,
    bumpMap: noiseTexture(9, 20, 30),
    bumpScale: 0.035,
  });
  const asphalt = new T.MeshStandardMaterial({
    color: "#727e7c",
    roughness: 0.93,
    bumpMap: noiseTexture(18, 24, 50),
    bumpScale: 0.025,
  });
  return {
    concrete,
    asphalt,
    sage: new T.MeshStandardMaterial({ color: "#7d9c83", roughness: 0.78 }),
    petrol: new T.MeshStandardMaterial({ color: "#315b60", roughness: 0.5 }),
    steel: new T.MeshStandardMaterial({
      color: "#a7b6ae",
      metalness: 0.7,
      roughness: 0.4,
    }),
    ivory: new T.MeshStandardMaterial({ color: "#e4e8df", roughness: 0.75 }),
    yellow: new T.MeshStandardMaterial({ color: "#d2b36f", roughness: 0.85 }),
    white: new T.MeshStandardMaterial({ color: "#eee9d8", roughness: 0.85 }),
    dark: new T.MeshStandardMaterial({ color: "#344b4a", roughness: 0.82 }),
    wood: new T.MeshStandardMaterial({ color: "#a17d50", roughness: 0.9 }),
  };
}
export function cloneAsset(asset) {
  return asset.clone(true);
}
