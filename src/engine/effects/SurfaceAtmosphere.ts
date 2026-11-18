import { Color, type MeshStandardMaterial } from "three";
import { skySolarIllumination } from "./PlanetarySky";

/** Display-only near-surface aerial perspective, in meter-space and linear radiance. */
export class SurfaceAtmosphere {
  readonly density = { value: 0 };
  readonly radiance = { value: new Color(0, 0, 0) };
  private readonly color: Color;
  constructor(color: string, private readonly extinctionPerM: number, private readonly layerHeightM: number) {
    this.color = new Color(color);
  }

  update(solarCosine: number, irradiance: number, altitudeM: number): void {
    const depth = Number.isFinite(altitudeM) ? Math.max(0, Math.min(1, 1 - altitudeM / this.layerHeightM)) : 0;
    this.density.value = this.extinctionPerM * depth * depth;
    const energy = Number.isFinite(irradiance) ? Math.max(0, irradiance) : 0;
    this.radiance.value.copy(this.color).multiplyScalar(skySolarIllumination(solarCosine) * energy);
  }

  configure(material: MeshStandardMaterial): void {
    const previous = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      shader.uniforms.surfaceHazeDensity = this.density;
      shader.uniforms.surfaceHazeRadiance = this.radiance;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
          uniform float surfaceHazeDensity; uniform vec3 surfaceHazeRadiance;`)
        .replace("#include <opaque_fragment>", `#include <opaque_fragment>
          // Apply once before tone mapping, equally in the direct and HDR paths.
          float transmission = exp(-length(vViewPosition) * surfaceHazeDensity);
          gl_FragColor.rgb = mix(surfaceHazeRadiance, gl_FragColor.rgb, transmission);`);
    };
    material.customProgramCacheKey = () => `${key}-surface-aerial-perspective-v1`;
  }
}
