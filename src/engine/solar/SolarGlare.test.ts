import { describe, expect, it, vi } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { eyeGlarePsf, GLARE_ILLUMINANCE_EXPONENT, glareIlluminanceFactor, SolarGlare, solarGlareParameters } from "./SolarGlare";
import { SOLAR_DISPLAY_RADIANCE } from "./solarMath";

describe("eye/camera glare distinct from the solar corona", () => {
  it("follows the Spencer et al. (1995) photopic glare PSF", () => {
    // f1 ∝ (θ+0.02)^-3 dominates near the source, f2 ∝ (θ+0.02)^-2 far out.
    expect(eyeGlarePsf(1)).toBeCloseTo(0.478 * 20.91 / 1.02 ** 3 + 0.138 * 72.37 / 1.02 ** 2, 10);
    expect(eyeGlarePsf(0.5)).toBeGreaterThan(eyeGlarePsf(2));
    expect(eyeGlarePsf(2) / eyeGlarePsf(20)).toBeGreaterThan(50);
    expect(eyeGlarePsf(-1)).toBe(eyeGlarePsf(0));
  });

  it("keeps the glare finite in half-float targets at any exposure", () => {
    expect(SOLAR_DISPLAY_RADIANCE).toBeLessThan(65504 / 2);
    for (const exposure of [2 ** -20, 1, 4096]) {
      const parameters = solarGlareParameters(1200, exposure, 1, 1, "high");
      expect(parameters.maxRadiance).toBeLessThan(65504);
      expect(parameters.maxRadiance * exposure).toBeLessThanOrEqual(8.000001);
      expect(parameters.peakRadiance).toBeLessThanOrEqual(parameters.maxRadiance);
    }
  });

  it("scales with the Sun's visible flux: off when hidden or disabled, linear when partly occulted", () => {
    expect(solarGlareParameters(8, 1, 0, 1, "high").intensity).toBe(0);
    expect(solarGlareParameters(8, 1, 1, 0, "high").intensity).toBe(0);
    const full = solarGlareParameters(12, 1, 1, 0.35, "medium");
    const partial = solarGlareParameters(12, 1, 0.25, 0.35, "medium");
    expect(partial.intensity / full.intensity).toBeCloseTo(0.25);
    // 12 px at 853 px / 38 deg is the 0.533 deg Sun at 1 AU: glare as tuned for Earth.
    const near = solarGlareParameters(12, 1, 1, 0.35, "medium", false, 853);
    expect(glareIlluminanceFactor(12 / (853 / 38))).toBeCloseTo(1, 2);
    // At 2 AU the disk area is 4x smaller; exposure adapts 4x to the dimmer scene, yet
    // the glare follows the lower illuminance (0.25^0.35 = 0.62): reach and spikes shrink.
    const far = solarGlareParameters(6, 4, 1, 0.35, "medium", false, 853);
    expect(far.intensity * 4 / near.intensity).toBeCloseTo(0.25 ** GLARE_ILLUMINANCE_EXPONENT, 2);
    expect(far.spikeLengthPixels / near.spikeLengthPixels).toBeCloseTo(Math.sqrt(0.25 ** GLARE_ILLUMINANCE_EXPONENT), 2);
    expect(far.outerRadiusPixels).toBeLessThan(near.outerRadiusPixels);
    // From Neptune (30 AU) the Sun's glare is a small fraction of Earth's.
    expect(glareIlluminanceFactor(0.533 / 30)).toBeCloseTo(900 ** -GLARE_ILLUMINANCE_EXPONENT, 2);
  });

  it("shrinks under solar-filter exposure and fades spikes for a large resolved disk", () => {
    const normal = solarGlareParameters(12, 1, 1, 0.35, "medium", false, 853);
    const filtered = solarGlareParameters(12, 2 ** -13, 1, 0.35, "medium", false, 853);
    expect(filtered.outerRadiusPixels).toBeLessThan(normal.outerRadiusPixels);
    expect(solarGlareParameters(12, 1, 1, 0.35, "high").spikeFade).toBe(1);
    expect(solarGlareParameters(600, 1, 1, 0.35, "high").spikeFade).toBe(0);
  });

  it("bounds quad size and streak work per quality preset", () => {
    for (const [quality, streaks] of [["low", 0], ["medium", 72], ["high", 120]] as const) {
      const parameters = solarGlareParameters(12, 1, 1, 1, quality, false, 800);
      expect(parameters.streakCount).toBe(streaks);
      expect(parameters.outerRadiusPixels).toBeLessThanOrEqual(1.25 * 1.2 * 800);
    }
    expect(solarGlareParameters(12, 1, 1, 1, "auto", true, 800).streakCount).toBe(0);
  });

  it("veils the image without depth testing, masks the disk core, and releases its resources", () => {
    const glare = new SolarGlare();
    const camera = new PerspectiveCamera(50, 1.5, 0.1, 1000);
    camera.position.z = 100;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const frame = { camera, renderRadius: 1, viewportHeight: 600, exposure: 1,
      occluders: [{ direction: new Vector3(0, 0, -2), angularRadiusRad: 0.001 }] };
    glare.update(frame, 8, 0.35, "medium", false);
    // Lens ghosts read as stray objects, so they are off by default.
    expect(glare.ghostsEnabled).toBe(false);
    expect(glare.ghosts.points.visible).toBe(false);
    expect(glare.mesh.visible).toBe(true);
    expect(glare.mesh.material.depthTest).toBe(false);
    expect(glare.mesh.material.depthWrite).toBe(false);
    expect(glare.mesh.material.uniforms.glareOccluderCount.value).toBe(1);
    expect(glare.mesh.material.uniforms.glareViewport.value.x).toBe(900);
    expect(glare.mesh.material.uniforms.glarePixelsPerDegree.value).toBeCloseTo(600 / 50, 6);
    glare.ghostsEnabled = true;
    glare.update(frame, 8, 0.35, "medium", false);
    expect(glare.ghosts.points.visible).toBe(true);
    expect(glare.ghosts.points.material.depthWrite).toBe(false);
    glare.update({ ...frame, visibleSolarFraction: 0 }, 8, 0.35, "medium", false);
    expect(glare.mesh.visible).toBe(false);
    expect(glare.ghosts.points.visible).toBe(false);
    glare.update(frame, 8, 0.35, "low", true);
    expect(glare.ghosts.points.visible).toBe(false);
    const geometry = vi.spyOn(glare.mesh.geometry, "dispose");
    const material = vi.spyOn(glare.mesh.material, "dispose");
    const ghostGeometry = vi.spyOn(glare.ghosts.points.geometry, "dispose");
    const ghostMaterial = vi.spyOn(glare.ghosts.points.material, "dispose");
    glare.dispose(); glare.dispose();
    expect(geometry).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
    expect(ghostGeometry).toHaveBeenCalledOnce();
    expect(ghostMaterial).toHaveBeenCalledOnce();
  });
});
