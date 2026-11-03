import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { cartesianToGeodetic, cubeDirection, directionToCube, geodeticToCartesian, type CubeFace } from "./coordinates";

describe("lunar body-fixed coordinates", () => {
  it("round-trips elevations against the 1,737,400 meter datum", () => {
    for (const [lat, lon, height] of [[20.1908, 30.7717, -2624.525], [-65, -175, 4000], [90, 0, 0]]) {
      const point = geodeticToCartesian(lat, lon, height, 1_737_400);
      const result = cartesianToGeodetic(point, 1_737_400);
      expect(result.latDeg).toBeCloseTo(lat, 8);
      expect(result.lonDeg).toBeCloseTo(lon, 8);
      expect(result.heightM).toBeCloseTo(height, 6);
    }
    expect(geodeticToCartesian(0, 90, 0, 1).z).toBeCloseTo(-1);
    expect(geodeticToCartesian(90, 0, 0, 1).y).toBeCloseTo(1);
  });

  it("retains a 1.7 meter eye height after CPU origin subtraction and Float32 upload", () => {
    const ground = geodeticToCartesian(20.1908, 30.7717, -2624.525, 1_737_400);
    const eye = geodeticToCartesian(20.1908, 30.7717, -2622.825, 1_737_400);
    const relative = ground.clone().sub(eye);
    const uploaded = new Vector3().fromArray(new Float32Array(relative.toArray()));
    expect(uploaded.length()).toBeCloseTo(1.7, 6);
  });

  it("gives matching directions on every cube-face edge and invertible face interiors", () => {
    const edgePoints = new Map<string, number>();
    for (let face = 0; face < 6; face++) {
      for (const [u, v] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const point = cubeDirection(face as CubeFace, u, v);
        const key = point.toArray().map((value) => value.toFixed(8)).join(",").replaceAll("-0.00000000", "0.00000000");
        edgePoints.set(key, (edgePoints.get(key) ?? 0) + 1);
      }
      const point = cubeDirection(face as CubeFace, 0.23, -0.72);
      const result = directionToCube(point);
      expect(result.face).toBe(face);
      expect(result.u).toBeCloseTo(0.23);
      expect(result.v).toBeCloseTo(-0.72);
    }
    expect(edgePoints.size).toBe(12);
    expect([...edgePoints.values()].every((count) => count === 2)).toBe(true);
  });
});
