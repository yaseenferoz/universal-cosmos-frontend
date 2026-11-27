import { describe, expect, it } from "vitest";
import { airmass, columnToSpace, groundTransmittance, limbRadiance, RAYLEIGH_SCALE_HEIGHT_KM, rayleighOpticalDepth } from "./StationAtmosphere";

const R = 6378.137;
const H = RAYLEIGH_SCALE_HEIGHT_KM;
const blueness = ([r, , b]: number[]) => b / r;

describe("Earth's atmosphere seen from the ISS", () => {
  it("uses the standard sea-level Rayleigh optical depth and its λ⁻⁴ colour", () => {
    expect(rayleighOpticalDepth(0.55)).toBeCloseTo(0.097, 2);
    const ratio = rayleighOpticalDepth(0.44) / rayleighOpticalDepth(0.68);
    expect(ratio).toBeGreaterThan((0.68 / 0.44) ** 4);
    expect(ratio).toBeLessThan(1.1 * (0.68 / 0.44) ** 4);
  });

  it("gives one air mass overhead and about forty at the horizon", () => {
    expect(airmass(R, 1, H)).toBeCloseTo(1, 2);
    expect(airmass(R, 0, H)).toBeGreaterThan(38);
    expect(airmass(R, 0, H)).toBeLessThan(41);
    expect(airmass(R, 0.5, H)).toBeLessThan(airmass(R, 0.2, H));
  });

  it("is continuous at the horizon and dark in Earth's shadow", () => {
    const below = columnToSpace(R + 5, -1e-6, H), above = columnToSpace(R + 5, 1e-6, H);
    expect(Math.abs(below - above) / above).toBeLessThan(1e-4);
    expect(columnToSpace(R + 5, -0.05, H)).toBeGreaterThan(columnToSpace(R + 5, 0, H));
    expect(columnToSpace(R + 1, -0.2, H)).toBeGreaterThanOrEqual(1e4);
  });

  it("fades the daytime limb from white near the ground to deep blue above", () => {
    const low = limbRadiance(2, 0.5), mid = limbRadiance(15, 0.5), high = limbRadiance(40, 0.5);
    expect(high[2]).toBeGreaterThan(high[1]);
    expect(high[1]).toBeGreaterThan(high[0]);
    expect(high[2]).toBeLessThan(mid[2]);
    expect(blueness(high)).toBeGreaterThan(2 * blueness(low));
    expect(limbRadiance(120, 0.5)[2]).toBeLessThan(1e-3 * mid[2]);
  });

  it("reddens the limb where sunlight reaches it at a grazing angle", () => {
    const day = limbRadiance(4, 0.5), twilight = limbRadiance(4, -0.02);
    expect(twilight[0]).toBeGreaterThan(twilight[2]);
    expect(twilight[2]).toBeLessThan(day[2]);
    expect(Math.max(...limbRadiance(10, -0.5))).toBe(0);
  });

  it("lets more red than blue through from the ground, much less near the horizon", () => {
    const nadir = groundTransmittance(1), grazing = groundTransmittance(0.05);
    expect(nadir[2]).toBeLessThan(nadir[1]);
    expect(nadir[1]).toBeLessThan(nadir[0]);
    expect(nadir[2]).toBeGreaterThan(0.5);
    expect(grazing[2]).toBeLessThan(0.1 * nadir[2]);
  });
});
