import {
  AddEquation,
  BackSide,
  Color,
  CustomBlending,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  Vector3,
} from "three";
import type { ObjectId } from "../../types/celestial";
import { skySolarIllumination } from "./PlanetarySky";

/**
 * Cloud-level view inside a giant planet, seen from above the visible cloud deck.
 *
 * Grounded in the observed vertical structure: Jupiter's and Saturn's visible decks are
 * ammonia-ice clouds near 0.5–1 bar under photochemical haze; Uranus's and Neptune's
 * are methane-ice clouds near 1–1.5 bar beneath a clear, methane-absorbing atmosphere
 * that removes red light (cyan sky). Above the deck, Rayleigh scattering by H₂ gives a
 * thin bluish sky (Jupiter: τ ≈ 0.1 at 450 nm above 0.5 bar), whitened by haze toward the
 * horizon. Lightning has been observed on Jupiter (Galileo, Juno) and Saturn (Cassini)
 * and inferred from radio bursts on Uranus and Neptune.
 *
 * Every number below is an illustrative rendering choice informed by those regimes, not
 * a radiative-transfer solution. Deck colours come from the installed global map's zonal
 * mean at the observer's latitude; cloud texture finer than the map is procedural.
 */
export interface GiantAtmosphereProfile {
  /** Visible cloud-deck altitude above the 1-bar reference radius, km. */
  deckAltitudeKm: number;
  /** Vertical optical depth of the air above the observer (visible light). */
  zenithOpticalDepth: number;
  zenithColor: string;
  horizonColor: string;
  /** Atmospheric scale height near 1 bar, km (NASA NSSDCA fact sheets). */
  scaleHeightKm: number;
  /** Vertical optical depth of the haze above the cloud deck (illustrative). */
  hazeDepth: number;
  /** Relative lightning rate (0 = none). */
  lightning: number;
  /** Deck colour if the map is unavailable. */
  deckColor: string;
  /** Strength of the convective cloud texture. */
  convection: number;
}

export const GIANT_ATMOSPHERES: Partial<Record<ObjectId, GiantAtmosphereProfile>> = {
  jupiter: { deckAltitudeKm: 10, zenithOpticalDepth: 0.25, zenithColor: "#3f6fa6", horizonColor: "#d9cdb5",
    scaleHeightKm: 27, hazeDepth: 0.3, lightning: 1, deckColor: "#cdb795", convection: 1 },
  saturn: { deckAltitudeKm: 10, zenithOpticalDepth: 0.45, zenithColor: "#6c86a4", horizonColor: "#e2d4af",
    scaleHeightKm: 59.5, hazeDepth: 0.6, lightning: 0.6, deckColor: "#d8c79d", convection: 0.7 },
  uranus: { deckAltitudeKm: 5, zenithOpticalDepth: 0.6, zenithColor: "#2c6f8a", horizonColor: "#a9d7d8",
    scaleHeightKm: 27.7, hazeDepth: 0.45, lightning: 0.15, deckColor: "#b9dfe0", convection: 0.35 },
  neptune: { deckAltitudeKm: 5, zenithOpticalDepth: 0.55, zenithColor: "#244f8c", horizonColor: "#9cc6dc",
    scaleHeightKm: 19.7, hazeDepth: 0.4, lightning: 0.15, deckColor: "#a8cde0", convection: 0.5 },
};

/**
 * Distance (km) along a view ray to the cloud deck, or Infinity when the ray misses it.
 * Uses altitude-based terms so it stays precise for observers kilometres above a
 * ~70,000 km sphere (mirrors the fragment shader).
 */
export function deckHitDistanceKm(observerRadiusKm: number, deckRadiusKm: number, elevationCosine: number): number {
  const height = observerRadiusKm - deckRadiusKm;
  if (height <= 0) return 0;
  const b = observerRadiusKm * elevationCosine;
  const discriminant = b * b - height * (2 * deckRadiusKm + height);
  if (b >= 0 || discriminant < 0) return Infinity;
  return -b - Math.sqrt(discriminant);
}

/** Zonal and meridional cloud periods (km): winds stretch features east–west ~3:1. */
const ZONAL_PERIOD_KM = 180;
const MERIDIONAL_PERIOD_KM = 60;

/**
 * Tileable smooth noise (RGB = three independent fields) for cheap cloud fbm: one GPU
 * fetch per octave instead of eight hashes. Seeded, so every visit looks the same.
 */
export function createCloudNoiseTexture(size = 128, seed = 0x5eed): DataTexture {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Random lattice blurred once (wrapping) so bilinear sampling reads as smooth noise.
  const raw = Array.from({ length: 3 }, () => Float32Array.from({ length: size * size }, random));
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            sum += raw[channel][((y + dy + size) % size) * size + ((x + dx + size) % size)] * (dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1);
        data[(y * size + x) * 4 + channel] = Math.round((sum / 16) * 255);
      }
      data[(y * size + x) * 4 + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const fragmentShader = `
uniform vec3 upDirection, sunDirection, observerKm;
uniform float observerRadiusKm, observerHeightKm, deckRadiusKm;
uniform vec3 zenithColor, horizonColor, deckColor;
uniform float zenithDepth, scaleHeightKm, hazeDepth, lightning, convection, irradiance, daylight, timeSeconds;
uniform sampler2D bandMap, noiseMap;
uniform float hasBandMap, zonalTiles, meridionalScale;
varying vec3 sightline;

float gHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
// Planet-fixed cloud coordinates: longitude tiles an integer number of noise periods
// around the parallel (seamless at ±180°), latitude in meridional periods.
vec2 deckUv(vec3 normal) {
  float lon = atan(-normal.z, normal.x);
  float lat = asin(clamp(normal.y, -1.0, 1.0));
  return vec2(lon / 6.2831853 * zonalTiles, lat * meridionalScale);
}
float cloudFbm(vec2 uv) {
  float value = 0.0, amplitude = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    value += amplitude * texture2D(noiseMap, uv).r;
    uv = uv * 2.0 + vec2(0.37, 0.71);
    amplitude *= 0.5;
  }
  return value / 0.9375;
}
vec3 bandColor(vec3 normal) {
  if (hasBandMap < 0.5) return deckColor;
  // Zonal mean of the observed map at this latitude: bands are zonal, the map is
  // far coarser than these clouds, and some sources have longitude gaps.
  float lat = asin(clamp(normal.y, -1.0, 1.0));
  float v = 0.5 + lat / 3.14159265;
  vec4 sum = vec4(0.0);
  for (int k = 0; k < 4; k++) {
    vec4 sampled = texture2D(bandMap, vec2((float(k) + 0.5) / 4.0, v));
    sum += vec4(sampled.rgb * sampled.a, sampled.a);
  }
  return sum.a > 0.05 ? sum.rgb / sum.a : deckColor;
}
void main() {
  vec3 ray = normalize(sightline);
  float mu = dot(ray, upDirection);
  float sunHeight = dot(upDirection, sunDirection);
  float cosine = dot(ray, sunDirection);
  // Ray against the deck sphere with altitude-based terms (precise at 70,000 km).
  float b = observerRadiusKm * mu;
  float discriminant = b * b - observerHeightKm * (2.0 * deckRadiusKm + observerHeightKm);
  vec3 color;
  float alpha;
  if (b < 0.0 && discriminant >= 0.0) {
    float distanceKm = -b - sqrt(discriminant);
    vec3 hit = observerKm + ray * distanceKm;
    vec3 normal = normalize(hit);
    // Aerial perspective first: the haze column between observer and deck (exponential
    // with the scale height) times the airmass where the ray meets the cloud tops;
    // grazing rays near the horizon cross the whole layer (Chapman-limited airmass).
    float column = hazeDepth * (1.0 - exp(-observerHeightKm / scaleHeightKm));
    float incidence = abs(dot(ray, normal));
    float maxAirmass = sqrt(1.5707963 * deckRadiusKm / scaleHeightKm);
    float transmittance = exp(-column * min(1.0 / max(incidence, 1e-4), maxAirmass));
    vec3 haze = horizonColor * irradiance * daylight * 0.9;
    vec3 lit = vec3(0.0);
    // Cloud structure is invisible through thick horizon haze: skip its cost there.
    if (transmittance > 0.02) {
      // Zonally stretched structure (anisotropic periods): winds shear features east–west.
      vec2 uv = deckUv(normal);
      vec3 warp = texture2D(noiseMap, uv * 0.37 + vec2(0.11, 0.23)).rgb - 0.5;
      float clouds = cloudFbm(uv + warp.xy * 0.9);
      float detail = cloudFbm(uv * 4.3 + warp.yz * 1.6);
      // Cloud masses over darker, redder gaps that look down into deeper layers.
      float cover = smoothstep(0.42, 0.58, clouds * 0.75 + detail * 0.25);
      // Thin zonal streaks finer than the map resolves (~200 km), sheared by the flow.
      float latitudeKm = asin(clamp(normal.y, -1.0, 1.0)) * deckRadiusKm;
      float streaks = 1.0 + 0.12 * sin(latitudeKm / 35.0 + warp.x * 6.0) + 0.06 * sin(latitudeKm / 9.0 + warp.y * 9.0);
      vec3 band = bandColor(normal) * streaks;
      vec3 deep = band * vec3(0.45, 0.36, 0.3);
      // Convective cells: bright, puffy tops where fine structure peaks.
      float puffs = smoothstep(0.62, 0.8, detail) * cover;
      vec3 albedo = mix(deep, band * mix(0.95, 1.2, detail), cover) + vec3(0.35) * convection * puffs;
      float lambert = max(0.0, dot(normal, sunDirection));
      // Slant illumination of cloud tops reads through relief-like shading.
      float relief = 0.85 + 0.3 * (clouds - 0.5) * smoothstep(0.0, 0.4, lambert);
      lit = albedo * irradiance * lambert * relief * exp(-zenithDepth * 0.5 / max(0.05, sunHeight));
      // Faint night light from moons, rings and stars (illustrative) keeps silhouettes.
      lit += albedo * irradiance * 0.02 * (1.0 - daylight);
      // Night side: lightning glows diffusing up through the deck (stochastic, slow cadence).
      vec3 cell = floor(hit / 120.0);
      float epoch = floor(timeSeconds * 1.7 + gHash(cell) * 9.0);
      float strike = step(1.0 - 0.02 * lightning, gHash(cell + epoch * 0.731));
      float glow = strike * exp(-length(hit / 120.0 - (cell + 0.5)) * 2.5);
      lit += vec3(0.75, 0.82, 1.0) * glow * irradiance * 3.0 * (1.0 - daylight);
    }
    color = lit * transmittance + haze * (1.0 - transmittance);
    alpha = 1.0;
  } else {
    // Less air above a higher observer: the sky darkens to black in space.
    float above = zenithDepth * exp(-observerHeightKm / scaleHeightKm);
    float airmass = min(1.0 / max(0.02, mu + 0.015), sqrt(1.5707963 * observerRadiusKm / scaleHeightKm));
    float transmittance = exp(-above * airmass);
    float rayleigh = 0.75 * (1.0 + cosine * cosine);
    float forward = pow(max(0.0, cosine), 6.0) * 1.5;
    vec3 tint = mix(horizonColor, zenithColor, pow(max(0.0, mu), 0.5));
    color = tint * (rayleigh + forward) * (1.0 - transmittance) * irradiance * daylight * 1.4;
    // The air dims everything behind it (Sun, moons, rings) by its transmittance.
    alpha = 1.0 - transmittance;
  }
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Full-sky dome: deck below the horizon, translucent scattering sky above. */
export class GiantPlanetAtmosphere {
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly material: ShaderMaterial;
  private readonly deckRadiusKm: number;
  private readonly noise = createCloudNoiseTexture();

  constructor(profile: GiantAtmosphereProfile, radiusKm: number) {
    this.deckRadiusKm = radiusKm + profile.deckAltitudeKm;
    this.material = new ShaderMaterial({
      uniforms: {
        upDirection: { value: new Vector3(0, 1, 0) },
        sunDirection: { value: new Vector3(1, 0, 0) },
        observerKm: { value: new Vector3(0, radiusKm + 25, 0) },
        observerRadiusKm: { value: radiusKm + 25 },
        observerHeightKm: { value: 25 - profile.deckAltitudeKm },
        deckRadiusKm: { value: this.deckRadiusKm },
        zenithColor: { value: new Color(profile.zenithColor) },
        horizonColor: { value: new Color(profile.horizonColor) },
        deckColor: { value: new Color(profile.deckColor) },
        zenithDepth: { value: profile.zenithOpticalDepth },
        scaleHeightKm: { value: profile.scaleHeightKm },
        hazeDepth: { value: profile.hazeDepth },
        lightning: { value: profile.lightning },
        convection: { value: profile.convection },
        irradiance: { value: 1 },
        daylight: { value: 1 },
        timeSeconds: { value: 0 },
        bandMap: { value: null as Texture | null },
        hasBandMap: { value: 0 },
        noiseMap: { value: this.noise },
        zonalTiles: { value: 1 },
        meridionalScale: { value: this.deckRadiusKm / MERIDIONAL_PERIOD_KM },
      },
      vertexShader: `varying vec3 sightline;
        void main() { sightline = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader,
      side: BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      // Premultiplied: sky radiance is added, and the scene behind is dimmed by the air.
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
    this.mesh = new Mesh(new SphereGeometry(1, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = "Giant-planet cloud deck and sky (illustrative)";
  }

  /** Observed zonal band colours (the body's installed global map). */
  setBandMap(texture: Texture | null): void {
    this.material.uniforms.bandMap.value = texture;
    this.material.uniforms.hasBandMap.value = texture ? 1 : 0;
  }

  update(positionM: Vector3, sunDirection: Vector3, _altitudeM: number, irradiance: number): void {
    const u = this.material.uniforms;
    const radiusKm = positionM.length() / 1000;
    u.upDirection.value.copy(positionM).normalize();
    u.sunDirection.value.copy(sunDirection).normalize();
    u.observerKm.value.copy(positionM).multiplyScalar(1 / 1000);
    u.observerRadiusKm.value = radiusKm;
    u.observerHeightKm.value = Math.max(0.05, radiusKm - this.deckRadiusKm);
    u.daylight.value = skySolarIllumination(u.upDirection.value.dot(u.sunDirection.value));
    // Whole noise periods around the observer's parallel keep the ±180° seam invisible.
    const latitudeCosine = Math.sqrt(Math.max(0, 1 - u.upDirection.value.y ** 2));
    u.zonalTiles.value = Math.max(1, Math.round((2 * Math.PI * this.deckRadiusKm * Math.max(0.05, latitudeCosine)) / ZONAL_PERIOD_KM));
    u.irradiance.value = Number.isFinite(irradiance) ? Math.max(0, irradiance) : 0;
    u.timeSeconds.value = performance.now() / 1000;
    this.mesh.visible = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.noise.dispose();
  }
}
