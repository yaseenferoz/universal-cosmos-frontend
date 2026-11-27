import { describe, expect, it } from "vitest";
import {
  apparentMagnitude, blackbodyLinearRgb, blackbodyLinearRgbFast, bolometricCorrection, bvToTemperature, luminositySolar,
  radiusSolar, stellarEstimate,
} from "./stellarPhysics";

describe("stellar estimates from catalogue photometry", () => {
  it("recovers the Sun from its own magnitude and colour", () => {
    // Sun: M_V = 4.83, B−V = 0.65, T = 5772 K, BC ≈ −0.07.
    expect(bvToTemperature(0.65)).toBeGreaterThan(5650);
    expect(bvToTemperature(0.65)).toBeLessThan(5900);
    expect(bolometricCorrection(5772)).toBeCloseTo(-0.07, 1);
    const sun = stellarEstimate(4.83, 0.65);
    expect(sun.luminosity).toBeGreaterThan(0.9);
    expect(sun.luminosity).toBeLessThan(1.1);
    expect(sun.radiusSolar).toBeGreaterThan(0.9);
    expect(sun.radiusSolar).toBeLessThan(1.1);
  });

  it("gives Sirius A ~25 L☉ and Betelgeuse a supergiant radius", () => {
    // Sirius A: M_V = 1.45, B−V = 0.00 → L ≈ 25 L☉ (measured 25.4), T ≈ 9940 K.
    const sirius = stellarEstimate(1.45, 0.0);
    expect(sirius.luminosity).toBeGreaterThan(18);
    expect(sirius.luminosity).toBeLessThan(32);
    expect(sirius.temperatureK).toBeGreaterThan(9000);
    // Betelgeuse: M_V ≈ −5.5, B−V = 1.85; colour-temperature estimates give R of order 10³ R☉.
    expect(stellarEstimate(-5.5, 1.85).radiusSolar).toBeGreaterThan(300);
    expect(radiusSolar(luminositySolar(4.74 + 0.07, 5772), 5772)).toBeCloseTo(1, 1);
  });

  it("falls back to the spectral class when the colour index is unknown", () => {
    const estimate = stellarEstimate(15.5, Number.NaN, "M5Ve");
    expect(estimate.temperatureFromClass).toBe(true);
    expect(estimate.temperatureK).toBe(3200);
  });

  it("computes apparent magnitude with the distance modulus", () => {
    expect(apparentMagnitude(4.83, 10)).toBeCloseTo(4.83, 10);
    // Sun seen from Alpha Centauri (1.34 pc): about magnitude 0.5.
    expect(apparentMagnitude(4.83, 1.34)).toBeCloseTo(0.47, 1);
  });

  it("colours hot stars blue-white, the Sun near white, and cool stars orange-red", () => {
    const hot = blackbodyLinearRgb(25000), sun = blackbodyLinearRgb(5772), cool = blackbodyLinearRgb(3200);
    expect(hot[2]).toBe(1);
    expect(hot[0]).toBeLessThan(hot[2]);
    expect(cool[0]).toBe(1);
    expect(cool[2]).toBeLessThan(0.25);
    expect(Math.min(...sun)).toBeGreaterThan(0.6);
  });

  it("matches the exact blackbody colour through the lookup table", () => {
    for (const t of [2500, 3800, 5772, 9940, 30000]) {
      const fast = [0, 0, 0];
      blackbodyLinearRgbFast(t, fast);
      blackbodyLinearRgb(t).forEach((channel, c) => expect(fast[c]).toBeCloseTo(channel, 2));
    }
  });
});
