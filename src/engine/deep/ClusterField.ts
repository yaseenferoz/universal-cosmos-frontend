import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, Points, ShaderMaterial, Vector3 } from "three";
import type { ClusterCatalog, StarCluster } from "../../data/deep/clusters";
import { createStarMaterial } from "../stars/StarCloud";
import { blackbodyLinearRgbFast } from "../stars/stellarPhysics";
import {
  livingMassLimit, massForCount, meanVisualLuminosity, sampleStars, totalStars, type ClusterModel, type StarSample,
} from "./clusterPopulation";
import { REFERENCE_PIXEL_SR } from "./deepPhotometry";

/** Brightest stars drawn for every cluster all the time; the rest are glow until close. */
const GLOBAL_STARS = { open: 24, globular: 160 } as const;
const DETAIL_STARS = { open: 3000, globular: 20_000 } as const;
export const MAX_DETAILED_CLUSTERS = 4;
/** Milliseconds per frame spent preparing clusters while the field builds (keeps frames short). */
const BUILD_BUDGET_MS = 4;

export function clusterModel(cluster: StarCluster): ClusterModel {
  return {
    kind: cluster.kind, distancePc: cluster.distancePc, logAge: cluster.logAge, metallicity: cluster.metallicity ?? 0,
    extinctionV: cluster.extinctionV, halfRadiusPc: cluster.halfRadiusPc, coreRadiusPc: Math.min(cluster.coreRadiusPc, cluster.halfRadiusPc),
    tidalRadiusPc: cluster.tidalRadiusPc > cluster.halfRadiusPc ? cluster.tidalRadiusPc : cluster.halfRadiusPc * 8,
    members: cluster.members, absMagV: cluster.absMagV,
  };
}

function starGeometry(sample: StarSample, positions: Float32Array): BufferGeometry {
  const colors = new Float32Array(sample.count * 3);
  for (let i = 0; i < sample.count; i++) blackbodyLinearRgbFast(sample.temperatureK[i], colors, i * 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("absMag", new BufferAttribute(sample.absMag, 1));
  geometry.setAttribute("starColor", new BufferAttribute(colors, 3));
  geometry.setAttribute("radiusPc", new BufferAttribute(new Float32Array(sample.count), 1));
  return geometry;
}

/**
 * Star clusters as stars: each cluster's brightest members (a seeded statistical sample
 * matching its measured population) are drawn like catalogue stars; the light of the
 * unresolved rest is a glow with the cluster's profile. Clusters seen up close get a
 * deeper sample of fainter members.
 */
export class ClusterField {
  readonly group = new Group();
  private readonly material = createStarMaterial();
  private readonly glowMaterial: ShaderMaterial;
  private readonly glows: Points<BufferGeometry, ShaderMaterial>;
  private stars: Points<BufferGeometry, ShaderMaterial> | null = null;
  private readonly models: ClusterModel[];
  private readonly totals: Float64Array;
  private readonly splitMass: Float64Array;
  /** Unresolved light per cluster (L☉, V) and heliocentric source positions of the drawn stars. */
  private readonly glowLuminosity: Float32Array;
  private readonly glowPositions: Float32Array;
  private readonly starSource: Float64Array;
  private readonly starLocal: Float32Array;
  private readonly starMag: Float32Array;
  private readonly starTemperature: Float32Array;
  private starCount = 0;
  private built = 0;
  private readonly details = new Map<number, { points: Points<BufferGeometry, ShaderMaterial>; luminosityV: number; used: number }>();
  private readonly origin = new Vector3();

  constructor(private readonly catalog: ClusterCatalog) {
    const count = catalog.clusters.length;
    this.models = catalog.clusters.map(clusterModel);
    this.totals = new Float64Array(count);
    this.splitMass = new Float64Array(count);
    this.glowLuminosity = new Float32Array(count);
    this.glowPositions = new Float32Array(count * 3);
    const capacity = catalog.clusters.reduce((sum, c) => sum + GLOBAL_STARS[c.kind], 0);
    this.starSource = new Float64Array(capacity * 3);
    this.starLocal = new Float32Array(capacity * 3);
    this.starMag = new Float32Array(capacity);
    this.starTemperature = new Float32Array(capacity);
    const radius = new Float32Array(count), core = new Float32Array(count), kind = new Float32Array(count), index = new Float32Array(count);
    catalog.clusters.forEach((cluster, i) => {
      radius[i] = cluster.halfRadiusPc;
      core[i] = Math.min(cluster.coreRadiusPc, cluster.halfRadiusPc);
      kind[i] = cluster.kind === "globular" ? 1 : 0;
      index[i] = i;
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(this.glowPositions, 3));
    geometry.setAttribute("luminosityV", new BufferAttribute(this.glowLuminosity, 1));
    geometry.setAttribute("halfRadius", new BufferAttribute(radius, 1));
    geometry.setAttribute("coreRadius", new BufferAttribute(core, 1));
    geometry.setAttribute("globular", new BufferAttribute(kind, 1));
    geometry.setAttribute("clusterIndex", new BufferAttribute(index, 1));
    this.glowMaterial = new ShaderMaterial({
      uniforms: {
        magnitudeLimit: { value: 6.5 }, skyVisibility: { value: 1 }, focalPx: { value: 1000 }, pixelRatio: { value: 1 },
        referencePixel: { value: REFERENCE_PIXEL_SR }, maxSizePx: { value: 256 }, highlight: { value: -1 },
        detailIndex: { value: new Array<number>(MAX_DETAILED_CLUSTERS).fill(-1) },
        detailLuminosity: { value: new Array<number>(MAX_DETAILED_CLUSTERS).fill(0) },
      },
      vertexShader: /* glsl */ `
        attribute float luminosityV, halfRadius, coreRadius, globular, clusterIndex;
        uniform float magnitudeLimit, skyVisibility, focalPx, pixelRatio, referencePixel, maxSizePx, highlight;
        uniform float detailIndex[${MAX_DETAILED_CLUSTERS}];
        uniform float detailLuminosity[${MAX_DETAILED_CLUSTERS}];
        varying float vSizePx, vRho, vCore, vGlobular, vSurface, vPoint, vFlux, vHighlight;
        void main() {
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          float d = length(view.xyz);
          float light = luminosityV;
          for (int i = 0; i < ${MAX_DETAILED_CLUSTERS}; i++) if (abs(detailIndex[i] - clusterIndex) < 0.5) light = max(0.0, light - detailLuminosity[i]);
          // Same scale as the stars: absolute magnitude of the glow at the eye's distance.
          float absMag = 4.83 - 2.5 * log2(max(light, 1e-9)) * 0.30103;
          float m = absMag + 5.0 * log2(d) * 0.30103 - 5.0;
          vFlux = exp2(1.3287712 * (magnitudeLimit - m)) * 0.05 * skyVisibility;
          vRho = halfRadius / d * focalPx;
          vCore = coreRadius / halfRadius;
          vGlobular = globular;
          // Surface brightness at the centre of a projected Plummer profile (per reference pixel).
          vSurface = vFlux * d * d * referencePixel / (3.14159 * halfRadius * halfRadius);
          vHighlight = abs(clusterIndex - highlight) < 0.5 ? 1.0 : 0.0;
          bool faint = vRho < 1.5 ? vFlux < 0.01 : vSurface < 0.0005;
          if ((view.z > -halfRadius * 0.3 || faint) && vHighlight < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
          vPoint = vRho < 1.5 ? 1.0 : 0.0;
          vSizePx = vPoint > 0.5 ? 5.0 : min(vRho * 6.0, maxSizePx);
          vSurface *= 1.0 - smoothstep(0.8, 1.0, vRho * 6.0 / maxSizePx);
          if (vHighlight > 0.5) vSizePx = max(vSizePx, 14.0);
          gl_PointSize = vSizePx * pixelRatio;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: /* glsl */ `
        varying float vSizePx, vRho, vCore, vGlobular, vSurface, vPoint, vFlux, vHighlight;
        void main() {
          vec2 off = (gl_PointCoord - 0.5) * vSizePx;
          float r2 = dot(off, off);
          // Integrated starlight of old clusters is yellowish, of young ones bluish white.
          vec3 tint = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.86, 0.66), vGlobular);
          vec3 color;
          if (vPoint > 0.5) color = tint * min(vFlux, 3.0) * exp(-r2 / 1.1);
          else {
            float x = r2 / (vRho * vRho);
            float halo = 1.0 / pow(1.0 + x, 2.0);
            float core = 1.0 / pow(1.0 + x / (vCore * vCore), 2.0) / (vCore * vCore);
            color = tint * vSurface * (vGlobular > 0.5 ? 0.6 * halo + 0.4 * core : halo);
          }
          if (vHighlight > 0.5 && vSizePx < 80.0) color += vec3(0.45, 0.75, 1.0) * smoothstep(1.5, 0.0, abs(sqrt(r2) - (vSizePx * 0.5 - 2.0))) * 0.5;
          if (max(color.r, max(color.g, color.b)) < 0.0015) discard;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      blending: AdditiveBlending, transparent: true, depthTest: false, depthWrite: false,
    });
    this.glows = new Points(geometry, this.glowMaterial);
    this.glows.frustumCulled = false;
    this.glows.renderOrder = -985;
    this.glows.geometry.setDrawRange(0, 0);
    this.group.add(this.glows);
    this.group.name = "star-clusters";
  }

  get ready(): boolean {
    return this.built >= this.models.length;
  }

  /** Prepare the next clusters' bright stars and glows; call once per frame until ready. */
  buildStep(): void {
    if (this.ready) return;
    const start = performance.now();
    let i = this.built;
    for (; i < this.models.length && (i === this.built || performance.now() - start < BUILD_BUDGET_MS); i++) {
      const cluster = this.catalog.clusters[i], model = this.models[i];
      const total = totalStars(model);
      const top = livingMassLimit(model.logAge);
      const wanted = GLOBAL_STARS[cluster.kind];
      const split = massForCount(total, wanted, top);
      this.totals[i] = total;
      this.splitMass[i] = split;
      const sample = sampleStars(model, split, top, Math.min(wanted, Math.ceil(total)), i * 7919 + 17);
      for (let s = 0; s < sample.count; s++) {
        const k = this.starCount + s;
        this.starSource[k * 3] = cluster.position[0] + sample.positions[s * 3];
        this.starSource[k * 3 + 1] = cluster.position[1] + sample.positions[s * 3 + 1];
        this.starSource[k * 3 + 2] = cluster.position[2] + sample.positions[s * 3 + 2];
        this.starMag[k] = sample.absMag[s];
        this.starTemperature[k] = sample.temperatureK[s];
      }
      this.starCount += sample.count;
      // The glow carries the light of every star not drawn individually (catalogue stars excluded).
      const totalLight = cluster.kind === "globular" && cluster.absMagV !== undefined
        ? 10 ** (-0.4 * (cluster.absMagV - 4.83)) : total * meanVisualLuminosity({ kind: model.kind, logAge: model.logAge, metallicity: model.metallicity });
      this.glowLuminosity[i] = Math.max(0, totalLight - sample.luminosityV - sample.skippedLuminosityV);
    }
    this.built = i;
    this.glows.geometry.getAttribute("luminosityV").needsUpdate = true;
    this.glows.geometry.setDrawRange(0, this.built);
    if (this.ready) this.createStars();
    this.rebase(this.origin);
  }

  private createStars(): void {
    const n = this.starCount;
    const sample: StarSample = {
      positions: this.starLocal.subarray(0, n * 3), absMag: this.starMag.subarray(0, n),
      temperatureK: this.starTemperature.subarray(0, n), luminosityV: 0, skippedLuminosityV: 0, count: n,
    };
    this.stars = new Points(starGeometry(sample, sample.positions), this.material);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -990;
    this.group.add(this.stars);
  }

  rebase(origin: Vector3): void {
    this.origin.copy(origin);
    this.catalog.clusters.forEach((cluster, i) => {
      this.glowPositions[i * 3] = cluster.position[0] - origin.x;
      this.glowPositions[i * 3 + 1] = cluster.position[1] - origin.y;
      this.glowPositions[i * 3 + 2] = cluster.position[2] - origin.z;
    });
    this.glows.geometry.getAttribute("position").needsUpdate = true;
    if (this.stars) {
      for (let k = 0; k < this.starCount; k++) {
        this.starLocal[k * 3] = this.starSource[k * 3] - origin.x;
        this.starLocal[k * 3 + 1] = this.starSource[k * 3 + 1] - origin.y;
        this.starLocal[k * 3 + 2] = this.starSource[k * 3 + 2] - origin.z;
      }
      this.stars.geometry.getAttribute("position").needsUpdate = true;
    }
    for (const [index, detail] of this.details) detail.points.position.set(...this.catalog.clusters[index].position).sub(origin);
  }

  /** Local position (relative to the floating origin) of cluster `index`. */
  localPosition(index: number, target = new Vector3()): Vector3 {
    return target.set(...this.catalog.clusters[index].position).sub(this.origin);
  }

  /** Apparent half-member radius in CSS px (Infinity from inside the cluster). */
  apparentRadius(index: number, eye: Vector3, focalPx: number, scratch = new Vector3()): number {
    const cluster = this.catalog.clusters[index];
    const distance = this.localPosition(index, scratch).distanceTo(eye);
    return distance < cluster.halfRadiusPc * 2 ? Infinity : (cluster.halfRadiusPc / distance) * focalPx;
  }

  /** Clusters at least `minPx` in apparent radius, largest first. */
  largest(eye: Vector3, focalPx: number, minPx: number): { index: number; rho: number }[] {
    const scratch = new Vector3();
    const found: { index: number; rho: number }[] = [];
    for (let i = 0; i < this.catalog.clusters.length; i++) {
      const rho = this.apparentRadius(i, eye, focalPx, scratch);
      if (rho >= minPx) found.push({ index: i, rho });
    }
    return found.sort((a, b) => b.rho - a.rho);
  }

  setView(magnitudeLimit: number, skyVisibility: number, focalPx: number, pixelRatio: number, maxSizePx: number): void {
    const s = this.material.uniforms, g = this.glowMaterial.uniforms;
    s.magnitudeLimit.value = g.magnitudeLimit.value = magnitudeLimit;
    s.skyVisibility.value = g.skyVisibility.value = skyVisibility;
    s.focalPx.value = g.focalPx.value = focalPx;
    s.pixelRatio.value = g.pixelRatio.value = pixelRatio;
    g.maxSizePx.value = maxSizePx;
  }

  setHighlight(index: number | null): void {
    this.glowMaterial.uniforms.highlight.value = index ?? -1;
  }

  /** Show deeper samples of fainter members for these clusters (others are released). */
  setDetailed(indices: number[], now: number): void {
    const wanted = indices.slice(0, MAX_DETAILED_CLUSTERS).filter((i) => this.ready && i < this.models.length);
    for (const index of wanted) {
      const existing = this.details.get(index);
      if (existing) {
        existing.used = now;
        continue;
      }
      const cluster = this.catalog.clusters[index], model = this.models[index];
      const split = this.splitMass[index];
      const count = Math.min(DETAIL_STARS[cluster.kind], Math.max(0, Math.round(this.totals[index] - GLOBAL_STARS[cluster.kind])));
      const low = massForCount(this.totals[index], count + GLOBAL_STARS[cluster.kind], livingMassLimit(model.logAge));
      const sample = sampleStars(model, low, split, count, index * 104729 + 3);
      const points = new Points(starGeometry(sample, sample.positions), this.material);
      points.frustumCulled = false;
      points.renderOrder = -990;
      points.position.set(...cluster.position).sub(this.origin);
      this.group.add(points);
      this.details.set(index, { points, luminosityV: sample.luminosityV + sample.skippedLuminosityV, used: now });
    }
    // Keep a few recently used samples; release the rest.
    for (const [index, detail] of this.details) {
      const active = wanted.includes(index);
      detail.points.visible = active;
      if (!active && now - detail.used > 10_000) {
        detail.points.geometry.dispose();
        this.group.remove(detail.points);
        this.details.delete(index);
      }
    }
    const u = this.glowMaterial.uniforms;
    const ids = u.detailIndex.value as number[], light = u.detailLuminosity.value as number[];
    for (let i = 0; i < MAX_DETAILED_CLUSTERS; i++) {
      const index = wanted[i];
      ids[i] = index ?? -1;
      light[i] = index !== undefined ? this.details.get(index)?.luminosityV ?? 0 : 0;
    }
  }

  dispose(): void {
    this.stars?.geometry.dispose();
    for (const detail of this.details.values()) detail.points.geometry.dispose();
    this.details.clear();
    this.glows.geometry.dispose();
    this.glowMaterial.dispose();
    this.material.dispose();
    this.group.clear();
  }
}
