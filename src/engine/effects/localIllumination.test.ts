import { describe, expect, it } from "vitest";
import { localAtmosphereModel } from "../../data/localAtmosphereModels";
import { atmosphericAirMass, localIllumination } from "./localIllumination";
import { planetaryEnvironments } from "../../data/planetaryEnvironments";

describe("atmosphere-aware local illumination", () => {
  it("has finite horizon extinction and unit zenith air mass", () => {
    expect(atmosphericAirMass(1)).toBeCloseTo(1, 10);
    expect(atmosphericAirMass(0)).toBeGreaterThan(10);
    expect(atmosphericAirMass(0)).toBeLessThan(15);
    expect(atmosphericAirMass(0.5)).toBeLessThan(atmosphericAirMass(0.1));
  });
  it.each(Object.entries(planetaryEnvironments))("bounds %s direct/diffuse illumination and removes solar light at night", (id, environment) => {
    const model = localAtmosphereModel(id as keyof typeof planetaryEnvironments);
    for (const cosine of [-1, -0.14, 0, 0.2, 1]) {
      const light = localIllumination(cosine, 0, environment.hazeHeightM, model);
      expect(light.direct).toBeGreaterThanOrEqual(0);
      expect(light.direct).toBeLessThanOrEqual(1);
      expect(light.diffuse).toBeGreaterThanOrEqual(0);
      expect(light.diffuse).toBeLessThanOrEqual(1);
      if (cosine <= -0.14) expect(light).toEqual({ direct: 0, diffuse: 0 });
    }
  });
  it("makes Venus diffuse-dominated, keeps airless sunlight direct, and clears above atmosphere", () => {
    const venus = localIllumination(1, 0, 100000, localAtmosphereModel("venus"));
    expect(venus.direct).toBeLessThan(0.003);
    expect(venus.diffuse).toBeGreaterThan(0.5);
    expect(localIllumination(1, 0, 0, localAtmosphereModel("moon"))).toEqual({ direct: 1, diffuse: 0 });
    expect(localIllumination(1, 100000, 100000, localAtmosphereModel("venus"))).toEqual({ direct: 1, diffuse: 0 });
    expect(localIllumination(NaN, 0, 80000, localAtmosphereModel("earth"))).toEqual({ direct: 0, diffuse: 0 });
  });
});
