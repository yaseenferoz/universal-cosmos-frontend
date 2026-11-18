import { Color, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, SRGBColorSpace, Vector3, type MeshStandardMaterial, type Texture } from "three";
import type { ObjectId } from "../../types/celestial";
import { fetchImageTexture } from "../loaders/ScientificTextureLoader";

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
    });
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      uniform vec3 detailOriginM;
      varying vec3 detailPositionM, detailNormal;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        detailPositionM = ${rock ? "position * 0.5" : "(modelMatrix * vec4(position, 1.0)).xyz + detailOriginM"};
        detailNormal = normal;`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 detailPositionM, detailNormal;
      uniform sampler2D detailColorMap, detailHeightMap;
      uniform float detailEnabled;
      uniform vec3 detailTint;
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
        if (detailEnabled > 0.5) {
          vec3 photographed = detailSample(detailColorMap, detailPositionM * ${rock ? "1.0" : "0.25"}).rgb;
          ${rock ? "" : `// A second, larger octave softens obvious repetition without large world coordinates.
            vec3 broad = detailSample(detailColorMap, detailPositionM * 0.0625 + vec3(0.31, 0.53, 0.17)).rgb;
            photographed *= clamp(dot(broad, vec3(0.2126, 0.7152, 0.0722)) / 0.22, 0.8, 1.2);`}
          float luminance = dot(photographed, vec3(0.2126, 0.7152, 0.0722));
          ${measured ? `// Keep the measured regional image as the macro albedo; only add representative grain.
            diffuseColor.rgb *= mix(1.0, clamp(luminance / 0.22, 0.55, 1.5), detailFade() * 0.65);`
            : `vec3 surfaceColor = ${bodyId === "earth" ? "photographed" : "luminance * detailTint"};
            ${rock ? "diffuseColor.rgb *= surfaceColor * 2.5;" : "diffuseColor.rgb = surfaceColor;"}`}
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
  };
  material.customProgramCacheKey = () => `${previousKey}-surface-detail-v2-${bodyId}-${rock}-${measured}`;
}
