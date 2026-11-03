import { MeshStandardMaterial, ShaderChunk, Vector3 } from "three";

export interface SolarMaterialOccluder {
  position: Vector3;
  radius: number;
}

export interface SolarMaterialState {
  /** Camera-relative world positions and radii must use the same rendering units. */
  sunPosition: Vector3;
  sunRadius: number;
  /** Per-body inverse-square multiplier relative to the scene's 1 AU light baseline. */
  irradiance: number;
  occluders: readonly SolarMaterialOccluder[];
}

export const MAX_MATERIAL_SOLAR_OCCLUDERS = 4;
const CACHE_VERSION = "cosmos-fragment-solar-lighting-v1";
const DIRECTIONAL_CALL =
  "getDirectionalLightInfo( directionalLight, directLight );";
const AMBIENT_CALL = "getAmbientLightIrradiance( ambientLightColor )";

/**
 * Analytic overlap of angular discs with uniform solar brightness. This is not
 * limb-weighted eclipse photometry. Multiple candidates use the strongest single
 * occultation, not an exact union; ring transmission and irregular shapes are absent.
 */
const FRAGMENT_DECLARATIONS = `
varying vec3 cosmosSolarWorldPosition;
uniform vec3 cosmosSolarSunPosition;
uniform vec3 cosmosSolarFallbackDirection;
uniform float cosmosSolarSunRadius;
uniform float cosmosSolarIrradiance;
uniform int cosmosSolarOccluderCount;
uniform vec3 cosmosSolarOccluderPositions[${MAX_MATERIAL_SOLAR_OCCLUDERS}];
uniform float cosmosSolarOccluderRadii[${MAX_MATERIAL_SOLAR_OCCLUDERS}];

float cosmosSolarDiscVisibility(float sunAngle, float blockerAngle, float separation) {
  if (sunAngle <= 0.0 || blockerAngle <= 0.0) return 1.0;
  // Normalize by solar radius to keep the area calculation stable for small discs.
  float r = blockerAngle / sunAngle;
  float d = separation / sunAngle;
  if (d >= 1.0 + r) return 1.0;
  if (d <= abs(1.0 - r)) return r >= 1.0 ? 0.0 : 1.0 - r * r;
  float d2 = d * d;
  float r2 = r * r;
  float solarSector = acos(clamp((d2 + 1.0 - r2) / (2.0 * d), -1.0, 1.0));
  float blockerSector = acos(clamp((d2 + r2 - 1.0) / (2.0 * d * r), -1.0, 1.0));
  float kite = sqrt(max(0.0, (-d + 1.0 + r) * (d + 1.0 - r) * (d - 1.0 + r) * (d + 1.0 + r)));
  float overlap = solarSector + r2 * blockerSector - 0.5 * kite;
  return clamp(1.0 - overlap / 3.141592653589793, 0.0, 1.0);
}

vec3 cosmosSolarDirection(vec3 point) {
  vec3 offset = cosmosSolarSunPosition - point;
  return dot(offset, offset) > 1e-20 ? normalize(offset) : normalize(cosmosSolarFallbackDirection);
}

float cosmosSolarVisibility(vec3 point) {
  if (cosmosSolarOccluderCount == 0) return 1.0;
  vec3 toSun = cosmosSolarSunPosition - point;
  float solarDistance = length(toSun);
  if (solarDistance <= cosmosSolarSunRadius || cosmosSolarSunRadius <= 0.0) return 1.0;
  vec3 solarDirection = toSun / solarDistance;
  float solarAngle = asin(clamp(cosmosSolarSunRadius / solarDistance, 0.0, 1.0));
  float visibility = 1.0;
  for (int occultor = 0; occultor < ${MAX_MATERIAL_SOLAR_OCCLUDERS}; occultor++) {
    if (occultor >= cosmosSolarOccluderCount) break;
    float blockerRadius = cosmosSolarOccluderRadii[occultor];
    vec3 toBlocker = cosmosSolarOccluderPositions[occultor] - point;
    float blockerDistance = length(toBlocker);
    if (blockerRadius <= 0.0 || blockerDistance >= solarDistance || dot(toBlocker, toSun) <= 0.0) continue;
    if (blockerDistance <= blockerRadius) return 0.0;
    vec3 blockerDirection = toBlocker / blockerDistance;
    // atan2 remains useful when acos(dot) would round a tiny separation to zero.
    float separation = atan(length(cross(solarDirection, blockerDirection)), clamp(dot(solarDirection, blockerDirection), -1.0, 1.0));
    float blockerAngle = asin(clamp(blockerRadius / blockerDistance, 0.0, 1.0));
    visibility = min(visibility, cosmosSolarDiscVisibility(solarAngle, blockerAngle, separation));
  }
  return visibility;
}
`;

const WORLD_POSITION = `
#include <worldpos_vertex>
vec4 cosmosSolarVertex = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  cosmosSolarVertex = batchingMatrix * cosmosSolarVertex;
#endif
#ifdef USE_INSTANCING
  cosmosSolarVertex = instanceMatrix * cosmosSolarVertex;
#endif
cosmosSolarWorldPosition = (modelMatrix * cosmosSolarVertex).xyz;
`;

function finiteVector(vector: Vector3): boolean {
  return (
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  );
}

/**
 * Extends the scene's first DirectionalLight without replacing Three's BRDF or
 * shadow sampling. Attach after existing night/coverage hooks. Uniform references
 * are stable across updates, so moving an eclipse does not recompile a material.
 */
export class SolarMaterialLighting {
  private readonly attached = new WeakSet<MeshStandardMaterial>();
  private readonly uniforms = {
    cosmosSolarSunPosition: { value: new Vector3() },
    cosmosSolarFallbackDirection: { value: new Vector3(1, 0, 0) },
    cosmosSolarSunRadius: { value: 0 },
    cosmosSolarIrradiance: { value: 1 },
    cosmosSolarOccluderCount: { value: 0 },
    cosmosSolarOccluderPositions: {
      value: Array.from(
        { length: MAX_MATERIAL_SOLAR_OCCLUDERS },
        () => new Vector3(),
      ),
    },
    cosmosSolarOccluderRadii: {
      value: new Float32Array(MAX_MATERIAL_SOLAR_OCCLUDERS),
    },
  };

  constructor(readonly towardSun: Vector3) {
    this.uniforms.cosmosSolarFallbackDirection.value = towardSun;
  }

  attach(material: MeshStandardMaterial): void {
    if (this.attached.has(material)) return;
    if (
      !ShaderChunk.lights_fragment_begin.includes(DIRECTIONAL_CALL) ||
      !ShaderChunk.lights_fragment_begin.includes(AMBIENT_CALL)
    )
      throw new Error(
        "The installed Three.js lighting chunks do not match the solar material extension.",
      );
    this.attached.add(material);
    const previousCompile = material.onBeforeCompile;
    const previousCacheKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer);
      if (
        !shader.vertexShader.includes("#include <worldpos_vertex>") ||
        !shader.fragmentShader.includes("#include <lights_fragment_begin>")
      )
        throw new Error(
          "Solar material lighting requires the standard world-position and lighting shader hooks.",
        );
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 cosmosSolarWorldPosition;",
        )
        .replace("#include <worldpos_vertex>", WORLD_POSITION);
      const lighting = ShaderChunk.lights_fragment_begin
        .replace(
          DIRECTIONAL_CALL,
          `${DIRECTIONAL_CALL}
        #if UNROLLED_LOOP_INDEX == 0
          directLight.direction = normalize((viewMatrix * vec4(cosmosSolarDirection(cosmosSolarWorldPosition), 0.0)).xyz);
          directLight.color *= cosmosSolarIrradiance * cosmosSolarVisibility(cosmosSolarWorldPosition);
        #endif`,
        )
        .replace(AMBIENT_CALL, `${AMBIENT_CALL} * cosmosSolarIrradiance`);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\n${FRAGMENT_DECLARATIONS}`,
        )
        .replace("#include <lights_fragment_begin>", lighting);
    };
    material.customProgramCacheKey = () =>
      `${previousCacheKey.call(material)}|${CACHE_VERSION}`;
    material.needsUpdate = true;
  }

  update(state: SolarMaterialState): void {
    this.uniforms.cosmosSolarSunPosition.value.copy(
      finiteVector(state.sunPosition) ? state.sunPosition : new Vector3(),
    );
    this.uniforms.cosmosSolarSunRadius.value = Number.isFinite(state.sunRadius)
      ? Math.max(0, state.sunRadius)
      : 0;
    this.uniforms.cosmosSolarIrradiance.value = Number.isFinite(
      state.irradiance,
    )
      ? Math.max(0, state.irradiance)
      : 0;
    let count = 0;
    for (const occluder of state.occluders) {
      if (count >= MAX_MATERIAL_SOLAR_OCCLUDERS) break;
      if (
        !finiteVector(occluder.position) ||
        !Number.isFinite(occluder.radius) ||
        occluder.radius <= 0
      )
        continue;
      this.uniforms.cosmosSolarOccluderPositions.value[count].copy(
        occluder.position,
      );
      this.uniforms.cosmosSolarOccluderRadii.value[count] = occluder.radius;
      count++;
    }
    this.uniforms.cosmosSolarOccluderCount.value = count;
    for (let index = count; index < MAX_MATERIAL_SOLAR_OCCLUDERS; index++) {
      this.uniforms.cosmosSolarOccluderPositions.value[index].set(0, 0, 0);
      this.uniforms.cosmosSolarOccluderRadii.value[index] = 0;
    }
  }
}
