import { describe, expect, it } from "vitest";
import { siteGroundColor, type Linear } from "./siteColor";

/** 64×32 test map: bright west half, dark east half, unobserved (transparent) south. */
function map(): Uint8ClampedArray {
  const width = 64, height = 32, pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const k = (y * width + x) * 4;
    const value = x < width / 2 ? 220 : 60;
    pixels.set([value, value * 0.8, value * 0.6, y >= 24 ? 0 : 255], k);
  }
  return pixels;
}
const luminance = ([r, g, b]: Linear) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

describe("landing-site ground colour from the global map", () => {
  const ground: Linear = [0.2, 0.2, 0.2];
  it("is brighter on bright terrain and darker on dark terrain, keeping the map's hue", () => {
    const west = siteGroundColor(map(), 64, 32, 20, -90, ground)!;
    const east = siteGroundColor(map(), 64, 32, 20, 90, ground)!;
    expect(luminance(west)).toBeGreaterThan(luminance(ground));
    expect(luminance(east)).toBeLessThan(luminance(ground));
    expect(west[0]).toBeGreaterThan(west[2]);
  });

  it("refuses sites the map never observed", () => {
    expect(siteGroundColor(map(), 64, 32, -80, 0, ground)).toBeNull();
    expect(siteGroundColor(new Uint8ClampedArray(64 * 32 * 4), 64, 32, 0, 0, ground)).toBeNull();
  });

  it("wraps across the ±180° seam", () => {
    const seam = siteGroundColor(map(), 64, 32, 10, 179.9, ground);
    expect(seam).not.toBeNull();
  });
});
