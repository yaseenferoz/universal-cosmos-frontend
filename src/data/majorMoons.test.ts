import { describe, expect, it } from "vitest";
import { majorMoons } from "./majorMoons";
import { objectById } from "./catalog";
import { imageryFor } from "./imagery";
import { explorationProfile } from "./explorationProfiles";

describe("additional major moon references", () => {
  it("keeps physical quantities consistent and destinations complete", () => {
    expect(new Set(majorMoons.map(({ id }) => id)).size).toBe(9);
    for (const moon of majorMoons) {
      expect(objectById[moon.parentId!]).toBeDefined();
      expect(moon.semiMajorAxisKm).toBeGreaterThan(objectById[moon.parentId!]!.radiusKm + moon.radiusKm);
      expect(moon.gravityMs2).toBeCloseTo(6.67430e-11 * moon.massKg / (moon.radiusKm * 1000) ** 2, 10);
      expect(moon.rotationPeriodHours / 24).toBeCloseTo(moon.orbitalPeriodDays, 10);
      // Cassini maps are installed for Saturn's mid-size moons; Uranus's still lack one.
      const imagery = imageryFor(moon.id);
      if (moon.parentId === "saturn") {
        expect(imagery.surface?.attribution, moon.id).toMatch(/NASA\/JPL/);
        expect(imagery.surface?.sourceUrl, moon.id).toMatch(/^https:\/\/photojournal\.jpl\.nasa\.gov\//);
      } else expect(imagery.surface, moon.id).toBeUndefined();
      expect(imagery.missing.length).toBeGreaterThan(0);
      expect(explorationProfile(moon.id).modes).toMatchObject({ orbital: "available", surface: "demonstration" });
    }
  });
});
