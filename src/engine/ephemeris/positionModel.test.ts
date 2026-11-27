import { describe, expect, it } from "vitest";
import { objectById } from "../../data/catalog";
import { setBodySamples } from "./generatedEphemeris";
import { positionModelAt, withinPlanetaryEphemeris } from "./positionModel";

const at = (year: number) => Date.UTC(year, 5, 1);

describe("position model labels", () => {
  it("names the model in use and never calls a fallback a JPL position", () => {
    expect(positionModelAt(objectById.mars, at(2026))).toMatchObject({ kind: "ephemeris", caption: "JPL mean orbital elements" });
    expect(positionModelAt(objectById.mars, at(2300))).toMatchObject({ kind: "extrapolated" });
    // The Moon uses a lunar theory, not JPL.
    const moon = positionModelAt(objectById.moon, at(2026));
    expect(moon.caption).toMatch(/Meeus/);
    expect(moon.caption).not.toMatch(/JPL/);
    expect(positionModelAt(objectById.sun, at(2026)).kind).toBe("reference");
  });

  it("reports the fitted-element fallback while sampled Horizons positions are not loaded", () => {
    setBodySamples(null);
    // Io's model is its fitted elements; Himalia's is sampled Horizons positions.
    expect(positionModelAt(objectById.io, at(2026))).toMatchObject({ kind: "ephemeris", caption: "JPL-fitted orbital elements" });
    const status = positionModelAt(objectById.himalia!, at(2026));
    expect(status.kind).toBe("fallback");
    expect(status.caption).toMatch(/fallback/);
    expect(status.detail).toMatch(/not loaded/);
  });

  it("labels bodies without an ephemeris as modeled", () => {
    expect(positionModelAt(objectById.iss, at(2026))).toMatchObject({ kind: "modeled", caption: "Modeled circular orbit" });
  });

  it("knows the planetary elements' validity window", () => {
    expect(withinPlanetaryEphemeris(at(2026))).toBe(true);
    expect(withinPlanetaryEphemeris(at(2100))).toBe(false);
  });
});
