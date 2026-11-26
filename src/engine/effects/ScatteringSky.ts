import {
  BackSide, LinearFilter, Mesh, RepeatWrapping, ClampToEdgeWrapping, ShaderMaterial, SphereGeometry,
  NoColorSpace, Texture, TextureLoader, Vector3,
} from "three";
import type { Quality } from "../../types/celestial";

/**
 * Earth's clear-air optical constants at sea level (per metre), as used by
 * Bruneton & Neyret (2008) and Hillaire (2020): Rayleigh scattering for air at
 * 680/550/440 nm, a continental aerosol (Mie) layer, and ozone absorption.
 */
export const EARTH_ATMOSPHERE = {
  planetRadiusM: 6_371_000,
  atmosphereHeightM: 100_000,
  rayleighScattering: [5.802e-6, 13.558e-6, 33.1e-6] as const,
  rayleighScaleHeightM: 8_000,
  mieScattering: 3.996e-6,
  mieExtinction: 4.44e-6,
  mieScaleHeightM: 1_200,
  mieAsymmetry: 0.8,
  ozoneAbsorption: [0.65e-6, 1.881e-6, 0.085e-6] as const,
  /** Ozone layer: tent profile centred at 25 km, 30 km wide. */
  ozoneCenterM: 25_000,
  ozoneWidthM: 15_000,
};

/** Solar angular radius at 1 AU (R☉ = 695,700 km); scales as 1/distance. */
export const SOLAR_ANGULAR_RADIUS_1AU = Math.asin(695_700 / 149_597_870.7);
/**
 * Fraction of the eye-PSF glare drawn around the Sun in a sky. Chosen so the glare
 * against the daylit sky matches the strength used against planets in space.
 */
export const SKY_SUN_GLARE = 0.015;

/** Low cloud deck used for the cloud layer seen from the ground (metres above datum). */
export const CLOUD_BASE_M = 1_800;

/** Optical depth along a vertical column, per channel: Rayleigh + aerosol + ozone. */
export function zenithOpticalDepth(): [number, number, number] {
  const a = EARTH_ATMOSPHERE;
  const ozoneColumn = a.ozoneWidthM; // integral of a unit tent of half-width w is w
  return [0, 1, 2].map((c) =>
    a.rayleighScattering[c] * a.rayleighScaleHeightM + a.mieExtinction * a.mieScaleHeightM
    + a.ozoneAbsorption[c] * ozoneColumn) as [number, number, number];
}

const vertexShader = `
varying vec3 sightline;
void main() {
  sightline = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const fragmentShader = `
varying vec3 sightline;
uniform vec3 observer;          // body-fixed metres, +Y north
uniform vec3 sunDirection;      // unit, body-fixed
uniform float irradiance;       // relative to 1 AU
uniform float sunScale;         // display radiance scale of the solar beam
uniform sampler2D cloudMap;     // NASA Blue Marble cloud composite (equirectangular)
uniform float cloudsEnabled;
uniform int primarySteps;
uniform int lightSteps;
uniform float planetRadius, atmosphereRadius;
uniform vec3 betaR, betaO;
uniform float betaMs, betaMe, scaleR, scaleM, mieG, ozoneCenter, ozoneWidth, cloudBase;
uniform float sunAngularRadius; // radians, from the Sun's distance
uniform float sunGlare;         // eye/camera glare strength (display choice)

const float PI = 3.14159265359;

vec2 sphereHit(vec3 origin, vec3 dir, float radius) {
  float b = dot(origin, dir);
  float c = dot(origin, origin) - radius * radius;
  float d = b * b - c;
  if (d < 0.0) return vec2(1e30, -1e30);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}

vec3 densities(vec3 p) {
  float h = max(0.0, length(p) - planetRadius);
  float ozone = max(0.0, 1.0 - abs(h - ozoneCenter) / ozoneWidth);
  return vec3(exp(-h / scaleR), exp(-h / scaleM), ozone);
}

vec3 extinction(vec3 d) {
  return betaR * d.x + vec3(betaMe) * d.y + betaO * d.z;
}

// Transmittance from p toward the Sun (zero if the planet blocks it).
vec3 sunTransmittance(vec3 p) {
  if (sphereHit(p, sunDirection, planetRadius * 0.9995).x > 0.0) return vec3(0.0);
  float far = sphereHit(p, sunDirection, atmosphereRadius).y;
  float stepLength = far / float(lightSteps);
  vec3 optical = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= lightSteps) break;
    optical += densities(p + sunDirection * (float(i) + 0.5) * stepLength) * stepLength;
  }
  return exp(-extinction(optical));
}

float hash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}

void main() {
  vec3 ray = normalize(sightline);
  vec3 origin = observer;
  vec2 atmosphere = sphereHit(origin, ray, atmosphereRadius);
  float start = max(0.0, atmosphere.x);
  float end = atmosphere.y;
  float ground = sphereHit(origin, ray, planetRadius).x;
  // A miss returns 1e30; only a finite forward intersection is ground.
  bool hitsGround = ground > 0.0 && ground < 1e29;
  if (hitsGround) end = min(end, ground);
  vec3 up = normalize(origin);

  // Single scattering (Rayleigh + Mie) with ozone absorption, Nishita-style march.
  float mu = dot(ray, sunDirection);
  float rayleighPhase = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g2 = mieG * mieG;
  float miePhase = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * mieG * mu, 1.5));
  float stepLength = max(0.0, end - start) / float(primarySteps);
  vec3 optical = vec3(0.0);
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= primarySteps) break;
    vec3 p = origin + ray * (start + (float(i) + 0.5) * stepLength);
    vec3 d = densities(p) * stepLength;
    optical += d;
    vec3 attenuation = exp(-extinction(optical)) * sunTransmittance(p);
    sumR += d.x * attenuation;
    sumM += d.y * attenuation;
  }
  vec3 sky = sunScale * irradiance * (sumR * betaR * rayleighPhase + sumM * betaMs * miePhase);
  vec3 viewTransmittance = exp(-extinction(optical));
  float alpha = 1.0;
  if (hitsGround) {
    // Distant ground beyond the local terrain: Lambertian albedo ~0.15 (global land
    // average) under attenuated sunlight, seen through the same air column.
    vec3 g = origin + ray * ground;
    vec3 gn = normalize(g);
    vec3 direct = sunTransmittance(g) * max(0.0, dot(gn, sunDirection));
    sky += viewTransmittance * sunScale * irradiance * 0.15 / PI * (direct + 0.08 * vec3(0.5, 0.65, 1.0));
  }

  // The Sun itself, seen through the air column (reddened near the horizon), plus
  // the same eye-glare PSF as in space (Spencer et al. 1995). Clouds drawn below cover it.
  if (!hitsGround) {
    float theta = acos(clamp(mu, -1.0, 1.0));
    float disk = 1.0 - smoothstep(sunAngularRadius * 0.9, sunAngularRadius * 1.1, theta);
    float solidAngle = 6.2831853 * (1.0 - cos(sunAngularRadius));
    float sunRadiance = min(60000.0, sunScale * irradiance / max(solidAngle, 1e-9));
    float thetaDeg = degrees(max(theta, sunAngularRadius)) + 0.02;
    float psf = 0.478 * 20.91 / (thetaDeg * thetaDeg * thetaDeg) + 0.138 * 72.37 / (thetaDeg * thetaDeg);
    sky += viewTransmittance * (sunRadiance * disk + sunScale * irradiance * psf * sunGlare);
  }

  // Cloud deck: coverage from the NASA composite at the hit point, procedural detail.
  if (cloudsEnabled > 0.5 && dot(ray, up) > 0.0) {
    float hit = sphereHit(origin, ray, planetRadius + cloudBase).y;
    vec3 p = origin + ray * hit;
    vec3 n = normalize(p);
    float lat = asin(clamp(n.y, -1.0, 1.0));
    float lon = atan(-n.z, n.x);
    vec2 uv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
    float coverage = texture2D(cloudMap, uv).r;
    // Grayscale brightness → approximate fractional cover (not calibrated optical depth).
    coverage = smoothstep(0.08, 0.75, coverage);
    vec3 q = p / 2600.0;
    float warp = fbm(q * 0.35 + 3.1);
    float detail = fbm(q + vec3(warp * 1.6, 0.0, -warp * 1.6));
    float density = smoothstep(1.0 - coverage, 1.0 - coverage + 0.22, detail * 0.55 + coverage * 0.6);
    // Fade toward the horizon, where the deck is too foreshortened to resolve.
    float elevation = dot(ray, up);
    density *= smoothstep(0.0, 0.06, elevation);
    vec3 sunAtCloud = sunTransmittance(p);
    float cosine = dot(ray, sunDirection);
    float silver = pow(max(0.0, cosine), 12.0) * 0.8;
    // Seen from below, thin cloud transmits diffuse sunlight; thick bases go grey.
    // Radiance ≈ E·albedo/π with cloud albedo ~0.6–0.8 (Lambertian approximation).
    float thickness = mix(0.75, 0.3, density);
    vec3 lit = sunScale * irradiance * (0.7 / PI) * sunAtCloud * (thickness + silver) * max(0.0, dot(n, sunDirection) + 0.1);
    vec3 skylight = vec3(dot(sky, vec3(0.3333))) * 0.9 + sky * 0.2;
    vec3 cloudColor = lit + skylight;
    // Aerial perspective between observer and the cloud.
    float haze = 1.0 - exp(-hit / 60000.0);
    cloudColor = mix(cloudColor, sky, haze * 0.7);
    sky = mix(sky, cloudColor, density);
    viewTransmittance *= (1.0 - density);
  }

  // Stars show through only where the sky is dark and no cloud blocks them.
  float luminance = dot(sky, vec3(0.2126, 0.7152, 0.0722));
  alpha = clamp(luminance * 40.0, 0.0, 1.0);
  alpha = clamp(max(alpha, 1.0 - viewTransmittance.g), 0.0, 1.0);
  if (hitsGround) alpha = 1.0;
  gl_FragColor = vec4(sky, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Physically based clear-sky radiance for Earth plus a cloud deck whose coverage comes
 * from NASA's Blue Marble cloud composite (historical, not live weather).
 */
export class ScatteringSky {
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly material: ShaderMaterial;
  private cloudTexture: Texture | null = null;
  private disposed = false;

  private readonly datumRadiusM: number;

  /** `datumRadiusM` must match the terrain datum so the observer height agrees. */
  constructor(cloudMapUrl: string | null, quality: Quality = "auto", mobile = false, datumRadiusM = EARTH_ATMOSPHERE.planetRadiusM) {
    const a = { ...EARTH_ATMOSPHERE, planetRadiusM: datumRadiusM };
    this.datumRadiusM = datumRadiusM;
    const placeholder = new Texture();
    this.material = new ShaderMaterial({
      uniforms: {
        observer: { value: new Vector3(0, a.planetRadiusM + 2, 0) },
        sunDirection: { value: new Vector3(0, 1, 0) },
        irradiance: { value: 1 },
        sunScale: { value: 22 },
        cloudMap: { value: placeholder },
        cloudsEnabled: { value: 0 },
        primarySteps: { value: 16 },
        lightSteps: { value: 6 },
        planetRadius: { value: a.planetRadiusM },
        atmosphereRadius: { value: a.planetRadiusM + a.atmosphereHeightM },
        betaR: { value: new Vector3(...a.rayleighScattering) },
        betaO: { value: new Vector3(...a.ozoneAbsorption) },
        betaMs: { value: a.mieScattering },
        betaMe: { value: a.mieExtinction },
        scaleR: { value: a.rayleighScaleHeightM },
        scaleM: { value: a.mieScaleHeightM },
        mieG: { value: a.mieAsymmetry },
        ozoneCenter: { value: a.ozoneCenterM },
        ozoneWidth: { value: a.ozoneWidthM },
        cloudBase: { value: CLOUD_BASE_M },
        sunAngularRadius: { value: SOLAR_ANGULAR_RADIUS_1AU },
        sunGlare: { value: SKY_SUN_GLARE },
      },
      vertexShader, fragmentShader,
      side: BackSide, transparent: true, depthWrite: false, depthTest: false,
    });
    this.mesh = new Mesh(new SphereGeometry(1, 32, 16), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.setQuality(quality, mobile);
    if (cloudMapUrl) {
      new TextureLoader().load(cloudMapUrl, (texture) => {
        if (this.disposed) { texture.dispose(); return; }
        texture.colorSpace = NoColorSpace;
        texture.wrapS = RepeatWrapping;
        texture.wrapT = ClampToEdgeWrapping;
        texture.minFilter = texture.magFilter = LinearFilter;
        texture.generateMipmaps = false;
        this.cloudTexture = texture;
        this.material.uniforms.cloudMap.value = texture;
        this.material.uniforms.cloudsEnabled.value = 1;
      }, undefined, () => { /* Clear sky remains; the panel notes historical clouds. */ });
    }
  }

  setQuality(quality: Quality, mobile = false): void {
    const resolved = quality === "auto" ? (mobile ? "low" : "medium") : quality;
    this.material.uniforms.primarySteps.value = { low: 10, medium: 16, high: 24 }[resolved];
    this.material.uniforms.lightSteps.value = { low: 4, medium: 6, high: 8 }[resolved];
  }

  /** Matches PlanetarySky: observer in body-fixed metres, unit Sun direction. */
  update(positionM: Vector3, sunDirection: Vector3, _altitudeM: number, irradiance: number): void {
    // Keep the observer just above the datum so local relief never puts it underground.
    const radius = Math.max(positionM.length(), this.datumRadiusM + 2);
    this.material.uniforms.observer.value.copy(positionM).setLength(radius);
    this.material.uniforms.sunDirection.value.copy(sunDirection).normalize();
    this.material.uniforms.irradiance.value = Number.isFinite(irradiance) ? Math.max(0, irradiance) : 0;
    // Irradiance ∝ 1/d², so the Sun's angular radius scales with sqrt(irradiance).
    this.material.uniforms.sunAngularRadius.value = SOLAR_ANGULAR_RADIUS_1AU * Math.sqrt(Math.max(irradiance, 1e-6));
    this.mesh.visible = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.cloudTexture?.dispose();
  }
}
