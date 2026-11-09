import {
  AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points,
  ShaderMaterial, Vector2,
} from "three";

/** Small screen-space lens reflections; these are optics, not celestial objects. */
export class SolarLensGhosts {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  private readonly uniforms = {
    ghostSunNdc: { value: new Vector2() },
    ghostSunDepthNdc: { value: 1 },
    ghostRadiance: { value: 0 },
  };

  constructor() {
    const geometry = new BufferGeometry();
    const factors = [-1.35, -1.08, -0.78, -0.53, -0.26, 0.18, 0.46, 0.73];
    const sizes = [52, 19, 43, 31, 53, 24, 39, 16];
    const gains = [0.42, 0.22, 0.62, 0.35, 0.55, 0.27, 0.4, 0.18];
    const colors = [
      [0.08, 0.26, 0.37], [0.08, 0.42, 0.28], [0.16, 0.23, 0.55],
      [0.30, 0.15, 0.46], [0.07, 0.34, 0.48], [0.20, 0.43, 0.28],
      [0.24, 0.29, 0.58], [0.43, 0.25, 0.50],
    ];
    geometry.setAttribute("position", new Float32BufferAttribute(factors.flatMap((factor) => [factor, 0, 0]), 3));
    geometry.setAttribute("ghostSize", new Float32BufferAttribute(sizes, 1));
    geometry.setAttribute("ghostGain", new Float32BufferAttribute(gains, 1));
    geometry.setAttribute("ghostTint", new Float32BufferAttribute(colors.flat(), 3));
    this.points = new Points(geometry, new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        attribute float ghostSize;
        attribute float ghostGain;
        attribute vec3 ghostTint;
        uniform vec2 ghostSunNdc;
        uniform float ghostSunDepthNdc;
        varying float vGain;
        varying vec3 vTint;
        void main() {
          vGain = ghostGain;
          vTint = ghostTint;
          gl_Position = vec4(ghostSunNdc * position.x, ghostSunDepthNdc, 1.0);
          gl_PointSize = ghostSize;
        }`,
      fragmentShader: `
        uniform float ghostRadiance;
        varying float vGain;
        varying vec3 vTint;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float radius = length(p);
          float hexagon = max(abs(p.y), abs(p.x) * 0.866 + abs(p.y) * 0.5);
          float aperture = 1.0 - smoothstep(0.78, 1.0, hexagon);
          float profile = (exp(-3.0 * radius * radius)
            + 0.12 * exp(-95.0 * pow(hexagon - 0.72, 2.0))) * aperture;
          gl_FragColor = vec4(vTint * ghostRadiance * vGain * profile, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, blending: AdditiveBlending,
      depthTest: true, depthWrite: false, toneMapped: true,
    }));
    this.points.name = "Illustrative camera lens reflections";
    this.points.renderOrder = 100;
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  update(sunNdc: Vector2, sunDepthNdc: number, radiance: number, enabled: boolean): void {
    this.points.visible = enabled && radiance > 0 && Number.isFinite(radiance)
      && Math.abs(sunNdc.x) <= 1.1 && Math.abs(sunNdc.y) <= 1.1;
    if (!this.points.visible) return;
    this.uniforms.ghostSunNdc.value.copy(sunNdc);
    this.uniforms.ghostSunDepthNdc.value = sunDepthNdc;
    this.uniforms.ghostRadiance.value = radiance;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
