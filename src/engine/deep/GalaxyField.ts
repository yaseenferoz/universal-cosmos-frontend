import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3, type Texture } from "three";
import type { GalaxyCatalog } from "../../data/deep/galaxies";
import { MILKY_WAY, milkyWayFrame } from "../../data/deep/milkyWay";
import { blackbodyLinearRgbFast, bvToTemperature } from "../stars/stellarPhysics";
import { DEEP_SKY_GAIN, galaxyColorIndex, REFERENCE_PIXEL_SR } from "./deepPhotometry";
import { galaxyArchetype, MILKY_WAY_CELL } from "./galaxyMaps";
import { bulgeShape, inPlaneAxis, milkyWayBulge, seedAngle } from "./galaxyModel";
import { GALAXY_COMMON } from "./galaxyShaders";

/** Galaxies drawn as volumes instead of sprites at any moment (the sprite fades out for them). */
export const MAX_DETAILED = 8;

/** Per-galaxy shape attributes, shared with the volumes. Index `count` is the Milky Way. */
export interface GalaxyShapes {
  count: number;
  /** In-plane reference axis (unit), engine axes. */
  axes: Float32Array;
  cells: Float32Array;
  oldColors: Float32Array;
}

export function galaxyShapes(catalog: GalaxyCatalog | null): GalaxyShapes {
  const n = catalog?.count ?? 0;
  const axes = new Float32Array((n + 1) * 3), cells = new Float32Array(n + 1), oldColors = new Float32Array((n + 1) * 3);
  for (let i = 0; i < n; i++) {
    const normal: [number, number, number] = [catalog!.normals[i * 3], catalog!.normals[i * 3 + 1], catalog!.normals[i * 3 + 2]];
    axes.set(inPlaneAxis(normal, seedAngle(i)), i * 3);
    cells[i] = galaxyArchetype(catalog!.tType[i], catalog!.flags[i], catalog!.flattening[i]);
    blackbodyLinearRgbFast(bvToTemperature(galaxyColorIndex(catalog!.tType[i])), oldColors, i * 3);
  }
  axes.set(milkyWayFrame().xAxis, n * 3);
  cells[n] = MILKY_WAY_CELL;
  blackbodyLinearRgbFast(bvToTemperature(0.75), oldColors, n * 3);
  return { count: n + 1, axes, cells, oldColors };
}

/**
 * Every galaxy as one draw call: points of light when unresolved, then sprites shaded from
 * the face-on maps, oriented by each disk's measured tilt. The Milky Way is the last vertex.
 */
export class GalaxyField {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  private readonly positions: Float32Array;
  private readonly source: Float64Array;

  constructor(catalog: GalaxyCatalog | null, readonly shapes: GalaxyShapes, atlas: Texture, milkyWayMap: Texture, mapTexels: [number, number]) {
    const count = shapes.count;
    const n = count - 1;
    this.source = new Float64Array(count * 3);
    if (catalog) this.source.set(catalog.positions);
    const frame = milkyWayFrame();
    this.source.set(frame.centre, n * 3);
    this.positions = new Float32Array(count * 3);
    const radius = new Float32Array(count), absMag = new Float32Array(count), flattening = new Float32Array(count);
    const normals = new Float32Array(count * 3), index = new Float32Array(count);
    const bulge = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const milkyWay = i === n;
      radius[i] = milkyWay ? MILKY_WAY.displayRadiusPc : catalog!.radiusPc[i];
      absMag[i] = milkyWay ? MILKY_WAY.absMagV : catalog!.absMagV[i];
      flattening[i] = milkyWay ? MILKY_WAY.thinDisk.scaleHeightPc * 4 / MILKY_WAY.displayRadiusPc : catalog!.flattening[i];
      if (milkyWay) normals.set(frame.normal, i * 3);
      else normals.set(catalog!.normals.subarray(i * 3, i * 3 + 3), i * 3);
      index[i] = i;
      const shape = milkyWay ? milkyWayBulge() : bulgeShape(catalog!.tType[i], shapes.cells[i], catalog!.flattening[i]);
      bulge.set([shape.fraction, shape.radius, shape.k, shape.truncation], i * 4);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(this.positions, 3));
    geometry.setAttribute("radiusPc", new BufferAttribute(radius, 1));
    geometry.setAttribute("absMag", new BufferAttribute(absMag, 1));
    geometry.setAttribute("flattening", new BufferAttribute(flattening, 1));
    geometry.setAttribute("diskNormal", new BufferAttribute(normals, 3));
    geometry.setAttribute("diskAxis", new BufferAttribute(shapes.axes, 3));
    geometry.setAttribute("cell", new BufferAttribute(shapes.cells, 1));
    geometry.setAttribute("oldColor", new BufferAttribute(shapes.oldColors, 3));
    geometry.setAttribute("bulge", new BufferAttribute(bulge, 4));
    geometry.setAttribute("galaxyIndex", new BufferAttribute(index, 1));
    const material = new ShaderMaterial({
      uniforms: {
        atlas: { value: atlas }, milkyWayMap: { value: milkyWayMap }, mapTexels: { value: mapTexels },
        magnitudeLimit: { value: 6.5 }, exposureMag: { value: 0 }, focalPx: { value: 1000 }, pixelRatio: { value: 1 },
        maxSizePx: { value: 256 }, referencePixel: { value: REFERENCE_PIXEL_SR }, visibility: { value: 1 },
        detailIndex: { value: new Array<number>(MAX_DETAILED).fill(-1) }, detailFade: { value: new Array<number>(MAX_DETAILED).fill(0) },
        highlight: { value: -1 },
        // displayLuminosity(M, limit) = DEEP_SKY_GAIN × 0.05 × 100 × 10^(0.4 (limit − M)).
        gainTimes5: { value: DEEP_SKY_GAIN * 5 },
      },
      vertexShader: /* glsl */ `
        attribute float radiusPc, absMag, flattening, cell, galaxyIndex;
        attribute vec3 diskNormal, diskAxis, oldColor;
        attribute vec4 bulge;
        uniform float magnitudeLimit, exposureMag, focalPx, pixelRatio, maxSizePx, referencePixel, visibility, highlight, gainTimes5;
        uniform float detailIndex[${MAX_DETAILED}];
        uniform float detailFade[${MAX_DETAILED}];
        varying vec2 vE1, vE2, vMinor;
        varying vec3 vOldColor;
        varying vec4 vBulge;
        varying float vSizePx, vS0, vFlux, vPoint, vCell, vCos, vFlat, vRho, vBulgeRatio, vHighlight;
        vec2 project(vec3 v, vec3 p) { return (v.xy + p.xy * (v.z / -p.z)) / -p.z * focalPx; }
        void main() {
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          float d = length(view.xyz);
          float fade = visibility;
          for (int i = 0; i < ${MAX_DETAILED}; i++) if (abs(detailIndex[i] - galaxyIndex) < 0.5) fade *= 1.0 - detailFade[i];
          // Display luminosity (star scale, with the deep-sky gain and exposure) at 10 pc, times pc^2.
          float L = gainTimes5 * exp2(1.3287712 * (magnitudeLimit + exposureMag - absMag));
          float flux = L / (d * d) * fade;
          vS0 = L * referencePixel / (radiusPc * radiusPc) * fade;
          float rho = radiusPc / d * focalPx;
          bool hidden = view.z > -radiusPc * 0.2 || fade < 0.003 || (rho < 1.5 && flux < 0.004) || (rho >= 1.5 && vS0 < 0.002);
          if (hidden && abs(galaxyIndex - highlight) > 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
          vec3 n = normalize(mat3(modelViewMatrix) * diskNormal);
          vec3 e1 = normalize(mat3(modelViewMatrix) * diskAxis);
          vec3 e2 = cross(e1, n);
          vE1 = project(e1, view.xyz) * radiusPc;
          vE2 = project(e2, view.xyz) * radiusPc;
          vec2 minor = project(n, view.xyz);
          vMinor = dot(minor, minor) > 1e-12 ? normalize(minor) : vec2(0.0, 1.0);
          vCos = abs(dot(n, -view.xyz / d));
          vFlat = flattening;
          float halfSize = max(length(vE1), length(vE2)) * 1.04 + 1.0;
          vPoint = halfSize < 2.5 ? 1.0 : 0.0;
          vSizePx = vPoint > 0.5 ? 5.0 : min(2.0 * halfSize, maxSizePx);
          // Sprites larger than the point-size limit would be clipped: they fade (a volume takes over).
          vS0 *= 1.0 - smoothstep(0.8, 1.0, 2.0 * halfSize / maxSizePx);
          vFlux = flux;
          vRho = rho;
          vCell = cell;
          vBulge = bulge;
          vBulgeRatio = sqrt(vCos * vCos + 0.36 * (1.0 - vCos * vCos));
          if (cell < -0.5) vBulgeRatio = sqrt(vCos * vCos + flattening * flattening * (1.0 - vCos * vCos));
          vOldColor = oldColor;
          vHighlight = abs(galaxyIndex - highlight) < 0.5 ? 1.0 : 0.0;
          gl_PointSize = max(vSizePx, vHighlight > 0.5 ? 14.0 : 0.0) * pixelRatio;
          if (vHighlight > 0.5) vSizePx = max(vSizePx, 14.0);
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: /* glsl */ `
        ${GALAXY_COMMON}
        varying vec2 vE1, vE2, vMinor;
        varying vec3 vOldColor;
        varying vec4 vBulge;
        varying float vSizePx, vS0, vFlux, vPoint, vCell, vCos, vFlat, vRho, vBulgeRatio, vHighlight;
        void main() {
          vec2 off = (gl_PointCoord - 0.5) * vSizePx;
          off.y = -off.y;
          vec3 color = vec3(0.0);
          if (vPoint > 0.5) {
            // Unresolved: a point of light like a star, with the galaxy's integrated flux.
            vec3 tint = mix(vOldColor, YOUNG_COLOR, vCell > -0.5 && vCell < 7.5 ? 0.25 : 0.0);
            color = tint * min(vFlux, 3.0) * exp(-dot(off, off) / 1.1);
          } else {
            // Screen offset = a·E1 + b·E2 → face-on coordinates (a, b); near edge-on the
            // determinant is held at the disk's thickness.
            float det = vE1.x * vE2.y - vE1.y * vE2.x;
            float scale = length(vE1) * length(vE2);
            det = (det < 0.0 ? -1.0 : 1.0) * max(abs(det), max(vFlat, 0.03) * scale);
            vec2 p = vec2(off.x * vE2.y - off.y * vE2.x, vE1.x * off.y - vE1.y * off.x) / det;
            float qd = max(vCos, vFlat);
            if (vCell > -0.5) {
              vec4 m = faceOn(vCell, p, vRho * 2.0);
              float tau = min(6.0, m.b * 0.9 / qd);
              vec3 disk = (m.g * vOldColor + m.r * YOUNG_COLOR * 0.9 + m.a * HII_COLOR * 0.5) * (1.0 - vBulge.x) / MAP_NORMALISATION / qd;
              color += disk * exp(-tau * DUST_REDDENING * 0.5);
            }
            // Bulge (or the whole elliptical): projected column in scaled units.
            vec2 u = off / max(vRho, 1e-6);
            float major = dot(u, vec2(-vMinor.y, vMinor.x)), minorAxis = dot(u, vMinor);
            float bs = length(vec2(major, minorAxis / max(vBulgeRatio, 0.05))) / vBulge.y;
            color += (vCell > -0.5 ? BULGE_COLOR : vOldColor) * bulgeColumn(bs, vBulge.z, vBulge.y, vBulge.w) / max(vBulgeRatio, 0.05);
            color *= vS0;
          }
          if (vHighlight > 0.5 && vSizePx < 80.0) {
            float r = length(off);
            float ring = smoothstep(1.5, 0.0, abs(r - (vSizePx * 0.5 - 2.0)));
            color += vec3(0.45, 0.75, 1.0) * ring * 0.5;
          }
          if (max(color.r, max(color.g, color.b)) < 0.0015) discard;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      blending: AdditiveBlending, transparent: true, depthTest: false, depthWrite: false,
    });
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -950;
    this.rebase(new Vector3());
  }

  get milkyWayIndex(): number {
    return this.shapes.count - 1;
  }

  rebase(origin: Vector3): void {
    const count = this.shapes.count;
    for (let i = 0; i < count; i++) {
      this.positions[i * 3] = this.source[i * 3] - origin.x;
      this.positions[i * 3 + 1] = this.source[i * 3 + 1] - origin.y;
      this.positions[i * 3 + 2] = this.source[i * 3 + 2] - origin.z;
    }
    this.points.geometry.getAttribute("position").needsUpdate = true;
  }

  /** Heliocentric position of galaxy `index` (the Milky Way's centre for the last index). */
  heliocentric(index: number, target = new Vector3()): Vector3 {
    return target.set(this.source[index * 3], this.source[index * 3 + 1], this.source[index * 3 + 2]);
  }

  setView(magnitudeLimit: number, exposureMag: number, focalPx: number, pixelRatio: number, maxSizePx: number): void {
    const u = this.points.material.uniforms;
    u.magnitudeLimit.value = magnitudeLimit;
    u.exposureMag.value = exposureMag;
    u.focalPx.value = focalPx;
    u.pixelRatio.value = pixelRatio;
    u.maxSizePx.value = maxSizePx;
  }

  setVisibility(visibility: number): void {
    this.points.material.uniforms.visibility.value = visibility;
  }

  setHighlight(index: number | null): void {
    this.points.material.uniforms.highlight.value = index ?? -1;
  }

  /** Galaxies drawn as volumes and how far each sprite has faded out (0–1). */
  setDetailed(entries: { index: number; fade: number }[]): void {
    const u = this.points.material.uniforms;
    const indices = u.detailIndex.value as number[], fades = u.detailFade.value as number[];
    for (let i = 0; i < MAX_DETAILED; i++) {
      indices[i] = entries[i]?.index ?? -1;
      fades[i] = entries[i]?.fade ?? 0;
    }
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
