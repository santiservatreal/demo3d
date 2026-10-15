// Development-only compatibility probe. Uses the same local assets as the campus.
import * as T from "three/webgpu";
import { pass, vec4, float } from "three/tsl";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
const params = new URLSearchParams(location.search),
  result = {
    requested: params.get("backend") || "webgpu",
    version: T.REVISION,
    webgpuApi: !!navigator.gpu,
  };
window.labResult = result;
try {
  const r = new T.WebGPURenderer({
    antialias: true,
    forceWebGL: params.get("backend") === "webgl",
  });
  await r.init();
  r.setSize(900, 650);
  r.shadowMap.enabled = true;
  r.toneMapping = T.ACESFilmicToneMapping;
  document.body.append(r.domElement);
  const s = new T.Scene();
  s.background = new T.Color("#edf1eb");
  const c = new T.PerspectiveCamera(35, 900 / 650, 0.1, 100);
  c.position.set(12, 10, 17);
  c.lookAt(0, 1, 0);
  s.environment = await new RGBELoader().loadAsync("/assets/luma/studio.hdr");
  s.environment.mapping = T.EquirectangularReflectionMapping;
  s.environmentIntensity = 0.65;
  const sun = new T.DirectionalLight(0xfff3de, 3);
  sun.position.set(10, 20, 10);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {
    left: -15,
    right: 15,
    top: 15,
    bottom: -15,
  });
  s.add(sun, new T.HemisphereLight(0xffffff, 0x738579, 1));
  const l = new GLTFLoader();
  const truck = (await l.loadAsync("/assets/luma/truck.glb")).scene;
  truck.position.set(1, 0, 2);
  truck.rotation.y = Math.PI;
  s.add(truck);
  const dock = (await l.loadAsync("/assets/luma/warehouse.glb")).scene;
  dock.position.set(0, 0, -8);
  dock.rotation.y = Math.PI;
  s.add(dock);
  s.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  const physical = new T.MeshPhysicalNodeMaterial({
    color: 0x4e7b67,
    roughness: 0.28,
    clearcoat: 0.3,
  });
  const test = new T.Mesh(new T.SphereGeometry(0.6, 24, 16), physical);
  test.position.set(-4, 0.6, 1);
  s.add(test);
  const ground = new T.Mesh(
    new T.PlaneGeometry(60, 60),
    new T.MeshStandardNodeMaterial({ color: 0xb9c0b5, roughness: 0.9 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  s.add(ground);
  // r180 exports PostProcessing, not RenderPipeline. Native TSL chain, never EffectComposer.
  const pipeline = new T.PostProcessing(r);
  const renderPass = pass(s, c);
  pipeline.outputNode = renderPass;
  await pipeline.renderAsync();
  if (r.backend.device) await r.backend.device.queue.onSubmittedWorkDone();
  await new Promise(requestAnimationFrame);
  await pipeline.renderAsync();
  if (r.backend.device) await r.backend.device.queue.onSubmittedWorkDone();
  const ray = new T.Raycaster();
  ray.setFromCamera(new T.Vector2(0, 0), c);
  result.picking = ray.intersectObjects(s.children, true).length > 0;
  result.backend = r.backend.constructor.name;
  result.ok = true;
  result.material = "MeshPhysicalNodeMaterial";
  result.postprocessing = "PostProcessing + TSL pass";
  result.calls = r.info.render.calls;
} catch (e) {
  result.ok = false;
  result.error = e.message;
  console.error(e);
}
document.body.dataset.complete = "true";
document.title = JSON.stringify(result);
