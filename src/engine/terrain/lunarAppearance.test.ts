import { describe, expect, it } from "vitest";
import { lunarDisplayReflectance, LUNAR_DISPLAY_DARK, LUNAR_DISPLAY_RANGE } from "./lunarAppearance";

describe("illustrative lunar reflectance remap", () => {
  it("retains image ordering while limiting extreme photographic contrast", () => {
    let previous = -1;
    for (let i = 0; i <= 100; i++) {
      const reflectance = lunarDisplayReflectance(i / 100);
      expect(reflectance).toBeGreaterThan(previous);
      expect(reflectance).toBeGreaterThanOrEqual(LUNAR_DISPLAY_DARK);
      expect(reflectance).toBeLessThanOrEqual(LUNAR_DISPLAY_DARK + LUNAR_DISPLAY_RANGE);
      previous = reflectance;
    }
    expect(lunarDisplayReflectance(0.8) / lunarDisplayReflectance(0.02)).toBeLessThan(4);
  });
  it("bounds missing and out-of-range samples instead of generating invalid lighting", () => {
    for (const value of [-1, NaN, Infinity]) expect(lunarDisplayReflectance(value)).toBe(LUNAR_DISPLAY_DARK);
    expect(lunarDisplayReflectance(2)).toBe(LUNAR_DISPLAY_DARK + LUNAR_DISPLAY_RANGE);
  });
});
