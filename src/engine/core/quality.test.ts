import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_MIN_RATIO, ADAPTIVE_STARTUP_GRACE_MS, initialAdaptiveResolution, nextAdaptiveResolution, qualityConfig,
  type AdaptiveResolutionState,
} from "./quality";

describe("rendering quality budget", () => {
  it("caps retina displays to the preset budget", () => {
    expect(qualityConfig("low", 4).pixelRatio).toBe(1);
    expect(qualityConfig("medium", 4).pixelRatio).toBe(1.5);
    expect(qualityConfig("high", 4).pixelRatio).toBe(2);
  });
  it("starts automatic quality conservatively on touch devices", () => {
    expect(qualityConfig("auto", 3, true)).toEqual(
      qualityConfig("low", 3, true),
    );
    expect(qualityConfig("auto", 3, false)).toEqual(
      qualityConfig("medium", 3, false),
    );
  });
  it("never supersamples a device below its native ratio and grows geometry-independent density by preset", () => {
    expect(qualityConfig("high", 1).pixelRatio).toBe(1);
    expect(qualityConfig("high").stars).toBeGreaterThan(
      qualityConfig("medium").stars,
    );
    expect(qualityConfig("medium").stars).toBeGreaterThan(
      qualityConfig("low").stars,
    );
  });
});

describe("adaptive resolution", () => {
  const start = 0;
  const step = (state: AdaptiveResolutionState, fps: number, ratio: number, now: number) =>
    nextAdaptiveResolution(state, fps, ratio, 1.5, now, start);

  it("ignores start-up hitches from texture uploads and shader compiles", () => {
    const state = step(initialAdaptiveResolution(), 5, 1.5, ADAPTIVE_STARTUP_GRACE_MS - 1);
    expect(state.limit).toBe(Infinity);
  });
  it("drops under sustained slow frames and stops at the minimum ratio", () => {
    let state = step(initialAdaptiveResolution(), 20, 1.5, 10_000);
    expect(state.limit).toBeCloseTo(1.35, 10);
    state = step(state, 20, ADAPTIVE_MIN_RATIO, 15_000);
    expect(state.limit).toBeCloseTo(1.35, 10);
  });
  it("recovers after two fast intervals instead of staying blurry for the session", () => {
    let state = step(initialAdaptiveResolution(), 20, 1.5, 10_000); // drop to 1.35
    state = step(state, 20, 1.35, 15_000); // drop to 1.2
    state = step(state, 58, 1.2, 80_000);
    expect(state.limit).toBeCloseTo(1.2, 10); // one fast interval is not enough
    state = step(state, 58, 1.2, 85_000);
    expect(state.limit).toBeCloseTo(1.35, 10);
    state = step(step(state, 58, 1.35, 90_000), 58, 1.35, 95_000);
    expect(state.limit).toBe(Infinity); // back at the preset maximum
  });
  it("does not oscillate by immediately retrying a ratio that just failed", () => {
    let state = step(initialAdaptiveResolution(), 20, 1.5, 10_000); // 1.5 failed
    state = step(step(state, 58, 1.35, 15_000), 58, 1.35, 20_000);
    expect(state.limit).toBeCloseTo(1.35, 10);
    state = step(step(state, 58, 1.35, 75_000), 58, 1.35, 80_000);
    expect(state.limit).toBe(Infinity); // retried only after a minute
  });
});
