import { describe, expect, it } from "vitest";
import { Matrix4, Mesh, MeshStandardMaterial, RingGeometry, ShaderLib, Vector3, type WebGLRenderer } from "three";
import { objectById } from "../../data/catalog";
import { CelestialBody } from "./CelestialBody";
import { SolarMaterialLighting } from "../solar/PlanetSolarLighting";
import { configureSaturnClouds, configureSaturnLighting, SATURN_POLAR_RATIO, saturnRingOpticalDepth, saturnRingTransmission } from "./SaturnAppearance";

describe("Saturn globe and particle-sheet rings", () => {
  it("distinguishes dense rings, thin rings, the Cassini division and empty space", () => {
    expect(saturnRingOpticalDepth(60000)).toBe(0);
    expect(saturnRingOpticalDepth(140000)).toBe(0);
    expect(saturnRingTransmission(100000, 1)).toBeLessThan(saturnRingTransmission(80000, 1));
    expect(saturnRingTransmission(120000, 1)).toBeGreaterThan(0.95);
    expect(saturnRingTransmission(130000, 0.1)).toBeLessThan(saturnRingTransmission(130000, 1));
    for (const angle of [-1, -0.1, 0, 0.1, 1]) {
      expect(saturnRingTransmission(130000, angle)).toBeGreaterThanOrEqual(0);
      expect(saturnRingTransmission(130000, angle)).toBeLessThanOrEqual(1);
      expect(saturnRingTransmission(130000, angle)).toBe(saturnRingTransmission(130000, -angle));
    }
  });
  it("flattens every globe LOD without flattening its equatorial rings or physical radius", () => {
    const body = new CelestialBody(objectById.saturn);
    for (const { object } of body.surface.levels) {
      const mesh = object as Mesh;
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
      expect(box.max.y / box.max.x).toBeCloseTo(SATURN_POLAR_RATIO, 5);
    }
    const ring = body.tilted.children.find((node) => node instanceof Mesh && node.geometry instanceof RingGeometry) as Mesh<RingGeometry, MeshStandardMaterial>;
    expect(ring.geometry.parameters.innerRadius / body.renderRadius).toBeCloseTo(74658 / body.data.radiusKm);
    expect(ring.material.depthWrite).toBe(false);
    expect(ring.castShadow).toBe(false);
    body.setRenderRadius(6.0268);
    expect(body.data.radiusKm).toBe(60268);
    expect(body.tilted.scale.x).toBe(body.tilted.scale.y);
    body.dispose();
  });
  it.each([false, true])("composes the %s ring shader with solar lighting and persistent transforms", (rings) => {
    const material = new MeshStandardMaterial();
    if (!rings) configureSaturnClouds(material);
    new SolarMaterialLighting(new Vector3(1, 0, 0)).attach(material);
    const inverse = new Matrix4();
    configureSaturnLighting(material, inverse, 2.1, rings);
    const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader, uniforms: { ...ShaderLib.standard.uniforms } } as Parameters<MeshStandardMaterial["onBeforeCompile"]>[0];
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    expect(shader.uniforms.saturnWorldToBody.value).toBe(inverse);
    expect(shader.fragmentShader).toContain("float saturnTau");
    expect(shader.fragmentShader.indexOf("vec3 cosmosSolarDirection")).toBeLessThan(shader.fragmentShader.indexOf("vec3 saturnSun"));
    expect(shader.fragmentShader).toContain(rings ? "length(p + t * s)" : "float t = -p.y / s.y");
    if (rings) {
      expect(shader.fragmentShader).toContain("diffuseColor.a = 1.0 - exp");
      expect(shader.fragmentShader).not.toContain("diffuseColor *= sampledDiffuseColor");
    }
    material.dispose();
  });
});
