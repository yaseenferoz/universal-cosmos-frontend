import {
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";
import { skyExposureCompensation } from "./skyExposure";

const RECORD_FLOATS = 7;
const MAX_STARS = 24000;

/** Bright point sources extracted from the installed NASA SVS map, not invented coordinates. */
export class BrightStarField {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  private readonly abort = new AbortController();
  private loading = false;
  private disposed = false;
  private loaded = false;

  constructor() {
    const material = new ShaderMaterial({
      uniforms: {
        visibility: { value: 0 },
        pixelRatio: { value: 1 },
        exposureCompensation: { value: 1 },
      },
      vertexShader: `attribute vec3 starColor;
        attribute float starSize;
        uniform float pixelRatio;
        varying vec3 color;
        void main() {
          color = starColor;
          vec4 projected = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = projected.xyww;
          gl_PointSize = starSize * pixelRatio;
        }`,
      fragmentShader: `uniform float visibility;
        uniform float exposureCompensation;
        varying vec3 color;
        void main() {
          float radius = length(gl_PointCoord - 0.5) * 2.0;
          if (radius > 1.0) discard;
          float alpha = exp(-radius * radius * 3.0) * visibility;
          gl_FragColor = vec4(color * 2.5 * exposureCompensation, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    const geometry = new BufferGeometry();
    geometry.setDrawRange(0, 0);
    this.points = new Points(geometry, material);
    this.points.renderOrder = -1900;
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  get ready(): boolean {
    return this.loaded;
  }

  load(): void {
    if (this.loading || this.loaded || this.disposed) return;
    this.loading = true;
    void fetch("/textures/deep-sky-bright-stars.bin", { signal: this.abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Bright-star asset unavailable");
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (this.disposed) return;
        const stride = RECORD_FLOATS * Float32Array.BYTES_PER_ELEMENT;
        if (buffer.byteLength % stride !== 0 || buffer.byteLength / stride > MAX_STARS)
          throw new Error("Invalid bright-star asset");
        const records = new Float32Array(buffer);
        const count = records.length / RECORD_FLOATS;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        for (let i = 0; i < count; i++) {
          const offset = i * RECORD_FLOATS;
          for (let axis = 0; axis < 3; axis++) {
            const direction = records[offset + axis];
            const color = records[offset + axis + 3];
            if (!Number.isFinite(direction) || !Number.isFinite(color))
              throw new Error("Invalid bright-star record");
            positions[i * 3 + axis] = direction * 700;
            colors[i * 3 + axis] = color;
          }
          const size = records[offset + 6];
          if (!Number.isFinite(size) || size <= 0 || size > 3)
            throw new Error("Invalid bright-star size");
          sizes[i] = size;
        }
        this.points.geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
        this.points.geometry.setAttribute("starColor", new Float32BufferAttribute(colors, 3));
        this.points.geometry.setAttribute("starSize", new Float32BufferAttribute(sizes, 1));
        this.points.geometry.setDrawRange(0, count);
        this.loaded = true;
      })
      .catch(() => {
        // The local map remains available if the point layer cannot load.
      });
  }

  update(cameraPosition: Vector3, visibility: number, pixelRatio: number, exposure = 1, adaptation = 1): void {
    this.points.position.copy(cameraPosition);
    this.points.material.uniforms.visibility.value = Math.max(0, Math.min(1, visibility));
    this.points.material.uniforms.pixelRatio.value = pixelRatio;
    this.points.material.uniforms.exposureCompensation.value = skyExposureCompensation(exposure) * Math.max(1, Math.min(3, adaptation));
    this.points.visible = this.loaded && visibility > 0.005;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
