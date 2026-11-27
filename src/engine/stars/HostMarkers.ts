import { BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from "three";
import type { StarCatalog } from "../../data/stars/starCatalog";

/**
 * Optional rings around stars with confirmed planets, so faint hosts (most are invisible to
 * the eye) can be found. A navigation overlay, not a rendering of anything physical.
 */
export class HostMarkers {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  readonly hosts: Int32Array;
  private readonly positions: Float32Array;

  constructor(private readonly catalog: StarCatalog) {
    this.hosts = Int32Array.from(catalog.systems.keys());
    this.positions = new Float32Array(this.hosts.length * 3);
    const counts = new Float32Array(this.hosts.length);
    this.hosts.forEach((star, i) => { counts[i] = catalog.systems.get(star)?.planets.length ?? 1; });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(this.positions, 3));
    geometry.setAttribute("planets", new BufferAttribute(counts, 1));
    this.points = new Points(geometry, new ShaderMaterial({
      uniforms: { pixelRatio: { value: 1 } },
      vertexShader: `attribute float planets; uniform float pixelRatio; varying float vAlpha;
        void main() {
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          float d = length(view.xyz);
          if (view.z > 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
          // Nearer systems stand out; multi-planet systems get slightly larger rings.
          vAlpha = clamp(1.3 - log(max(d, 1.0)) / log(10.0) * 0.45, 0.18, 1.0);
          gl_PointSize = (6.0 + min(planets, 6.0) * 0.6) * pixelRatio;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `varying float vAlpha;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float ring = smoothstep(0.62, 0.74, r) * (1.0 - smoothstep(0.86, 1.0, r));
          if (ring < 0.01) discard;
          gl_FragColor = vec4(vec3(0.35, 0.85, 0.75) * ring * vAlpha * 0.8, 1.0);
        }`,
      transparent: true, depthTest: false, depthWrite: false,
    }));
    this.points.renderOrder = -900;
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  rebase(origin: Vector3): void {
    this.hosts.forEach((star, i) => {
      this.positions[i * 3] = this.catalog.positions[star * 3] - origin.x;
      this.positions[i * 3 + 1] = this.catalog.positions[star * 3 + 1] - origin.y;
      this.positions[i * 3 + 2] = this.catalog.positions[star * 3 + 2] - origin.z;
    });
    this.points.geometry.getAttribute("position").needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
