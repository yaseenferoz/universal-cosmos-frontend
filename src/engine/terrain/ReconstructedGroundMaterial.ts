import { Vector3, type MeshStandardMaterial, type Texture } from "three";
import type { ObjectId } from "../../types/celestial";

/** Generated rock/soil albedo variation, explicitly illustrative; no observed detail. */
export function configureReconstructedGround(
  material: MeshStandardMaterial,
  originKm: Vector3,
  bodyId: ObjectId,
  detailMap: { value: Texture | null },
  detailEnabled: { value: number },
): void {
  const surfaceKind = bodyId === "mars" ? 1 : bodyId === "earth" ? 2 : 0;
  material.onBeforeCompile = shader => {
    shader.uniforms.terrainOriginKm = { value: originKm };
    shader.uniforms.terrainSurfaceKind = { value: surfaceKind };
    shader.uniforms.terrainDetailMap = detailMap;
    shader.uniforms.terrainDetailEnabled = detailEnabled;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform vec3 terrainOriginKm; varying vec3 terrainPointKm;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nterrainPointKm = (modelMatrix * vec4(transformed, 1.0)).xyz * 0.001 + terrainOriginKm;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 terrainPointKm;
      uniform float terrainSurfaceKind;
      uniform sampler2D terrainDetailMap;
      uniform float terrainDetailEnabled;
      float groundNoise(vec3 p) {
        vec3 cell = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
        vec4 h = sin(vec4(dot(cell,vec3(17.0,59.0,113.0))) + vec4(0.0,17.0,59.0,76.0))*43758.5453;
        vec4 j = sin(vec4(dot(cell,vec3(17.0,59.0,113.0))) + vec4(113.0,130.0,172.0,189.0))*43758.5453;
        return mix(mix(mix(fract(h.x),fract(h.y),f.x),mix(fract(h.z),fract(h.w),f.x),f.y), mix(mix(fract(j.x),fract(j.y),f.x),mix(fract(j.z),fract(j.w),f.x),f.y),f.z);
      }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float broad = groundNoise(terrainPointKm * 18.0);
        float localVariation = groundNoise(terrainPointKm * 180.0);
        float grit = fract(sin(dot(terrainPointKm * 2200.0, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float gritVisibility = 1.0 - smoothstep(0.4, 1.6, length(fwidth(terrainPointKm * 2200.0)));
        if (terrainSurfaceKind > 1.5) {
          // Patchy dry vegetation and exposed soil; this is not a land-cover map.
          float soil = smoothstep(0.35, 0.68, broad + 0.18 * (localVariation - 0.5));
          diffuseColor.rgb *= mix(vec3(0.81, 0.88, 0.71), vec3(1.12, 0.98, 0.81), soil);
          diffuseColor.rgb *= 0.88 + 0.22 * localVariation + gritVisibility * 0.1 * (grit - 0.5);
        } else if (terrainSurfaceKind > 0.5) {
          // Dust, exposed dark clasts, and gentle color variation across Mars.
          float darkClast = smoothstep(0.67, 0.88, localVariation + 0.12 * (grit - 0.5));
          diffuseColor.rgb *= mix(vec3(1.10, 0.94, 0.79), vec3(0.68, 0.60, 0.56), darkClast * 0.65);
          diffuseColor.rgb *= 0.84 + 0.26 * broad + gritVisibility * 0.13 * (grit - 0.5);
        } else {
          diffuseColor.rgb *= 0.75 + 0.3 * broad + 0.12 * localVariation;
        }
        if (terrainDetailEnabled > 0.5) {
          vec3 radial = abs(normalize(terrainPointKm));
          vec2 detailUv = radial.x > radial.y && radial.x > radial.z ? terrainPointKm.yz
            : radial.y > radial.z ? terrainPointKm.xz : terrainPointKm.xy;
          // One image tile represents about eight meters. Fade to broad terrain at distance.
          vec3 detailColor = texture2D(terrainDetailMap, detailUv * 125.0).rgb;
          float detailFade = 1.0 - smoothstep(65.0, 220.0, length(vViewPosition));
          diffuseColor.rgb = mix(diffuseColor.rgb, detailColor * (0.83 + 0.3 * broad), detailFade);
        }`);
  };
  material.customProgramCacheKey = () => `reconstructed-ground-v3-${surfaceKind}`;
}
