import {
  AdditiveBlending, BackSide, BufferGeometry, Float32BufferAttribute, Group, LOD,
  Mesh, PerspectiveCamera, Points, ShaderMaterial, SphereGeometry, Vector3, Vector4,
} from "three";
import type { Quality } from "../../types/celestial";
import { createGranulationTexture, GRANULE_SCALE_KM, GRANULE_TILE_CELLS } from "./GranulationTexture";
import {
  NOMINAL_SOLAR_RADIUS_KM, SOLAR_COLOR_LINEAR, SOLAR_DISPLAY_RADIANCE, SOLAR_LIMB_ALPHA_RGB, SOLAR_LIMB_DARKENING,
} from "./solarMath";
import {
  CORONA_DISPLAY_LEVEL, CORONA_OUTER_RADII, SOLAR_OCCLUDER_LIMIT, SOLAR_SPOT_LIMIT,
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

/**
 * Deterministic, illustrative sunspot groups in the solar body frame (+Y = rotation
 * pole): leader/follower pairs in the ±8–30° activity belts, umbrae 2,500–9,000 km.
 * Positions are not observations. xyz = direction, w = umbra angular radius (rad).
 */
export function illustrativeSunspots(seed = 25): Vector4[] {
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const spots: Vector4[] = [];
  const groups = 7;
  for (let group = 0; group < groups && spots.length < SOLAR_SPOT_LIMIT - 3; group++) {
    const latitude = (8 + random() * 22) * (random() < 0.5 ? -1 : 1) * (Math.PI / 180);
    const longitude = random() * Math.PI * 2;
    const members = 1 + Math.floor(random() * 3);
    for (let member = 0; member < members; member++) {
      // Followers trail the leader in longitude and sit slightly poleward (Joy's law).
      const lon = longitude - member * (2.5 + random() * 4) * (Math.PI / 180);
      const lat = latitude + Math.sign(latitude) * member * 0.6 * (Math.PI / 180);
      const umbraKm = (member === 0 ? 5000 : 2500) + random() * 4000;
      spots.push(new Vector4(
        Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon),
        umbraKm / NOMINAL_SOLAR_RADIUS_KM,
      ));
    }
  }
  return spots;
}

/** All units here are renderer-relative. Parent tilt/scale and physical catalog radius stay authoritative. */
export class SunRenderer {
  readonly surface = new LOD();
  readonly pickables: Mesh<SphereGeometry, ShaderMaterial>[] = [];
  /** Coronal shell + unresolved optical sampling point, both excluded from picking. */
  readonly corona = new Group();
  readonly notice = `Modeled white-light photosphere with chromatic power-law limb darkening (Hestroffer & Magnan 1998) and procedural granulation. Sunspot groups are illustrative, placed in the active-latitude belts; they are not today's observed spots. Corona follows the Baumbach (1937) radial profile with illustrative streamers, radially compressed and shown at a fixed visibility like processed eclipse photographs (the real corona is ~10⁻⁶ of the disk). Glare is a smooth camera point-spread effect, not solar plasma.`;
  private readonly uniforms = {
    solarRadiance: { value: SOLAR_DISPLAY_RADIANCE },
    solarLimbAlpha: { value: new Vector3(...SOLAR_LIMB_ALPHA_RGB) },
    solarColor: { value: new Vector3(...SOLAR_COLOR_LINEAR) },
    solarSpotCount: { value: 0 },
    solarSpots: { value: Array.from({ length: SOLAR_SPOT_LIMIT }, () => new Vector4()) },
    solarPole: { value: new Vector3(0, 1, 0) },
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
    const spots = illustrativeSunspots();
    spots.forEach((spot, index) => this.uniforms.solarSpots.value[index].copy(spot));
    this.uniforms.solarSpotCount.value = spots.length;
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
    this.coronaMesh.visible = this.coronaEnabled && this.budget.coronaEnabled && frame.exposure > 0;
    // Fixed display level at the limb, independent of exposure (see CORONA_DISPLAY_LEVEL).
    this.uniforms.solarCoronaGain.value = frame.exposure > 0
      ? CORONA_DISPLAY_LEVEL / (frame.exposure * SOLAR_DISPLAY_RADIANCE)
      : 0;
    // Rotation axis in world space orients the coronal streamer belt.
    this.uniforms.solarPole.value.set(0, 1, 0).transformDirection(this.surface.matrixWorld);
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
