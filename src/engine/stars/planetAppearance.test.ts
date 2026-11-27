import { describe, expect, it } from "vitest";
import type { Exoplanet } from "../../data/stars/exoplanets";
import { describePlanet, equilibriumTemperature, planetLook, planetSize, radiusFromMass, rockDensityRatio } from "./planetAppearance";

const base: Exoplanet = {
  name: "Test b", semiMajorAxisCalculated: false, radiusCalculated: false, massKind: "mass", equilibriumCalculated: false,
  method: "Radial Velocity", transiting: false, controversial: false,
};

describe("exoplanet size and illustrative class", () => {
  it("uses the Chen & Kipping mass–radius relation, continuous across regimes", () => {
    expect(radiusFromMass(1)).toBeCloseTo(1, 6);
    expect(radiusFromMass(2.039)).toBeCloseTo(radiusFromMass(2.041), 1);
    expect(radiusFromMass(131.9)).toBeCloseTo(radiusFromMass(132.1), 0);
    // Jupiter (318 M⊕) comes out near its 11.2 R⊕.
    expect(radiusFromMass(318)).toBeGreaterThan(10);
    expect(radiusFromMass(318)).toBeLessThan(14);
    expect(planetSize({ ...base, massEarth: 5 }).from).toBe("mass-relation");
    expect(planetSize({ ...base, radiusEarth: 2, radiusCalculated: true })).toEqual({ radiusEarth: 2, from: "archive-calculated" });
    expect(planetSize(base).from).toBe("unknown");
  });

  it("recovers Earth's equilibrium temperature from a Sun-like host at 1 AU", () => {
    expect(equilibriumTemperature(base, { temperatureK: 5772, radiusSolar: 1 }, 1)).toBeCloseTo(278.6, -0.5);
    expect(equilibriumTemperature({ ...base, insolationEarth: 1 }, {})).toBeCloseTo(278.6, 6);
    expect(equilibriumTemperature({ ...base, equilibriumK: 400 }, {})).toBe(400);
  });

  it("classes planets by the radius valley, Neptune and giant sizes, and giant temperature", () => {
    expect(planetLook(1, 250).kind).toBe("rocky");
    expect(planetLook(1.3, 1800).kind).toBe("hot-rocky");
    expect(planetLook(1.3, 1800).emission[0]).toBeGreaterThan(0);
    expect(planetLook(2.5, 400).kind).toBe("sub-neptune");
    expect(planetLook(5, 300).kind).toBe("neptune");
    expect(planetLook(11, 120).label).toMatch(/ammonia/);
    expect(planetLook(14, 1300).label).toMatch(/alkali/);
    expect(planetLook(14, 2000).emission[0]).toBeGreaterThan(planetLook(14, 1000).emission[0]);
    expect(planetLook(12, 1000, 5000).label).toMatch(/brown-dwarf/);
  });

  it("counts dense planets above the radius valley as rocky only with a measured mass and radius", () => {
    expect(rockDensityRatio({ ...base, massEarth: 1, radiusEarth: 1 })).toBeCloseTo(1, 6);
    // 55 Cnc e: 8 M⊕ in 1.88 R⊕ is ~80% of Earth-like rock density at that mass.
    const dense = { ...base, massEarth: 8, radiusEarth: 1.88, equilibriumK: 2000 };
    expect(describePlanet(dense, {}).look.kind).toBe("hot-rocky");
    // The same radius with a minimum mass, a calculated radius or a low density stays a sub-Neptune.
    expect(describePlanet({ ...dense, massKind: "minimum" }, {}).look.kind).toBe("sub-neptune");
    expect(describePlanet({ ...dense, radiusCalculated: true }, {}).look.kind).toBe("sub-neptune");
    expect(describePlanet({ ...dense, massEarth: 4 }, {}).look.kind).toBe("sub-neptune");
  });
});
