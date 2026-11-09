import { AdditiveBlending, Matrix4, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3 } from "three";
import type { Quality } from "../../types/celestial";
import type { SunRenderFrame } from "./SunRenderer";
import { SOLAR_DISPLAY_RADIANCE, SOLAR_LIMB_DARKENING } from "./solarMath";
import { SOLAR_OCCLUDER_LIMIT } from "./SolarShaders";
import { SolarLensGhosts } from "./SolarLensGhosts";

export interface SolarGlareParameters {
  diskRadiusPixels: number;
  haloWidthPixels: number;
  rayReachPixels: number;
  peakRadiance: number;
}

/** Camera-optics approximation, separate from the solar atmosphere and physical disk. */
export function solarGlareParameters(
  diameterPixels: number, exposure: number, visibleFraction: number,
  strength: number, quality: Quality, mobile = false, viewportHeight = 800,
): SolarGlareParameters {
  const resolved = quality === "auto" ? mobile ? "low" : "medium" : quality;
  const diskRadiusPixels = Math.max(0, Number.isFinite(diameterPixels) ? diameterPixels / 2 : 0);
  const haloWidthPixels = Math.min({ low: 12, medium: 24, high: 40 }[resolved], 6 + Math.sqrt(diskRadiusPixels * 2) * 2);
  // Long spikes are a lens/sensor display effect. They contract for a close,
  // resolved disk and stay bounded in drawing-buffer pixels at every preset.
  const rayReachPixels = Math.min(
    { low: 150, medium: 650, high: 900 }[resolved],
    Math.max(haloWidthPixels, Math.max(1, viewportHeight) * 0.75) * Math.min(1, 90 / Math.max(90, diameterPixels)),
  );
  if (!(exposure > 0) || !Number.isFinite(exposure) || diskRadiusPixels === 0 || !(visibleFraction > 0) || !(strength > 0))
    return { diskRadiusPixels, haloWidthPixels, rayReachPixels, peakRadiance: 0 };
  const diskArea = Math.PI * diskRadiusPixels ** 2;
  const sigma = haloWidthPixels / 3;
  // The compact halo receives a bounded fraction of source flux. The faint
  // directional streaks and veil below are illustrative lens/sensor response.
  const kernelArea = diskArea + 2 * Math.PI * (diskRadiusPixels * sigma * Math.sqrt(Math.PI / 2) + sigma ** 2);
  const sourceFlux = SOLAR_DISPLAY_RADIANCE * (1 - SOLAR_LIMB_DARKENING / 3) * diskArea * Math.min(1, visibleFraction);
  const exposedPeak = Math.min(2, sourceFlux * exposure * 0.02 / Math.max(kernelArea, 1));
  return { diskRadiusPixels, haloWidthPixels, rayReachPixels, peakRadiance: exposedPeak * Math.min(1, strength) / exposure };
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

const fragmentShader = `
uniform float glareDiskRadius;
uniform float glareHaloWidth;
uniform float glareRayReach;
uniform float glarePeakRadiance;
uniform int glareOccluderCount;
uniform vec3 glareOccluderDirection[${SOLAR_OCCLUDER_LIMIT}];
uniform float glareOccluderSineSquared[${SOLAR_OCCLUDER_LIMIT}];
varying vec2 glarePixelOffset;
varying vec3 glareSightRay;
void main() {
  vec3 ray = normalize(glareSightRay);
  for (int index = 0; index < ${SOLAR_OCCLUDER_LIMIT}; index++) {
    if (index >= glareOccluderCount) break;
    vec3 separation = cross(ray, glareOccluderDirection[index]);
    if (dot(ray, glareOccluderDirection[index]) > 0.0 && dot(separation, separation) <= glareOccluderSineSquared[index]) discard;
  }
  float radius = length(glarePixelOffset);
  float edgeDistance = max(0.0, radius - glareDiskRadius);
  if (edgeDistance >= max(glareHaloWidth, glareRayReach)) discard;
  float sigma = glareHaloWidth / 3.0;
  float halo = exp(-0.5 * edgeDistance * edgeDistance / (sigma * sigma));
  halo *= 1.0 - smoothstep(glareHaloWidth * 0.85, glareHaloWidth, edgeDistance);
  float fade = 1.0 - smoothstep(glareRayReach * 0.72, glareRayReach, edgeDistance);
  float angle = atan(glarePixelOffset.y, glarePixelOffset.x);
  // Mixed broad and fine lobes produce many soft optical rays, without a hard cross.
  float broad = pow(abs(cos(4.0 * angle)), 2.0);
  float fine = pow(0.5 + 0.5 * cos(32.0 * angle + 0.25 * sin(7.0 * angle)), 3.0);
  float envelope = exp(-edgeDistance / max(1.0, glareRayReach * 0.7)) * fade;
  float streaks = (0.025 * broad + 0.05 * fine) * envelope;
  float veil = 0.11 * exp(-edgeDistance / max(1.0, glareRayReach * 0.42)) * fade;
  float blueShift = smoothstep(glareHaloWidth, max(glareHaloWidth + 1.0, glareRayReach * 0.6), edgeDistance);
  vec3 tint = mix(vec3(1.0), vec3(0.62, 0.73, 1.0), blueShift);
  gl_FragColor = vec4(tint * glarePeakRadiance * (halo + streaks + veil), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class SolarGlare {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly ghosts = new SolarLensGhosts();
  private readonly uniforms = {
    solarRenderRadius: { value: 1 }, glareViewport: { value: new Vector2(1, 1) },
    glareOuterRadius: { value: 1 }, glareDiskRadius: { value: 0 },
    glareHaloWidth: { value: 1 }, glareRayReach: { value: 1 }, glarePeakRadiance: { value: 0 },
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
      transparent: true, blending: AdditiveBlending, depthTest: true, depthWrite: false, toneMapped: true,
    }));
    this.mesh.name = "Bounded camera-optics solar glare; not solar plasma";
    this.mesh.visible = false;
    this.mesh.frustumCulled = false; // Clip-space quad; its world-space bounds do not describe its pixel footprint.
  }

  update(frame: SunRenderFrame, diameterPixels: number, strength: number, quality: Quality, mobile: boolean): void {
    if (this.disposed) return;
    const parameters = solarGlareParameters(diameterPixels, frame.exposure, frame.visibleSolarFraction ?? 1, strength, quality, mobile, frame.viewportHeight);
    this.mesh.getWorldPosition(this.center);
    frame.camera.getWorldPosition(this.eye);
    frame.camera.getWorldDirection(this.forward);
    this.mesh.visible = parameters.peakRadiance > 0 && this.toSun.copy(this.center).sub(this.eye).dot(this.forward) > 0;
    this.projected.copy(this.center).project(frame.camera);
    this.sunNdc.set(this.projected.x, this.projected.y);
    this.ghosts.update(
      this.sunNdc, this.projected.z, parameters.peakRadiance * 0.5,
      this.mesh.visible && this.projected.z >= -1 && this.projected.z <= 1
        && quality !== "low" && !(quality === "auto" && mobile),
    );
    this.uniforms.solarRenderRadius.value = frame.renderRadius;
    this.uniforms.glareViewport.value.set(Math.max(1, frame.viewportHeight * frame.camera.aspect), Math.max(1, frame.viewportHeight));
    this.uniforms.glareOuterRadius.value = parameters.diskRadiusPixels + Math.max(parameters.haloWidthPixels, parameters.rayReachPixels);
    this.uniforms.glareDiskRadius.value = parameters.diskRadiusPixels;
    this.uniforms.glareHaloWidth.value = parameters.haloWidthPixels;
    this.uniforms.glareRayReach.value = parameters.rayReachPixels;
    this.uniforms.glarePeakRadiance.value = parameters.peakRadiance;
    this.uniforms.glareInverseProjection.value.copy(frame.camera.projectionMatrixInverse);
    this.uniforms.glareCameraWorld.value.copy(frame.camera.matrixWorld);
    let count = 0;
    for (const occluder of frame.occluders ?? []) {
      if (count >= SOLAR_OCCLUDER_LIMIT) break;
      const length = occluder.direction.lengthSq();
      if (!(length > 0) || !Number.isFinite(length) || !(occluder.angularRadiusRad > 0) || occluder.angularRadiusRad > Math.PI / 2 || !Number.isFinite(occluder.angularRadiusRad)) continue;
      this.uniforms.glareOccluderDirection.value[count].copy(occluder.direction).normalize();
      this.uniforms.glareOccluderSineSquared.value[count] = Math.sin(occluder.angularRadiusRad) ** 2;
      count++;
    }
    this.uniforms.glareOccluderCount.value = count;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.ghosts.dispose();
  }
}
