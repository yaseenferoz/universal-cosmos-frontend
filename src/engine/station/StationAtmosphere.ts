import { AdditiveBlending, BackSide, ShaderMaterial, type IUniform, type Vector3 } from "three";

/**
 * Earth's atmosphere as seen from the ISS: single scattering by air (Rayleigh) and aerosol (Mie)
 * in an exponential atmosphere, with analytic column depths (no ray marching).
 *
 * - The glow beyond the limb comes from how deep each line of sight dips into the air: its
 *   tangent altitude. High rays cross thin air and scatter mostly blue; low rays are optically
 *   thick in every colour and look white; rays lit by sunlight that has crossed the atmosphere at
 *   a grazing angle are reddened (the twilight band).
 * - Over the disk the same model dims the ground and adds path radiance (aerial perspective), so
 *   the surface blends into the limb haze instead of meeting a painted rim.
 *
 * Approximations: single scattering with an empirical gain standing in for multiple scattering;
 * spherical-shell air-mass formula; sunlight on a path evaluated at one effective height; no ozone
 * absorption; a fixed global aerosol load. It is a physically shaped illustration, not radiometry.
 */

const EARTH_RADIUS_KM = 6378.137;
/** Rayleigh (air) and aerosol density scale heights, km. */
export const RAYLEIGH_SCALE_HEIGHT_KM = 8;
export const AEROSOL_SCALE_HEIGHT_KM = 1.2;
/** Representative red, green and blue wavelengths, micrometres. */
const WAVELENGTHS_UM = [0.68, 0.55, 0.44] as const;
type Rgb = [number, number, number];

/** Sea-level vertical Rayleigh optical depth (Hansen & Travis 1974, standard atmosphere). */
export function rayleighOpticalDepth(wavelengthUm: number): number {
  const l2 = wavelengthUm ** -2;
  return 0.008569 * l2 * l2 * (1 + 0.0113 * l2 + 0.00013 * l2 * l2);
}
export const RAYLEIGH_TAU = WAVELENGTHS_UM.map(rayleighOpticalDepth) as Rgb;
/** Clear-sky aerosol optical depth 0.12 at 550 nm with Ångström exponent 1.3 (near the global mean). */
export const AEROSOL_TAU = WAVELENGTHS_UM.map((l) => 0.12 * (l / 0.55) ** -1.3) as Rgb;
const AEROSOL_ALBEDO = 0.9;
const AEROSOL_ASYMMETRY = 0.7;
/** Empirical gain for light scattered more than once (single scattering alone looks too dark). */
const MULTIPLE_SCATTERING_GAIN = 1.6;
/** Share of light scattered out of the direct beam that reaches the ground as skylight. */
const SKYLIGHT_SHARE = 0.5;
/**
 * Night airglow (oxygen 557.7 nm) in a thin layer near 95 km, seen edge-on as a green line.
 * Only drawn where the limb is in darkness; its brightness is raised so a station-exposed view
 * shows what long-exposure photographs from the ISS record.
 */
const AIRGLOW_HEIGHT_KM = 95;
const AIRGLOW_WIDTH_KM = 5;
const AIRGLOW_COLOR: Rgb = [0.3, 1, 0.28];
const AIRGLOW_SCALE = 8e-4;

/** Air mass of a homogeneous shell one scale height thick, from radius r at cos(zenith) mu ≥ 0. */
export function airmass(radiusKm: number, mu: number, scaleHeightKm: number): number {
  const k = radiusKm / scaleHeightKm;
  // Rationalised form of sqrt(k²μ² + 2k + 1) − kμ (no cancellation near the zenith).
  return (2 * k + 1) / (Math.sqrt(k * k * mu * mu + 2 * k + 1) + k * mu);
}

/**
 * Column from radius r to space along cos(zenith) mu, in units of the sea-level vertical column.
 * Below the horizon (mu < 0) the ray grazes a lower height first (Chapman's construction);
 * if that is inside the Earth the point is in Earth's shadow (returns a huge column).
 */
export function columnToSpace(radiusKm: number, mu: number, scaleHeightKm: number): number {
  const density = (r: number) => Math.exp(-(r - EARTH_RADIUS_KM) / scaleHeightKm);
  if (mu >= 0) return density(radiusKm) * airmass(radiusKm, mu, scaleHeightKm);
  const grazing = radiusKm * Math.sqrt(Math.max(0, 1 - mu * mu));
  if (grazing <= EARTH_RADIUS_KM) return 1e4;
  return 2 * density(grazing) * airmass(grazing, 0, scaleHeightKm) - density(radiusKm) * airmass(radiusKm, -mu, scaleHeightKm);
}

function rayleighPhase(nu: number): number { return 0.75 * (1 + nu * nu); }
function miePhase(nu: number): number {
  const g = AEROSOL_ASYMMETRY;
  return (1 - g * g) / Math.max(1 + g * g - 2 * g * nu, 1e-4) ** 1.5;
}

/** Path radiance per unit solar irradiance for given view/sun columns (see the shader's atmoScatter). */
function scatter(viewR: number, viewM: number, sunR: number, sunM: number, nu: number): Rgb {
  return [0, 1, 2].map((i) => {
    const tv = RAYLEIGH_TAU[i] * viewR + AEROSOL_TAU[i] * viewM;
    const s = rayleighPhase(nu) * RAYLEIGH_TAU[i] * viewR + AEROSOL_ALBEDO * miePhase(nu) * AEROSOL_TAU[i] * viewM;
    const fraction = tv > 1e-5 ? (1 - Math.exp(-tv)) / tv : 1;
    const sunlight = Math.exp(-(RAYLEIGH_TAU[i] * sunR + AEROSOL_TAU[i] * sunM));
    return (s * fraction * sunlight * MULTIPLE_SCATTERING_GAIN) / (4 * Math.PI);
  }) as Rgb;
}

/**
 * Limb radiance per unit solar irradiance for a line of sight grazing `tangentAltitudeKm`, with
 * the Sun at cos(zenith) `sunMu` above the tangent point and cos(scattering angle) `nu`.
 */
export function limbRadiance(tangentAltitudeKm: number, sunMu: number, nu = 0): Rgb {
  const r = EARTH_RADIUS_KM + Math.max(0, tangentAltitudeKm);
  const h = r - EARTH_RADIUS_KM;
  const view = (H: number) => Math.exp(-h / H) * Math.sqrt((2 * Math.PI * r) / H);
  const H_R = RAYLEIGH_SCALE_HEIGHT_KM, H_M = AEROSOL_SCALE_HEIGHT_KM;
  return scatter(view(H_R), view(H_M), columnToSpace(r + H_R, sunMu, H_R), columnToSpace(r + H_M, sunMu, H_M), nu);
}

/** Fraction of light from the ground that reaches space at cos(view zenith) `mu`. */
export function groundTransmittance(mu: number): Rgb {
  const r = EARTH_RADIUS_KM;
  const cr = airmass(r, mu, RAYLEIGH_SCALE_HEIGHT_KM), cm = airmass(r, mu, AEROSOL_SCALE_HEIGHT_KM);
  return [0, 1, 2].map((i) => Math.exp(-(RAYLEIGH_TAU[i] * cr + AEROSOL_TAU[i] * cm))) as Rgb;
}

/* ---------- Shaders (positions in the station backdrop's 100 km units) ---------- */

const UNIT_KM = 100;
function glsl(value: number): string {
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}
const vec3 = (rgb: Rgb) => `vec3(${rgb.map(glsl).join(", ")})`;

/** Uniforms shared by the atmosphere chunk; positions and directions in one consistent space. */
export interface AtmosphereUniforms {
  /** Earth's centre in the space the shader works in (view space for surfaces, world for the limb). */
  atmoCenter: IUniform<Vector3>;
  /** Unit vector toward the Sun, same space. */
  atmoSun: IUniform<Vector3>;
  /** Solar irradiance in display units (colour × intensity). */
  atmoIrradiance: IUniform<Vector3>;
}

const ATMOSPHERE_CHUNK = `
uniform vec3 atmoCenter;
uniform vec3 atmoSun;
uniform vec3 atmoIrradiance;
const float ATMO_PI = 3.141592653589793;
const float ATMO_R = ${glsl(EARTH_RADIUS_KM / UNIT_KM)};
const float ATMO_HR = ${glsl(RAYLEIGH_SCALE_HEIGHT_KM / UNIT_KM)};
const float ATMO_HM = ${glsl(AEROSOL_SCALE_HEIGHT_KM / UNIT_KM)};
const vec3 ATMO_TR = ${vec3(RAYLEIGH_TAU)};
const vec3 ATMO_TM = ${vec3(AEROSOL_TAU)};
float atmoAirmass(float r, float mu, float H) {
  float k = r / H;
  return (2.0 * k + 1.0) / (sqrt(k * k * mu * mu + 2.0 * k + 1.0) + k * mu);
}
float atmoColumn(float r, float mu, float H) {
  if (mu >= 0.0) return exp(-(r - ATMO_R) / H) * atmoAirmass(r, mu, H);
  float rg = r * sqrt(max(1.0 - mu * mu, 0.0));
  if (rg <= ATMO_R) return 1.0e4;
  return 2.0 * exp(-(rg - ATMO_R) / H) * atmoAirmass(rg, 0.0, H) - exp(-(r - ATMO_R) / H) * atmoAirmass(r, -mu, H);
}
vec3 atmoScatter(float viewR, float viewM, float sunR, float sunM, float nu) {
  float g = ${glsl(AEROSOL_ASYMMETRY)};
  float phaseR = 0.75 * (1.0 + nu * nu);
  float phaseM = (1.0 - g * g) / pow(max(1.0 + g * g - 2.0 * g * nu, 1.0e-4), 1.5);
  vec3 tv = ATMO_TR * viewR + ATMO_TM * viewM;
  vec3 s = phaseR * ATMO_TR * viewR + ${glsl(AEROSOL_ALBEDO)} * phaseM * ATMO_TM * viewM;
  vec3 fraction = (1.0 - exp(-tv)) / max(tv, vec3(1.0e-5));
  vec3 sunlight = exp(-(ATMO_TR * sunR + ATMO_TM * sunM));
  return atmoIrradiance * s * fraction * sunlight * ${glsl(MULTIPLE_SCATTERING_GAIN)} / (4.0 * ATMO_PI);
}
`;

type ShaderSource = { uniforms: Record<string, IUniform>; fragmentShader: string };

/**
 * Add aerial perspective to a MeshStandardMaterial drawn in the backdrop: sunlight reaching the
 * surface is reddened and dimmed by its path through the air (plus skylight), and light leaving
 * the surface is attenuated and joined by scattered light. Uniforms must be in view space.
 */
export function injectAerialPerspective(shader: ShaderSource, uniforms: AtmosphereUniforms): void {
  Object.assign(shader.uniforms, uniforms);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${ATMOSPHERE_CHUNK}`)
    .replace("#include <aomap_fragment>", `#include <aomap_fragment>
      vec3 atmoP = -vViewPosition;
      vec3 atmoUp = atmoP - atmoCenter;
      float atmoRadius = max(length(atmoUp), ATMO_R);
      atmoUp = normalize(atmoUp);
      vec3 atmoView = normalize(atmoP);
      float atmoMuV = max(dot(atmoUp, -atmoView), 0.0);
      float atmoMuS = dot(atmoUp, atmoSun);
      float atmoViewR = exp(-(atmoRadius - ATMO_R) / ATMO_HR) * atmoAirmass(atmoRadius, atmoMuV, ATMO_HR);
      float atmoViewM = exp(-(atmoRadius - ATMO_R) / ATMO_HM) * atmoAirmass(atmoRadius, atmoMuV, ATMO_HM);
      vec3 atmoTv = exp(-(ATMO_TR * atmoViewR + ATMO_TM * atmoViewM));
      vec3 atmoTs = exp(-(ATMO_TR * atmoColumn(atmoRadius, atmoMuS, ATMO_HR) + ATMO_TM * atmoColumn(atmoRadius, atmoMuS, ATMO_HM)));
      reflectedLight.directDiffuse *= atmoTs + ${glsl(SKYLIGHT_SHARE)} * (1.0 - atmoTs) * smoothstep(0.0, 0.25, atmoMuS);
      reflectedLight.directSpecular *= atmoTs;
      vec3 atmoIn = atmoScatter(atmoViewR, atmoViewM,
        atmoColumn(atmoRadius + ATMO_HR, atmoMuS, ATMO_HR), atmoColumn(atmoRadius + ATMO_HM, atmoMuS, ATMO_HM), dot(atmoView, atmoSun));`)
    .replace("#include <opaque_fragment>", "outgoingLight = outgoingLight * atmoTv + atmoIn;\n#include <opaque_fragment>");
}

/** Glow beyond the limb: the inner face of a shell enclosing the atmosphere. Uniforms in world space. */
export function atmosphereLimbMaterial(uniforms: AtmosphereUniforms): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...uniforms },
    vertexShader: `varying vec3 vWorld;
      void main() { vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz; gl_Position = projectionMatrix * viewMatrix * world; }`,
    fragmentShader: `${ATMOSPHERE_CHUNK}
      varying vec3 vWorld;
      void main() {
        vec3 d = normalize(vWorld - cameraPosition);
        vec3 oc = atmoCenter - cameraPosition;
        float t = dot(oc, d);
        if (t <= 0.0) discard;
        // Lowest point of the line of sight (rays that would meet the globe are hidden by it;
        // clamping keeps tessellation slivers at the limb filled with the horizon colour).
        float r = max(sqrt(max(dot(oc, oc) - t * t, 0.0)), ATMO_R);
        float h = r - ATMO_R;
        float muS = dot(normalize(cameraPosition + d * t - atmoCenter), atmoSun);
        float viewR = exp(-h / ATMO_HR) * sqrt(2.0 * ATMO_PI * r / ATMO_HR);
        float viewM = exp(-h / ATMO_HM) * sqrt(2.0 * ATMO_PI * r / ATMO_HM);
        vec3 color = atmoScatter(viewR, viewM, atmoColumn(r + ATMO_HR, muS, ATMO_HR), atmoColumn(r + ATMO_HM, muS, ATMO_HM), dot(d, atmoSun));
        float z = h - ${glsl(AIRGLOW_HEIGHT_KM / UNIT_KM)};
        float w = ${glsl(AIRGLOW_WIDTH_KM / UNIT_KM)};
        float airglow = sqrt(r / (2.0 * max(-z, w))) * exp(-0.5 * max(z, 0.0) * max(z, 0.0) / (w * w));
        color += ${vec3(AIRGLOW_COLOR.map((c) => c * AIRGLOW_SCALE) as Rgb)} * airglow * (1.0 - smoothstep(-0.35, -0.1, muS));
        // Same exposure and output encoding as the lit surfaces it meets at the horizon.
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: BackSide, transparent: true, blending: AdditiveBlending, depthWrite: false,
  });
}

/** Radius of the limb shell, in backdrop units: tangent heights up to ~130 km are covered. */
export const ATMOSPHERE_SHELL_RADIUS = (EARTH_RADIUS_KM + 130) / UNIT_KM;
