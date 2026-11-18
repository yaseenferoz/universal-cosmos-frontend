import { describe, expect, it } from "vitest";
import { SurfaceAtmosphere } from "./SurfaceAtmosphere";

describe("meter-space atmospheric perspective", () => {
  it("scales radiance linearly with sunlight and extinguishes it at deep night", () => {
    const atmosphere = new SurfaceAtmosphere("#d4b39a", 0.00012, 60000);
    atmosphere.update(1, 1, 0);
    const daylight = atmosphere.radiance.value.clone();
    atmosphere.update(1, 0.25, 0);
    expect(atmosphere.radiance.value.r).toBeCloseTo(daylight.r * 0.25);
    atmosphere.update(-1, 1, 0);
    expect(atmosphere.radiance.value.toArray()).toEqual([0, 0, 0]);
    expect(atmosphere.density.value).toBeGreaterThan(0);
  });
  it("clears above the modeled atmosphere and rejects invalid illumination", () => {
    const atmosphere = new SurfaceAtmosphere("#d4b39a", 0.00012, 60000);
    atmosphere.update(1, 1, 60000);
    expect(atmosphere.density.value).toBe(0);
    for (const value of [NaN, Infinity, -1]) {
      atmosphere.update(1, value, 0);
      expect(atmosphere.radiance.value.toArray()).toEqual([0, 0, 0]);
    }
  });
});
