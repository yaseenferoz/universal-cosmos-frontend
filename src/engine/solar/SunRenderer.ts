import {
  AdditiveBlending, BackSide, BufferGeometry, Float32BufferAttribute, Group, LOD,
  Mesh, PerspectiveCamera, Points, ShaderMaterial, SphereGeometry, Vector3,
} from "three";
import type { Quality } from "../../types/celestial";
import { createGranulationTexture, GRANULE_SCALE_KM, GRANULE_TILE_CELLS } from "./GranulationTexture";
import { NOMINAL_SOLAR_RADIUS_KM, SOLAR_DISPLAY_RADIANCE, SOLAR_LIMB_DARKENING } from "./solarMath";
import {
  CORONA_OUTER_RADII, CORONA_RELATIVE_RADIANCE, SOLAR_OCCLUDER_LIMIT,
  coronaFragmentShader, photosphereFragmentShader, solarVertexShader,
  unresolvedFragmentShader, unresolvedVertexShader,
} from "./SolarShaders";
import { SolarGlare } from "./SolarGlare";

export interface SolarOccluder {
  /** Unit CAMERA-to-body direction in world axes. Host filters bodies behind the Sun. */
  direction: Vector3;
  angularRadiusRad: number;
}

export interface SunRenderFrame {
  camera: PerspectiveCamera;
  renderRadius: number;
  /** Drawing-buffer height, so the unresolved point is measured in real pixels. */
  viewportHeight: number;
  exposure: number;
  visibleSolarFraction?: number;
  occluders?: readonly SolarOccluder[];
}

export interface SunQualityBudget {
  sphereSegments: readonly [number, number, number];
  coronaSegments: number;
  granulationTextureSize: number;
  coronaEnabled: boolean;
}

export function sunQualityBudget(quality: Quality, mobile = false): SunQualityBudget {
  const resolved = quality === "auto" ? mobile ? "low" : "medium" : quality;
  const budgets = {
    low: { sphereSegments: [96, 48, 24] as const, coronaSegments: 32, granulationTextureSize: 128, coronaEnabled: false },
    medium: { sphereSegments: [128, 64, 32] as const, coronaSegments: 48, granulationTextureSize: 256, coronaEnabled: true },
    high: { sphereSegments: [192, 96, 48] as const, coronaSegments: 64, granulationTextureSize: 512, coronaEnabled: true },
  };
  return budgets[resolved];
}

/** Continuous pixel estimate of the physical sphere; no minimum radius is imposed. */
export function solarDiameterPixels(radius: number, distance: number, viewportHeight: number, fovRadians: number): number {
  if (!(radius > 0) || !(distance > radius) || !(viewportHeight > 0) || !(fovRadians > 0 && fovRadians < Math.PI)) return 0;
  return radius / Math.sqrt(distance * distance - radius * radius) * viewportHeight / Math.tan(fovRadians / 2);
}

export function unresolvedSolarWeight(diameterPixels: number): number {
  const t = Math.max(0, Math.min(1, (diameterPixels - 0.75) / 0.75));
  return 1 - t * t * (3 - 2 * t);
}

/** All units here are renderer-relative. Parent tilt/scale and physical catalog radius stay authoritative. */
export class SunRenderer {
  readonly surface = new LOD();
  readonly pickables: Mesh<SphereGeometry, ShaderMaterial>[] = [];
  /** Coronal shell + unresolved optical sampling point, both excluded from picking. */
  readonly corona = new Group();
  readonly notice = "Modeled white-light photosphere; approximate limb darkening, procedural granulation and radial corona. Optical glare is a bounded camera effect, not solar plasma. No observed solar activity or prominences. Subpixel optical sampling preserves disk area.";
  private readonly uniforms = {
    solarRadiance: { value: SOLAR_DISPLAY_RADIANCE },
    solarLimbCoefficient: { value: SOLAR_LIMB_DARKENING },
    solarGranulation: { value: createGranulationTexture(128) },
    solarGranuleScale: { value: NOMINAL_SOLAR_RADIUS_KM / (GRANULE_SCALE_KM * GRANULE_TILE_CELLS) },
    solarGranulationStrength: { value: 0.18 },
    solarPhotosphereGain: { value: 1 },
    solarRenderRadius: { value: 1 },
    solarCoronaGain: { value: 1 },
    solarOccluderCount: { value: 0 },
    solarOccluderDirection: { value: Array.from({ length: SOLAR_OCCLUDER_LIMIT }, () => new Vector3()) },
    solarOccluderSineSquared: { value: new Float32Array(SOLAR_OCCLUDER_LIMIT) },
  };
  private readonly photosphereMaterial = new ShaderMaterial({
    uniforms: this.uniforms, vertexShader: solarVertexShader, fragmentShader: photosphereFragmentShader,
    toneMapped: true, depthTest: true, depthWrite: true,
  });
  private readonly coronaMaterial = new ShaderMaterial({
    uniforms: this.uniforms, vertexShader: solarVertexShader, fragmentShader: coronaFragmentShader,
    side: BackSide, transparent: true, blending: AdditiveBlending,
    toneMapped: true, depthTest: true, depthWrite: false,
  });
  private readonly pointUniforms = {
    solarPointSize: { value: 2 }, solarPointRadiance: { value: 0 },
    solarRenderRadius: this.uniforms.solarRenderRadius,
  };
  private readonly pointMaterial = new ShaderMaterial({
    uniforms: this.pointUniforms, vertexShader: unresolvedVertexShader, fragmentShader: unresolvedFragmentShader,
    transparent: true, blending: AdditiveBlending, toneMapped: true, depthTest: true, depthWrite: false,
  });
  private readonly coronaMesh: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly point: Points<BufferGeometry, ShaderMaterial>;
  private readonly worldCenter = new Vector3();
  private readonly observer = new Vector3();
  private quality: Quality;
  private mobile: boolean;
  private budget: SunQualityBudget;
  private radius: number;
  private disposed = false;
  private coronaEnabled = true;
  private glareStrength = 0.35;
  private readonly glare = new SolarGlare();

  constructor(readonly baseRadius: number, quality: Quality = "auto", mobile = false) {
    if (!Number.isFinite(baseRadius) || baseRadius <= 0) throw new Error("Solar geometry requires a positive radius.");
    this.quality = quality;
    this.mobile = mobile;
    this.budget = sunQualityBudget(quality, mobile);
    this.radius = baseRadius;
    this.surface.name = "Physical solar photosphere";
    this.corona.name = "Approximate faint corona and subpixel optical sampling";
    for (let level = 0; level < 3; level++) {
      const segments = this.budget.sphereSegments[level];
      const mesh = new Mesh(new SphereGeometry(baseRadius, segments, segments / 2), this.photosphereMaterial);
      mesh.userData.objectId = "sun";
      mesh.castShadow = mesh.receiveShadow = false;
      this.pickables.push(mesh);
      this.surface.addLevel(mesh, baseRadius * [0, 20, 60][level]);
    }
    this.coronaMesh = new Mesh(new SphereGeometry(baseRadius * CORONA_OUTER_RADII, this.budget.coronaSegments, this.budget.coronaSegments / 2), this.coronaMaterial);
    const pointGeometry = new BufferGeometry();
    pointGeometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0], 3));
    this.point = new Points(pointGeometry, this.pointMaterial);
    this.point.name = "Flux-weighted unresolved Sun optical sample";
    this.point.visible = false;
    this.corona.add(this.coronaMesh, this.point, this.glare.mesh, this.glare.ghosts.points);
    this.replaceGranulation(this.budget.granulationTextureSize);
    this.setRenderRadius(baseRadius);
  }

  setRenderRadius(radius: number): void {
    if (!Number.isFinite(radius) || radius <= 0) return;
    this.radius = radius;
    this.uniforms.solarRenderRadius.value = radius;
    this.surface.levels.forEach((level, index) => { level.distance = radius * [0, 20, 60][index]; });
  }

  setQuality(quality: Quality, mobile = this.mobile): void {
    if (this.disposed || quality === this.quality && mobile === this.mobile) return;
    this.quality = quality;
    this.mobile = mobile;
    this.budget = sunQualityBudget(quality, mobile);
    this.pickables.forEach((mesh, index) => {
      mesh.geometry.dispose();
      const segments = this.budget.sphereSegments[index];
      mesh.geometry = new SphereGeometry(this.baseRadius, segments, segments / 2);
    });
    this.coronaMesh.geometry.dispose();
    this.coronaMesh.geometry = new SphereGeometry(this.baseRadius * CORONA_OUTER_RADII, this.budget.coronaSegments, this.budget.coronaSegments / 2);
    this.replaceGranulation(this.budget.granulationTextureSize);
  }

  /** Preserve unresolved disk sampling when the optional coronal shell is hidden. */
  setCoronaEnabled(visible: boolean): void {
    this.coronaEnabled = visible;
    if (!visible) this.coronaMesh.visible = false;
  }

  setGlareStrength(strength: number): void {
    this.glareStrength = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
    if (this.glareStrength === 0) {
      this.glare.mesh.visible = false;
      this.glare.ghosts.points.visible = false;
    }
  }

  private replaceGranulation(size: number): void {
    const previous = this.uniforms.solarGranulation.value;
    if (previous.image.width === size) return;
    this.uniforms.solarGranulation.value = createGranulationTexture(size);
    previous.dispose();
  }

  update(frame: SunRenderFrame): void {
    if (this.disposed) return;
    this.setRenderRadius(frame.renderRadius);
    this.surface.getWorldPosition(this.worldCenter);
    frame.camera.getWorldPosition(this.observer);
    const distance = this.observer.distanceTo(this.worldCenter);
    const pixels = solarDiameterPixels(this.radius, distance, frame.viewportHeight, frame.camera.getEffectiveFOV() * Math.PI / 180);
    const weight = unresolvedSolarWeight(pixels);
    const fraction = Math.max(0, Math.min(1, frame.visibleSolarFraction ?? 1));
    this.uniforms.solarPhotosphereGain.value = 1 - weight;
    // The mean linear limb law integrates to (1-u/3) over the projected disk.
    const diskArea = Math.PI * (pixels / 2) ** 2;
    this.pointUniforms.solarPointRadiance.value = SOLAR_DISPLAY_RADIANCE * (1 - SOLAR_LIMB_DARKENING / 3) * diskArea * weight * fraction / this.pointUniforms.solarPointSize.value ** 2;
    this.point.visible = pixels > 0 && weight > 0 && fraction > 0;
    this.coronaMesh.visible = this.coronaEnabled && this.budget.coronaEnabled && frame.exposure * SOLAR_DISPLAY_RADIANCE * CORONA_RELATIVE_RADIANCE > 1e-5;
    let count = 0;
    for (const occluder of frame.occluders ?? []) {
      if (count >= SOLAR_OCCLUDER_LIMIT) break;
      if (!(occluder.angularRadiusRad > 0) || occluder.angularRadiusRad > Math.PI / 2 || !Number.isFinite(occluder.angularRadiusRad) || !Number.isFinite(occluder.direction.lengthSq()) || occluder.direction.lengthSq() <= 0) continue;
      this.uniforms.solarOccluderDirection.value[count].copy(occluder.direction).normalize();
      // sin² remains representable for subpixel transits where float cos(theta) rounds to1.
      this.uniforms.solarOccluderSineSquared.value[count] = Math.sin(occluder.angularRadiusRad) ** 2;
      count++;
    }
    this.uniforms.solarOccluderCount.value = count;
    this.glare.update(frame, pixels, this.glareStrength, this.quality, this.mobile);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pickables.forEach((mesh) => mesh.geometry.dispose());
    this.coronaMesh.geometry.dispose();
    this.point.geometry.dispose();
    this.uniforms.solarGranulation.value.dispose();
    this.photosphereMaterial.dispose();
    this.coronaMaterial.dispose();
    this.pointMaterial.dispose();
    this.glare.dispose();
    this.surface.clear();
    this.corona.clear();
  }
}
