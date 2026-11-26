import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { planetaryEnvironments } from "../../data/planetaryEnvironments";
import { localStarVisibility, PlanetarySky, skySolarIllumination } from "./PlanetarySky";
import { relativeSolarIrradiance } from "../solar/solarMath";

describe("landing sky", () => {
  it.each(Object.entries(planetaryEnvironments))("audits %s at noon, twilight and midnight", (_id, profile) => {
    const sky = new PlanetarySky(profile);
    const altitude = profile.mode === "atmosphere" ? 25000 : 1.7;
    let previous = -1;
    for (const cosine of [-1, -0.5, -0.14, -0.07, 0, 0.1, 0.18, 1]) {
      const sun = new Vector3(Math.sqrt(1 - cosine * cosine), cosine, 0);
      sky.update(new Vector3(0, 1, 0), sun, altitude, 1);
      const illumination = sky.mesh.material.uniforms.daylight.value as number;
      expect(illumination).toBeGreaterThanOrEqual(previous);
      expect(illumination).toBeGreaterThanOrEqual(0);
      expect(illumination).toBeLessThanOrEqual(1);
      if (cosine <= -0.14) expect(illumination).toBe(0);
      if (cosine >= 0.18) expect(illumination).toBe(1);
      previous = illumination;
      const stars = localStarVisibility(cosine, profile);
      expect(stars).toBeGreaterThanOrEqual(0);
      expect(stars).toBeLessThanOrEqual(1);
      if (profile.nightSkyTransmission === 0) expect(stars).toBe(0);
    }
    expect(sky.mesh.visible).toBe(profile.hazeHeightM > altitude);
    sky.dispose();
  });

  it("does not invent sunlight from invalid solar geometry", () => {
    for (const invalid of [NaN, Infinity, -Infinity]) expect(skySolarIllumination(invalid)).toBe(0);
  });

  it("treats Mercury and the Moon consistently as optically airless", () => {
    for (const cosine of [-1, -0.1, 0, 0.1, 1])
      expect(localStarVisibility(cosine, planetaryEnvironments.mercury)).toBe(localStarVisibility(cosine));
  });
  it("keeps haze on the same inverse-square lighting scale as terrain before exposure", () => {
    const profile = planetaryEnvironments.neptune!;
    const sky = new PlanetarySky(profile);
    for (const distanceAu of [0.723, 1, 5.2, 30.1]) {
      sky.update(new Vector3(1, 0, 0), new Vector3(1, 0, 0), 25000, relativeSolarIrradiance(distanceAu));
      // Compensating exposure must preserve the modeled color across solar distances.
      expect(sky.mesh.material.uniforms.irradiance.value * distanceAu ** 2).toBeCloseTo(1, 10);
    }
    for (const invalid of [0, -1, NaN, Infinity]) {
      sky.update(new Vector3(1, 0, 0), new Vector3(1, 0, 0), 25000, invalid);
      expect(sky.mesh.material.uniforms.irradiance.value).toBe(0);
    }
    sky.dispose();
  });

  it("reveals the star map at night and attenuates it in daylight or dense haze", () => {
    expect(localStarVisibility(-1)).toBe(1);
    expect(localStarVisibility(1)).toBeCloseTo(0.035);
    expect(localStarVisibility(-1, planetaryEnvironments.earth)).toBeGreaterThan(0.5);
    expect(localStarVisibility(1, planetaryEnvironments.earth)).toBeCloseTo(0.01);
    expect(localStarVisibility(-1, planetaryEnvironments.mars)).toBeCloseTo(0.85);
    expect(localStarVisibility(1, planetaryEnvironments.mars)).toBeCloseTo(0.01);
    expect(localStarVisibility(-1, planetaryEnvironments.venus)).toBe(0);
    expect(localStarVisibility(1, planetaryEnvironments.venus)).toBe(0);
    // Above Jupiter's cloud deck the night sky is clear enough for stars.
    expect(localStarVisibility(-1, planetaryEnvironments.jupiter)).toBeCloseTo(0.75);
  });

  it("shows analytic haze only within its modeled layer", () => {
    const profile = planetaryEnvironments.mars;
    if (!profile) throw new Error("Mars profile missing");
    const sky = new PlanetarySky(profile);
    sky.update(new Vector3(1, 0, 0), new Vector3(1, 0, 0), 0, 1);
    expect(sky.mesh.visible).toBe(true);
    expect(sky.mesh.material.uniforms.density.value).toBeGreaterThan(0);
    sky.update(new Vector3(1, 0, 0), new Vector3(1, 0, 0), profile.hazeHeightM + 1, 1);
    expect(sky.mesh.visible).toBe(false);
    sky.dispose();
  });

  it("uses a structured opaque sky for Venus while leaving Mars translucent", () => {
    const venus = planetaryEnvironments.venus;
    const mars = planetaryEnvironments.mars;
    if (!venus || !mars) throw new Error("Planet profiles missing");
    const cloudySky = new PlanetarySky(venus);
    const dustySky = new PlanetarySky(mars);
    expect(cloudySky.mesh.material.uniforms.opaqueHaze.value).toBe(1);
    expect(cloudySky.mesh.material.uniforms.cloudStructure.value).toBeGreaterThan(0);
    expect(dustySky.mesh.material.uniforms.opaqueHaze.value).toBe(0);
    expect(dustySky.mesh.material.uniforms.cloudStructure.value).toBe(0);
    cloudySky.dispose();
    dustySky.dispose();
  });
});
