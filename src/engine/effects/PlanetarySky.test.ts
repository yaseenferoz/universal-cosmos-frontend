import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { planetaryEnvironments } from "../../data/planetaryEnvironments";
import { localStarVisibility, PlanetarySky } from "./PlanetarySky";

describe("landing sky", () => {
  it("reveals the star map at night and attenuates it in daylight or dense haze", () => {
    expect(localStarVisibility(-1)).toBe(1);
    expect(localStarVisibility(1)).toBeCloseTo(0.035);
    expect(localStarVisibility(-1, planetaryEnvironments.earth)).toBeGreaterThan(0.5);
    expect(localStarVisibility(1, planetaryEnvironments.earth)).toBeCloseTo(0.01);
    expect(localStarVisibility(-1, planetaryEnvironments.mars)).toBeCloseTo(0.85);
    expect(localStarVisibility(1, planetaryEnvironments.mars)).toBeCloseTo(0.01);
    expect(localStarVisibility(-1, planetaryEnvironments.venus)).toBe(0);
    expect(localStarVisibility(1, planetaryEnvironments.venus)).toBe(0);
    expect(localStarVisibility(-1, planetaryEnvironments.jupiter)).toBe(0);
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
