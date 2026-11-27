import { Color, Vector3, Vector4, type MeshStandardMaterial } from "three";
import type { ObjectId } from "../../types/celestial";
import { SurfaceDetailMaps } from "./SurfaceDetailMaps";
export { SurfaceDetailMaps } from "./SurfaceDetailMaps";
import { LUNAR_DISPLAY_DARK, LUNAR_DISPLAY_RANGE } from "./lunarAppearance";
import { environmentFor } from "../../data/planetaryEnvironments";
import { hexToLinear, resolvePaletteColor, surfaceProfileFor, type SurfaceProfile } from "../../data/surfaceProfiles";

/** A power-of-two period shared by every texture octave, in body-fixed meters. */
export const DETAIL_PERIOD_M = 4096;
export function wrappedDetailOrigin(positionM: Vector3, target = new Vector3()): Vector3 {
  return target.set(...positionM.toArray().map(value => ((value % DETAIL_PERIOD_M) + DETAIL_PERIOD_M) % DETAIL_PERIOD_M) as [number, number, number]);
}

/**
 * Per-class ground palette (linear RGB) and parameters for synthesized landing sites.
 * `base` may be replaced by the landing site's colour sampled from the global map.
 */
export interface SurfaceGroundUniforms {
  base: { value: Color };
  slope: { value: Color };
  patch: { value: Color };
  accent: { value: Color };
  /** mottle, slope exposure, patch amount, patch threshold */
  shape: { value: Vector4 };
  /** patch scale (m), grain, gloss, unused */
  finish: { value: Vector4 };
}

export function surfaceGroundUniforms(profile: SurfaceProfile, groundLinear?: readonly [number, number, number]): SurfaceGroundUniforms {
  const ground = groundLinear ?? hexToLinear(profile.groundColor);
  const color = (entry: string) => new Color().setRGB(...resolvePaletteColor(entry, ground));
  const g = profile.ground;
  // Value-noise sums are roughly normal about 0.5: map coverage to a threshold.
  const threshold = 0.5 + (0.5 - g.patchCoverage) * 0.45;
  return {
    base: { value: new Color().setRGB(...ground) },
    slope: { value: color(g.slopeColor) },
    patch: { value: color(g.patchColor) },
    accent: { value: color(g.accentColor) },
    shape: { value: new Vector4(g.mottle, g.slopeExposure, g.patchAmount, threshold) },
    finish: { value: new Vector4(g.patchScaleM, g.grain, g.gloss, 0) },
  };
}

/** Re-derive the palette from a new base colour (landing-site map colour), in place. */
export function updateSurfaceGround(uniforms: SurfaceGroundUniforms, profile: SurfaceProfile, groundLinear: readonly [number, number, number]): void {
  const next = surfaceGroundUniforms(profile, groundLinear);
  uniforms.base.value.copy(next.base.value);
  uniforms.slope.value.copy(next.slope.value);
  uniforms.patch.value.copy(next.patch.value);
  uniforms.accent.value.copy(next.accent.value);
}

/** Small coordinates, triplanar photographs, and derivative bump shading; no DEM displacement. */
export function configureSurfaceDetail(material: MeshStandardMaterial, maps: SurfaceDetailMaps,
  originM: Vector3, bodyId: ObjectId, rock = false, measured = false,
  ground?: SurfaceGroundUniforms): SurfaceGroundUniforms | undefined {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  // Worlds without a dedicated palette take their environment's ground colour (from the
  // measured albedo/colour), normalized by the detail photographs' mean luminance (~0.22).
  const dedicated = ["mars", "venus", "earth", "mercury", "moon"].includes(bodyId);
  const groundHex = dedicated ? undefined : environmentFor(bodyId)?.groundColor;
  const tint = groundHex
    ? new Color(groundHex).multiplyScalar(1 / 0.22)
    : new Color(bodyId === "mars" ? "#c69576" : bodyId === "venus" ? "#ac9679" : "#a5a3a0").multiplyScalar(3.2);
  const soil = new Color(bodyId === "mercury" ? "#696663" : "#80756a");
  const outcrop = new Color(bodyId === "mercury" ? "#545252" : "#625e59");
  // Synthesized landing sites: class-specific ground instead of the tinted photograph,
  // which then only contributes fine grain and bump.
  const profile = dedicated ? undefined : surfaceProfileFor(bodyId);
  const kind = profile ? (ground ?? surfaceGroundUniforms(profile)) : undefined;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, {
      detailOriginM: { value: originM }, detailColorMap: maps.color, detailHeightMap: maps.height,
      detailEnabled: maps.enabled, detailTint: { value: tint },
      martianSand: { value: new Color("#a18163") }, martianRock: { value: new Color("#786b5c") },
      substrateColor: { value: soil }, outcropColor: { value: outcrop },
    });
    if (kind) Object.assign(shader.uniforms, {
      kindBase: kind.base, kindSlopeColor: kind.slope, kindPatchColor: kind.patch,
      kindAccentColor: kind.accent, kindShape: kind.shape, kindFinish: kind.finish,
    });
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      uniform vec3 detailOriginM;
      ${rock ? "" : "attribute float terrainElevationM, terrainSlope, terrainMaterial; varying float detailElevationM, detailSlope, detailMaterialValue;"}
      varying vec3 detailPositionM, detailNormal;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        detailPositionM = ${rock ? "position * 0.5" : "(modelMatrix * vec4(position, 1.0)).xyz + detailOriginM"};
        detailNormal = normal;`);
    if (!rock) shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      detailElevationM = terrainElevationM; detailSlope = terrainSlope; detailMaterialValue = terrainMaterial;`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 detailPositionM, detailNormal;
      uniform sampler2D detailColorMap, detailHeightMap;
      uniform float detailEnabled;
      uniform vec3 detailTint;
      uniform vec3 martianSand, martianRock;
      uniform vec3 substrateColor, outcropColor;
      ${rock ? "" : "varying float detailElevationM, detailSlope, detailMaterialValue;"}
      ${kind ? `uniform vec3 kindBase, kindSlopeColor, kindPatchColor, kindAccentColor;
      uniform vec4 kindShape, kindFinish;
      float kindHash(vec3 c) {
        c = fract(c * 0.1031);
        c += dot(c, c.yzx + 33.33);
        return fract((c.x + c.y) * c.z);
      }
      // Value noise whose lattice wraps every 4096 m, matching the floating-origin wrap.
      float kindNoise(vec3 p, float cell) {
        float period = 4096.0 / cell;
        vec3 x = p / cell, i = floor(x), f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        float a = kindHash(mod(i, period)), b = kindHash(mod(i + vec3(1, 0, 0), period));
        float c = kindHash(mod(i + vec3(0, 1, 0), period)), d = kindHash(mod(i + vec3(1, 1, 0), period));
        float e = kindHash(mod(i + vec3(0, 0, 1), period)), g = kindHash(mod(i + vec3(1, 0, 1), period));
        float h = kindHash(mod(i + vec3(0, 1, 1), period)), k = kindHash(mod(i + vec3(1, 1, 1), period));
        return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
      }` : ""}
      vec3 detailWeights() {
        vec3 w = pow(abs(normalize(detailNormal)), vec3(6.0));
        return w / max(0.0001, w.x + w.y + w.z);
      }
      vec4 detailSample(sampler2D source, vec3 p) {
        vec3 w = detailWeights();
        return texture2D(source, p.yz) * w.x + texture2D(source, p.zx) * w.y + texture2D(source, p.xy) * w.z;
      }
      float detailFade() { return 1.0 - smoothstep(35.0, 140.0, length(vViewPosition)); }
      float detailHeight() {
        return detailSample(detailHeightMap, detailPositionM * ${rock ? "1.0" : "0.25"}).r;
      }`)
      .replace("#include <roughnessmap_fragment>", `
        ${measured ? `// LROC imagery contains source shadows/exposure. This bounded display
          // remap reduces double-lighting contrast; it is not calibrated albedo.
          float sourceLuminance = clamp(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
          diffuseColor.rgb = vec3(${LUNAR_DISPLAY_DARK} + ${LUNAR_DISPLAY_RANGE} * sqrt(sourceLuminance));` : ""}
        ${kind ? "float kindGrainValue = 1.0;" : ""}
        if (detailEnabled > 0.5) {
          vec3 photographed = detailSample(detailColorMap, detailPositionM * ${rock ? "1.0" : "0.25"}).rgb;
          ${rock ? "" : `// A second, larger octave softens obvious repetition without large world coordinates.
            vec3 broad = detailSample(detailColorMap, detailPositionM * 0.0625 + vec3(0.31, 0.53, 0.17)).rgb;
            photographed *= clamp(dot(broad, vec3(0.2126, 0.7152, 0.0722)) / 0.22, 0.8, 1.2);`}
          float luminance = dot(photographed, vec3(0.2126, 0.7152, 0.0722));
          ${measured ? `// Preserve the regional image's spatial variation; add representative grain.
            diffuseColor.rgb *= mix(1.0, clamp(luminance / 0.22, 0.55, 1.5), detailFade() * 0.65);`
            : kind ? `kindGrainValue = clamp(luminance / 0.22, 0.55, 1.5);`
            : `vec3 surfaceColor = ${bodyId === "earth" ? "photographed" : "luminance * detailTint"};
            ${rock ? "diffuseColor.rgb *= surfaceColor * 2.5;" : "diffuseColor.rgb = surfaceColor;"}`}
          ${bodyId === "mars" && !rock ? `
            // Body-fixed periodic variation survives the 4096 m floating-origin wrap.
            vec3 phase = detailPositionM * 0.0015339807878856412;
            float dustVariation = 0.5 + 0.25 * sin(phase.x * 7.0 + phase.y * 11.0 + sin(phase.z * 5.0) * 2.0)
              + 0.25 * sin(phase.z * 13.0 - phase.y * 3.0);
            float exposed = smoothstep(0.12, 0.5, detailSlope);
            float grain = clamp(luminance / 0.22, 0.5, 1.55);
            float bedding = 0.9 + 0.1 * sin(detailElevationM * 0.95 + sin(phase.x * 5.0) * 0.4);
            vec3 dust = martianSand * mix(0.74, 1.08, dustVariation) * mix(1.0, grain, 0.4);
            vec3 bedrock = martianRock * bedding * mix(1.0, grain, 0.75);
            diffuseColor.rgb = mix(dust, bedrock, exposed);
          ` : ""}
          ${!rock && (bodyId === "mercury" || bodyId === "venus") ? `
            // Neutral rocky substrates, with atmospheric tint supplied by lighting.
            // Colors and slope masks are illustrative, not mineral measurements.
            float exposedRock = smoothstep(0.15, 0.6, detailSlope);
            diffuseColor.rgb = mix(substrateColor, outcropColor, exposedRock)
              * clamp(luminance / 0.22, 0.65, 1.4);
          ` : ""}
        }
        ${kind && rock ? `// Rock colour comes from the instance palette; the photograph adds grain only.
          diffuseColor.rgb *= mix(1.0, kindGrainValue, 0.8);` : ""}
        ${kind && !rock ? `{
          // Class-specific ground (illustrative): mottled base, fresh material on slopes,
          // patchy secondary deposits, and the relief's feature material (accent).
          vec3 kp = detailPositionM;
          float mottle = 0.5 * kindNoise(kp, 512.0) + 0.3 * kindNoise(kp, 64.0) + 0.2 * kindNoise(kp, 8.0);
          vec3 ground = kindBase * (1.0 + 2.0 * kindShape.x * (mottle - 0.5));
          ground = mix(ground, kindSlopeColor, kindShape.y * smoothstep(0.25, 0.9, detailSlope));
          // Deposits vary at every scale, so close views are not uniform either.
          float patchNoise = 0.5 * kindNoise(kp, kindFinish.x) + 0.3 * kindNoise(kp + 17.0, max(1.0, kindFinish.x * 0.125))
            + 0.2 * kindNoise(kp + 41.0, max(1.0, kindFinish.x / 64.0));
          float patchMask = smoothstep(kindShape.w - 0.04, kindShape.w + 0.04, patchNoise);
          ground = mix(ground, kindPatchColor, kindShape.z * patchMask);
          ground = mix(ground, kindAccentColor, clamp(detailMaterialValue, 0.0, 1.0));
          diffuseColor.rgb = ground * mix(1.0, kindGrainValue, kindFinish.y);
        }` : ""}
        #include <roughnessmap_fragment>`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        if (detailEnabled > 0.5) {
          // Differentiate sampled height before applying view-dependent attenuation.
          // Differentiating the fade itself creates false ridges at its boundary.
          float height = detailHeight() * ${rock ? "0.025" : "0.006"}${kind && !rock ? " * max(0.25, kindFinish.y)" : ""};
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 rx = cross(sy, normal), ry = cross(normal, sx);
          float determinant = dot(sx, rx);
          vec3 gradient = sign(determinant) * (dFdx(height) * rx + dFdy(height) * ry);
          // Bound the slope and suppress subpixel grain at a grazing view angle.
          // The albedo photograph remains visible; only bump relief is filtered.
          gradient /= max(abs(determinant), 1e-8);
          gradient *= min(1.0, ${rock ? "0.8" : "0.35"} / max(length(gradient), 1e-6));
          float footprintM = max(length(dFdx(detailPositionM)), length(dFdy(detailPositionM)));
          float resolved = 1.0 - smoothstep(${rock ? "0.02, 0.12" : "0.025, 0.18"}, footprintM);
          float facing = smoothstep(0.04, 0.22, abs(dot(normal, normalize(vViewPosition))));
          normal = normalize(normal - gradient * detailFade() * resolved * facing);
        }`);
    if (!rock) shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_fragment>", `#include <lights_physical_fragment>
      // Porous soil/regolith is diffuse-dominated. The generic dielectric's
      // grazing Fresnel lobe produces mirror-white bands along coarse slopes.
      // This is a display BRDF approximation, not a measured reflectance fit.
      material.specularColorBlended = vec3(0.005);
      material.specularF90 = 0.05;
      ${kind ? `// Ice is smoother and more specular than regolith (illustrative gloss).
        material.specularColorBlended = vec3(mix(0.005, 0.035, kindFinish.z));
        material.specularF90 = mix(0.05, 0.55, kindFinish.z);
        material.roughness = mix(material.roughness, 0.42, kindFinish.z);` : ""}`);
  };
  material.customProgramCacheKey = () => `${previousKey}-surface-detail-v5-${bodyId}-${rock}-${measured}-${kind ? "kind" : "photo"}`;
  return kind;
}
