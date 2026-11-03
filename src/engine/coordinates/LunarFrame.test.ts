import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import {
  fromMoonFixedMeters,
  lunarSunDirection,
  relativeSolarIrradiance,
  toMoonFixedMeters,
} from "./LunarFrame";

describe("lunar and solar coordinate boundary", () => {
  it("preserves centimeter displacements at a heliocentric camera position", () => {
    const moon = new Vector3(14959, 2, 200);
    const rotation = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      1.3,
    );
    const observer = new Vector3(1737401.7, 0.01, 50.03);
    const world = fromMoonFixedMeters(observer, moon, rotation);
    expect(
      toMoonFixedMeters(world, moon, rotation).distanceTo(observer),
    ).toBeLessThan(0.0001);
  });
  it("transforms Sun direction into the same rotating frame as terrain", () => {
    const rotation = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      Math.PI / 2,
    );
    const sun = lunarSunDirection(new Vector3(10, 0, 0), rotation);
    expect(
      sun
        .clone()
        .applyQuaternion(rotation)
        .distanceTo(new Vector3(-1, 0, 0)),
    ).toBeLessThan(1e-12);
    expect(relativeSolarIrradiance(2)).toBe(0.25);
  });
});
