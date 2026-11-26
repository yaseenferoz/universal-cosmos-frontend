import { describe, expect, it, vi } from "vitest";
import { Texture, TextureLoader, Vector3 } from "three";
import { DeepSky, glowLevelFor } from "./DeepSky";

describe("local deep sky", () => {
  it("loads one bounded texture per tier and releases it on teardown", async () => {
    const texture = new Texture<HTMLImageElement>();
    const dispose = vi.spyOn(texture, "dispose");
    const load = vi.spyOn(TextureLoader.prototype, "loadAsync").mockResolvedValue(texture);
    try {
      const sky = new DeepSky();
      sky.setQuality("low", true);
      sky.setQuality("medium", true);
      expect(load).toHaveBeenCalledTimes(1);
      expect(load).toHaveBeenCalledWith("/textures/deep-sky-2048.webp?v=2020ha2");
      await Promise.resolve();
      sky.update(new Vector3(4, 5, 6), 0.8, 64);
      expect(sky.ready).toBe(true);
      expect(sky.mesh.position.toArray()).toEqual([4, 5, 6]);
      expect(sky.mesh.material.uniforms.visibility.value).toBe(0.8);
      expect(sky.mesh.material.uniforms.exposureCompensation.value).toBeCloseTo(1 / 64);
      sky.update(new Vector3(), 1, 0.25);
      expect(sky.mesh.material.uniforms.exposureCompensation.value).toBe(1);
      sky.update(new Vector3(), 0.85, 1, 2.2);
      expect(sky.mesh.material.uniforms.exposureCompensation.value).toBeCloseTo(2.2);
      sky.dispose();
      expect(dispose).toHaveBeenCalledOnce();
    } finally {
      load.mockRestore();
    }
  });

  it("uses the sharper map for the default desktop view", async () => {
    const texture = new Texture<HTMLImageElement>();
    const load = vi.spyOn(TextureLoader.prototype, "loadAsync").mockResolvedValue(texture);
    try {
      const sky = new DeepSky();
      sky.setQuality("auto", false);
      expect(load).toHaveBeenCalledWith("/textures/deep-sky-4096.webp?v=2020ha2");
      await Promise.resolve();
      sky.dispose();
    } finally {
      load.mockRestore();
    }
  });

  it("samples the glow at the same angular scale for both map tiers", () => {
    // ~0.35 deg per texel: 4096 and 2048 maps both resolve 1024 texels around the sky.
    expect(glowLevelFor(4096)).toBe(2);
    expect(glowLevelFor(2048)).toBe(1);
    expect(glowLevelFor(1024)).toBe(0);
    expect(glowLevelFor(512)).toBe(0);
    expect(glowLevelFor(0)).toBe(0);
  });
});
