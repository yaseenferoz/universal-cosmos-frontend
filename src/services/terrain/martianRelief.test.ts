import { describe, expect, it } from "vitest";
import { LocalCelestialService } from "../api/LocalCelestialService";
import { ReconstructedTerrainProvider } from "./ReconstructedTerrainProvider";
import { martianReliefM, terrainNoise } from "./martianRelief";
import { buildTerrainGeometry } from "../../engine/terrain/TerrainGeometry";
import { cartesianToGeodetic } from "../../engine/terrain/coordinates";
import { Vector3 } from "three";

describe("reconstructed Martian geology", () => {
  it("is continuous across noise cell boundaries and remains within declared relief", () => {
    for (const x of [-100, -1, 0, 1, 150]) {
      expect(Math.abs(terrainNoise(x - 1e-6, 0.37, -1.8) - terrainNoise(x + 1e-6, 0.37, -1.8))).toBeLessThan(1e-5);
    }
    for (let i = 0; i < 1000; i++) {
      const x = Math.sin(i * 3.7) * 3389500, y = Math.cos(i * 1.9) * 3389500, z = Math.sin(i * 5.1) * 3389500;
      const height = martianReliefM(x, y, z, 450);
      expect(height).toBeGreaterThanOrEqual(-450);
      expect(height).toBeLessThanOrEqual(450);
      expect(martianReliefM(x, y, z, 0)).toBe(0);
    }
  });

  it("preserves the longitude seam, reports reconstruction provenance and shares collision heights with the mesh", async () => {
    const body = await new LocalCelestialService().getObject("mars");
    if (!body) throw new Error("Missing Mars");
    const provider = new ReconstructedTerrainProvider(body, { latDeg: 0, lonDeg: 0, radiusM: 1000 });
    await provider.initialize();
    for (const lat of [-90, -45, 0, 45, 90]) {
      expect(provider.sampleHeight(lat, 180).heightM).toBeCloseTo(provider.sampleHeight(lat, -180).heightM, 5);
    }
    expect(provider.sampleHeight(91, 0).available).toBe(false);
    expect(provider.manifest.reconstruction).toBe(true);
    const tile = buildTerrainGeometry({ face: 0, level: 16, x: 32768, y: 32768 }, 8, provider);
    const positions = tile.geometry.getAttribute("position");
    for (let i = 0; i < 81; i++) {
      const point = new Vector3().fromBufferAttribute(positions, i).add(tile.centerM);
      const geo = cartesianToGeodetic(point, provider.manifest.radiusM);
      expect(geo.heightM).toBeCloseTo(provider.sampleHeight(geo.latDeg, geo.lonDeg).heightM, 3);
      expect(tile.geometry.getAttribute("terrainElevationM").getX(i)).toBeCloseTo(geo.heightM, 3);
      expect(tile.geometry.getAttribute("terrainSlope").getX(i)).toBeGreaterThanOrEqual(0);
    }
    tile.geometry.dispose(); provider.dispose();
  });
});
