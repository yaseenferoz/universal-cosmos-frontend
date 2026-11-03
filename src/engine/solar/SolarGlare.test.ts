import { describe, expect, it, vi } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { SolarGlare, solarGlareParameters } from "./SolarGlare";
import { SOLAR_DISPLAY_RADIANCE } from "./solarMath";

describe("bounded optical glare distinct from the solar corona", () => {
  it("keeps normalized source radiance finite in a half-float scene", () => {
    expect(SOLAR_DISPLAY_RADIANCE).toBeLessThan(65504 / 2);
    for (const exposure of [2 ** -20, 1, 4096]) {
      const parameters = solarGlareParameters(500, exposure, 1, 1, "high");
      expect(parameters.peakRadiance).toBeLessThan(65504);
      expect(parameters.peakRadiance * exposure).toBeLessThanOrEqual(2.000001);
    }
  });

  it("bounds halo width per quality and preserves the physical disk parameter", () => {
    for (const [quality, limit] of [["low", 12], ["medium", 24], ["high", 40]] as const) {
      const parameters = solarGlareParameters(800, 1, 1, 0.35, quality);
      expect(parameters.diskRadiusPixels).toBe(400);
      expect(parameters.haloWidthPixels).toBe(limit);
    }
    expect(solarGlareParameters(800, 1, 1, 0.35, "auto", true).haloWidthPixels).toBe(12);
  });

  it("vanishes for total occultation/disabled optics and dims under solar filtering", () => {
    expect(solarGlareParameters(8, 1, 0, 1, "high").peakRadiance).toBe(0);
    expect(solarGlareParameters(8, 1, 1, 0, "high").peakRadiance).toBe(0);
    const normal = solarGlareParameters(8, 1, 1, 0.35, "medium");
    const filtered = solarGlareParameters(8, 2 ** -13, 1, 0.35, "medium");
    expect(filtered.peakRadiance * 2 ** -13).toBeLessThan(normal.peakRadiance / 100);
    const full = solarGlareParameters(0.25, 1, 1, 0.35, "medium");
    const partial = solarGlareParameters(0.25, 1, 0.25, 0.35, "medium");
    expect(partial.peakRadiance / full.peakRadiance).toBeCloseTo(0.25);
  });

  it("uses depth and angular masks without writing depth, and releases its resources", () => {
    const glare = new SolarGlare();
    const camera = new PerspectiveCamera(50, 1.5, 0.1, 1000);
    camera.position.z = 100;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const frame = { camera, renderRadius: 1, viewportHeight: 600, exposure: 1,
      occluders: [{ direction: new Vector3(0, 0, -2), angularRadiusRad: 0.001 }] };
    glare.update(frame, 8, 0.35, "medium", false);
    expect(glare.mesh.visible).toBe(true);
    expect(glare.mesh.material.depthTest).toBe(true);
    expect(glare.mesh.material.depthWrite).toBe(false);
    expect(glare.mesh.material.uniforms.glareOccluderCount.value).toBe(1);
    expect(glare.mesh.material.uniforms.glareViewport.value.x).toBe(900);
    glare.update({ ...frame, visibleSolarFraction: 0 }, 8, 0.35, "medium", false);
    expect(glare.mesh.visible).toBe(false);
    const geometry = vi.spyOn(glare.mesh.geometry, "dispose");
    const material = vi.spyOn(glare.mesh.material, "dispose");
    glare.dispose(); glare.dispose();
    expect(geometry).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
  });
});
