import { describe, expect, it } from "vitest";
import { STATION_SUN_DIRECTION, STATION_SUN_SKY_DISTANCE, STATION_SUN_SKY_RADIUS, stationEarthDetailEnabled, stationEarthTexturePath } from "./StationBackdrop";

describe("station sky scale", () => {
  it("draws a Sun with its approximately 0.53 degree apparent diameter at Earth", () => {
    const diameterDeg = 2 * Math.atan(STATION_SUN_SKY_RADIUS / STATION_SUN_SKY_DISTANCE) * 180 / Math.PI;
    expect(diameterDeg).toBeGreaterThan(0.52);
    expect(diameterDeg).toBeLessThan(0.54);
    expect(STATION_SUN_DIRECTION.length()).toBeCloseTo(1, 10);
  });
  it("selects native 8K Earth imagery only within the desktop GPU budget", () => {
    expect(stationEarthTexturePath("auto", 16384, false)).toBe("/textures/iss-earth-day-8192.webp");
    expect(stationEarthTexturePath("high", 4096, false)).toBe("/textures/earth-day-4096.webp");
    expect(stationEarthTexturePath("medium", 16384, false)).toBe("/textures/earth-day-4096.webp");
    expect(stationEarthTexturePath("auto", 16384, true)).toBe("/textures/earth-day-4096.webp");
  });
  it("uses the regional 500 m crop only in capable desktop quality presets", () => {
    expect(stationEarthDetailEnabled("auto", 8192, false)).toBe(true);
    expect(stationEarthDetailEnabled("high", 4096, false)).toBe(true);
    expect(stationEarthDetailEnabled("medium", 8192, false)).toBe(false);
    expect(stationEarthDetailEnabled("auto", 2048, false)).toBe(false);
    expect(stationEarthDetailEnabled("auto", 8192, true)).toBe(false);
  });
});
