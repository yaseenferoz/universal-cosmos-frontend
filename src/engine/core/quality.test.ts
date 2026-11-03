import { describe, expect, it } from "vitest";
import { qualityConfig } from "./quality";

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
