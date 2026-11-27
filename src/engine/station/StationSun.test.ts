import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { EARTH_LIMB_DIP_DEG, stationSunlight, SUN_ANGULAR_RADIUS_DEG, sunAltitudeDeg, sunAtmosphereTint, sunVisibleFraction } from "./StationSun";
import { DEFAULT_STATION_ORBIT_SPEED, STATION_ORBIT_SPEEDS } from "./stationSpeeds";

const atAltitude = (deg: number) => new Vector3(Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), 0);

describe("the Sun seen from the ISS", () => {
  it("sets behind Earth's limb 19.8° below the horizontal at 400 km", () => {
    expect(EARTH_LIMB_DIP_DEG).toBeCloseTo(19.76, 1);
    expect(sunVisibleFraction(10)).toBe(1);
    expect(sunVisibleFraction(-EARTH_LIMB_DIP_DEG)).toBeCloseTo(0.5, 6);
    expect(sunVisibleFraction(-EARTH_LIMB_DIP_DEG - SUN_ANGULAR_RADIUS_DEG)).toBe(0);
    expect(sunVisibleFraction(-EARTH_LIMB_DIP_DEG + SUN_ANGULAR_RADIUS_DEG * 0.5)).toBeGreaterThan(0.5);
  });

  it("is white in open space and reddens only when its light grazes the limb", () => {
    expect(sunAtmosphereTint(30)).toEqual([1, 1, 1]);
    const [r, g, b] = sunAtmosphereTint(-EARTH_LIMB_DIP_DEG + 0.3);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(stationSunlight(atAltitude(45))).toMatchObject({ intensity: 1 });
    expect(stationSunlight(atAltitude(-30)).intensity).toBe(0);
    expect(sunAltitudeDeg(atAltitude(-12))).toBeCloseTo(-12, 9);
  });

  it("starts the orbit at real time (1×)", () => {
    expect(DEFAULT_STATION_ORBIT_SPEED).toBe(1);
    expect(STATION_ORBIT_SPEEDS).toContain(DEFAULT_STATION_ORBIT_SPEED);
  });
});
