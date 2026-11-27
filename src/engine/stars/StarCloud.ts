import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3,
} from "three";
import type { StarCatalog } from "../../data/stars/starCatalog";
import { blackbodyLinearRgbFast, bvToTemperature, luminositySolar, radiusSolar, stellarEstimate } from "./stellarPhysics";

/** Parsecs per solar radius. */
export const PC_PER_SOLAR_RADIUS = 695_700 / 3.085677581491367e13;

/**
 * Display brightness of a star relative to the faintest drawn star: 1 at
 * `magnitudeLimit`, ×2.512 per magnitude brighter. Mirrors the vertex shader.
 */
export function starVisibility(apparentMag: number, magnitudeLimit: number): number {
  return 10 ** (0.4 * (magnitudeLimit - apparentMag)) * 0.05;
}

/**
 * Every catalogued star as one draw call. Brightness, glare size and colour follow each
 * star's absolute magnitude and the camera's true distance to it, so moving through space
 * changes the sky. Positions are re-expressed relative to a floating origin (parsecs) so
 * float32 vertex precision holds near the focused star.
 */
export class StarCloud {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  readonly origin = new Vector3();
  /** Estimated radius per star, parsecs (for disk/glare handover and close-approach limits). */
  readonly radiusPc: Float32Array;
  /** Estimated effective temperature per star, kelvin. */
  readonly temperatureK: Float32Array;
  private readonly positions: Float32Array;

  constructor(private readonly catalog: StarCatalog) {
    const count = catalog.count;
    this.positions = new Float32Array(count * 3);
    this.radiusPc = new Float32Array(count);
    this.temperatureK = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Measured host-star values (exoplanet archive) win over estimates from B−V and magnitude.
      const measuredT = catalog.temperatureK[i], measuredR = catalog.radiusSolar[i];
      const temperature = Number.isFinite(measuredT) ? measuredT
        : Number.isFinite(bvToTemperature(catalog.colorIndex[i])) ? bvToTemperature(catalog.colorIndex[i]) : 5800;
      const radius = Number.isFinite(measuredR) ? measuredR
        : Number.isFinite(measuredT) ? radiusSolar(luminositySolar(catalog.absMag[i], measuredT), measuredT)
          : stellarEstimate(catalog.absMag[i], catalog.colorIndex[i]).radiusSolar;
      this.temperatureK[i] = temperature;
      this.radiusPc[i] = Math.min(2000, radius) * PC_PER_SOLAR_RADIUS;
      blackbodyLinearRgbFast(temperature, colors, i * 3);
    }
    // The Sun's catalogue values are exact.
    this.radiusPc[0] = PC_PER_SOLAR_RADIUS;
    this.temperatureK[0] = 5772;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(this.positions, 3));
    geometry.setAttribute("absMag", new BufferAttribute(catalog.absMag, 1));
    geometry.setAttribute("starColor", new BufferAttribute(colors, 3));
    geometry.setAttribute("radiusPc", new BufferAttribute(this.radiusPc, 1));
    this.rebase(new Vector3());
    const material = new ShaderMaterial({
      uniforms: {
        magnitudeLimit: { value: 6.5 },
        /** Daylight/atmosphere dimming from a planet's surface (1 = space). */
        skyVisibility: { value: 1 },
        pixelRatio: { value: 1 },
        focalPx: { value: 1000 },
      },
      vertexShader: `
        attribute float absMag;
        attribute vec3 starColor;
        attribute float radiusPc;
        uniform float magnitudeLimit, skyVisibility, pixelRatio, focalPx;
        varying vec3 vColor;
        varying float vSize, vGlow, vCore;
        void main() {
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          float d = max(length(view.xyz), 1e-12);
          float m = absMag + 5.0 * log2(d) * 0.30103 - 5.0;
          float v = exp2(1.3287712 * (magnitudeLimit - m)) * 0.05 * skyVisibility;
          // Skip stars too faint to show at this limit: most of the catalogue at any moment.
          if (v < 0.02 || view.z > 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
          // A resolved stellar disk is drawn by the star-body mesh; the point keeps only glare.
          float diskPx = radiusPc / d * focalPx;
          vCore = 1.0 - smoothstep(0.8, 2.5, diskPx);
          vGlow = clamp(log(max(v, 1.0)) * 0.25, 0.0, 1.5);
          vSize = min(64.0, 3.0 + 26.0 * vGlow) * pixelRatio;
          vColor = starColor * min(v, 3.0);
          gl_PointSize = vSize;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        varying float vSize, vGlow, vCore;
        void main() {
          float rPx = length(gl_PointCoord - 0.5) * vSize;
          // Crisp ~1.5 px core plus an eye/camera glare halo for bright stars.
          float core = exp(-rPx * rPx / 1.1) * vCore;
          // The halo fades to zero before the sprite's edge, so very bright stars show no square.
          float halo = vGlow * 0.35 * exp(-rPx / max(1.0, vSize * 0.16)) * (1.0 - smoothstep(0.6, 1.0, rPx / (0.5 * vSize)));
          float a = core + halo;
          if (a < 0.002) discard;
          gl_FragColor = vec4(vColor * a, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -1000;
  }

  /** Re-express all positions relative to a new origin (parsecs, catalogue frame). */
  rebase(origin: Vector3): void {
    this.origin.copy(origin);
    const source = this.catalog.positions;
    for (let i = 0; i < this.catalog.count; i++) {
      this.positions[i * 3] = source[i * 3] - origin.x;
      this.positions[i * 3 + 1] = source[i * 3 + 1] - origin.y;
      this.positions[i * 3 + 2] = source[i * 3 + 2] - origin.z;
    }
    const attribute = this.points?.geometry.getAttribute("position");
    if (attribute) attribute.needsUpdate = true;
  }

  /** A star's position relative to the current origin. */
  localPosition(index: number, target = new Vector3()): Vector3 {
    const source = this.catalog.positions;
    return target.set(source[index * 3] - this.origin.x, source[index * 3 + 1] - this.origin.y, source[index * 3 + 2] - this.origin.z);
  }

  setMagnitudeLimit(limit: number): void {
    this.points.material.uniforms.magnitudeLimit.value = limit;
  }

  /** Dim the sky for daylight or an atmosphere (1 = space, 0 = no stars). */
  setSkyVisibility(visibility: number): void {
    this.points.material.uniforms.skyVisibility.value = Math.max(0, visibility);
  }

  setView(pixelRatio: number, focalPx: number): void {
    this.points.material.uniforms.pixelRatio.value = pixelRatio;
    this.points.material.uniforms.focalPx.value = focalPx;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
