import { ClampToEdgeWrapping, SRGBColorSpace, Vector4, type MeshStandardMaterial, type Texture } from "three";
import type { TerrainImagery } from "../../types/terrain";
import { fetchImageTexture } from "../loaders/ScientificTextureLoader";

/** Two bounded registered overlays: regional context first, landing detail second. */
export class TerrainImageryLayers {
  private readonly slots = Array.from({ length: 2 }, () => ({
    requestedUrl: "", generation: 0, texture: { value: null as Texture | null },
    bounds: { value: new Vector4() }, enabled: { value: 0 },
  }));
  private disposed = false;
  private anisotropy = 2;

  constructor(private readonly onError: (error: unknown) => void) {}

  configure(material: MeshStandardMaterial): void {
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      let declarations = "";
      let overlays = "";
      this.slots.forEach((slot, index) => {
        const prefix = `terrainLayer${index}`;
        shader.uniforms[`${prefix}Map`] = slot.texture;
        shader.uniforms[`${prefix}Bounds`] = slot.bounds;
        shader.uniforms[`${prefix}Enabled`] = slot.enabled;
        declarations += `uniform sampler2D ${prefix}Map;
          uniform vec4 ${prefix}Bounds; uniform float ${prefix}Enabled;\n`;
        overlays += `if (${prefix}Enabled > 0.5) {
          vec2 regionalUv = (lonLat - ${prefix}Bounds.xy) / ${prefix}Bounds.zw;
          if (all(greaterThanEqual(regionalUv, vec2(0.0))) && all(lessThanEqual(regionalUv, vec2(1.0)))) {
            vec4 observed = texture2D(${prefix}Map, regionalUv);
            float edge = min(min(regionalUv.x, regionalUv.y), min(1.0 - regionalUv.x, 1.0 - regionalUv.y));
            diffuseColor.rgb = mix(diffuseColor.rgb, observed.rgb, observed.a * smoothstep(0.0, 0.025, edge));
          }
        }\n`;
      });
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${declarations}`)
        .replace("#include <map_fragment>", `#include <map_fragment>
          #ifdef USE_MAP
            vec2 lonLat = vec2((fract(vMapUv.x) - 0.5) * 360.0, (vMapUv.y - 0.5) * 180.0);
            ${overlays}
          #endif`);
    };
    material.customProgramCacheKey = () => `${previousKey}-registered-terrain-layers-v2`;
  }

  setAnisotropy(value: number): void {
    this.anisotropy = value;
    for (const slot of this.slots) {
      if (slot.texture.value) {
        slot.texture.value.anisotropy = value;
        slot.texture.value.needsUpdate = true;
      }
    }
  }

  update(layers: TerrainImagery[]): void {
    if (this.disposed) return;
    // Retain the widest context and finest detail if a future provider offers more.
    const sorted = [...layers].sort((a, b) => b.sourceResolutionM - a.sourceResolutionM);
    const selected = sorted.length > 2 ? [sorted[0], sorted[sorted.length - 1]] : sorted;
    this.slots.forEach((slot, index) => {
      const imagery = selected[index];
      const url = imagery?.url ?? "";
      if (url === slot.requestedUrl) return;
      slot.requestedUrl = url;
      const generation = ++slot.generation;
      if (!imagery) {
        slot.enabled.value = 0;
        if (slot.texture.value) this.release(slot.texture.value);
        slot.texture.value = null;
        return;
      }
      void fetchImageTexture(url).then(texture => {
        if (this.disposed || slot.generation !== generation) { this.release(texture); return; }
        texture.colorSpace = SRGBColorSpace;
        texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
        texture.anisotropy = this.anisotropy;
        texture.needsUpdate = true;
        if (slot.texture.value) this.release(slot.texture.value);
        slot.texture.value = texture;
        const { west, east, south, north } = imagery.bounds;
        slot.bounds.value.set(west, south, east - west, north - south);
        slot.enabled.value = 1;
      }).catch(error => { if (!this.disposed && slot.generation === generation) this.onError(error); });
    });
  }

  private release(texture: Texture): void {
    texture.dispose();
    if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap) texture.image.close();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of this.slots) {
      slot.enabled.value = 0;
      if (slot.texture.value) this.release(slot.texture.value);
      slot.texture.value = null;
    }
  }
}
