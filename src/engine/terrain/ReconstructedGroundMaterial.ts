import { Vector3, type MeshStandardMaterial } from "three";

/** Generated rock/soil albedo variation, explicitly illustrative; no observed detail. */
export function configureReconstructedGround(material: MeshStandardMaterial, originKm: Vector3): void {
  material.onBeforeCompile = shader => {
    shader.uniforms.terrainOriginKm = { value: originKm };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform vec3 terrainOriginKm; varying vec3 terrainPointKm;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nterrainPointKm = (modelMatrix * vec4(transformed, 1.0)).xyz * 0.001 + terrainOriginKm;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 terrainPointKm;
      float groundNoise(vec3 p) {
        vec3 cell = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
        vec4 h = sin(vec4(dot(cell,vec3(17.0,59.0,113.0))) + vec4(0.0,17.0,59.0,76.0))*43758.5453;
        vec4 j = sin(vec4(dot(cell,vec3(17.0,59.0,113.0))) + vec4(113.0,130.0,172.0,189.0))*43758.5453;
        return mix(mix(mix(fract(h.x),fract(h.y),f.x),mix(fract(h.z),fract(h.w),f.x),f.y), mix(mix(fract(j.x),fract(j.y),f.x),mix(fract(j.z),fract(j.w),f.x),f.y),f.z);
      }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float coarse = groundNoise(terrainPointKm * 10.0);
        float fine = groundNoise(terrainPointKm * 200.0);
        diffuseColor.rgb *= 0.72 + 0.3 * coarse + 0.14 * fine;`);
  };
  material.customProgramCacheKey = () => "reconstructed-ground-v1";
}
