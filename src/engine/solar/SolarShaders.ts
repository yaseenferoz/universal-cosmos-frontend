/** Render-side approximations are documented separately from measured solar properties. */
export const SOLAR_OCCLUDER_LIMIT = 4;
export const CORONA_OUTER_RADII = 3;
export const CORONA_RELATIVE_RADIANCE = 1e-6;

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

export const photosphereFragmentShader = `
uniform float solarRadiance;
uniform float solarLimbCoefficient;
uniform sampler2D solarGranulation;
uniform float solarGranuleScale;
uniform float solarGranulationStrength;
uniform float solarPhotosphereGain;
varying vec3 solarLocalPosition;
varying vec3 solarWorldPosition;
varying vec3 solarWorldNormal;
${occultation}
void main() {
  if (solarPhotosphereGain <= 0.0) discard;
  vec3 ray = normalize(solarWorldPosition - cameraPosition);
  if (solarOcculted(ray)) discard;
  vec3 normal = normalize(solarWorldNormal);
  float mu = clamp(dot(normal, -ray), 0.0, 1.0);
  float limb = 1.0 - solarLimbCoefficient * (1.0 - mu);
  vec3 direction = normalize(solarLocalPosition);
  vec3 p = direction * solarGranuleScale;
  vec3 weight = pow(abs(direction), vec3(4.0));
  weight /= max(0.00001, weight.x + weight.y + weight.z);
  float cells = texture2D(solarGranulation, p.yz).r * weight.x
              + texture2D(solarGranulation, p.zx).r * weight.y
              + texture2D(solarGranulation, p.xy).r * weight.z;
  float cellsPerPixel = max(length(dFdx(p)), length(dFdy(p))) * 16.0;
  float resolved = 1.0 - smoothstep(0.35, 1.2, cellsPerPixel);
  float granulation = 1.0 + solarGranulationStrength * (cells - 0.65) * resolved;
  gl_FragColor = vec4(vec3(solarRadiance * limb * granulation * solarPhotosphereGain), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const coronaFragmentShader = `
uniform float solarRadiance;
uniform float solarRenderRadius;
uniform float solarCoronaGain;
varying vec3 solarWorldPosition;
varying vec3 solarWorldCenter;
${occultation}
void main() {
  vec3 ray = normalize(solarWorldPosition - cameraPosition);
  if (solarOcculted(ray)) discard;
  vec3 centerRay = solarWorldCenter - cameraPosition;
  float radius = length(cross(centerRay, ray)) / solarRenderRadius;
  if (radius <= 1.0 || radius >= ${CORONA_OUTER_RADII.toFixed(1)}) discard;
  // Finite radial display model, not a recovered coronal density/magnetic field.
  float profile = exp(-7.0 * (radius - 1.0)) * (1.0 - smoothstep(2.5, 3.0, radius));
  gl_FragColor = vec4(vec3(solarRadiance * ${CORONA_RELATIVE_RADIANCE} * profile * solarCoronaGain), 1.0);
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
