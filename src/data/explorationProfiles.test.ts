import { describe, expect, it } from "vitest";
import { explorationProfile, explorationProfiles } from "./explorationProfiles";

describe("planetary exploration profiles", () => {
  it("covers every bundled catalog object", () => {
    expect(Object.keys(explorationProfiles).sort()).toEqual([
      "earth", "jupiter", "mars", "mercury", "moon", "neptune", "saturn", "sun", "uranus", "venus",
    ]);
  });

  it("permits only the measured Moon surface package today", () => {
    expect(explorationProfile("moon").modes.surface).toBe("available");
    expect(explorationProfile("mars").modes.surface).toBe("demonstration");
  });

  it("never classifies a star or giant as a solid-surface destination", () => {
    for (const id of ["sun", "jupiter", "saturn", "uranus", "neptune"] as const)
      expect(explorationProfile(id).modes.surface).toBe("not-supported");
  });
});
