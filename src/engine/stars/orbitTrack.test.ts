import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { solarPlanetarySystem } from "../../data/stars/solarSystemPlanets";
import { J2000_JD, orbitFrame, resolveOrbit } from "./keplerOrbit";
import { keplerTrack, solarPlanetTrack } from "./orbitTrack";

describe("orbit tracks", () => {
  it("places our planets with JPL's approximate elements in the stars' heliocentric axes", () => {
    const earth = solarPlanetTrack("earth", 365.256, J2000_JD)!;
    // Early January is near perihelion: 0.983 AU.
    expect(earth.positionAu(J2000_JD, new Vector3()).length()).toBeCloseTo(0.983, 2);
    expect(earth.semiMajorAxisAu).toBeCloseTo(1, 2);
    expect(earth.eccentricity).toBeCloseTo(0.0167, 2);
    // Engine +Y is ecliptic north; prograde orbits have their angular momentum there.
    expect(earth.normal(new Vector3()).y).toBeGreaterThan(0.9999);
    const mars = solarPlanetTrack("mars", 686.98, J2000_JD)!;
    expect(mars.semiMajorAxisAu).toBeCloseTo(1.524, 2);
    expect(mars.normal(new Vector3()).angleTo(new Vector3(0, 1, 0)) * 180 / Math.PI).toBeCloseTo(1.85, 1);
    expect(solarPlanetTrack("not-a-planet", 100, J2000_JD)).toBeNull();
  });

  it("wraps exoplanet elements with the same interface", () => {
    const elements = resolveOrbit({
      name: "Test b", periodDays: 10, semiMajorAxisAu: 0.1, eccentricity: 0.2, inclinationDeg: 90, semiMajorAxisCalculated: false,
      radiusCalculated: false, massKind: "mass", equilibriumCalculated: false, method: "Transit", transiting: true, controversial: false,
    }, 1)!;
    const track = keplerTrack(elements, orbitFrame(new Vector3(3, 0, 4)));
    expect(track.positionAu(J2000_JD, new Vector3()).length()).toBeGreaterThanOrEqual(0.08 - 1e-9);
    expect(track.pathAu(32)).toHaveLength(96);
    expect(track.periodDays).toBe(10);
  });

  it("describes the Sun's eight planets for star mode from the catalogue", () => {
    const sun = solarPlanetarySystem();
    expect(sun.solarSystem).toBe(true);
    expect(sun.planets.map((p) => p.objectId)).toEqual(["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"]);
    const earth = sun.planets[2];
    expect(earth.radiusEarth).toBeCloseTo(1, 2);
    expect(earth.massEarth).toBeCloseTo(1, 2);
    expect(earth.semiMajorAxisAu).toBeCloseTo(1, 2);
  });
});
