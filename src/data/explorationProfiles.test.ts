import { describe, expect, it } from "vitest";
import { explorationProfile, explorationProfiles } from "./explorationProfiles";
import { celestialObjects } from "./catalog";

describe("planetary exploration profiles", () => {
  it("covers every bundled catalog object", () => {
    expect(Object.keys(explorationProfiles).sort()).toEqual(celestialObjects.map(({ id }) => id).sort());
  });

  it("permits only the measured Moon surface package today", () => {
    expect(explorationProfile("moon").modes.surface).toBe("available");
    expect(explorationProfile("mars").modes.surface).toBe("demonstration");
  });

  it("never classifies a star or giant as a solid-surface destination", () => {
    for (const id of ["sun", "jupiter", "saturn", "uranus", "neptune"] as const)
      expect(explorationProfile(id).modes.surface).toBe("not-supported");
  });

  it("does not claim local environments for orbit-only satellites", () => {
    for (const body of celestialObjects.filter(body => body.parentId && body.parentId !== "sun" && body.id !== "moon")) {
      const profile = explorationProfile(body.id);
      expect(profile.modes.surface).toBe("planned");
      expect(profile.modes.atmospheric).toBe("not-supported");
      expect(profile.sky.reconstruction).toBe("unavailable");
    }
    expect(explorationProfile("titan").classification).toBe("ATMOSPHERIC_SOLID");
    expect(explorationProfile("triton").classification).toBe("ATMOSPHERIC_SOLID");
  });
});
