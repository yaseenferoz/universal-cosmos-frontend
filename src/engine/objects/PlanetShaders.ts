import {
  AdditiveBlending,
  BackSide,
  Color,
  MeshStandardMaterial,
  ShaderMaterial,
  Vector3,
} from "three";
import type { AtmosphereLimb } from "../../data/atmosphereLimbs";

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

/**
 * Unobserved parts of a partial map. `fill` should be the observed map's mean colour;
 * `variation` > 0 mottles it with multi-octave 3D value noise in body space (no seams),
 * an illustrative continuation rather than a flat placeholder. Observed pixels are
 * never altered; the map's alpha feathers the boundary.
 */
export function configurePartialCoverage(material: MeshStandardMaterial, fill = "#777b80", northEdge = 1, variation = 0,
  craters = 0): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.cosmosUnknownAlbedo = { value: new Color(fill) };
    shader.uniforms.cosmosNorthEdge = { value: northEdge };
    shader.uniforms.cosmosFillVariation = { value: variation };
    shader.uniforms.cosmosFillCraters = { value: craters };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 cosmosBodyPosition;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ncosmosBodyPosition = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 cosmosUnknownAlbedo;
        uniform float cosmosNorthEdge;
        uniform float cosmosFillVariation;
        uniform float cosmosFillCraters;
        varying vec3 cosmosBodyPosition;
        float cosmosHash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float cosmosValueNoise(vec3 x) {
          vec3 i = floor(x), f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(cosmosHash(i), cosmosHash(i + vec3(1.0, 0.0, 0.0)), f.x),
                mix(cosmosHash(i + vec3(0.0, 1.0, 0.0)), cosmosHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
            mix(mix(cosmosHash(i + vec3(0.0, 0.0, 1.0)), cosmosHash(i + vec3(1.0, 0.0, 1.0)), f.x),
                mix(cosmosHash(i + vec3(0.0, 1.0, 1.0)), cosmosHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
        }
        // Cellular crater field: dark bowls with brighter rims (illustrative). Crater
        // radii stay below half a cell, so only the 2x2x2 block of cells nearest p can
        // reach it: 8 lookups instead of 27.
        float cosmosCraters(vec3 p) {
          vec3 base = floor(p - 0.5);
          float relief = 0.0;
          for (int corner = 0; corner < 8; corner++) {
            vec3 id = base + vec3(float(corner & 1), float((corner >> 1) & 1), float((corner >> 2) & 1));
            vec3 feature = id + vec3(cosmosHash(id), cosmosHash(id + 17.31), cosmosHash(id + 41.7));
            float radius = 0.12 + 0.3 * cosmosHash(id + 7.13);
            float d = length(feature - p) / radius;
            relief += d < 1.0 ? -0.3 * (1.0 - d * d) : 0.0;
            relief += 0.18 * exp(-((d - 1.0) * (d - 1.0)) / 0.02);
          }
          return relief;
        }
        float cosmosMottle(vec3 p) {
          float value = 0.0, amplitude = 0.5;
          for (int octave = 0; octave < 5; octave++) {
            value += amplitude * cosmosValueNoise(p);
            p *= 2.03;
            amplitude *= 0.5;
          }
          return value;
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `
        #ifdef USE_MAP
          vec4 measuredAlbedo = texture2D(map, vMapUv);
          float coverage = measuredAlbedo.a;
          if (cosmosNorthEdge < 1.0) coverage *= 1.0 - smoothstep(cosmosNorthEdge - 0.06, cosmosNorthEdge, vMapUv.y);
          vec3 continuation = cosmosUnknownAlbedo;
          if (cosmosFillVariation > 0.0 && coverage < 0.999) {
            // Illustrative: mottling at ~15 deg to ~1 deg scales around the observed mean,
            // plus a two-scale crater field; never applied over observed pixels.
            vec3 unit = normalize(cosmosBodyPosition);
            float mottle = cosmosMottle(unit * 4.0) - 0.5;
            float craters = cosmosFillCraters > 0.0
              ? cosmosCraters(unit * 7.0) + 0.6 * cosmosCraters(unit * 17.0 + 3.1) : 0.0;
            continuation *= max(0.2, 1.0 + 2.0 * cosmosFillVariation * (mottle + 0.8 * cosmosFillCraters * craters));
          }
          diffuseColor.rgb *= mix(continuation, measuredAlbedo.rgb, coverage);
        #endif
      `,
      );
  };
  material.customProgramCacheKey = () => `cosmos-observed-coverage-v3-${variation > 0 ? "mottled" : "flat"}`;
  // Crater density is a uniform, so it does not need its own program.
}

/**
 * Low-cost single-scattering-inspired limb approximation. The 80 km shell is
 * deliberately thin; visibility follows grazing angle and solar illumination.
 * It is not a spectral/volumetric atmosphere or a claim of calibrated radiance.
 */
export interface LimbAtmosphereOptions {
  profile: AtmosphereLimb;
  /** Unit vector toward the Sun in world space (shared, updated by the body). */
  towardSun: Vector3;
  /** Relative solar irradiance uniform shared with the surface lighting. */
  irradiance: { value: number };
  /** Planet radius in the shell mesh's local units. */
  localPlanetRadius: number;
  /** Polar/equatorial radius ratio of the rendered planet (Saturn < 1). */
  polarRatio?: number;
}

/** Scene sunlight (DirectionalLight intensity) that surfaces are lit with. */
export const LIMB_SUN_INTENSITY = 3.1;

/**
 * Single-scattering atmospheric limb in the same radiance units as the lit surfaces
 * (E · p(μ) · (1 − e^−τ)): Rayleigh + Henyey–Greenstein aerosol phase, a Chapman
 * grazing column, and reddening of the light that crosses the limb. A backlit
 * world shows the bright forward-scattering ring; the day-side limb shows a thin
 * haze. Drawn additively outside the planet's disk only.
 */
export function createLimbAtmosphereMaterial(options: LimbAtmosphereOptions): ShaderMaterial {
  const { profile } = options;
  return new ShaderMaterial({
    uniforms: {
      limbSun: { value: options.towardSun },
      limbIrradiance: options.irradiance,
      limbSunIntensity: { value: LIMB_SUN_INTENSITY },
      localPlanetRadius: { value: options.localPlanetRadius },
      limbPolarRatio: { value: options.polarRatio ?? 1 },
      limbScaleHeight: { value: profile.scaleHeight },
      limbShellHeight: { value: profile.shellHeight },
      limbDepth: { value: profile.verticalDepth },
      limbExtinction: { value: new Vector3(...profile.extinction) },
      limbRayleighColor: { value: new Vector3(...profile.rayleighColor) },
      limbRayleighWeight: { value: profile.rayleighWeight },
      limbAerosolColor: { value: new Vector3(...profile.aerosolColor) },
      limbAerosolWeight: { value: profile.aerosolWeight },
      limbG: { value: profile.asymmetry },
    },
    vertexShader: `
      uniform float localPlanetRadius;
      varying vec3 limbWorldPosition;
      varying vec3 limbCenter;
      varying vec3 limbPole;
      varying float limbRadius;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        limbWorldPosition = world.xyz;
        limbCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        limbRadius = length(mat3(modelMatrix) * vec3(localPlanetRadius, 0.0, 0.0));
        limbPole = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 limbSun;
      uniform float limbIrradiance;
      uniform float limbSunIntensity;
      uniform float limbPolarRatio;
      uniform float limbScaleHeight;
      uniform float limbShellHeight;
      uniform float limbDepth;
      uniform vec3 limbExtinction;
      uniform vec3 limbRayleighColor;
      uniform float limbRayleighWeight;
      uniform vec3 limbAerosolColor;
      uniform float limbAerosolWeight;
      uniform float limbG;
      varying vec3 limbWorldPosition;
      varying vec3 limbCenter;
      varying vec3 limbPole;
      varying float limbRadius;
      void main() {
        vec3 view = normalize(limbWorldPosition - cameraPosition);
        // Stretch the polar axis so an oblate planet becomes a sphere.
        float stretch = 1.0 / limbPolarRatio - 1.0;
        vec3 origin = cameraPosition - limbCenter;
        origin += stretch * dot(origin, limbPole) * limbPole;
        vec3 direction = normalize(view + stretch * dot(view, limbPole) * limbPole);
        float along = -dot(origin, direction);
        if (along <= 0.0) discard;
        vec3 closest = origin + direction * along;
        float altitude = length(closest) / limbRadius - 1.0;
        if (altitude < 0.0) discard; // the ray meets the planet itself
        // Display aid: keep the limb at least ~1–2 px thick for distant planets.
        float height = max(limbScaleHeight, 0.75 * fwidth(altitude));
        float fade = 1.0 - smoothstep(0.65 * limbShellHeight, limbShellHeight, altitude);
        // Grazing (Chapman) column along the line of sight: τv · sqrt(2πR/H) · e^(−a/H).
        float grazing = sqrt(6.2831853 / height);
        float density = limbDepth * exp(-altitude / height);
        vec3 opacity = 1.0 - exp(-density * grazing * limbExtinction);
        // Sunlight reaches the scattering point along its own slant path: ~1/cos z from
        // above on the day side, the full grazing column when backlit (reddening it).
        float solarCosine = dot(normalize(closest), limbSun);
        float airmass = solarCosine > 0.0 ? min(grazing, 1.0 / max(solarCosine, 1e-3)) : grazing;
        vec3 transmitted = exp(-density * airmass * limbExtinction);
        float lit = smoothstep(-0.2, 0.02, solarCosine);
        float mu = dot(view, limbSun);
        float rayleigh = 0.0596831 * (1.0 + mu * mu);
        float g = limbG;
        float henyeyGreenstein = (1.0 - g * g) / (12.5663706 * pow(max(1e-4, 1.0 + g * g - 2.0 * g * mu), 1.5));
        vec3 phase = limbRayleighColor * rayleigh * limbRayleighWeight
          + limbAerosolColor * henyeyGreenstein * limbAerosolWeight;
        vec3 radiance = limbSunIntensity * limbIrradiance * lit * fade * transmitted * opacity * phase;
        gl_FragColor = vec4(radiance, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: BackSide,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}
