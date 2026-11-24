import { Color, Matrix4, MeshStandardMaterial } from "three";

/** NASA/PDS 1-bar radii, km. The catalog radius remains equatorial. */
export const SATURN_POLAR_RATIO = 54364 / 60268;
/** NASA NSSDCA major-ring boundaries; representative optical depths, not occultation data. */
export const SATURN_RING_ZONES = [
  { inner: 74658, outer: 91975, tau: 0.18 },
  { inner: 91975, outer: 117507, tau: 1.6 },
  { inner: 117507, outer: 122340, tau: 0.045 },
  { inner: 122340, outer: 136780, tau: 0.65 },
] as const;

export function saturnRingOpticalDepth(radiusKm: number): number {
  return SATURN_RING_ZONES.find(({ inner, outer }) => radiusKm >= inner && radiusKm < outer)?.tau ?? 0;
}
export function saturnRingTransmission(radiusKm: number, cosine: number): number {
  return Math.exp(-saturnRingOpticalDepth(radiusKm) / Math.max(0.025, Math.abs(cosine)));
}

const profile = `
float saturnTau(float r) {
  ${SATURN_RING_ZONES.map(({ inner, outer, tau }) => `if (r >= ${inner.toFixed(1)} && r < ${outer.toFixed(1)}) return ${tau};`).join("\n  ")}
  return 0.0;
}
uniform mat4 saturnWorldToBody;
uniform float saturnModelRadius;
vec3 saturnPoint() { return (saturnWorldToBody * vec4(cosmosSolarWorldPosition, 1.0)).xyz / saturnModelRadius; }
vec3 saturnSun() { return normalize(mat3(saturnWorldToBody) * cosmosSolarDirection(cosmosSolarWorldPosition)); }
// Illustrative unresolved ringlets; filter frequencies as their pixel footprint grows.
float saturnRinglets(float r) {
  float footprint = max(fwidth(r), 1.0);
  return 1.0 + 0.13 * sin(r * 0.0031) * exp(-footprint * 0.0031)
    + 0.10 * sin(r * 0.021) * exp(-footprint * 0.021)
    + 0.06 * sin(r * 0.079) * exp(-footprint * 0.079);
}
`;

/** Composes AFTER SolarMaterialLighting. Shared inverse transform follows the floating origin. */
export function configureSaturnLighting(material: MeshStandardMaterial, inverse: Matrix4, modelRadius: number, rings: boolean): void {
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.saturnWorldToBody = { value: inverse };
    shader.uniforms.saturnModelRadius = { value: modelRadius };
    // Solar functions must be declared before functions which call them.
    shader.fragmentShader = shader.fragmentShader.replace("void main() {", `${profile}\nvoid main() {`);
    const marker = "directLight.color *= cosmosSolarIrradiance * cosmosSolarVisibility(cosmosSolarWorldPosition);";
    if (!shader.fragmentShader.includes(marker)) throw new Error("Saturn requires solar material lighting first.");
    if (rings) {
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
        vec3 ringPoint = saturnPoint();
        float ringRadiusKm = length(ringPoint.xz) * 60268.0;
        float ringlets = saturnRinglets(ringRadiusKm);
        float ringDepth = saturnTau(ringRadiusKm) * ringlets;
        vec3 ringView = normalize(mat3(saturnWorldToBody) * (cameraPosition - cosmosSolarWorldPosition));
        #ifdef USE_MAP
          // Radial sampling from position avoids triangle-interpolation spokes.
          float radialUv = clamp((ringRadiusKm - 74658.0) / (136780.0 - 74658.0), 0.0, 1.0);
          vec3 scan = texture2D(map, vec2(radialUv, 0.5)).rgb;
          // This is an unlit-side scan, NOT a reflectance map. Keep only modest
          // source color/detail modulation over a neutral ice reconstruction.
          float luminance = dot(scan, vec3(0.2126, 0.7152, 0.0722));
          vec3 tint = clamp(scan / max(luminance, 0.04), vec3(0.7), vec3(1.25));
          diffuseColor.rgb *= vec3(0.62, 0.57, 0.48) * mix(vec3(1.0), tint, 0.3) * (0.6 + 0.4 * sqrt(luminance)) * ringlets;
        #endif
        diffuseColor.a = 1.0 - exp(-ringDepth / max(abs(ringView.y), 0.025));
      `).replace(marker, `${marker}
        vec3 p = saturnPoint() / vec3(1.0, ${SATURN_POLAR_RATIO}, 1.0);
        vec3 s = saturnSun() / vec3(1.0, ${SATURN_POLAR_RATIO}, 1.0);
        float t = max(0.0, -dot(p, s) / dot(s, s));
        float clearance = length(p + t * s);
        directLight.color *= smoothstep(0.996, 1.004, clearance);
        // Particle sheet: a bounded transmitted contribution on the unlit face.
        if (dot(normal, directLight.direction) < 0.0) {
          directLight.direction = reflect(directLight.direction, normal);
          directLight.color *= 0.35 * exp(-saturnTau(length(saturnPoint().xz) * 60268.0) / max(abs(saturnSun().y), 0.08));
        }
      `);
    } else {
      shader.fragmentShader = shader.fragmentShader.replace(marker, `${marker}
        vec3 p = saturnPoint();
        vec3 s = saturnSun();
        if (abs(s.y) > 0.0001) {
          float t = -p.y / s.y;
          if (t > 0.0) {
            float r = length((p + t * s).xz) * 60268.0;
            directLight.color *= exp(-saturnTau(r) * saturnRinglets(r) / max(abs(s.y), 0.025));
          }
        }
      `);
    }
  };
  material.customProgramCacheKey = () => `${key.call(material)}|saturn-sheet-v2-${rings}`;
}

/** Zonal reduction avoids mapping the OPAL ring-obscuration footprint onto the clouds.
 * Longitude-local weather is intentionally lost; missing latitudes use reconstruction.
 */
export function configureSaturnClouds(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.saturnCloudBase = { value: new Color("#d5c5a3") };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 saturnCloudBase;")
      .replace("#include <map_fragment>", `
        #ifdef USE_MAP
          vec3 zonal = vec3(0.0);
          float coverage = 0.0;
          for (int i = 0; i < 12; i++) {
            vec4 sampleColor = texture2D(map, vec2((float(i) + 0.5) / 12.0, vMapUv.y));
            zonal += sampleColor.rgb * sampleColor.a;
            coverage += sampleColor.a;
          }
          zonal /= max(coverage, 1.0);
          // Suppress the sparsely observed southern patches and feather the
          // ring-obscured latitude range. No invented longitude-local storms.
          float reliable = smoothstep(0.25, 0.32, vMapUv.y) * smoothstep(3.0, 10.0, coverage);
          reliable *= smoothstep(0.44, 0.48, vMapUv.y);
          float lat = (vMapUv.y - 0.5) * 3.14159265;
          float bands = 0.96 + 0.045 * cos(lat * 14.0) + 0.018 * sin(lat * 43.0 + 0.5);
          vec3 reconstructed = saturnCloudBase * bands;
          // The filter composite is not natural color: retain muted zonal
          // contrast in a disclosed warm color reconstruction, not green seams.
          float brightness = dot(zonal, vec3(0.2126, 0.7152, 0.0722));
          vec3 observedBands = saturnCloudBase * clamp(0.65 + brightness * 0.65, 0.72, 1.16);
          diffuseColor.rgb *= mix(reconstructed, observedBands, reliable);
        #endif
      `);
  };
  material.customProgramCacheKey = () => "saturn-cloud-zonal-reconstruction-v2";
}
