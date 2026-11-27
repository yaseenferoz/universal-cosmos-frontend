import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import type { Exoplanet } from "../../data/stars/exoplanets";
import { julianDate, orbitFrame, orbitNormal, orbitPathAu, orbitPositionAu, resolveOrbit, solveKepler } from "./keplerOrbit";

function planet(overrides: Partial<Exoplanet>): Exoplanet {
  return {
    name: "Test b", semiMajorAxisCalculated: false, radiusCalculated: false, massKind: "mass", equilibriumCalculated: false,
    method: "Transit", transiting: false, controversial: false, ...overrides,
  };
}

// A host 12 pc away in an arbitrary direction (engine axes).
const host = new Vector3(12.046, 0.137, 3.062);
const frame = orbitFrame(host);

describe("Keplerian exoplanet orbits", () => {
  it("solves Kepler's equation across eccentricities", () => {
    for (const e of [0, 0.1, 0.5, 0.9, 0.97])
      for (const M of [-3, -1, 0.001, 0.5, 2, 3.1]) {
        const E = solveKepler(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
      }
  });

  it("builds a right-handed sky frame with z pointing back at the Sun", () => {
    expect(frame.z.dot(host.clone().normalize())).toBeCloseTo(-1, 12);
    expect(frame.x.dot(frame.z)).toBeCloseTo(0, 12);
    expect(new Vector3().crossVectors(frame.x, frame.y).dot(frame.z)).toBeCloseTo(1, 12);
  });

  it("puts a transiting planet in front of its star at the transit time and behind it half an orbit later", () => {
    const el = resolveOrbit(planet({ periodDays: 6.1, semiMajorAxisAu: 0.029, inclinationDeg: 89.8, conjunctionJd: 2457660.37, transiting: true }), 0.09)!;
    expect(el.phaseFrom).toBe("transit");
    const atTransit = orbitPositionAu(el, frame, 2457660.37);
    expect(atTransit.clone().normalize().dot(frame.z)).toBeGreaterThan(0.999);
    // Many orbits later the ephemeris still lands on a transit.
    expect(orbitPositionAu(el, frame, 2457660.37 + 6.1 * 500).normalize().dot(frame.z)).toBeGreaterThan(0.999);
    expect(orbitPositionAu(el, frame, 2457660.37 + 3.05).normalize().dot(frame.z)).toBeLessThan(-0.999);
  });

  it("keeps eccentric conjunctions on the line of sight and the distance within periastron/apastron", () => {
    const el = resolveOrbit(planet({ periodDays: 111.4, semiMajorAxisAu: 0.46, eccentricity: 0.93, periastronArgumentDeg: 300.8, inclinationDeg: 89.3, conjunctionJd: 2454424.857, transiting: true }), 1.1)!;
    const conjunction = orbitPositionAu(el, frame, 2454424.857);
    expect(conjunction.clone().normalize().dot(frame.z)).toBeGreaterThan(0.999);
    for (let day = 0; day < 111.4; day += 0.7) {
      const r = orbitPositionAu(el, frame, 2454424.857 + day).length();
      expect(r).toBeGreaterThanOrEqual(0.46 * 0.07 - 1e-9);
      expect(r).toBeLessThanOrEqual(0.46 * 1.93 + 1e-9);
    }
  });

  it("derives missing sizes and periods from Kepler's third law and flags assumptions", () => {
    const earthLike = resolveOrbit(planet({ periodDays: 365.25 }), 1)!;
    expect(earthLike.semiMajorAxisAu).toBeCloseTo(1, 6);
    expect(earthLike.semiMajorAxisFrom).toBe("kepler-law");
    expect(earthLike.inclinationFrom).toBe("assumed");
    expect(earthLike.phaseFrom).toBe("illustrative");
    expect(resolveOrbit(planet({ semiMajorAxisAu: 4 }), 1)!.periodDays).toBeCloseTo(8 * 365.25, 6);
    expect(resolveOrbit(planet({}), 1)).toBeNull();
  });

  it("draws an outline in the orbital plane, edge-on to us when the inclination is 90°", () => {
    const el = resolveOrbit(planet({ semiMajorAxisAu: 1, inclinationDeg: 90, eccentricity: 0.3 }), 1)!;
    const normal = orbitNormal(el, frame);
    expect(Math.abs(normal.dot(frame.z))).toBeLessThan(1e-9);
    const path = orbitPathAu(el, frame, 64);
    for (let i = 0; i < 64; i++) expect(new Vector3(path[i * 3], path[i * 3 + 1], path[i * 3 + 2]).dot(normal)).toBeCloseTo(0, 6); // float32 outline
    const faceOn = resolveOrbit(planet({ semiMajorAxisAu: 1, inclinationDeg: 0 }), 1)!;
    expect(orbitNormal(faceOn, frame).dot(frame.z)).toBeCloseTo(1, 9);
  });

  it("converts JavaScript time to Julian dates", () => {
    expect(julianDate(Date.UTC(2000, 0, 1, 12))).toBeCloseTo(2451545, 8);
  });
});
