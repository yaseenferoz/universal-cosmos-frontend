import { describe, expect, it } from "vitest";
import { atmosphereOpacity, nightEmissionWeight } from "./PlanetShaders";

describe("planetary lighting boundaries", () => {
  it("suppresses city-light emission on the illuminated hemisphere", () => {
    expect(nightEmissionWeight(1)).toBe(0);
    expect(nightEmissionWeight(0.1)).toBe(0);
    expect(nightEmissionWeight(-1)).toBe(1);
    expect(nightEmissionWeight(-0.03)).toBeCloseTo(0.5);
  });
  it("keeps the atmosphere dark on the night limb and transparent at disk center", () => {
    expect(atmosphereOpacity(0, -1, 0)).toBe(0);
    expect(atmosphereOpacity(1, 1, 1)).toBe(0);
    expect(atmosphereOpacity(0, 0.5, -1)).toBeGreaterThan(0);
    expect(atmosphereOpacity(0, 1, 1)).toBeLessThanOrEqual(0.28);
  });
});
