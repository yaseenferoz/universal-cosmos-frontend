import { describe, expect, it } from "vitest";
import { craterProfile, terrestrialReliefM } from "./terrestrialRelief";
import { ReconstructedTerrainProvider } from "./ReconstructedTerrainProvider";
import { LocalCelestialService } from "../api/LocalCelestialService";

describe("distinct reconstructed terrestrial relief", () => {
  it("provides a crater depression, positive rim and compact smooth exterior", () => {
    expect(craterProfile(0)).toBeLessThan(-0.3);
    expect(craterProfile(1)).toBeGreaterThan(0.1);
    expect(craterProfile(1.5)).toBe(0);
    expect(Math.abs(craterProfile(1.4999))).toBeLessThan(1e-8);
  });
  it.each(["earth", "venus", "mercury"] as const)("keeps %s relief bounded and continuous across cellular boundaries", body => {
    for (let i = -25; i <= 25; i++) {
      const x = i * 1400, y = 233.7, z = 513.1;
      const value = terrestrialReliefM(body, x, y, z, 500);
      expect(Math.abs(value)).toBeLessThanOrEqual(500);
      expect(Math.abs(terrestrialReliefM(body, x - 0.001, y, z, 500) - terrestrialReliefM(body, x + 0.001, y, z, 500))).toBeLessThan(0.01);
      expect(terrestrialReliefM(body, x, y, z, 0)).toBe(0);
    }
  });
  it("preserves seams/poles for every solid reconstruction and leaves giant datums groundless", async () => {
    const objects = await new LocalCelestialService().getObjects();
    for (const id of ["earth", "venus", "mercury", "jupiter", "saturn", "uranus", "neptune"] as const) {
      const body = objects.find(body => body.id === id)!;
      const provider = new ReconstructedTerrainProvider(body, { latDeg: 0, lonDeg: 0, radiusM: 1000 });
      for (const lat of [-90, -45, 0, 45, 90]) {
        expect(provider.sampleHeight(lat, -180).heightM).toBeCloseTo(provider.sampleHeight(lat, 180).heightM, 6);
      }
      expect(provider.sampleHeight(90, -40).heightM).toBeCloseTo(provider.sampleHeight(90, 80).heightM, 6);
      if (["jupiter", "saturn", "uranus", "neptune"].includes(id)) expect(provider.sampleHeight(15, 27).heightM).toBe(0);
      provider.dispose();
    }
  });
});
