import { describe, expect, it } from "vitest";
import {
  adaptExposureEv,
  angularDiameterRad,
  ASTRONOMICAL_UNIT_KM,
  MIN_SOLAR_DISTANCE_AU,
  NOMINAL_SOLAR_RADIUS_KM,
  relativeSolarIrradiance,
  solarAngularDiameterRad,
  solarIrradianceWm2,
  solarVisibility,
  visibleDiskFraction,
} from "./solarMath";

describe("nominal exterior solar model", () => {
  it.each([
    [0.387, 1.3770468212329203, 9087.32781817332],
    [1, 0.5329062144923113, 1361],
    [1.524, 0.34967527602832627, 585.9872830856772],
    [5.2, 0.10248160859053705, 50.33284023668639],
    [30, 0.017763476525601923, 1.5122222222222221],
  ])("preserves physical size and irradiance at %s au", (distance, diameter, irradiance) => {
    expect(solarAngularDiameterRad(distance * ASTRONOMICAL_UNIT_KM) * 180 / Math.PI).toBeCloseTo(diameter, 10);
    expect(solarIrradianceWm2(distance)).toBeCloseTo(irradiance, 9);
  });

  it("retains inverse-square brightening inside 0.1 au up to the photosphere", () => {
    expect(relativeSolarIrradiance(2)).toBe(0.25);
    expect(relativeSolarIrradiance(0.05)).toBe(400);
    expect(relativeSolarIrradiance(0.01)).toBe(10_000);
    expect(relativeSolarIrradiance(MIN_SOLAR_DISTANCE_AU / 2)).toBe(relativeSolarIrradiance(MIN_SOLAR_DISTANCE_AU));
    expect(solarAngularDiameterRad(NOMINAL_SOLAR_RADIUS_KM)).toBe(Math.PI);
    expect(solarAngularDiameterRad(NOMINAL_SOLAR_RADIUS_KM / 2)).toBe(Math.PI);
  });

  it("uses a sphere's tangent limb during close approach", () => {
    // At two radii from the center, the tangent triangle has a 30-degree half-angle.
    expect(angularDiameterRad(NOMINAL_SOLAR_RADIUS_KM, NOMINAL_SOLAR_RADIUS_KM * 2)).toBeCloseTo(Math.PI / 3, 12);
  });

  it("preserves apparent size when radius and distance use the same render-unit scale", () => {
    for (const distanceAu of [0.387, 1, 1.524, 5.2, 30]) {
      const distanceKm = distanceAu * ASTRONOMICAL_UNIT_KM;
      const physical = angularDiameterRad(NOMINAL_SOLAR_RADIUS_KM, distanceKm);
      for (const kmPerUnit of [1, 10_000, 1_000_000]) {
        expect(angularDiameterRad(NOMINAL_SOLAR_RADIUS_KM / kmPerUnit, distanceKm / kmPerUnit)).toBeCloseTo(physical, 14);
      }
    }
  });

  it.each([0, -1, NaN, Infinity, -Infinity])("rejects invalid exterior distances %s without nonfinite output", (value) => {
    expect(relativeSolarIrradiance(value)).toBe(0);
    expect(solarIrradianceWm2(value)).toBe(0);
    expect(solarAngularDiameterRad(value)).toBe(0);
    expect(angularDiameterRad(value, 1)).toBe(0);
  });

  it("stays finite for extremely small and large positive distances", () => {
    expect(Number.isFinite(solarIrradianceWm2(Number.MIN_VALUE))).toBe(true);
    expect(solarIrradianceWm2(Number.MAX_VALUE)).toBe(0);
    expect(angularDiameterRad(1, Number.MIN_VALUE)).toBe(Math.PI);
  });
});

describe("finite angular disks", () => {
  it("distinguishes clear, total, and annular occultation", () => {
    expect(visibleDiskFraction(0.01, 0.01, 0.021)).toBe(1);
    expect(visibleDiskFraction(0.01, 0.02, 0.005)).toBe(0);
    expect(visibleDiskFraction(0.01, 0.005, 0)).toBe(0.75);
  });

  it("matches the known equal-circle lens area", () => {
    const visible = 1 / 3 + Math.sqrt(3) / (2 * Math.PI);
    expect(visibleDiskFraction(0.01, 0.01, 0.01)).toBeCloseTo(visible, 12);
  });

  it("is continuous at contact and stable for a very large occulting limb", () => {
    expect(visibleDiskFraction(0.01, 0.01, 0.02)).toBe(1);
    expect(visibleDiskFraction(0.01, 0.01, 0.02 - 1e-9)).toBeGreaterThan(0.999999);
    expect(visibleDiskFraction(0.01, 0.02, 0.01 + 1e-9)).toBeLessThan(0.000001);
    expect(visibleDiskFraction(1e-14, 1, 1)).toBeCloseTo(0.5, 12);
  });

  it.each([
    [NaN, 0.01, 0], [0.01, Infinity, 0], [0.01, 0.01, -1],
    [0, 0.01, 0], [1e308, 1e308, 1e308],
  ])("fails open for invalid angular input %s/%s/%s", (sun, occulter, separation) => {
    expect(visibleDiskFraction(sun, occulter, separation)).toBe(1);
  });
});

describe("observer-specific solar visibility", () => {
  const observer = { x: 0, y: 0, z: 0 };
  const sun = { x: 0, y: 0, z: 1000 };
  const foreground = { positionKm: { x: 0, y: 0, z: 500 }, radiusKm: 5 };

  it("computes total and annular eclipses from finite physical spheres", () => {
    expect(solarVisibility(observer, sun, [foreground], 10)).toBe(0);
    const annular = { ...foreground, radiusKm: 2.5 };
    const expected = 1 - (Math.asin(2.5 / 500) / Math.asin(10 / 1000)) ** 2;
    expect(solarVisibility(observer, sun, [annular], 10)).toBeCloseTo(expected, 12);
  });

  it("rejects spheres behind the observer and beyond the solar surface", () => {
    const behindObserver = { positionKm: { x: 0, y: 0, z: -500 }, radiusKm: 5 };
    const beyondSun = { positionKm: { x: 0, y: 0, z: 2000 }, radiusKm: 20 };
    const insideSun = { positionKm: { x: 0, y: 0, z: 1005 }, radiusKm: 2 };
    expect(solarVisibility(observer, sun, [behindObserver, beyondSun, insideSun], 10)).toBe(1);
  });

  it("keeps a camera eclipse separate from illumination at another observer", () => {
    expect(solarVisibility(observer, sun, [foreground], 10)).toBe(0);
    expect(solarVisibility({ x: 100, y: 0, z: 0 }, sun, [foreground], 10)).toBe(1);
  });

  it("preserves occultation after a large common coordinate translation", () => {
    const offset = { x: 4e9, y: -8e9, z: 3e9 };
    expect(solarVisibility(offset, { ...offset, z: offset.z + 1000 }, [
      { positionKm: { ...offset, z: offset.z + 500 }, radiusKm: 5 },
    ], 10)).toBe(0);
  });

  it("keeps a partial eclipse unchanged when the entire direction frame rotates", () => {
    const partial = { positionKm: { x: 5, y: 0, z: 500 }, radiusKm: 5 };
    const expected = solarVisibility(observer, sun, [partial], 10);
    for (const angle of [Math.PI / 2, 1.13, -Math.PI / 4]) {
      const rotate = ({ x, y, z }: { x: number; y: number; z: number }) => ({
        x: x * Math.cos(angle) + z * Math.sin(angle),
        y,
        z: -x * Math.sin(angle) + z * Math.cos(angle),
      });
      expect(solarVisibility(rotate(observer), rotate(sun), [
        { positionKm: rotate(partial.positionKm), radiusKm: partial.radiusKm },
      ], 10)).toBeCloseTo(expected, 12);
    }
  });

  it("keeps sampled eclipse unions stable across differently oriented coordinate frames", () => {
    const blockers = [
      { positionKm: { x: -3, y: 1, z: 500 }, radiusKm: 2.5 },
      { positionKm: { x: 3, y: -1, z: 500 }, radiusKm: 2.5 },
    ];
    const expected = solarVisibility(observer, sun, blockers, 10);
    // Cyclic axis rotation also crosses the sampler's choice of tangent basis.
    const rotate = ({ x, y, z }: { x: number; y: number; z: number }) => ({ x: z, y: x, z: y });
    const actual = solarVisibility(rotate(observer), rotate(sun), blockers.map((blocker) => ({
      positionKm: rotate(blocker.positionKm), radiusKm: blocker.radiusKm,
    })), 10);
    expect(expected).toBeGreaterThan(0.4);
    expect(expected).toBeLessThan(0.6);
    // Finite rays approximate a union, so rotation invariance has sampling tolerance.
    expect(Math.abs(actual - expected)).toBeLessThan(0.01);
  });

  it("unions duplicate blockers rather than multiplying obscured fractions", () => {
    const partial = { positionKm: { x: 5, y: 0, z: 500 }, radiusKm: 5 };
    const single = solarVisibility(observer, sun, [partial], 10);
    const duplicate = solarVisibility(observer, sun, [partial, partial], 10);
    expect(Math.abs(duplicate - single)).toBeLessThan(0.01);
    expect(duplicate).toBeGreaterThan(single * single + 0.1);
  });

  it("combines disjoint transit areas without counting a clear gap as shadow", () => {
    const left = { positionKm: { x: -3, y: 0, z: 500 }, radiusKm: 1 };
    const right = { positionKm: { x: 3, y: 0, z: 500 }, radiusKm: 1 };
    // Each apparent radius is about 1/5 of the solar radius: 2 * 0.2² blocked.
    expect(Math.abs(solarVisibility(observer, sun, [left, right], 10) - 0.92)).toBeLessThan(0.01);
  });

  it("uses spherical-cone area and actual depth for a near-Sun observer", () => {
    const closeSun = { x: 0, y: 0, z: 20 };
    const transit = { positionKm: { x: 0, y: 0, z: 10 }, radiusKm: 2 };
    const expected = 1 - (1 - Math.sqrt(1 - 0.2 ** 2)) / (1 - Math.sqrt(1 - 0.5 ** 2));
    expect(Math.abs(solarVisibility(observer, closeSun, [transit], 10) - expected)).toBeLessThan(1 / 512);
    expect(solarVisibility(observer, closeSun, [
      { positionKm: { x: 0, y: 0, z: 30 }, radiusKm: 10 },
    ], 10)).toBe(1);
  });

  it("handles an enclosed observer and invalid source data explicitly", () => {
    expect(solarVisibility(observer, sun, [{ positionKm: observer, radiusKm: 1 }], 10)).toBe(0);
    expect(solarVisibility(observer, sun, [{ positionKm: { x: NaN, y: 0, z: 5 }, radiusKm: 2 }], 10)).toBe(1);
    expect(solarVisibility({ x: Infinity, y: 0, z: 0 }, sun, [foreground], 10)).toBe(1);
    expect(solarVisibility(observer, observer, [foreground], 10)).toBe(1);
  });
});

describe("time-based exposure adaptation", () => {
  it("gives the same adaptation at 30 and 60 frames per second", () => {
    const evolve = (fps: number): number => {
      let ev = 0;
      for (let frame = 0; frame < 2 * fps; frame += 1) ev = adaptExposureEv(ev, -16, 1 / fps);
      return ev;
    };
    expect(evolve(30)).toBeCloseTo(evolve(60), 12);
    expect(evolve(60)).toBeCloseTo(adaptExposureEv(0, -16, 2), 12);
  });

  it("responds faster to bright light without overshooting", () => {
    const brightening = adaptExposureEv(0, 4, 0.25);
    const darkening = adaptExposureEv(0, -4, 0.25);
    expect(brightening).toBeGreaterThan(0);
    expect(brightening).toBeLessThan(-darkening);
    expect(darkening).toBeGreaterThan(-4);
    expect(adaptExposureEv(0, -4, 1e6)).toBe(-4);
    expect(adaptExposureEv(0, 4, 1, 0)).toBe(4);
  });

  it("does not propagate invalid timing or EV inputs", () => {
    expect(adaptExposureEv(2, 4, NaN)).toBe(2);
    expect(adaptExposureEv(2, 4, -1)).toBe(2);
    expect(adaptExposureEv(2, Infinity, 1)).toBe(2);
    expect(Number.isFinite(adaptExposureEv(NaN, 4, 1))).toBe(true);
    expect(Number.isFinite(adaptExposureEv(Number.MAX_VALUE, -Number.MAX_VALUE, 1))).toBe(true);
  });
});
