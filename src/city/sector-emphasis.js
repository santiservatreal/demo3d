import { Color, Vector3 } from "three";

/** A subtle single-pass atmospheric focus, shared by every city material. */
export function createSectorEmphasis(background = "#e3eef2") {
  const weights = { value: new Vector3(1, 1, 1) };
  const backdrop = { value: new Color(background) };
  const target = new Vector3(1, 1, 1);
  const installed = new WeakSet();
  let materialCount = 0;
  function install(scene) {
    scene.traverse((object) => {
      if (!object.isMesh || object.material?.visible === false) return;
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        if (
          !material ||
          installed.has(material) ||
          (!material.isMeshStandardMaterial && !material.isMeshBasicMaterial)
        )
          continue;
        installed.add(material);
        materialCount++;
        const previousCompile = material.onBeforeCompile;
        const previousKey = material.customProgramCacheKey.bind(material);
        material.onBeforeCompile = function (shader, renderer) {
          previousCompile.call(this, shader, renderer);
          shader.uniforms.atlasSectorWeights = weights;
          shader.uniforms.atlasSectorBackdrop = backdrop;
          shader.vertexShader =
            `varying float vAtlasWorldZ;\n${shader.vertexShader}`.replace(
              "#include <project_vertex>",
              `#include <project_vertex>
            vec4 atlasWorldPoint = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
              atlasWorldPoint = instanceMatrix * atlasWorldPoint;
            #endif
            vAtlasWorldZ = (modelMatrix * atlasWorldPoint).z;`,
            );
          shader.fragmentShader =
            `uniform vec3 atlasSectorWeights;\nuniform vec3 atlasSectorBackdrop;\nvarying float vAtlasWorldZ;\n${shader.fragmentShader}`.replace(
              "#include <opaque_fragment>",
              `float atlasSales = smoothstep(-28.0, -26.0, vAtlasWorldZ);
            float atlasIndustry = 1.0 - smoothstep(-47.0, -44.0, vAtlasWorldZ);
            float atlasCommunications = max(0.0, 1.0 - atlasSales - atlasIndustry);
            float atlasAway = 1.0 - dot(vec3(atlasSales, atlasCommunications, atlasIndustry), atlasSectorWeights);
            float atlasLuma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
            outgoingLight = mix(outgoingLight, vec3(atlasLuma), atlasAway * 0.30);
            outgoingLight = mix(outgoingLight, atlasSectorBackdrop, atlasAway * 0.12);
            #include <opaque_fragment>`,
            );
        };
        material.customProgramCacheKey = () =>
          `${previousKey()}|atlas-sector-emphasis-v1`;
        material.needsUpdate = true;
      }
    });
  }
  return {
    install,
    setDistrict(district) {
      target.set(
        district === "sales" || district === "all" ? 1 : 0,
        district === "communications" || district === "all" ? 1 : 0,
        district === "industry" || district === "all" ? 1 : 0,
      );
    },
    update(delta, immediate = false) {
      if (immediate) weights.value.copy(target);
      else weights.value.lerp(target, 1 - Math.exp(-Math.max(0, delta) * 3.2));
    },
    debug: () => ({
      materialCount,
      weights: weights.value.toArray(),
      target: target.toArray(),
      passes: 1,
    }),
  };
}
