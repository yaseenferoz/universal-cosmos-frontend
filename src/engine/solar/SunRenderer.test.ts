import { describe, expect, it, vi } from "vitest";
import { AdditiveBlending, Group, Mesh, PerspectiveCamera, Points, ShaderMaterial, Vector3 } from "three";
import { SunRenderer, solarDiameterPixels, sunQualityBudget, unresolvedSolarWeight } from "./SunRenderer";
import { SOLAR_DISPLAY_RADIANCE, SOLAR_LIMB_DARKENING } from "./solarMath";

function cameraAt(distance: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, 1, 0.001, 1_000_000);
  camera.position.set(0, 0, distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

describe("dedicated solar rendering resources and physical geometry", () => {
  it("preserves physical photosphere radius and stable picking at every quality", () => {
    const sun = new SunRenderer(5, "low");
    const meshes = [...sun.pickables];
    const parent = new Group();
    parent.add(sun.surface, sun.corona);
    parent.scale.setScalar(69.57 / 5);
    sun.setRenderRadius(69.57);
    sun.setQuality("high");
    expect(sun.pickables).toEqual(meshes);
    for (const mesh of sun.pickables) {
      expect(mesh.geometry.parameters.radius).toBe(5);
      expect(mesh.userData.objectId).toBe("sun");
      expect(mesh.geometry.parameters.radius * parent.scale.x).toBeCloseTo(69.57);
      expect(mesh.castShadow || mesh.receiveShadow).toBe(false);
    }
    expect(sun.surface.levels[1].distance).toBeCloseTo(69.57 * 20);
    expect(sun.corona.children.every((child) => !sun.pickables.includes(child as Mesh<never, never>))).toBe(true);
    sun.dispose();
  });

  it("outputs HDR linear photosphere values through exactly one exposure/colorspace path", () => {
    const sun = new SunRenderer(1, "low");
    const material = sun.pickables[0].material;
    expect(material.uniforms.solarRadiance.value).toBe(SOLAR_DISPLAY_RADIANCE);
    expect(material.uniforms.solarLimbCoefficient.value).toBe(SOLAR_LIMB_DARKENING);
    expect(material.toneMapped).toBe(true);
    expect(material.fragmentShader.match(/#include <tonemapping_fragment>/g)).toHaveLength(1);
    expect(material.fragmentShader.match(/#include <colorspace_fragment>/g)).toHaveLength(1);
    expect(material.fragmentShader).not.toContain("toneMappingExposure *");
    const corona = sun.corona.children.find((child) => child instanceof Mesh) as Mesh;
    const coronaMaterial = corona.material as ShaderMaterial;
    expect(coronaMaterial.depthTest).toBe(true);
    expect(coronaMaterial.depthWrite).toBe(false);
    expect(coronaMaterial.blending).toBe(AdditiveBlending);
    sun.dispose();
  });

  it("retains tiny angular masks without cosine rounding and rejects invalid occluders", () => {
    const sun = new SunRenderer(1, "low");
    sun.update({ camera: cameraAt(214), renderRadius: 1, viewportHeight: 800, exposure: 1,
      occluders: [
        { direction: new Vector3(0, 0, -4), angularRadiusRad: 1e-6 },
        { direction: new Vector3(NaN, 0, 0), angularRadiusRad: 0.1 },
        { direction: new Vector3(), angularRadiusRad: 0.1 },
      ],
    });
    const uniforms = sun.pickables[0].material.uniforms;
    expect(uniforms.solarOccluderCount.value).toBe(1);
    expect(uniforms.solarOccluderDirection.value[0].length()).toBeCloseTo(1);
    expect(uniforms.solarOccluderSineSquared.value[0]).toBeGreaterThan(0);
    expect(uniforms.solarOccluderSineSquared.value[0]).toBeCloseTo(1e-12, 18);
    sun.dispose();
  });

  it("preserves unresolved flux scaling and total occultation independently of the corona toggle", () => {
    const sun = new SunRenderer(1, "low");
    const camera = cameraAt(6438);
    const point = sun.corona.children.find((child) => child instanceof Points) as Points<never, ShaderMaterial>;
    sun.setCoronaEnabled(false);
    sun.update({ camera, renderRadius: 1, viewportHeight: 800, exposure: 1 });
    expect(point.visible).toBe(true);
    expect(sun.corona.visible).toBe(true);
    const radiance = point.material.uniforms.solarPointRadiance.value as number;
    camera.position.z *= 2;
    sun.update({ camera, renderRadius: 1, viewportHeight: 800, exposure: 1 });
    expect(point.material.uniforms.solarPointRadiance.value / radiance).toBeCloseTo(0.25, 6);
    sun.update({ camera, renderRadius: 1, viewportHeight: 800, exposure: 1, visibleSolarFraction: 0 });
    expect(point.visible).toBe(false);
    expect(point.material.uniforms.solarPointRadiance.value).toBe(0);
    expect(sun.pickables[0].geometry.parameters.radius).toBe(1);
    sun.dispose();
  });

  it("disposes replaced geometry and textures, then releases every owned resource once", () => {
    const sun = new SunRenderer(1, "low");
    const oldGeometry = vi.spyOn(sun.pickables[0].geometry, "dispose");
    const oldTexture = vi.spyOn(sun.pickables[0].material.uniforms.solarGranulation.value, "dispose");
    sun.setQuality("medium");
    expect(oldGeometry).toHaveBeenCalledOnce();
    expect(oldTexture).toHaveBeenCalledOnce();
    const geometry = vi.spyOn(sun.pickables[0].geometry, "dispose");
    const material = vi.spyOn(sun.pickables[0].material, "dispose");
    const texture = vi.spyOn(sun.pickables[0].material.uniforms.solarGranulation.value, "dispose");
    sun.dispose(); sun.dispose();
    expect(geometry).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
    expect(texture).toHaveBeenCalledOnce();
    expect(sun.surface.children).toHaveLength(0);
    expect(sun.corona.children).toHaveLength(0);
  });

  it("bounds mobile work and switches to optical sampling only below a physical 1.5px disk", () => {
    expect(sunQualityBudget("auto", true)).toEqual(sunQualityBudget("low"));
    expect(sunQualityBudget("low").granulationTextureSize).toBeLessThan(sunQualityBudget("high").granulationTextureSize);
    expect(sunQualityBudget("low").coronaEnabled).toBe(false);
    const earthPixels = solarDiameterPixels(695700, 149597870.7, 800, 50 * Math.PI / 180);
    expect(earthPixels).toBeGreaterThan(7);
    expect(unresolvedSolarWeight(earthPixels)).toBe(0);
    const neptunePixels = solarDiameterPixels(695700, 30 * 149597870.7, 800, 50 * Math.PI / 180);
    expect(neptunePixels).toBeLessThan(0.3);
    expect(unresolvedSolarWeight(neptunePixels)).toBe(1);
    expect(unresolvedSolarWeight(1.5)).toBe(0);
    expect(unresolvedSolarWeight(1.125)).toBeCloseTo(0.5);
  });
});
