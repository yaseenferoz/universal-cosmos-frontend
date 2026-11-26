import { describe, expect, it } from "vitest";
import { crateredReliefM, type CrateredReliefParameters } from "./crateredRelief";
import { craterDensityFor, environmentFor, reliefScaleFor } from "../../data/planetaryEnvironments";

const callisto: CrateredReliefParameters = { seed: 42, reliefM: 6000, featureScaleM: 150, radiusM: 2_410_000, craterDensity: 1 };

function profile(parameters: CrateredReliefParameters, count = 2000, stepM = 120): number[] {
  // A straight walk across the surface near (R, 0, 0).
  return Array.from({ length: count }, (_, i) => crateredReliefM(parameters.radiusM, 0, i * stepM, parameters));
}

describe("procedural cratered relief for airless worlds", () => {
  it("is deterministic per body and bounded by the relief scale", () => {
    const a = profile(callisto), b = profile(callisto);
    expect(a).toEqual(b);
    expect(profile({ ...callisto, seed: 7 })).not.toEqual(a);
    for (const height of a) {
      expect(Number.isFinite(height)).toBe(true);
      expect(Math.abs(height)).toBeLessThanOrEqual(callisto.reliefM);
    }
  });

  it("cuts bowls into saturated terrain but leaves resurfaced plains smooth", () => {
    const roughness = (heights: number[]) => {
      let sum = 0;
      for (let i = 1; i < heights.length; i++) sum += Math.abs(heights[i] - heights[i - 1]);
      return sum / (heights.length - 1);
    };
    const cratered = profile(callisto);
    const plains = profile({ ...callisto, craterDensity: 0 });
    expect(roughness(cratered)).toBeGreaterThan(roughness(plains) * 3);
    // Bowls go below the local mean, as impact craters do.
    expect(Math.min(...cratered)).toBeLessThan(-200);
  });

  it("scales relief and landform size with the body", () => {
    const bennu = reliefScaleFor(0.245), eros = reliefScaleFor(8.4), mimas = reliefScaleFor(198);
    expect(bennu.reliefM).toBeGreaterThan(20);
    expect(bennu.reliefM).toBeLessThan(60);
    expect(eros.reliefM).toBeGreaterThan(800);
    expect(eros.reliefM).toBeLessThan(1600);
    // Mimas's Herschel crater is ~10 km deep: relief saturates at the 8 km bound.
    expect(mimas.reliefM).toBe(8000);
    expect(bennu.featureScaleM).toBeLessThan(eros.featureScaleM);
    expect(craterDensityFor({ id: "io", category: "Natural satellite" })).toBe(0);
    expect(craterDensityFor({ id: "callisto", category: "Natural satellite" })).toBe(1);
    expect(craterDensityFor({ id: "tempel-1", category: "Periodic comet" })).toBeLessThan(0.5);
  });
});

describe("landing environments for every solid world", () => {
  it("synthesizes an airless environment from measured appearance", () => {
    const himalia = environmentFor("himalia");
    expect(himalia?.mode).toBe("surface");
    expect(himalia?.skyColor).toBe("#000000");
    expect(himalia?.hazeHeightM).toBe(0);
    expect(himalia?.nightSkyTransmission).toBe(1);
    expect(himalia?.description).toContain("Jupiter");
    // Himalia's measured albedo is 0.04: dark ground.
    const ground = parseInt(himalia!.groundColor.slice(1, 3), 16);
    expect(ground).toBeLessThan(110);
    expect(environmentFor("io")?.groundColor).toBe("#b09a64");
  });

  it("keeps Titan's hazy sky, the measured Moon path, and no ground on stars or giants", () => {
    const titan = environmentFor("titan");
    expect(titan?.hazeOpacity).toBe(1);
    expect(titan?.nightSkyTransmission).toBe(0);
    expect(environmentFor("moon")).toBeUndefined();
    expect(environmentFor("sun")).toBeUndefined();
    expect(environmentFor("iss")).toBeUndefined();
    expect(environmentFor("jupiter")?.mode).toBe("atmosphere");
  });
});
