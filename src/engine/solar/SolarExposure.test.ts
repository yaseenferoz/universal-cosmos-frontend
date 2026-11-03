import { describe, expect, it } from "vitest";
import {
  meteredExposureEv,
  SolarExposure,
  solarTargetPixelWeight,
  type ExposureMeter,
} from "./SolarExposure";
import { solarDiameterPixels } from "./SunRenderer";
import { ASTRONOMICAL_UNIT_KM, NOMINAL_SOLAR_RADIUS_KM, SOLAR_DISPLAY_RADIANCE, SOLAR_LIMB_DARKENING } from "./solarMath";

const earth: ExposureMeter = {
  overview: false,
  surfaceIrradiance: 1,
  sunInView: false,
  solarVisibleFraction: 1,
  solarDiskSolidAngle: 0.000068,
  viewSolidAngle: 0.7,
  solarTarget: false,
  solarDiameterPixels: 8,
};
describe("analytic solar exposure", () => {
  it("compensates distant-world irradiance without changing geometry", () => {
    expect(meteredExposureEv(earth)).toBeCloseTo(0);
    expect(
      meteredExposureEv({ ...earth, surfaceIrradiance: 1 / 900 }),
    ).toBeCloseTo(Math.log2(900));
  });
  it("meters a visible solar target and recovers during total occultation", () => {
    const target = { ...earth, sunInView: true, solarTarget: true };
    expect(meteredExposureEv(target, true)).toBeLessThan(-12);
    expect(meteredExposureEv({ ...target, solarVisibleFraction: 0 }, true)).toBeCloseTo(0);
    expect(meteredExposureEv({ ...target, overview: true }, true)).toBe(0);
  });
  it("adapts smoothly, keeps manual EV fixed and doubles radiance per EV", () => {
    const exposure = new SolarExposure();
    exposure.solarFilter = true;
    const target = { ...earth, sunInView: true, solarTarget: true };
    const first = exposure.update(target, 0.016);
    expect(first).toBeGreaterThan(2 ** meteredExposureEv(target, true));
    expect(first).toBeLessThan(1);
    exposure.automatic = false;
    exposure.compensationEv = -12;
    expect(exposure.update(target, 1)).toBe(2 ** -12);
    exposure.compensationEv = -11;
    expect(exposure.update(earth, 1)).toBe(2 ** -11);
  });

  it("meters the existing unresolved optical signal instead of overfiltering a Neptune-distance Sun", () => {
    const diameter = solarDiameterPixels(
      NOMINAL_SOLAR_RADIUS_KM, 30.1809 * ASTRONOMICAL_UNIT_KM,
      800, 50 * Math.PI / 180,
    );
    const resolvedTarget = { ...earth, sunInView: true, solarTarget: true };
    const distantTarget = { ...resolvedTarget, surfaceIrradiance: 1 / 30.1809 ** 2, solarDiameterPixels: diameter };
    expect(diameter).toBeLessThan(0.3);
    expect(meteredExposureEv(distantTarget, true) - meteredExposureEv(resolvedTarget, true)).toBeGreaterThan(4);
    const opticalPeak = SOLAR_DISPLAY_RADIANCE * (1 - SOLAR_LIMB_DARKENING / 3)
      * Math.PI * (diameter / 2) ** 2 / (4 * 0.2543);
    expect(opticalPeak * 2 ** meteredExposureEv(distantTarget, true)).toBeCloseTo(2);
    expect(meteredExposureEv({ ...distantTarget, solarVisibleFraction: 0 }, true)).toBeCloseTo(Math.log2(30.1809 ** 2));
  });

  it("keeps unresolved target signal comparable across pixel densities and transitions continuously", () => {
    for (const diameter of [0.1, 0.25, 0.5]) {
      const meter = { ...earth, sunInView: true, solarTarget: true, surfaceIrradiance: 1 / 900, solarDiameterPixels: diameter };
      expect(SOLAR_DISPLAY_RADIANCE * solarTargetPixelWeight(diameter) * 2 ** meteredExposureEv(meter, true)).toBeCloseTo(2);
    }
    expect(solarTargetPixelWeight(1.5)).toBe(1);
    expect(solarTargetPixelWeight(8)).toBe(1);
    expect(solarTargetPixelWeight(1.5 - 1e-5)).toBeCloseTo(1, 8);
    expect(solarTargetPixelWeight(0.75 - 1e-5)).toBeCloseTo(solarTargetPixelWeight(0.75 + 1e-5), 4);
    expect(solarTargetPixelWeight(0)).toBe(0);
    expect(solarTargetPixelWeight(NaN)).toBe(0);
  });

  it("keeps ordinary Earth viewing within1EV of its irradiance even beside a bright Sun", () => {
    const sunny = { ...earth, sunInView: true, solarDiskSolidAngle: 0.2, solarDiameterPixels: 400 };
    expect(meteredExposureEv(sunny)).toBeCloseTo(-1);
    expect(meteredExposureEv({ ...sunny, solarTarget: true })).toBeCloseTo(-1);
    expect(meteredExposureEv(sunny, true)).toBeLessThan(-12);
    expect(meteredExposureEv({ ...sunny, sunInView: false }, true)).toBeCloseTo(0);
  });

  it("releases the solar filter on ordinary viewing without lifting the physical night-side lighting", () => {
    const exposure = new SolarExposure();
    const sun = { ...earth, sunInView: true, solarTarget: true };
    exposure.solarFilter = true;
    for (let frame = 0; frame < 300; frame++) exposure.update(sun, 1 / 60);
    expect(exposure.valueEv).toBeLessThan(-12);
    exposure.solarFilter = false;
    const first = exposure.update(earth, 1 / 60);
    expect(first).toBeGreaterThan(2 ** -13);
    expect(first).toBeLessThan(0.01);
    for (let frame = 0; frame < 60; frame++) exposure.update(earth, 1 / 60);
    expect(exposure.valueEv).toBeGreaterThan(-0.1);
    expect(exposure.valueEv).toBeLessThanOrEqual(0);
  });

  it("keeps ordinary Earth-to-Neptune exposure transitions smooth", () => {
    const exposure = new SolarExposure();
    exposure.update(earth, 1);
    const neptune = { ...earth, surfaceIrradiance: 1 / 900 };
    exposure.update(neptune, 1 / 60);
    expect(exposure.valueEv).toBeGreaterThan(0);
    expect(exposure.valueEv).toBeLessThan(0.2);
    for (let frame = 0; frame < 60; frame++) exposure.update(neptune, 1 / 60);
    expect(exposure.valueEv).toBeGreaterThan(5);
    expect(exposure.valueEv).toBeLessThan(7);
  });
});
