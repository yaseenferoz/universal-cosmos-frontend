import { BufferGeometry, Float32BufferAttribute, Points, PointsMaterial } from "three";

/** Overview-only spatial cue. Particles are illustrative, not catalog objects or measured positions. */
export class AsteroidBelt {
  readonly points: Points<BufferGeometry, PointsMaterial>;

  constructor(count = 640) {
    let seed = 0x5b1f2a31;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      const angle = random() * Math.PI * 2;
      const radius = 28.2 + random() * 6.4;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = (random() - 0.5) * 0.8;
      positions[index * 3 + 2] = Math.sin(angle) * radius;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    this.points = new Points(geometry, new PointsMaterial({
      color: "#a8a29b",
      size: 0.12,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }));
    this.points.visible = false;
    this.points.frustumCulled = false;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
