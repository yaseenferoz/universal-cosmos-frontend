import { Color, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, SRGBColorSpace, Vector3, type MeshStandardMaterial, type Texture } from "three";
import type { ObjectId } from "../../types/celestial";
import { fetchImageTexture } from "../loaders/ScientificTextureLoader";
import { LUNAR_DISPLAY_DARK, LUNAR_DISPLAY_RANGE } from "./lunarAppearance";

/** A power-of-two period shared by every texture octave, in body-fixed meters. */
export const DETAIL_PERIOD_M = 4096;
export function wrappedDetailOrigin(positionM: Vector3, target = new Vector3()): Vector3 {
  return target.set(...positionM.toArray().map(value => ((value % DETAIL_PERIOD_M) + DETAIL_PERIOD_M) % DETAIL_PERIOD_M) as [number, number, number]);
}

/** CC0 terrestrial material samples. Their use off Earth is explicitly illustrative. */
export class SurfaceDetailMaps {
  readonly color = { value: null as Texture | null };
  readonly height = { value: null as Texture | null };
  readonly enabled = { value: 0 };
  private disposed = false;
  async load(rock: boolean, mobile: boolean): Promise<void> {
    const name = rock ? "rock_boulder_dry" : "dry_ground_rocks";
    const results = await Promise.allSettled(["color", "height"].map(async kind => {
      const texture = await fetchImageTexture(`/textures/${name}-${kind}.jpg`);
      if (this.disposed) { this.release(texture); return; }
      texture.colorSpace = kind === "color" ? SRGBColorSpace : NoColorSpace;
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = mobile ? 2 : 8;
      texture.needsUpdate = true;
      (kind === "color" ? this.color : this.height).value = texture;
    }));
    if (!this.disposed && this.color.value && this.height.value) this.enabled.value = 1;
    const failure = results.find(result => result.status === "rejected");
    if (failure?.status === "rejected" && !this.disposed) throw failure.reason;
  }
  private release(texture: Texture): void {
    texture.dispose();
    if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap) texture.image.close();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled.value = 0;
    if (this.color.value) this.release(this.color.value);
    if (this.height.value) this.release(this.height.value);
    this.color.value = this.height.value = null;
  }
}

/** Small coordinates, triplanar photographs, and derivative bump shading; no DEM displacement. */
export function configureSurfaceDetail(material: MeshStandardMaterial, maps: SurfaceDetailMaps,
  originM: Vector3, bodyId: ObjectId, rock = false, measured = false): void {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  const tint = new Color(bodyId === "mars" ? "#c69576" : bodyId === "venus" ? "#ac9679" : "#a5a3a0").multiplyScalar(3.2);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, {
      detailOriginM: { value: originM }, detailColorMap: maps.color, detailHeightMap: maps.height,
      detailEnabled: maps.enabled, detailTint: { value: tint },
      martianSand: { value: new Color("#a18163") }, martianRock: { value: new Color("#786b5c") },
    });
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      uniform vec3 detailOriginM;
      ${rock ? "" : "attribute float terrainElevationM, terrainSlope; varying float detailElevationM, detailSlope;"}
      varying vec3 detailPositionM, detailNormal;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        detailPositionM = ${rock ? "position * 0.5" : "(modelMatrix * vec4(position, 1.0)).xyz + detailOriginM"};
        detailNormal = normal;`);
    if (!rock) shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      detailElevationM = terrainElevationM; detailSlope = terrainSlope;`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 detailPositionM, detailNormal;
      uniform sampler2D detailColorMap, detailHeightMap;
      uniform float detailEnabled;
      uniform vec3 detailTint;
      uniform vec3 martianSand, martianRock;
      ${rock ? "" : "varying float detailElevationM, detailSlope;"}
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
        if (detailEnabled > 0.5) {
          vec3 photographed = detailSample(detailColorMap, detailPositionM * ${rock ? "1.0" : "0.25"}).rgb;
          ${rock ? "" : `// A second, larger octave softens obvious repetition without large world coordinates.
            vec3 broad = detailSample(detailColorMap, detailPositionM * 0.0625 + vec3(0.31, 0.53, 0.17)).rgb;
            photographed *= clamp(dot(broad, vec3(0.2126, 0.7152, 0.0722)) / 0.22, 0.8, 1.2);`}
          float luminance = dot(photographed, vec3(0.2126, 0.7152, 0.0722));
          ${measured ? `// Preserve the regional image's spatial variation; add representative grain.
            diffuseColor.rgb *= mix(1.0, clamp(luminance / 0.22, 0.55, 1.5), detailFade() * 0.65);`
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
        }
        #include <roughnessmap_fragment>`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        if (detailEnabled > 0.5) {
          // Differentiate sampled height before applying view-dependent attenuation.
          // Differentiating the fade itself creates false ridges at its boundary.
          float height = detailHeight() * ${rock ? "0.025" : "0.006"};
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
      material.specularF90 = 0.05;`);
  };
  material.customProgramCacheKey = () => `${previousKey}-surface-detail-v3-${bodyId}-${rock}-${measured}`;
}
