import { describe, expect, it, vi } from "vitest";
import {
  MeshStandardMaterial,
  ShaderChunk,
  ShaderLib,
  Vector3,
  type WebGLRenderer,
} from "three";
import {
  configureNightSide,
  configurePartialCoverage,
} from "../objects/PlanetShaders";
import {
  MAX_MATERIAL_SOLAR_OCCLUDERS,
  SolarMaterialLighting,
} from "./PlanetSolarLighting";
import { solarVisibility } from "./solarMath";

function compile(material: MeshStandardMaterial) {
  const shader = {
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
    uniforms: { ...ShaderLib.standard.uniforms },
  } as Parameters<MeshStandardMaterial["onBeforeCompile"]>[0];
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}

describe("planet solar material integration", () => {
  it("requires a position-dependent eclipse instead of dimming a whole planet", () => {
    // Synthetic geometry: one point on Earth's day side is eclipsed; another is not.
    const sun = new Vector3(149_597_870.7, 0, 0);
    const moon = [{ positionKm: new Vector3(360_000, 0, 0), radiusKm: 1737.4 }];
    expect(solarVisibility(new Vector3(6378, 0, 0), sun, moon)).toBe(0);
    expect(solarVisibility(new Vector3(0, 6378, 0), sun, moon)).toBe(1);
    const material = new MeshStandardMaterial();
    new SolarMaterialLighting(new Vector3(1, 0, 0)).attach(material);
    const shader = compile(material);
    expect(shader.fragmentShader).toContain(
      "cosmosSolarOccluderPositions[occultor] - point",
    );
    expect(shader.fragmentShader).toContain("cosmosSolarSunPosition - point");
    material.dispose();
  });
  it("extends the installed standard shader while retaining its shadows and BRDF", () => {
    const material = new MeshStandardMaterial();
    new SolarMaterialLighting(new Vector3(1, 0, 0)).attach(material);
    const shader = compile(material);
    expect(ShaderChunk.lights_fragment_begin).toContain(
      "getDirectionalLightInfo( directionalLight, directLight );",
    );
    expect(shader.fragmentShader).toContain(
      "cosmosSolarVisibility(cosmosSolarWorldPosition)",
    );
    expect(shader.fragmentShader).toContain(
      "viewMatrix * vec4(cosmosSolarDirection(cosmosSolarWorldPosition), 0.0)",
    );
    expect(shader.fragmentShader).toContain(
      "getShadow( directionalShadowMap[ i ]",
    );
    expect(shader.fragmentShader).toContain("RE_Direct( directLight");
    expect(shader.fragmentShader).toContain("getPointLightInfo( pointLight");
    expect(shader.vertexShader).toContain(
      "cosmosSolarWorldPosition = (modelMatrix * cosmosSolarVertex).xyz",
    );
    expect(shader.vertexShader).toContain("instanceMatrix * cosmosSolarVertex");
    expect(
      shader.fragmentShader.indexOf(
        "directLight.color *= cosmosSolarIrradiance",
      ),
    ).toBeLessThan(
      shader.fragmentShader.indexOf("getShadow( directionalShadowMap[ i ]"),
    );
    material.dispose();
  });

  it("preserves existing night-side emission and partial-coverage hooks/cache keys", () => {
    const towardSun = new Vector3(1, 0, 0);
    const night = new MeshStandardMaterial(),
      coverage = new MeshStandardMaterial();
    configureNightSide(night, towardSun);
    configurePartialCoverage(coverage);
    const lighting = new SolarMaterialLighting(towardSun);
    lighting.attach(night);
    lighting.attach(coverage);
    const nightShader = compile(night),
      coverageShader = compile(coverage);
    expect(nightShader.fragmentShader).toContain(
      "totalEmissiveRadiance *= cosmosNight",
    );
    expect(nightShader.uniforms.cosmosSunDirection.value).toBe(towardSun);
    expect(coverageShader.fragmentShader).toContain("measuredAlbedo.a");
    expect(night.customProgramCacheKey()).toContain("cosmos-night-mask-v1");
    expect(coverage.customProgramCacheKey()).toContain(
      "cosmos-observed-coverage-v2",
    );
    expect(night.customProgramCacheKey()).not.toBe(
      coverage.customProgramCacheKey(),
    );
    night.dispose();
    coverage.dispose();
  });

  it("scales ambient distance falloff separately from direct eclipse attenuation", () => {
    const material = new MeshStandardMaterial();
    new SolarMaterialLighting(new Vector3(1, 0, 0)).attach(material);
    const shader = compile(material);
    expect(shader.fragmentShader).toContain(
      "getAmbientLightIrradiance( ambientLightColor ) * cosmosSolarIrradiance;",
    );
    expect(shader.fragmentShader).not.toContain(
      "getAmbientLightIrradiance( ambientLightColor ) * cosmosSolarIrradiance * cosmosSolarVisibility",
    );
    material.dispose();
  });

  it("updates bounded uniforms in place and clears removed occultors", () => {
    const material = new MeshStandardMaterial();
    const lighting = new SolarMaterialLighting(new Vector3(1, 0, 0));
    lighting.attach(material);
    const shader = compile(material);
    const positions = shader.uniforms.cosmosSolarOccluderPositions.value;
    const version = material.version;
    lighting.update({
      sunPosition: new Vector3(100, 2, 3),
      sunRadius: 1,
      irradiance: 0.25,
      occluders: Array.from({ length: 7 }, (_, index) => ({
        position: new Vector3(index, 1, 0),
        radius: 0.1,
      })),
    });
    expect(shader.uniforms.cosmosSolarOccluderCount.value).toBe(
      MAX_MATERIAL_SOLAR_OCCLUDERS,
    );
    expect(shader.uniforms.cosmosSolarOccluderPositions.value).toBe(positions);
    expect(shader.uniforms.cosmosSolarIrradiance.value).toBe(0.25);
    lighting.update({
      sunPosition: new Vector3(10, 0, 0),
      sunRadius: 1,
      irradiance: 1,
      occluders: [],
    });
    expect(shader.uniforms.cosmosSolarOccluderCount.value).toBe(0);
    expect(Array.from(shader.uniforms.cosmosSolarOccluderRadii.value)).toEqual([
      0, 0, 0, 0,
    ]);
    expect(material.version).toBe(version);
    material.dispose();
  });

  it("attaches once and invokes the prior compile hook with its original receiver", () => {
    const material = new MeshStandardMaterial();
    const previous = vi.fn(function (this: MeshStandardMaterial) {
      expect(this).toBe(material);
    });
    material.onBeforeCompile = previous;
    const lighting = new SolarMaterialLighting(new Vector3(1, 0, 0));
    lighting.attach(material);
    const version = material.version;
    lighting.attach(material);
    const shader = compile(material);
    expect(previous).toHaveBeenCalledOnce();
    expect(
      shader.fragmentShader.match(/uniform float cosmosSolarIrradiance;/g),
    ).toHaveLength(1);
    expect(material.version).toBe(version);
    material.dispose();
  });

  it("filters invalid scalar and position data before uploading uniforms", () => {
    const material = new MeshStandardMaterial();
    const lighting = new SolarMaterialLighting(new Vector3(1, 0, 0));
    lighting.attach(material);
    const shader = compile(material);
    lighting.update({
      sunPosition: new Vector3(NaN, 0, 0),
      sunRadius: Infinity,
      irradiance: NaN,
      occluders: [
        { position: new Vector3(1, 0, 0), radius: -1 },
        { position: new Vector3(Infinity, 0, 0), radius: 1 },
        { position: new Vector3(2, 0, 0), radius: 1 },
      ],
    });
    expect(shader.uniforms.cosmosSolarSunPosition.value).toEqual(new Vector3());
    expect(shader.uniforms.cosmosSolarSunRadius.value).toBe(0);
    expect(shader.uniforms.cosmosSolarIrradiance.value).toBe(0);
    expect(shader.uniforms.cosmosSolarOccluderCount.value).toBe(1);
    material.dispose();
  });
});
