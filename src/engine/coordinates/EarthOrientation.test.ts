import { describe, expect, it } from "vitest";
import { Quaternion, SphereGeometry, Vector3 } from "three";
import { earthOrientationAt } from "./EarthOrientation";
import { geodeticToCartesian } from "../terrain/coordinates";

const DEG = Math.PI / 180;
const wrappedDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

describe("UTC Earth orientation", () => {
  it("matches J2000 Greenwich sidereal angle and the sidereal daily advance", () => {
    const noon = Date.UTC(2000, 0, 1, 12);
    const initial = earthOrientationAt(noon).spinRadians;
    expect(initial / DEG).toBeCloseTo(280.4606, 3);
    const sixHours = earthOrientationAt(noon + 6 * 3_600_000).spinRadians;
    expect(wrappedDifference(sixHours, initial) / DEG).toBeCloseTo(90.2464, 3);
    const tomorrow = earthOrientationAt(noon + 86_400_000).spinRadians;
    expect(wrappedDifference(tomorrow, initial) / DEG).toBeCloseTo(0.9856, 3);
  });

  it("keeps noon near Greenwich and moves the subsolar longitude west with UTC", () => {
    const noon = earthOrientationAt(Date.UTC(2026, 10, 19, 12));
    // November's equation of time puts apparent solar noon before 12:00 UTC.
    expect(noon.subsolarLongitudeDeg).toBeGreaterThan(-5);
    expect(noon.subsolarLongitudeDeg).toBeLessThan(-2);
    const evening = earthOrientationAt(Date.UTC(2026, 10, 19, 18));
    expect(evening.subsolarLongitudeDeg - noon.subsolarLongitudeDeg).toBeCloseTo(-90, 0);
    expect(noon.subsolarLatitudeDeg).toBeGreaterThan(-21);
    expect(noon.subsolarLatitudeDeg).toBeLessThan(-18);
  });

  it("follows equinox and solstice declinations instead of a fixed model season", () => {
    expect(earthOrientationAt(Date.UTC(2026, 2, 20, 15)).subsolarLatitudeDeg).toBeCloseTo(0, 1);
    expect(earthOrientationAt(Date.UTC(2026, 5, 21, 9)).subsolarLatitudeDeg).toBeCloseTo(23.44, 1);
    expect(earthOrientationAt(Date.UTC(2026, 11, 21, 21)).subsolarLatitudeDeg).toBeCloseTo(-23.44, 1);
  });

  it("maps the geographic subsolar point to the scene Sun in any model direction", () => {
    for (const utc of [Date.UTC(1990, 0, 1), Date.UTC(2026, 5, 21), Date.UTC(2026, 11, 21)]) {
      for (const sun of [new Vector3(1, 0, 0), new Vector3(-3, 0, 7), new Vector3(2, 1, -4)]) {
        sun.normalize();
        const orientation = earthOrientationAt(utc, sun);
        const rotation = orientation.poleRotation.clone().multiply(
          new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), orientation.spinRadians),
        );
        const subsolar = geodeticToCartesian(orientation.subsolarLatitudeDeg, orientation.subsolarLongitudeDeg, 0, 1);
        expect(subsolar.applyQuaternion(rotation).distanceTo(sun)).toBeLessThan(1e-10);
        // Geographic midnight must face away from the Sun, also for surface sessions.
        expect(subsolar.negate().dot(sun)).toBeCloseTo(-1, 10);
      }
    }
  });

  it("registers equirectangular Greenwich and east longitude to the sphere UVs", () => {
    const sphere = new SphereGeometry(1, 8, 4);
    const position = sphere.getAttribute("position"), uv = sphere.getAttribute("uv");
    for (const [index, longitude] of [[22, 0], [24, 90]]) {
      expect(uv.getX(index)).toBeCloseTo(0.5 + longitude / 360);
      const expected = geodeticToCartesian(0, longitude, 0, 1);
      expect(new Vector3().fromBufferAttribute(position, index).distanceTo(expected)).toBeLessThan(1e-6);
    }
    sphere.dispose();
  });

  it("stays continuous across UTC midnight and rejects invalid time/direction", () => {
    const midnight = Date.UTC(2026, 10, 20);
    const a = earthOrientationAt(midnight - 1), b = earthOrientationAt(midnight + 1);
    expect(Math.abs(wrappedDifference(a.spinRadians, b.spinRadians))).toBeLessThan(1e-5);
    expect(Math.abs(a.subsolarLongitudeDeg - b.subsolarLongitudeDeg)).toBeLessThan(0.001);
    expect(() => earthOrientationAt(NaN)).toThrow(RangeError);
    expect(() => earthOrientationAt(midnight, new Vector3())).toThrow(RangeError);
  });
});
