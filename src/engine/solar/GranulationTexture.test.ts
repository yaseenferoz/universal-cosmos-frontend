import { describe, expect, it } from "vitest";
import { LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping } from "three";
import { createGranulationTexture } from "./GranulationTexture";

describe("explicitly procedural solar granulation", () => {
  it("is deterministic, bounded, opaque grayscale data with periodic mipmapped sampling", () => {
    const first = createGranulationTexture(128);
    const second = createGranulationTexture(128);
    const data = first.image.data;
    if (!data) throw new Error("Generated granulation has no texture samples.");
    expect(data).toEqual(second.image.data);
    expect(data.length).toBe(128 * 128 * 4);
    let minimum = 255, maximum = 0;
    for (let index = 0; index < data.length; index += 4) {
      minimum = Math.min(minimum, data[index]); maximum = Math.max(maximum, data[index]);
      expect(data[index]).toBe(data[index + 1]);
      expect(data[index]).toBe(data[index + 2]);
      expect(data[index + 3]).toBe(255);
    }
    expect(minimum).toBeGreaterThanOrEqual(30);
    expect(maximum).toBeGreaterThan(230);
    expect(first.colorSpace).toBe(NoColorSpace);
    expect(first.wrapS).toBe(RepeatWrapping);
    expect(first.wrapT).toBe(RepeatWrapping);
    expect(first.minFilter).toBe(LinearMipmapLinearFilter);
    expect(first.generateMipmaps).toBe(true);
    expect(first.name).toContain("not an observation");
    first.dispose(); second.dispose();
  });
});
