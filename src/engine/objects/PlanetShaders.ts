import {
  BackSide,
  Color,
  MeshStandardMaterial,
  ShaderMaterial,
  Vector3,
} from "three";

/** Twilight width is an exposure approximation, not a refracted-atmosphere model. */
export function nightEmissionWeight(sunCosine: number): number {
  const t = Math.max(0, Math.min(1, (sunCosine + 0.14) / 0.22));
  return 1 - t * t * (3 - 2 * t);
}

/** CPU form of the shader's bounded approximation, used to validate lighting limits. */
export function atmosphereOpacity(
  normalDotView: number,
  normalDotSun: number,
  viewDotSun: number,
): number {
  const grazing = (1 - Math.min(1, Math.abs(normalDotView))) ** 3;
  const t = Math.max(0, Math.min(1, (normalDotSun + 0.12) / 0.42));
  const daylight = t * t * (3 - 2 * t);
  const phase = 0.75 * (1 + viewDotSun * viewDotSun);
  return Math.min(0.28, grazing * daylight * phase * 0.22);
}

export function configureNightSide(
  material: MeshStandardMaterial,
  towardSun: Vector3,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.cosmosSunDirection = { value: towardSun };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 cosmosWorldNormal;",
      )
      .replace(
        "#include <beginnormal_vertex>",
        "#include <beginnormal_vertex>\ncosmosWorldNormal = normalize(mat3(modelMatrix) * objectNormal);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 cosmosSunDirection;\nvarying vec3 cosmosWorldNormal;",
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float cosmosNight = 1.0 - smoothstep(-0.14, 0.08, dot(normalize(cosmosWorldNormal), normalize(cosmosSunDirection)));
        totalEmissiveRadiance *= cosmosNight;`,
      );
  };
  material.customProgramCacheKey = () => "cosmos-night-mask-v1";
}

/** Keep unobserved pixels neutral instead of stretching measured bands over the poles. */
export function configurePartialCoverage(material: MeshStandardMaterial, fill = "#777b80", northEdge = 1): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.cosmosUnknownAlbedo = { value: new Color(fill) };
    shader.uniforms.cosmosNorthEdge = { value: northEdge };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 cosmosUnknownAlbedo;\nuniform float cosmosNorthEdge;",
      )
      .replace(
        "#include <map_fragment>",
        `
        #ifdef USE_MAP
          vec4 measuredAlbedo = texture2D(map, vMapUv);
          float coverage = measuredAlbedo.a;
          if (cosmosNorthEdge < 1.0) coverage *= 1.0 - smoothstep(cosmosNorthEdge - 0.06, cosmosNorthEdge, vMapUv.y);
          diffuseColor.rgb *= mix(cosmosUnknownAlbedo, measuredAlbedo.rgb, coverage);
        #endif
      `,
      );
  };
  material.customProgramCacheKey = () => "cosmos-observed-coverage-v2";
}

/**
 * Low-cost single-scattering-inspired limb approximation. The 80 km shell is
 * deliberately thin; visibility follows grazing angle and solar illumination.
 * It is not a spectral/volumetric atmosphere or a claim of calibrated radiance.
 */
export function createAtmosphereMaterial(towardSun: Vector3): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      cosmosSunDirection: { value: towardSun },
      scatterColor: { value: new Color("#69a8df") },
    },
    vertexShader: `
      varying vec3 worldNormal;
      varying vec3 worldView;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        worldNormal = normalize(mat3(modelMatrix) * normal);
        worldView = cameraPosition - worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 cosmosSunDirection;
      uniform vec3 scatterColor;
      varying vec3 worldNormal;
      varying vec3 worldView;
      void main() {
        vec3 n = normalize(worldNormal);
        vec3 v = normalize(worldView);
        vec3 s = normalize(cosmosSunDirection);
        float grazing = pow(max(0.0, 1.0 - abs(dot(n, v))), 3.0);
        float daylight = smoothstep(-0.12, 0.3, dot(n, s));
        float scatteringCosine = dot(v, s);
        float rayleighPhase = 0.75 * (1.0 + scatteringCosine * scatteringCosine);
        float opacity = min(0.28, grazing * daylight * rayleighPhase * 0.22);
        gl_FragColor = vec4(scatterColor, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: BackSide,
    transparent: true,
    depthWrite: false,
  });
}
