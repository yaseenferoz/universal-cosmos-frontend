import { describe, expect, it } from "vitest";
import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import {
  buildIrregularShape,
  defaultAxes,
  roughnessForRadius,
  seededRandom,
  shapeSeed,
} from "./IrregularShape";

function positions(geometry: BufferGeometry): Vector3[] {
  const attribute = geometry.getAttribute("position") as BufferAttribute;
  return Array.from({ length: attribute.count }, (_, i) => new Vector3().fromBufferAttribute(attribute, i));
}

/** Volume of a closed triangle mesh (divergence theorem). */
function volume(geometry: BufferGeometry): number {
  const p = positions(geometry);
  const index = geometry.getIndex();
  if (!index) throw new Error("expected indexed geometry");
  let sum = 0;
  for (let i = 0; i < index.count; i += 3) {
    const a = p[index.getX(i)], b = p[index.getX(i + 1)], c = p[index.getX(i + 2)];
    sum += a.dot(new Vector3().crossVectors(b, c)) / 6;
  }
  return Math.abs(sum);
}

describe("seeded irregular small-body shapes", () => {
  const base = { axes: [1, 0.8, 0.6] as const, roughness: 0.15, craters: 60, detail: 12 };

  it("is deterministic per seed and distinct between bodies", () => {
    const one = positions(buildIrregularShape({ ...base, seed: shapeSeed("eros") }));
    const again = positions(buildIrregularShape({ ...base, seed: shapeSeed("eros") }));
    const other = positions(buildIrregularShape({ ...base, seed: shapeSeed("ida") }));
    expect(one.length).toBe(again.length);
    expect(one.every((v, i) => v.equals(again[i]))).toBe(true);
    const meanDifference = one.reduce((sum, v, i) => sum + Math.abs(v.length() - other[i].length()), 0) / one.length;
    expect(meanDifference).toBeGreaterThan(0.02);
  });

  it("keeps the volume-equivalent radius near 1 and honors the semi-axes", () => {
    const geometry = buildIrregularShape({ ...base, roughness: 0.04, craters: 10, seed: 7, axes: [17, 5.5, 5.5] });
    // Equal-volume sphere radius within a few percent despite lumps and craters.
    expect(Math.cbrt(volume(geometry) / (4 / 3 * Math.PI))).toBeGreaterThan(0.93);
    expect(Math.cbrt(volume(geometry) / (4 / 3 * Math.PI))).toBeLessThan(1.05);
    const box = geometry.boundingBox!;
    const x = box.max.x - box.min.x, y = box.max.y - box.min.y, z = box.max.z - box.min.z;
    // Long axis on +X (prime meridian), shortest on +Y (spin axis), as for Eros-like 17:5.5:5.5.
    expect(x / z).toBeGreaterThan(2.6);
    expect(x / z).toBeLessThan(3.6);
    expect(y / z).toBeGreaterThan(0.85);
    expect(y / z).toBeLessThan(1.15);
  });

  it("sits on its volume centroid and reports its true reach from that centre", () => {
    for (const id of ["himalia", "s2004s12", "kiviuq", "pasiphae", "eros"]) {
      const geometry = buildIrregularShape({ ...base, roughness: 0.2, seed: shapeSeed(id), detail: 16 });
      const p = positions(geometry);
      const index = geometry.getIndex()!;
      const centroid = new Vector3();
      let total = 0;
      for (let i = 0; i < index.count; i += 3) {
        const a = p[index.getX(i)], b = p[index.getX(i + 1)], c = p[index.getX(i + 2)];
        const signed = a.dot(new Vector3().crossVectors(b, c)) / 6;
        total += signed;
        centroid.addScaledVector(a.clone().add(b).add(c), signed / 4);
      }
      // Lumpy bodies spin about their mass centre, which sits at the ephemeris position.
      expect(centroid.divideScalar(total).length(), id).toBeLessThan(1e-6);
      // Camera clearance uses the reach from that centre, not the box-centred sphere.
      expect(geometry.userData.extent, id).toBeCloseTo(Math.max(...p.map((v) => v.length())), 10);
    }
  });

  it("produces finite unit normals and a bounded albedo modulation", () => {
    const geometry = buildIrregularShape({ ...base, seed: 99 });
    const normal = geometry.getAttribute("normal") as BufferAttribute;
    const color = geometry.getAttribute("color") as BufferAttribute;
    for (let i = 0; i < normal.count; i++) {
      const n = new Vector3().fromBufferAttribute(normal, i);
      expect(Number.isFinite(n.x + n.y + n.z)).toBe(true);
      expect(n.length()).toBeCloseTo(1, 5);
      expect(color.getX(i)).toBeGreaterThan(0.8);
      expect(color.getX(i)).toBeLessThan(1.2);
    }
  });

  it("shows the same large-scale shape at every level of detail", () => {
    // The coarse vertices are a subset of the fine icosphere's directions only at
    // the 12 original vertices; compare the radius along those directions.
    const coarse = buildIrregularShape({ ...base, seed: 5, detail: 6 });
    const fine = buildIrregularShape({ ...base, seed: 5, detail: 30 });
    const fineByDirection = positions(fine);
    let worst = 0;
    for (const v of positions(coarse).slice(0, 12)) {
      const direction = v.clone().normalize();
      const match = fineByDirection.reduce((best, w) =>
        w.clone().normalize().dot(direction) > best.clone().normalize().dot(direction) ? w : best);
      worst = Math.max(worst, Math.abs(match.length() - v.length()) / v.length());
    }
    // Only craters too small for the coarse mesh differ.
    expect(worst).toBeLessThan(0.08);
  });

  it("rounds large bodies and keeps small ones lumpy", () => {
    expect(roughnessForRadius(10)).toBeGreaterThan(0.18);
    expect(roughnessForRadius(600)).toBeLessThan(0.01);
    expect(roughnessForRadius(150, true)).toBeLessThan(roughnessForRadius(150, false));
    const [a, b, c] = defaultAxes(shapeSeed("s2004s12"), 3);
    expect(a).toBe(1);
    expect(b).toBeLessThanOrEqual(1);
    expect(c).toBeLessThanOrEqual(b);
    const [, bigB, bigC] = defaultAxes(1, 2000);
    expect(bigB).toBeGreaterThan(0.999);
    expect(bigC).toBeGreaterThan(0.999);
  });

  it("uses a well-distributed seeded generator", () => {
    const random = seededRandom(shapeSeed("bennu"));
    let sum = 0;
    for (let i = 0; i < 10_000; i++) sum += random();
    expect(sum / 10_000).toBeGreaterThan(0.48);
    expect(sum / 10_000).toBeLessThan(0.52);
  });
});
