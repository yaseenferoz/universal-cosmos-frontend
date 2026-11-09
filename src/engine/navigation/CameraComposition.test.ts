import { describe, expect, it } from "vitest";
import { MathUtils, Vector3 } from "three";
import {
  irregularBodyCameraOffset,
  orbitalCameraDistance,
  orbitalCameraOffset,
} from "./CameraComposition";

describe("orbital camera composition", () => {
  it("retains radius-relative framing and protects portrait widths", () => {
    const landscape = orbitalCameraDistance(1, 16 / 9);
    const portrait = orbitalCameraDistance(1, 9 / 16);
    expect(landscape).toBeGreaterThan(3);
    expect(landscape).toBeLessThan(5);
    expect(portrait).toBeGreaterThan(landscape);
    expect(orbitalCameraDistance(100, 16 / 9)).toBeCloseTo(landscape * 100);
  });
  it("frames a lit hemisphere and reserves space for Saturn rings", () => {
    const sun = new Vector3(1, 0, 0);
    const planet = orbitalCameraOffset(1, 16 / 9, sun);
    const phase = planet.clone().normalize().dot(sun);
    expect(phase).toBeGreaterThan(0.5);
    expect(phase).toBeLessThan(0.7);
    expect(orbitalCameraOffset(1, 16 / 9, sun, true).length()).toBeGreaterThan(
      planet.length() * 2,
    );
  });
  it("exposes Saturn's tilted ring plane while preserving the lit phase", () => {
    const sun = new Vector3(-Math.cos(2.5), 0, -Math.sin(2.5)).normalize();
    const pole = new Vector3(0, 1, 0).applyAxisAngle(
      new Vector3(0, 0, 1),
      MathUtils.degToRad(26.7),
    );
    const offset = orbitalCameraOffset(1, 16 / 9, sun, true, pole);
    const direction = offset.clone().normalize();
    expect(Math.abs(direction.dot(pole))).toBeCloseTo(
      Math.sin(MathUtils.degToRad(25)),
    );
    expect(direction.dot(pole) * sun.dot(pole)).toBeGreaterThan(0);
    expect(direction.dot(sun)).toBeCloseTo(Math.cos(MathUtils.degToRad(55)));
    expect(offset.length()).toBeCloseTo(orbitalCameraDistance(2.4, 16 / 9));
  });
  it("keeps ring composition finite when sunlight meets the pole", () => {
    const pole = new Vector3(0, 1, 0);
    const direction = orbitalCameraOffset(
      1,
      9 / 16,
      pole,
      true,
      pole,
    ).normalize();
    expect(direction.toArray().every(Number.isFinite)).toBe(true);
    expect(direction.dot(pole)).toBeCloseTo(Math.sin(MathUtils.degToRad(25)));
  });
  it("shows an irregular moon's long axis in the initial view", () => {
    const longAxis = new Vector3(1, 0, 0);
    const sun = new Vector3(1, 0, 0);
    const offset = irregularBodyCameraOffset(1.3, 16 / 9, sun, longAxis);
    const direction = offset.clone().normalize();
    expect(Math.abs(direction.dot(longAxis))).toBeLessThan(0.5);
    expect(direction.dot(sun)).toBeGreaterThan(0.3);
    expect(offset.length()).toBeCloseTo(orbitalCameraDistance(1.3, 16 / 9));
  });
});
