import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { buildTerrainGeometry } from "./TerrainGeometry";
import { CUBE_ROOTS } from "./coordinates";
import { testTerrainProvider } from "./terrainTestProvider";

describe("measured cube-sphere mesh construction", () => {
  it("uses the source datum/elevation and outward triangles on all six faces", () => {
    const provider = testTerrainProvider();
    for (const key of CUBE_ROOTS) {
      const tile = buildTerrainGeometry(key, 8, provider);
      const vertices = tile.geometry.getAttribute("position");
      const a = new Vector3().fromBufferAttribute(vertices, 0).add(tile.centerM);
      const b = new Vector3().fromBufferAttribute(vertices, 1).add(tile.centerM);
      const c = new Vector3().fromBufferAttribute(vertices, 9).add(tile.centerM);
      expect(a.length()).toBeCloseTo(provider.manifest.radiusM + 120, 0);
      expect(b.clone().sub(a).cross(c.clone().sub(a)).dot(a)).toBeGreaterThan(0);
      const radialNormal = new Vector3().fromBufferAttribute(tile.geometry.getAttribute("normal"), 0);
      expect(radialNormal.dot(a.normalize())).toBeCloseTo(1, 6);
      tile.geometry.dispose();
    }
  });

  it("shares boundary elevations between independently centered tiles", () => {
    const provider = testTerrainProvider((latitude, longitude) => Math.sin(latitude) * 12 + Math.cos(longitude) * 7);
    const left = buildTerrainGeometry({ face: 0, level: 14, x: 8000, y: 9000 }, 16, provider);
    const right = buildTerrainGeometry({ face: 0, level: 14, x: 8001, y: 9000 }, 16, provider);
    for (let row = 0; row <= 16; row++) {
      const a = new Vector3().fromBufferAttribute(left.geometry.getAttribute("position"), row * 17 + 16).add(left.centerM);
      const b = new Vector3().fromBufferAttribute(right.geometry.getAttribute("position"), row * 17).add(right.centerM);
      expect(a.distanceTo(b)).toBeLessThan(0.0001);
    }
    left.geometry.dispose(); right.geometry.dispose();
  });

  it("places skirts below observations and keeps near-ground vertices small", () => {
    const provider = testTerrainProvider();
    const tile = buildTerrainGeometry({ face: 0, level: 16, x: 30000, y: 40000 }, 16, provider);
    const positions = tile.geometry.getAttribute("position");
    const surfaceCount = 17 ** 2;
    for (let index = 0; index < positions.count; index++) {
      const position = new Vector3().fromBufferAttribute(positions, index);
      expect(position.length()).toBeLessThan(100);
      if (index >= surfaceCount) expect(position.add(tile.centerM).length()).toBeLessThan(provider.manifest.radiusM + 119.9);
    }
    tile.geometry.dispose();
  });

  it("extends fine edge skirts below neighboring coarse interpolation chords", () => {
    const provider = testTerrainProvider();
    const coarse = buildTerrainGeometry({ face: 0, level: 10, x: 500, y: 600 }, 16, provider);
    const fine = buildTerrainGeometry({ face: 0, level: 11, x: 1002, y: 1200 }, 16, provider);
    const coarsePositions = coarse.geometry.getAttribute("position");
    const finePositions = fine.geometry.getAttribute("position");
    const fineLeftSkirtStart = 17 ** 2 + 3 * 17;
    for (let row = 0; row <= 16; row++) {
      const coarseRow = row / 2;
      const a = new Vector3().fromBufferAttribute(coarsePositions, Math.floor(coarseRow) * 17 + 16).add(coarse.centerM);
      const b = new Vector3().fromBufferAttribute(coarsePositions, Math.ceil(coarseRow) * 17 + 16).add(coarse.centerM);
      const chord = a.lerp(b, coarseRow % 1);
      const skirt = new Vector3().fromBufferAttribute(finePositions, fineLeftSkirtStart + 16 - row).add(fine.centerM);
      expect(skirt.length()).toBeLessThan(chord.length());
    }
    coarse.geometry.dispose(); fine.geometry.dispose();
  });
});
