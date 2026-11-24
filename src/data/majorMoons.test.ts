import { describe, expect, it } from "vitest";
import { majorMoons } from "./majorMoons";
import { objectById } from "./catalog";
import { imageryById } from "./imagery";
import { explorationProfiles } from "./explorationProfiles";

describe("additional major moon references", () => {
  it("keeps physical quantities consistent and destinations complete", () => {
    expect(new Set(majorMoons.map(({ id }) => id)).size).toBe(9);
    for (const moon of majorMoons) {
      expect(objectById[moon.parentId!]).toBeDefined();
      expect(moon.semiMajorAxisKm).toBeGreaterThan(objectById[moon.parentId!].radiusKm + moon.radiusKm);
      expect(moon.gravityMs2).toBeCloseTo(6.67430e-11 * moon.massKg / (moon.radiusKm * 1000) ** 2, 10);
      expect(moon.rotationPeriodHours / 24).toBeCloseTo(moon.orbitalPeriodDays, 10);
      expect(imageryById[moon.id].surface).toBeUndefined();
      expect(imageryById[moon.id].missing.length).toBeGreaterThan(0);
      expect(explorationProfiles[moon.id].modes).toMatchObject({ orbital: "available", surface: "planned" });
    }
  });
});
