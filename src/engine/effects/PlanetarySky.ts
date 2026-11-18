import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";
import type { PlanetaryEnvironment } from "../../data/planetaryEnvironments";

/** Visual adaptation, not photometric radiance. Dense cloud-level views hide the star map. */
export function localStarVisibility(solarCosine: number, environment?: PlanetaryEnvironment): number {
  if (environment?.nightSkyTransmission === 0) return 0;
  const x = Math.max(0, Math.min(1, (solarCosine + 0.12) / 0.3));
  const day = x * x * (3 - 2 * x);
  const nightTransmission = environment?.nightSkyTransmission ?? 1;
  const airless = !environment || environment.hazeOpacity === 0;
  return (1 - day) * nightTransmission + day * (airless ? 0.035 : 0.01);
}

/** Illustrative solar twilight envelope; no artificial solar radiance at deep night. */
export function skySolarIllumination(solarCosine: number): number {
  if (!Number.isFinite(solarCosine)) return 0;
  const x = Math.max(0, Math.min(1, (solarCosine + 0.14) / 0.32));
  return x * x * (3 - 2 * x);
}

/** Analytic haze approximation in body-fixed axes. The global scene supplies physical disks. */
export class PlanetarySky {
  private readonly material: ShaderMaterial;
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  constructor(private readonly profile: PlanetaryEnvironment) {
    this.material = new ShaderMaterial({
      uniforms: {
        upDirection: { value: new Vector3(0, 1, 0) }, sunDirection: { value: new Vector3(1, 0, 0) },
        zenithColor: { value: new Color(profile.skyColor) }, horizonColor: { value: new Color(profile.horizonColor) },
        density: { value: 0 }, irradiance: { value: 1 }, opaqueHaze: { value: profile.nightSkyTransmission === 0 ? 1 : 0 },
        nightTransmission: { value: profile.nightSkyTransmission },
        cloudStructure: { value: profile.cloudStructure },
        daylight: { value: 0 },
        twilightColor: { value: new Color(profile.twilightColor ?? profile.horizonColor) },
        twilightStrength: { value: profile.twilightColor ? 1 : 0 },
      },
      vertexShader: `varying vec3 sightline;
        void main() { sightline = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        varying vec3 sightline;
        uniform vec3 upDirection, sunDirection, zenithColor, horizonColor, twilightColor;
        uniform float density, irradiance, opaqueHaze, nightTransmission, cloudStructure, daylight, twilightStrength;
        void main() {
          vec3 ray = normalize(sightline);
          float elevation = dot(ray, upDirection);
          float solarHeight = dot(upDirection, sunDirection);
          float day = daylight;
          float cosine = dot(ray, sunDirection);
          float rayleigh = 0.75 * (1.0 + cosine * cosine);
          float forwardScatter = pow(max(0.0, cosine), 24.0);
          vec3 color = mix(horizonColor, zenithColor, pow(max(0.0, elevation), 0.45));
          // Directional sunset tint: Mars dust is blue near the Sun; Earth is warm.
          // This is an artistic angular envelope, not spectral radiative transfer.
          float twilight = (1.0 - smoothstep(0.0, 0.28, abs(solarHeight)))
            * pow(max(0.0, cosine), 8.0) * twilightStrength;
          color = mix(color, twilightColor, twilight * 0.85);
          // Broad, stable cloud variation is illustrative, not a weather map.
          float cloud = 0.5 + 0.25 * sin(ray.x * 19.0 + 2.0 * sin(ray.z * 9.0))
            + 0.25 * sin(ray.z * 27.0 - ray.y * 15.0 + sin(ray.x * 13.0));
          color *= mix(1.0, mix(0.72, 1.18, cloud), cloudStructure);
          // Sunlight cannot leave a permanent colored glow on the night side.
          // Airglow, aurora, lightning and reflected planet/moonlight are not modeled.
          color *= (0.5 + 0.3 * rayleigh + 0.3 * forwardScatter) * day * irradiance;
          float airMass = 1.0 / max(0.12, max(0.0, elevation));
          float alpha = 1.0 - exp(-density * (0.8 + airMass * 0.3));
          float horizonDust = 1.0 - smoothstep(0.02, 0.45, elevation);
          float nightExtinction = mix(0.07, 0.35, 1.0 - nightTransmission) + 0.3 * horizonDust;
          alpha *= mix(nightExtinction, 1.0, day);
          alpha = mix(alpha, clamp(density, 0.0, 1.0), opaqueHaze);
          alpha *= 1.0 - (1.0 - opaqueHaze) * 0.75 * pow(max(0.0, cosine), 128.0) * day;
          gl_FragColor = vec4(color, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: BackSide, transparent: true, depthWrite: false, depthTest: false,
    });
    this.mesh = new Mesh(new SphereGeometry(1, 24, 12), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }
  update(positionM: Vector3, sunDirection: Vector3, altitudeM: number, irradiance: number): void {
    this.material.uniforms.upDirection.value.copy(positionM).normalize();
    this.material.uniforms.sunDirection.value.copy(sunDirection).normalize();
    this.material.uniforms.daylight.value = skySolarIllumination(
      this.material.uniforms.upDirection.value.dot(this.material.uniforms.sunDirection.value),
    );
    const depth = Math.max(0, 1 - altitudeM / Math.max(1, this.profile.hazeHeightM));
    this.material.uniforms.density.value = depth * depth * (this.profile.hazeOpacity === 1 ? 1.5 : 5) * this.profile.hazeOpacity;
    // Match the terrain's linear solar scale. Global exposure already compensates
    // for distance; a minimum brightness or sqrt here blows out outer-planet haze.
    this.material.uniforms.irradiance.value = Number.isFinite(irradiance) ? Math.max(0, irradiance) : 0;
    this.mesh.visible = this.profile.hazeHeightM > 0 && depth > 0;
  }
  dispose(): void { this.mesh.geometry.dispose(); this.material.dispose(); }
}
