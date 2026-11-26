import { AdditiveBlending, Matrix4, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3 } from "three";
import type { Quality } from "../../types/celestial";
import type { SunRenderFrame } from "./SunRenderer";
import { ASTRONOMICAL_UNIT_KM, NOMINAL_SOLAR_RADIUS_KM, SOLAR_DISPLAY_RADIANCE, SOLAR_LIMB_DARKENING } from "./solarMath";
import { SOLAR_OCCLUDER_LIMIT } from "./SolarShaders";
import { SolarLensGhosts } from "./SolarLensGhosts";

/**
 * Photopic glare point-spread function of the human eye (Spencer, Shirley, Zimmerman
 * & Greenberg 1995, "Physically-based glare effects for digital images"), per
 * steradian, θ in degrees from the source. The f0 core term is the disk itself.
 */
export function eyeGlarePsf(thetaDeg: number): number {
  const t = Math.max(0, thetaDeg) + 0.02;
  return 0.478 * (20.91 / t ** 3) + 0.138 * (72.37 / t ** 2);
}

/** Displayed glare above which the image is simply saturated (pre-tone-mapping). */
const DISPLAY_SATURATION = 8;
/** Half-float render targets overflow at 65,504. */
const HALF_FLOAT_LIMIT = 60_000;
/** Displayed glare below this is invisible; the quad stops there. */
const VISIBILITY_FLOOR = 0.002;
/** Apparent solar diameter at 1 AU, degrees. */
const SOLAR_DIAMETER_1AU_DEG = (2 * Math.asin(NOMINAL_SOLAR_RADIUS_KM / ASTRONOMICAL_UNIT_KM) * 180) / Math.PI;
/**
 * How strongly glare follows the Sun's illuminance at the observer once exposure has
 * adapted to the lit scene. 0 = observer fully adapted to the sunlit world (glare
 * identical everywhere); 1 = adapted to the dark sky (glare ∝ illuminance). This
 * perceptual compromise keeps Earth-distance glare unchanged and makes the Sun a
 * smaller, tighter star farther out (glare ×0.13 at Neptune).
 */
export const GLARE_ILLUMINANCE_EXPONENT = 0.35;

/** Glare visibility relative to 1 AU from the Sun's true apparent diameter (E ∝ diameter²). */
export function glareIlluminanceFactor(diameterDegrees: number): number {
  if (!(diameterDegrees > 0) || !Number.isFinite(diameterDegrees)) return 0;
  const relativeIlluminance = (diameterDegrees / SOLAR_DIAMETER_1AU_DEG) ** 2;
  return Math.min(3, Math.max(0.03, relativeIlluminance ** GLARE_ILLUMINANCE_EXPONENT));
}

export interface SolarGlareParameters {
  diskRadiusPixels: number;
  /** Half-size of the screen-space glare quad (drawing-buffer pixels). */
  outerRadiusPixels: number;
  /** Length of the four diffraction spikes. */
  spikeLengthPixels: number;
  pixelsPerDegree: number;
  /** Pre-exposure source flux × glare strength (display radiance · px²). */
  intensity: number;
  /** Pre-exposure clamp keeping half-float targets finite. */
  maxRadiance: number;
  /** Hair-thin ciliary-corona streaks (0 = off at low quality). */
  streakCount: number;
  /** Spikes/streaks fade out when the disk is large and resolved. */
  spikeFade: number;
  /** Pre-exposure glare at the disk edge (used by optional lens ghosts). */
  peakRadiance: number;
}

/**
 * Camera/eye optics around the Sun, separate from the solar disk and corona: an
 * eye-PSF halo scaled by the Sun's actual flux, hair-thin streaks and a four-point
 * diffraction cross. `strength` is the user's "Optical bloom / glare" setting.
 */
export function solarGlareParameters(
  diameterPixels: number, exposure: number, visibleFraction: number,
  strength: number, quality: Quality, mobile = false, viewportHeight = 800, fovDegrees = 38,
): SolarGlareParameters {
  const resolved = quality === "auto" ? (mobile ? "low" : "medium") : quality;
  const height = Math.max(1, viewportHeight);
  const diskRadiusPixels = Math.max(0, Number.isFinite(diameterPixels) ? diameterPixels / 2 : 0);
  const pixelsPerDegree = height / Math.max(1, Math.min(170, fovDegrees));
  // Farther from the Sun its illuminance falls as 1/r²: dimmer, shorter glare and spikes.
  const illuminance = glareIlluminanceFactor((2 * diskRadiusPixels) / pixelsPerDegree);
  // Diffraction spikes fall off ~1/r², so their visible length goes as √intensity.
  const spikeLengthPixels = height * { low: 0.3, medium: 0.45, high: 0.55 }[resolved]
    * Math.min(1.6, Math.max(0.25, Math.sqrt(illuminance)));
  const streakCount = { low: 0, medium: 72, high: 120 }[resolved];
  const spikeFade = 1 - smoothstep(40, 160, diskRadiusPixels);
  const off = {
    diskRadiusPixels, outerRadiusPixels: 0, spikeLengthPixels, pixelsPerDegree, intensity: 0,
    maxRadiance: 0, streakCount, spikeFade, peakRadiance: 0,
  };
  if (!(exposure > 0) || !Number.isFinite(exposure) || diskRadiusPixels === 0 || !(visibleFraction > 0) || !(strength > 0))
    return off;
  // Unresolved disks keep their flux through the renderer's ~2 px optical sample.
  const diskArea = Math.max(Math.PI * diskRadiusPixels ** 2, 0);
  const flux = SOLAR_DISPLAY_RADIANCE * (1 - SOLAR_LIMB_DARKENING / 3) * diskArea * Math.min(1, visibleFraction);
  const intensity = flux * Math.min(1, strength) * illuminance;
  const maxRadiance = Math.min(HALF_FLOAT_LIMIT, DISPLAY_SATURATION / exposure);
  const pixelSolidAngle = (Math.PI / 180 / pixelsPerDegree) ** 2;
  // Radius where the displayed halo (≈ 10/θ² per sr far out) falls below visibility.
  const haloDegrees = Math.sqrt((intensity * exposure * 10 * pixelSolidAngle) / VISIBILITY_FLOOR);
  const diagonal = height * 1.2;
  const outerRadiusPixels = Math.min(
    { low: 0.5, medium: 1, high: 1.25 }[resolved] * diagonal,
    Math.max(diskRadiusPixels * 1.5 + 8, haloDegrees * pixelsPerDegree, spikeFade > 0 ? spikeLengthPixels : 0),
  );
  const edgeDegrees = diskRadiusPixels / pixelsPerDegree;
  const peakRadiance = Math.min(maxRadiance, intensity * eyeGlarePsf(edgeDegrees) * pixelSolidAngle);
  return { ...off, outerRadiusPixels, intensity, maxRadiance, peakRadiance };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const vertexShader = `
uniform float solarRenderRadius;
uniform vec2 glareViewport;
uniform float glareOuterRadius;
uniform mat4 glareInverseProjection;
uniform mat4 glareCameraWorld;
varying vec2 glarePixelOffset;
varying vec3 glareSightRay;
void main() {
  vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 nearestPhotosphere = center + normalize(cameraPosition - center) * solarRenderRadius;
  gl_Position = projectionMatrix * viewMatrix * vec4(nearestPhotosphere, 1.0);
  glarePixelOffset = position.xy * glareOuterRadius;
  gl_Position.xy += glarePixelOffset * 2.0 / glareViewport * gl_Position.w;
  vec4 viewRay = glareInverseProjection * vec4(gl_Position.xy / gl_Position.w, 1.0, 1.0);
  glareSightRay = mat3(glareCameraWorld) * viewRay.xyz;
}`;

/** Spike and streak gains relative to source flux; tuned so Earth-orbit views match SpaceEngine-like optics. */
const SPIKE_GAIN = 3.6e-5;
const STREAK_GAIN = 1.2e-5;

const fragmentShader = `
uniform float glareDiskRadius;
uniform float glarePixelsPerDegree;
uniform float glareIntensity;
uniform float glareMaxRadiance;
uniform float glareOuterRadius;
uniform float glareSpikeLength;
uniform float glareSpikeFade;
uniform float glareStreakCount;
uniform int glareOccluderCount;
uniform vec3 glareOccluderDirection[${SOLAR_OCCLUDER_LIMIT}];
uniform float glareOccluderSineSquared[${SOLAR_OCCLUDER_LIMIT}];
varying vec2 glarePixelOffset;
varying vec3 glareSightRay;
float glareHash(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
void main() {
  float r = length(glarePixelOffset);
  if (r >= glareOuterRadius) discard;
  // Only the solar disk itself hides behind a foreground body; scattered light in
  // the eye/camera (halo, spikes, streaks) veils the whole image, as in photographs.
  if (r <= glareDiskRadius * 1.15 + 1.5) {
    vec3 ray = normalize(glareSightRay);
    for (int index = 0; index < ${SOLAR_OCCLUDER_LIMIT}; index++) {
      if (index >= glareOccluderCount) break;
      vec3 separation = cross(ray, glareOccluderDirection[index]);
      if (dot(ray, glareOccluderDirection[index]) > 0.0 && dot(separation, separation) <= glareOccluderSineSquared[index]) discard;
    }
  }
  float pixelSolidAngle = pow(radians(1.0 / glarePixelsPerDegree), 2.0);
  // Eye PSF (Spencer et al. 1995): θ in degrees from the Sun's centre, flat over the disk.
  float theta = max(r, glareDiskRadius) / glarePixelsPerDegree + 0.02;
  float psf = 0.478 * 20.91 / (theta * theta * theta) + 0.138 * 72.37 / (theta * theta);
  float halo = psf * pixelSolidAngle;
  float edge = max(0.0, r - glareDiskRadius);
  // Four-point diffraction cross: thin, with a power-law tail.
  float spikes = 0.0;
  float spikeWidth = 0.8 + 0.02 * glareDiskRadius;
  for (int axis = 0; axis < 2; axis++) {
    vec2 direction = axis == 0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    float along = abs(dot(glarePixelOffset, direction));
    float across = abs(dot(glarePixelOffset, vec2(-direction.y, direction.x)));
    float profile = exp(-(across * across) / (spikeWidth * spikeWidth));
    float tail = pow(10.0 / (10.0 + max(0.0, along - glareDiskRadius)), 1.25);
    float end = 1.0 - smoothstep(0.55, 1.0, along / glareSpikeLength);
    spikes += profile * tail * end;
  }
  // Ciliary-corona streaks: many hair-thin radial lines of random length.
  float streaks = 0.0;
  if (glareStreakCount > 0.0) {
    float angle = atan(glarePixelOffset.y, glarePixelOffset.x);
    float cell = floor((angle / 6.2831853 + 0.5) * glareStreakCount);
    for (int j = -1; j <= 1; j++) {
      float index = mod(cell + float(j), glareStreakCount);
      float h1 = glareHash(index);
      float h2 = glareHash(index + 17.31);
      float h3 = glareHash(index + 41.7);
      float center = ((index + 0.15 + 0.7 * h1) / glareStreakCount - 0.5) * 6.2831853;
      float delta = mod(angle - center + 3.1415927, 6.2831853) - 3.1415927;
      float across = abs(delta) * r;
      float width = 0.55 + 0.5 * h3;
      float streakLength = glareSpikeLength * (0.08 + 0.3 * h2 * h2);
      float profile = exp(-(across * across) / (width * width));
      float tail = 6.0 / (6.0 + edge);
      float end = 1.0 - smoothstep(0.4 * streakLength, streakLength, r);
      streaks += profile * tail * end * (0.25 + 0.75 * h3);
    }
  }
  float optics = (spikes * ${SPIKE_GAIN.toExponential()} + streaks * ${STREAK_GAIN.toExponential()}) * glareSpikeFade;
  // Warm-white source colour (≈ 5772 K); the broad halo is slightly warmer.
  vec3 color = vec3(1.0, 0.9, 0.8) * halo + vec3(1.0, 0.95, 0.9) * optics;
  gl_FragColor = vec4(min(vec3(glareMaxRadiance), color * glareIntensity), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class SolarGlare {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly ghosts = new SolarLensGhosts();
  /**
   * Coloured lens-reflection ghosts are a camera artefact that reads as stray
   * objects in space, so they are off unless explicitly enabled.
   */
  ghostsEnabled = false;
  private readonly uniforms = {
    solarRenderRadius: { value: 1 }, glareViewport: { value: new Vector2(1, 1) },
    glareOuterRadius: { value: 1 }, glareDiskRadius: { value: 0 },
    glarePixelsPerDegree: { value: 20 }, glareIntensity: { value: 0 }, glareMaxRadiance: { value: 0 },
    glareSpikeLength: { value: 1 }, glareSpikeFade: { value: 1 }, glareStreakCount: { value: 0 },
    glareInverseProjection: { value: new Matrix4() }, glareCameraWorld: { value: new Matrix4() },
    glareOccluderCount: { value: 0 },
    glareOccluderDirection: { value: Array.from({ length: SOLAR_OCCLUDER_LIMIT }, () => new Vector3()) },
    glareOccluderSineSquared: { value: new Float32Array(SOLAR_OCCLUDER_LIMIT) },
  };
  private readonly center = new Vector3();
  private readonly eye = new Vector3();
  private readonly forward = new Vector3();
  private readonly toSun = new Vector3();
  private readonly projected = new Vector3();
  private readonly sunNdc = new Vector2();
  private disposed = false;

  constructor() {
    this.mesh = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
      uniforms: this.uniforms, vertexShader, fragmentShader,
      // Optical scatter happens in the eye/camera, so it veils foreground bodies too:
      // no depth test. The disk core alone is masked by the analytic occluder test.
      transparent: true, blending: AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: true,
    }));
    this.mesh.name = "Eye/camera glare around the Sun; not solar plasma";
    this.mesh.visible = false;
    this.mesh.frustumCulled = false; // Clip-space quad; its world-space bounds do not describe its pixel footprint.
    this.mesh.renderOrder = 10; // after the scene, so it veils foreground bodies
  }

  update(frame: SunRenderFrame, diameterPixels: number, strength: number, quality: Quality, mobile: boolean): void {
    if (this.disposed) return;
    const parameters = solarGlareParameters(
      diameterPixels, frame.exposure, frame.visibleSolarFraction ?? 1, strength, quality, mobile,
      frame.viewportHeight, frame.camera.getEffectiveFOV(),
    );
    this.mesh.getWorldPosition(this.center);
    frame.camera.getWorldPosition(this.eye);
    frame.camera.getWorldDirection(this.forward);
    this.mesh.visible = parameters.intensity > 0 && this.toSun.copy(this.center).sub(this.eye).dot(this.forward) > 0;
    this.projected.copy(this.center).project(frame.camera);
    this.sunNdc.set(this.projected.x, this.projected.y);
    this.ghosts.update(
      this.sunNdc, this.projected.z, parameters.peakRadiance * 0.5,
      this.ghostsEnabled && this.mesh.visible && this.projected.z >= -1 && this.projected.z <= 1
        && quality !== "low" && !(quality === "auto" && mobile),
    );
    const u = this.uniforms;
    u.solarRenderRadius.value = frame.renderRadius;
    u.glareViewport.value.set(Math.max(1, frame.viewportHeight * frame.camera.aspect), Math.max(1, frame.viewportHeight));
    u.glareOuterRadius.value = parameters.outerRadiusPixels;
    u.glareDiskRadius.value = parameters.diskRadiusPixels;
    u.glarePixelsPerDegree.value = parameters.pixelsPerDegree;
    u.glareIntensity.value = parameters.intensity;
    u.glareMaxRadiance.value = parameters.maxRadiance;
    u.glareSpikeLength.value = parameters.spikeLengthPixels;
    u.glareSpikeFade.value = parameters.spikeFade;
    u.glareStreakCount.value = parameters.streakCount;
    u.glareInverseProjection.value.copy(frame.camera.projectionMatrixInverse);
    u.glareCameraWorld.value.copy(frame.camera.matrixWorld);
    let count = 0;
    for (const occluder of frame.occluders ?? []) {
      if (count >= SOLAR_OCCLUDER_LIMIT) break;
      const length = occluder.direction.lengthSq();
      if (!(length > 0) || !Number.isFinite(length) || !(occluder.angularRadiusRad > 0) || occluder.angularRadiusRad > Math.PI / 2 || !Number.isFinite(occluder.angularRadiusRad)) continue;
      u.glareOccluderDirection.value[count].copy(occluder.direction).normalize();
      u.glareOccluderSineSquared.value[count] = Math.sin(occluder.angularRadiusRad) ** 2;
      count++;
    }
    u.glareOccluderCount.value = count;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.ghosts.dispose();
  }
}
