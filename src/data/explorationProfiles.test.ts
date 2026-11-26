import { describe, expect, it } from "vitest";
import { explorationProfile, explorationProfiles } from "./explorationProfiles";
import { celestialObjects } from "./catalog";

describe("planetary exploration profiles", () => {
  it("covers every catalog object: curated profiles plus an orbit-only fallback for generated bodies", () => {
    for (const { id } of celestialObjects) expect(explorationProfile(id).objectId).toBe(id);
    expect(Object.keys(explorationProfiles).length).toBeGreaterThanOrEqual(33);
    expect(explorationProfile("himalia").modes.orbital).toBe("available");
  });

  it("permits only the measured Moon surface package today", () => {
    expect(explorationProfile("moon").modes.surface).toBe("available");
    expect(explorationProfile("mars").modes.surface).toBe("demonstration");
  });

  it("never classifies a star or giant as a solid-surface destination", () => {
    for (const id of ["sun", "jupiter", "saturn", "uranus", "neptune", "iss"] as const)
      expect(explorationProfile(id).modes.surface).toBe("not-supported");
  });

  it("offers every solid satellite a labelled demonstration descent, never a measured one", () => {
    for (const body of celestialObjects.filter(body => body.category === "Natural satellite" && body.id !== "moon")) {
      const profile = explorationProfile(body.id);
      expect(profile.modes.surface, body.id).toBe("demonstration");
      expect(profile.modes.atmospheric, body.id).toBe("not-supported");
      expect(profile.terrain.reconstruction, body.id).toBe("illustrative");
      expect(profile.sky.reconstruction, body.id).toBe("illustrative");
    }
    expect(explorationProfile("titan").classification).toBe("ATMOSPHERIC_SOLID");
    expect(explorationProfile("triton").classification).toBe("ATMOSPHERIC_SOLID");
  });
});
