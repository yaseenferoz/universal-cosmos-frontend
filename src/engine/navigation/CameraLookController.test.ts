import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  CameraLookController,
  interpolateDirection,
} from "./CameraLookController";

describe("rotation-only solar guidance", () => {
  it("handles opposite directions continuously without a zero-length midpoint", () => {
    const from = new Vector3(0, 0, -1);
    const to = from.clone().negate();
    let previous = from;
    for (let step = 1; step <= 100; step++) {
      const direction = interpolateDirection(from, to, step / 100);
      expect(direction.length()).toBeCloseTo(1, 12);
      expect(direction.angleTo(previous)).toBeLessThan(0.032);
      previous = direction;
    }
    expect(previous.distanceTo(to)).toBeLessThan(1e-12);
  });
  it("finishes toward the current Sun direction and supports interruption", () => {
    const look = new CameraLookController();
    look.start(new Vector3(0, 0, -1), false);
    look.pause();
    look.state.progress = 0.5;
    const target = new Vector3(1, 0.5, 0).normalize();
    expect(look.sample(target).angleTo(target)).toBeGreaterThan(0);
    look.state.progress = 1;
    expect(look.sample(target).distanceTo(target)).toBeLessThan(1e-12);
    expect(look.active).toBe(false);
    look.start(target, false);
    look.cancel();
    expect(look.active).toBe(false);
  });
});
