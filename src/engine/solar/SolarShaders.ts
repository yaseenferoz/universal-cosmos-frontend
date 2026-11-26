/** Render-side approximations are documented separately from measured solar properties. */
export const SOLAR_OCCLUDER_LIMIT = 4;
export const CORONA_OUTER_RADII = 6;
/** Baumbach brightness just above the limb (r = 1.0), relative to mean disk brightness. */
export const CORONA_RELATIVE_RADIANCE = 4e-6;
/**
 * Corona display level: tone-mapper input just above the limb. The true corona is
 * ~4e-6 of the disk and invisible beside it, so — like processed eclipse photographs —
 * it is shown at this fixed level regardless of exposure, keeping the Baumbach radial
 * falloff. Disclosed in the UI.
 */
export const CORONA_DISPLAY_LEVEL = 0.16;
/** Radial range compression exponent, like a radial-gradient eclipse filter. */
export const CORONA_RADIAL_COMPRESSION = 0.45;

export const solarVertexShader = `
varying vec3 solarLocalPosition;
varying vec3 solarWorldPosition;
varying vec3 solarWorldNormal;
varying vec3 solarWorldCenter;
void main() {
  solarLocalPosition = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  solarWorldPosition = world.xyz;
  solarWorldNormal = normalize(mat3(modelMatrix) * normal);
  solarWorldCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const occultation = `
uniform int solarOccluderCount;
uniform vec3 solarOccluderDirection[${SOLAR_OCCLUDER_LIMIT}];
uniform float solarOccluderSineSquared[${SOLAR_OCCLUDER_LIMIT}];
bool solarOcculted(vec3 sightRay) {
  for (int index = 0; index < ${SOLAR_OCCLUDER_LIMIT}; index++) {
    if (index >= solarOccluderCount) break;
    vec3 separation = cross(sightRay, solarOccluderDirection[index]);
    if (dot(sightRay, solarOccluderDirection[index]) > 0.0 && dot(separation, separation) <= solarOccluderSineSquared[index]) return true;
  }
  return false;
}`;

export const SOLAR_SPOT_LIMIT = 24;

export const photosphereFragmentShader = `
uniform float solarRadiance;
uniform vec3 solarLimbAlpha;
uniform vec3 solarColor;
uniform sampler2D solarGranulation;
uniform float solarGranuleScale;
uniform float solarGranulationStrength;
uniform float solarPhotosphereGain;
uniform int solarSpotCount;
// xyz: unit direction in the Sun's body frame; w: umbra angular radius (rad).
uniform vec4 solarSpots[${SOLAR_SPOT_LIMIT}];
varying vec3 solarLocalPosition;
varying vec3 solarWorldPosition;
varying vec3 solarWorldNormal;
${occultation}
float granules(vec3 p, vec3 weight) {
  return texture2D(solarGranulation, p.yz).r * weight.x
       + texture2D(solarGranulation, p.zx).r * weight.y
       + texture2D(solarGranulation, p.xy).r * weight.z;
}
void main() {
  if (solarPhotosphereGain <= 0.0) discard;
  vec3 ray = normalize(solarWorldPosition - cameraPosition);
  if (solarOcculted(ray)) discard;
  vec3 normal = normalize(solarWorldNormal);
  float mu = clamp(dot(normal, -ray), 0.0, 1.0);
  // Chromatic power-law limb darkening: the limb is darker and redder.
  // μ ≥ 0.05 (the law's fitted range) also avoids a dark faceted rim on the mesh edge.
  vec3 limb = pow(vec3(max(mu, 0.05)), solarLimbAlpha);
  vec3 direction = normalize(solarLocalPosition);
  vec3 p = direction * solarGranuleScale;
  vec3 weight = pow(abs(direction), vec3(4.0));
  weight /= max(0.00001, weight.x + weight.y + weight.z);
  float cells = granules(p, weight);
  float cellsPerPixel = max(length(dFdx(p)), length(dFdy(p))) * 16.0;
  float resolved = 1.0 - smoothstep(0.35, 1.2, cellsPerPixel);
  float granulation = 1.0 + solarGranulationStrength * (cells - 0.65) * resolved;
  // Illustrative sunspot groups: dark umbra, filamentary penumbra, limb faculae.
  float spot = 1.0;
  float faculae = 0.0;
  for (int index = 0; index < ${SOLAR_SPOT_LIMIT}; index++) {
    if (index >= solarSpotCount) break;
    vec4 s = solarSpots[index];
    float angle = acos(clamp(dot(direction, s.xyz), -1.0, 1.0));
    float umbra = 1.0 - smoothstep(s.w * 0.85, s.w * 1.05, angle);
    float penumbra = 1.0 - smoothstep(s.w * 2.0, s.w * 2.6, angle);
    vec3 tangent = normalize(direction - s.xyz * dot(direction, s.xyz) + 1e-6);
    float filaments = 0.85 + 0.15 * granules(tangent * solarGranuleScale * 0.35, weight);
    spot *= mix(1.0, mix(0.72 * filaments, 0.22, umbra), penumbra);
    faculae += 1.0 - smoothstep(s.w * 2.5, s.w * 7.0, angle);
  }
  // Faculae are only prominent toward the limb, where the contrast rises.
  float facularBoost = 1.0 + 0.18 * min(faculae, 1.0) * pow(1.0 - mu, 1.5) * (1.0 - (1.0 - spot));
  vec3 color = solarColor * limb * granulation * spot * facularBoost;
  // Umbrae are cooler (~4000 K) and so redder than the photosphere.
  color *= mix(vec3(1.0), vec3(1.0, 0.82, 0.66), 1.0 - spot);
  gl_FragColor = vec4(color * solarRadiance * solarPhotosphereGain, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const coronaFragmentShader = `
uniform float solarRadiance;
uniform float solarRenderRadius;
uniform float solarCoronaGain;
uniform vec3 solarPole;
uniform vec3 solarColor;
varying vec3 solarWorldPosition;
varying vec3 solarWorldCenter;
${occultation}
float hash(float n) { return fract(sin(n) * 43758.5453123); }
float angularNoise(float angle, float lobes, float seed) {
  float x = angle / 6.28318530718 * lobes;
  float i = floor(x);
  float f = fract(x);
  float a = hash(i + seed);
  float b = hash(mod(i + 1.0, lobes) + seed);
  return mix(a, b, f * f * (3.0 - 2.0 * f));
}
void main() {
  vec3 ray = normalize(solarWorldPosition - cameraPosition);
  if (solarOcculted(ray)) discard;
  vec3 centerRay = solarWorldCenter - cameraPosition;
  // Point of closest approach to the Sun's center along this sight line (sky plane).
  vec3 skyPoint = cameraPosition + ray * dot(centerRay, ray) - solarWorldCenter;
  float radius = length(skyPoint) / solarRenderRadius;
  // Fill slivers between the faceted photosphere mesh and the true limb (the disk's
  // depth hides the corona everywhere it is actually drawn).
  if (dot(centerRay, ray) <= 0.0 || radius <= 0.97 || radius >= ${CORONA_OUTER_RADII.toFixed(1)}) discard;
  radius = max(radius, 1.0);
  // Baumbach (1937) radial profile, relative to mean disk brightness.
  float baumbach = 1e-6 * (0.0532 * pow(radius, -2.5) + 1.425 * pow(radius, -7.0) + 2.565 * pow(radius, -17.0));
  // Illustrative structure: equatorial helmet streamers, narrower polar plumes.
  vec3 skyDirection = skyPoint / max(length(skyPoint), 1e-6);
  vec3 poleOnSky = normalize(solarPole - ray * dot(solarPole, ray) + 1e-6);
  vec3 eastOnSky = normalize(cross(ray, poleOnSky));
  float positionAngle = atan(dot(skyDirection, eastOnSky), dot(skyDirection, poleOnSky));
  float latitude = abs(asin(clamp(dot(skyDirection, poleOnSky), -1.0, 1.0)));
  float streamerBelt = exp(-pow((1.5708 - latitude) / 0.55, 2.0));
  float streamers = pow(angularNoise(positionAngle, 18.0, 3.0), 3.0) * 0.6 + pow(angularNoise(positionAngle, 7.0, 11.0), 2.0) * 0.8;
  float narrowing = smoothstep(1.05, 2.2, radius);
  float plumes = (1.0 - streamerBelt) * pow(angularNoise(positionAngle, 60.0, 29.0), 6.0) * 0.5;
  float structure = mix(1.0, 0.35 + streamerBelt * (0.5 + 1.4 * streamers) + plumes, narrowing);
  float edge = 1.0 - smoothstep(${(CORONA_OUTER_RADII * 0.8).toFixed(1)}, ${CORONA_OUTER_RADII.toFixed(1)}, radius);
  // Pearly white K-corona, slightly warmer close to the limb.
  vec3 tint = mix(solarColor, vec3(0.92, 0.95, 1.0), smoothstep(1.0, 2.5, radius));
  float compressed = pow(baumbach / ${CORONA_RELATIVE_RADIANCE.toExponential()}, ${CORONA_RADIAL_COMPRESSION.toFixed(2)});
  gl_FragColor = vec4(tint * solarRadiance * compressed * structure * edge * solarCoronaGain, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const unresolvedVertexShader = `
uniform float solarPointSize;
uniform float solarRenderRadius;
void main() {
  vec3 center = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 nearestPhotosphere = center + normalize(cameraPosition - center) * solarRenderRadius;
  gl_Position = projectionMatrix * viewMatrix * vec4(nearestPhotosphere, 1.0);
  gl_PointSize = solarPointSize;
}`;

export const unresolvedFragmentShader = `
uniform float solarPointRadiance;
void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  float kernel = exp(-12.0 * dot(centered, centered));
  // Integral over the unit square is approximately 0.2543; the CPU accounts for pixel area.
  gl_FragColor = vec4(vec3(solarPointRadiance * kernel / 0.2543), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
