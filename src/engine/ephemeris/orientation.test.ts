import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { earthOrientationAt } from "../coordinates/EarthOrientation";
import { analyticRelativePositionKm } from "./analyticEphemeris";
import { hasIauRotation, iauBodyQuaternion, iauRotationAngles } from "./orientation";
import { utcToTdbMs } from "./time";

const DEG = Math.PI / 180;
const NORTH = new Vector3(0, 1, 0);

/** Engine-axes direction expressed as planetocentric latitude/east longitude (degrees). */
function bodyLatLon(id: string, utcMs: number, directionEngine: Vector3) {
  const q = iauBodyQuaternion(id, utcToTdbMs(utcMs));
  if (!q) throw new Error(`no IAU rotation for ${id}`);
  const local = directionEngine.clone().normalize().applyQuaternion(q.clone().invert());
  // Mesh axes: +Y north, +X prime meridian, -Z 90 deg east.
  return {
    lat: Math.asin(local.y) / DEG,
    lon: Math.atan2(-local.z, local.x) / DEG,
  };
}

function engineVector(id: string, utcMs: number): Vector3 {
  const p = analyticRelativePositionKm(id, utcMs);
  if (!p) throw new Error(`no position for ${id}`);
  return new Vector3(p.x, p.y, p.z);
}

/** Sub-solar latitude on a planet, from the heliocentric ephemeris and the IAU pole. */
function subsolarLatitude(id: string, utcMs: number): number {
  return bodyLatLon(id, utcMs, engineVector(id, utcMs).negate()).lat;
}

describe("IAU WGCCRE rotation models", () => {
  it("covers the catalog's planets and major moons", () => {
    for (const id of ["sun", "mercury", "venus", "moon", "mars", "jupiter", "io", "saturn", "titan",
      "uranus", "titania", "neptune", "triton", "pluto", "charon", "ceres", "vesta", "eros"])
      expect(hasIauRotation(id), id).toBe(true);
    expect(iauRotationAngles("not-a-body", 0)).toBeNull();
  });

  it("matches the engine's dedicated Earth model in pole and prime meridian", () => {
    for (const iso of ["2000-01-01T12:00:00Z", "2026-11-25T13:07:00Z", "2031-06-21T03:00:00Z"]) {
      const utc = Date.parse(iso);
      const iau = iauBodyQuaternion("earth", utcToTdbMs(utc));
      const earth = earthOrientationAt(utc);
      const reference = earth.poleRotation.clone()
        .multiply(new Quaternion().setFromAxisAngle(NORTH, earth.spinRadians));
      if (!iau) throw new Error("Earth IAU model missing");
      const pole = NORTH.clone().applyQuaternion(iau).angleTo(NORTH.clone().applyQuaternion(reference));
      const meridian = new Vector3(1, 0, 0).applyQuaternion(iau)
        .angleTo(new Vector3(1, 0, 0).applyQuaternion(reference));
      // The Earth model spins relative to the equinox of date; the engine's axes are
      // J2000, so precession (~0.014 deg/yr) separates them. A convention error would
      // show up as tens of degrees.
      expect(pole / DEG, iso).toBeLessThan(0.5);
      expect(meridian / DEG, iso).toBeLessThan(0.6);
    }
  });

  it("keeps the Moon's near side toward Earth within optical libration", () => {
    const start = Date.parse("2026-11-01T00:00:00Z");
    let maxLon = 0;
    for (let day = 0; day < 30; day += 1.5) {
      const utc = start + day * 86_400_000;
      const { lat, lon } = bodyLatLon("moon", utc, engineVector("moon", utc).negate());
      // Optical librations reach about 7.9 deg in longitude and 6.9 deg in latitude.
      expect(Math.abs(lon)).toBeLessThan(8.5);
      expect(Math.abs(lat)).toBeLessThan(7.5);
      maxLon = Math.max(maxLon, Math.abs(lon));
    }
    // It must actually librate, not be frozen at the sub-Earth point.
    expect(maxLon).toBeGreaterThan(3);
  });

  it("reproduces published equinoxes and solstices", () => {
    // Saturn equinoxes: 2009-08-11 and 2025-05-06 (Sun crosses the ring plane).
    expect(Math.abs(subsolarLatitude("saturn", Date.parse("2009-08-11T00:00:00Z")))).toBeLessThan(0.6);
    expect(Math.abs(subsolarLatitude("saturn", Date.parse("2025-05-06T00:00:00Z")))).toBeLessThan(0.6);
    // Uranus equinox 2007-12-07; in late 2026 the IAU north pole is sunlit (~+70 deg).
    expect(Math.abs(subsolarLatitude("uranus", Date.parse("2007-12-07T00:00:00Z")))).toBeLessThan(1.5);
    const uranus2026 = subsolarLatitude("uranus", Date.parse("2026-11-25T00:00:00Z"));
    expect(uranus2026).toBeGreaterThan(64);
    expect(uranus2026).toBeLessThan(76);
    // Mars Year 37 began (Ls 0) on 2022-12-26; its northern summer solstice (Ls 90,
    // sub-solar latitude +25.2 deg) followed 193 sols later, on 2023-07-12.
    expect(Math.abs(subsolarLatitude("mars", Date.parse("2022-12-26T00:00:00Z")))).toBeLessThan(0.6);
    expect(subsolarLatitude("mars", Date.parse("2023-07-12T12:00:00Z"))).toBeCloseTo(25.2, 0);
  });

  it("keeps Io's sub-Jupiter point near its prime meridian", () => {
    const start = Date.parse("2026-11-25T00:00:00Z");
    for (let hour = 0; hour < 48; hour += 6) {
      const utc = start + hour * 3_600_000;
      const { lat, lon } = bodyLatLon("io", utc, engineVector("io", utc).negate());
      expect(Math.abs(lon)).toBeLessThan(2);
      expect(Math.abs(lat)).toBeLessThan(1);
    }
  });
});
