import { describe, expect, it } from "vitest";
import type { ObjectId } from "../../types/celestial";
import type { Cartesian } from "../coordinates/CoordinateSystem";
import {
  analyticRelativePositionKm,
  eclipticRelativeKm,
  ephemerisCoverage,
  isWithinCoverage,
} from "./analyticEphemeris";
import { HORIZONS_REFERENCE } from "./horizonsFixtures";
import { eclipticToEngine, solveKepler } from "./kepler";
import { meeusMoonOfDate } from "./moon";

const tdb = (date: string) => Date.parse(`${date}T00:00:00Z`);
const angleDeg = (a: Cartesian, b: readonly number[]) => {
  const dot = a.x * b[0] + a.y * b[1] + a.z * b[2];
  const cos = dot / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b[0], b[1], b[2]));
  return (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
};
const radialError = (a: Cartesian, b: readonly number[]) =>
  Math.abs(Math.hypot(a.x, a.y, a.z) / Math.hypot(b[0], b[1], b[2]) - 1);

/**
 * Tolerances follow the published model accuracy (Standish Table 1 worst case
 * ≈ 600″ for Saturn; truncated ELP ≈ 10″), with margin for the barycenter split.
 */
const ANGULAR_TOLERANCE_DEG: Partial<Record<ObjectId, number>> = {
  mercury: 0.02, venus: 0.02, earth: 0.02, mars: 0.03,
  jupiter: 0.15, saturn: 0.25, uranus: 0.1, neptune: 0.05,
  moon: 0.02, ceres: 0.01, vesta: 0.01, bennu: 0.05,
};
const wrap360 = (deg: number) => ((deg % 360) + 360) % 360;

describe("analytic ephemeris against JPL Horizons", () => {
  for (const [date, bodies] of Object.entries(HORIZONS_REFERENCE)) {
    for (const [key, reference] of Object.entries(bodies)) {
      const id = key as ObjectId;
      it(`places ${id} within published accuracy on ${date}`, () => {
        const position = eclipticRelativeKm(id, tdb(date))!;
        expect(position).not.toBeNull();
        expect(angleDeg(position, reference)).toBeLessThan(ANGULAR_TOLERANCE_DEG[id]!);
        expect(radialError(position, reference)).toBeLessThan(0.003);
      });
    }
  }

  it("reproduces Meeus example 47.a for the Moon (1992-04-12 0h TD)", () => {
    const moon = meeusMoonOfDate(Date.UTC(1992, 3, 12));
    expect(wrap360(moon.longitudeOfDateDeg)).toBeCloseTo(133.162655, 3);
    // Table 47.B is truncated to 30 terms: allow 0.001° (3.6″).
    expect(Math.abs(moon.latitudeDeg - -3.229126)).toBeLessThan(0.001);
    expect(moon.distanceKm).toBeGreaterThan(368409.7 - 5);
    expect(moon.distanceKm).toBeLessThan(368409.7 + 5);
  });
});

describe("ephemeris frames and coverage", () => {
  it("maps ecliptic axes to the engine's +Y north, −Z east frame as a proper rotation", () => {
    const close = (a: Cartesian, b: Cartesian) =>
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBe(0);
    close(eclipticToEngine({ x: 1, y: 0, z: 0 }), { x: 1, y: 0, z: 0 });
    close(eclipticToEngine({ x: 0, y: 1, z: 0 }), { x: 0, y: 0, z: -1 });
    close(eclipticToEngine({ x: 0, y: 0, z: 1 }), { x: 0, y: 1, z: 0 });
  });
  it("moves planets prograde (counter-clockwise seen from engine +Y)", () => {
    const utc = Date.UTC(2026, 0, 1);
    const a = analyticRelativePositionKm("earth", utc)!;
    const b = analyticRelativePositionKm("earth", utc + 86_400_000)!;
    // (a × b)·ŷ > 0 for counter-clockwise motion about +Y.
    expect(a.z * b.x - a.x * b.z).toBeGreaterThan(0);
  });
  it("applies TT − UTC so the UTC instant differs from the TDB instant", () => {
    const utc = Date.UTC(2026, 0, 1);
    const fromUtc = analyticRelativePositionKm("moon", utc)!;
    const fromTdb = eclipticToEngine(eclipticRelativeKm("moon", utc)!);
    const shiftKm = Math.hypot(fromUtc.x - fromTdb.x, fromUtc.y - fromTdb.y, fromUtc.z - fromTdb.z);
    expect(shiftKm).toBeGreaterThan(40); // ~1 km/s × 69 s
    expect(shiftKm).toBeLessThan(120);
  });
  it("reports models and limits honestly, with no ephemeris for the modeled ISS orbit", () => {
    expect(ephemerisCoverage("jupiter")?.model).toBe("jpl-keplerian-approx");
    expect(ephemerisCoverage("moon")?.model).toBe("meeus-elp");
    expect(ephemerisCoverage("bennu")?.model).toBe("sbdb-two-body");
    expect(ephemerisCoverage("io")?.model).toBe("jpl-fitted-elements");
    expect(ephemerisCoverage("iss")).toBeNull();
    expect(analyticRelativePositionKm("iss", Date.UTC(2026, 0, 1))).toBeNull();
    expect(isWithinCoverage("mars", Date.UTC(2026, 0, 1))).toBe(true);
    expect(isWithinCoverage("mars", Date.UTC(2300, 0, 1))).toBe(false);
    expect(analyticRelativePositionKm("mars", Number.NaN)).toBeNull();
  });
  it("solves Kepler's equation at high eccentricity", () => {
    for (const e of [0, 0.2, 0.9, 0.99]) {
      for (const m of [-3, -0.1, 0.5, 3.1]) {
        const anomaly = solveKepler(m, e);
        expect(anomaly - e * Math.sin(anomaly)).toBeCloseTo(m, 12);
      }
    }
  });
});
