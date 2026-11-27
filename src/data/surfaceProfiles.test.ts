import { describe, expect, it } from "vitest";
import { hexToLinear, resolvePaletteColor, surfaceKindFor, surfaceProfileFor } from "./surfaceProfiles";
import { objectById } from "./catalog";

describe("landing surface classes from imaged geology", () => {
  it("assigns each explored world its observed surface type", () => {
    const expected: Record<string, string> = {
      bennu: "rubble", ryugu: "rubble", itokawa: "rubble", eros: "regolith", vesta: "regolith",
      europa: "ice-ridged", enceladus: "ice-ridged", ganymede: "ice-grooved", callisto: "dark-lag",
      io: "volcanic", titan: "pebble", pluto: "volatile-ice", triton: "cantaloupe",
      "churyumov-gerasimenko": "comet", mimas: "ice-cratered", himalia: "regolith",
    };
    for (const [id, kind] of Object.entries(expected)) {
      const object = objectById[id];
      expect(object, id).toBeDefined();
      expect(surfaceKindFor(object!), id).toBe(kind);
      expect(surfaceProfileFor(id)?.kind, id).toBe(kind);
    }
  });

  it("leaves dedicated terrains and non-solid bodies alone", () => {
    for (const id of ["moon", "mars", "earth", "venus", "mercury", "jupiter", "sun", "iss"])
      expect(surfaceProfileFor(id), id).toBeUndefined();
  });

  it("gives volcanic Io and Titan's plains no impact craters, and rubble piles big boulders", () => {
    expect(surfaceProfileFor("io")?.craterDensity).toBe(0);
    expect(surfaceProfileFor("titan")?.craterDensity).toBe(0);
    expect(surfaceProfileFor("callisto")?.craterDensity).toBe(1);
    const bennu = surfaceProfileFor("bennu")!.rocks, titan = surfaceProfileFor("titan")!.rocks;
    expect(bennu.maxWidthM).toBeGreaterThan(5);
    expect(titan.maxWidthM).toBeLessThan(0.2);
    // Huygens's pebbles were rounded; Bennu's boulders are angular.
    expect(titan.shapeExponent).toBeLessThan(bennu.shapeExponent);
  });

  it("resolves relative and absolute palette entries in linear light", () => {
    const ground = hexToLinear("#808080");
    expect(resolvePaletteColor("+25%", ground)[0]).toBeCloseTo(ground[0] * 1.25, 6);
    expect(resolvePaletteColor("-15%", ground)[1]).toBeCloseTo(ground[1] * 0.85, 6);
    expect(resolvePaletteColor("#ffffff", ground)).toEqual([1, 1, 1]);
    expect(hexToLinear("#000000")).toEqual([0, 0, 0]);
  });
});
