import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";

/** Seeded, illustrative background stars: one draw call, no per-star scene objects. */
export class Starfield {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  constructor(maxStars = 14_400) {
    let seed = 80473;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const positions = new Float32Array(maxStars * 3);
    const colors = new Float32Array(maxStars * 3);
    const sizes = new Float32Array(maxStars);
    const color = new Color();
    for (let i = 0; i < maxStars; i++) {
      const azimuth = random() * Math.PI * 2;
      const y = random() * 2 - 1;
      const r = Math.sqrt(1 - y * y);
      positions.set(
        [r * Math.cos(azimuth) * 700, y * 700, r * Math.sin(azimuth) * 700],
        i * 3,
      );
      const brightness = 0.008 + random() ** 9 * 0.24;
      const hue = random();
      color
        .set(hue < 0.1 ? "#d5e2f7" : hue > 0.92 ? "#eadccb" : "#e6e9ed")
        .multiplyScalar(brightness);
      colors.set([color.r, color.g, color.b], i * 3);
      sizes[i] =
        random() < 0.015 ? 1.3 + random() * 0.35 : 0.6 + random() * 0.45;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    geometry.setAttribute("size", new BufferAttribute(sizes, 1));
    const material = new ShaderMaterial({
      uniforms: { pixelRatio: { value: 1 }, exposureVisibility: { value: 1 } },
      vertexShader: `attribute vec3 color; attribute float size; varying vec3 vColor; uniform float pixelRatio;
        void main(){ vColor=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize=size*pixelRatio; }`,
      fragmentShader: `varying vec3 vColor; uniform float exposureVisibility; void main(){ float d=length(gl_PointCoord-.5)*2.; if(d>1.) discard;
        gl_FragColor=vec4(vColor * exp(-d*d*3.)*.65*exposureVisibility, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
      transparent: false,
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
    });
    this.points = new Points(geometry, material);
    // Background first: this decorative shell must never occlude physical bodies.
    this.points.renderOrder = -1000;
    this.points.frustumCulled = false;
    this.setCount(1600);
  }
  setCount(count: number): void {
    this.points.geometry.setDrawRange(
      0,
      Math.min(14_400, Math.max(0, Math.round(count))),
    );
  }
  update(cameraPosition: Vector3, pixelRatio: number, exposure = 1): void {
    this.points.position.copy(cameraPosition);
    this.points.material.uniforms.pixelRatio.value = pixelRatio;
    // Final HDR output (or the direct fallback shader) applies exposure once.
    // Only cancel gains above1 for this illustrative, non-photometric background.
    this.points.material.uniforms.exposureVisibility.value =
      Number.isFinite(exposure) && exposure > 0 ? Math.min(1, exposure) / exposure : 1;
  }
  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
