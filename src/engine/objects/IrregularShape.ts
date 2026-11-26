import { BufferAttribute, BufferGeometry, IcosahedronGeometry, Vector3 } from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Seeded, illustrative small-body shapes.
 *
 * The radius function follows the Gaussian-random-sphere idea used for asteroid
 * shape statistics (Muinonen 1998; Muinonen & Lagerros 1998): the log-radius is a
 * smooth random field with a steep power-law spectrum, so large lumps dominate.
 * It is approximated by a sum of random plane waves on the unit sphere. Impact
 * craters follow a cumulative size distribution N(>D) ∝ D^-2 with simple-crater
 * depth/diameter ≈ 0.2 and a low raised rim. The field is then stretched to the
 * body's triaxial semi-axes (shortest axis on the spin axis, mesh +Y).
 *
 * None of this is a measured shape model; it only makes unmeasured bodies plausible
 * and distinct. Published dimensions (axes) are honored when supplied.
 */
export interface IrregularShapeParameters {
  /** Deterministic seed, e.g. shapeSeed(objectId). */
  seed: number;
  /** Semi-axes a ≥ b ≥ c in any unit; normalized so the volume-equivalent radius is 1. */
  axes: readonly [number, number, number];
  /** Standard deviation of the log-radius field (0 = smooth ellipsoid). */
  roughness: number;
  /** Number of resolved impact craters. */
  craters: number;
  /** Icosahedron subdivision (three.js detail); 20·(detail+1)² triangles. */
  detail: number;
}

/** FNV-1a 32-bit hash: stable seeds from object ids. */
export function shapeSeed(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32 PRNG in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomUnit(random: () => number, target: Vector3): Vector3 {
  const z = random() * 2 - 1;
  const azimuth = random() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return target.set(r * Math.cos(azimuth), z, r * Math.sin(azimuth));
}

/**
 * Lumpiness for a body of mean radius `radiusKm`: small bodies are rubble or
 * collisional fragments; above a few hundred km self-gravity rounds them.
 * Icy bodies relax at smaller sizes than rocky ones.
 */
export function roughnessForRadius(radiusKm: number, icy = false): number {
  // Hygiea (R ≈ 217 km) is nearly spherical; Psyche (≈ 111 km) is a smooth ellipsoid.
  const rounding = icy ? 95 : 120;
  return 0.2 / (1 + (Math.max(0, radiusKm) / rounding) ** 3);
}

/** Plausible default semi-axis ratios when none are published (seeded, illustrative). */
export function defaultAxes(seed: number, radiusKm: number, icy = false): [number, number, number] {
  const random = seededRandom(seed ^ 0x9e3779b9);
  // Elongation fades with size; small fragments have b/a ~ 0.6–0.95 and c/b ~ 0.6–0.95.
  const irregular = Math.min(1, roughnessForRadius(radiusKm, icy) / 0.2);
  const ba = 1 - irregular * (0.05 + random() * 0.35);
  const cb = 1 - irregular * (0.05 + random() * 0.35);
  return [1, ba, ba * cb];
}

interface Crater {
  center: Vector3;
  /** Angular radius, radians. */
  radius: number;
  depth: number;
}

/**
 * Build the geometry: positions (unit mean radius), smooth normals, and a vertex
 * colour attribute holding a subtle albedo modulation around 1 (multiply with the
 * body's albedo colour). Non-indexed icosphere vertices are welded first so the
 * normals are smooth.
 */
export function buildIrregularShape(parameters: IrregularShapeParameters): BufferGeometry {
  const { seed, roughness } = parameters;
  const detail = Math.max(1, Math.min(48, Math.round(parameters.detail)));
  const random = seededRandom(seed);
  const [a0, b0, c0] = parameters.axes.map((axis) => Math.max(1e-6, Math.abs(axis))) as [number, number, number];
  const scale = 1 / Math.cbrt(a0 * b0 * c0);
  const a = a0 * scale, b = b0 * scale, c = c0 * scale;

  // Random-wave approximation of a Gaussian random field with a steep spectrum.
  const WAVES = 40;
  const directions: Vector3[] = [];
  const frequencies: number[] = [];
  const phases: number[] = [];
  const amplitudes: number[] = [];
  let variance = 0;
  for (let k = 0; k < WAVES; k++) {
    directions.push(randomUnit(random, new Vector3()));
    // Log-spaced from global lumps (~degree 1–2) to features ~15° across.
    const frequency = 1.1 * Math.pow(14 / 1.1, (k + random() * 0.5) / WAVES);
    frequencies.push(frequency);
    phases.push(random() * Math.PI * 2);
    const amplitude = Math.pow(frequency, -1.7);
    amplitudes.push(amplitude);
    variance += (amplitude * amplitude) / 2;
  }
  const fieldScale = roughness / Math.sqrt(variance);

  // Albedo patchiness: a separate, weaker low-frequency field.
  const tintDirections = [0, 1, 2, 3, 4, 5].map(() => randomUnit(random, new Vector3()));
  const tintPhases = tintDirections.map(() => random() * Math.PI * 2);

  // The crater population is independent of mesh detail, so every level of detail
  // shows the same large craters; ones the mesh cannot resolve (radius under about
  // two edge lengths) are skipped instead of aliasing into single-vertex dents.
  const craters: Crater[] = [];
  const craterCount = Math.max(0, Math.round(parameters.craters));
  const minimumRadius = 0.035;
  const maximumRadius = 0.55;
  const resolvable = 2.2 / (detail + 1);
  for (let i = 0; i < craterCount; i++) {
    // Cumulative N(>r) ∝ r^-2  →  r = r_min · U^(-1/2), truncated.
    const radius = Math.min(maximumRadius, minimumRadius / Math.sqrt(Math.max(1e-4, random())));
    const center = randomUnit(random, new Vector3());
    const variation = 0.7 + random() * 0.6;
    if (radius < resolvable) continue;
    craters.push({
      center,
      radius,
      // depth/diameter ≈ 0.2 for simple craters, shallower for the largest basins.
      depth: 0.4 * radius * (radius > 0.3 ? 0.6 : 1) * variation,
    });
  }

  const source = new IcosahedronGeometry(1, detail);
  source.deleteAttribute("normal");
  source.deleteAttribute("uv");
  const geometry = mergeVertices(source, 1e-6);
  source.dispose();
  const position = geometry.getAttribute("position") as BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const direction = new Vector3();
  for (let i = 0; i < position.count; i++) {
    direction.fromBufferAttribute(position, i).normalize();
    let field = 0;
    for (let k = 0; k < WAVES; k++)
      field += amplitudes[k] * Math.cos(frequencies[k] * Math.PI * direction.dot(directions[k]) + phases[k]);
    let logRadius = field * fieldScale - (roughness * roughness) / 2;
    let freshness = 0;
    for (const crater of craters) {
      const angle = Math.acos(Math.max(-1, Math.min(1, direction.dot(crater.center))));
      const x = angle / crater.radius;
      if (x >= 1.8) continue;
      // Continuous profile: parabolic bowl rising to a rim crest (height ~0.2 of the
      // depth, i.e. ~4% of the diameter) at x = 1, then an ejecta apron to x = 1.8.
      const rimHeight = crater.depth * 0.2;
      if (x < 1) {
        logRadius += crater.depth * (x * x - 1) + rimHeight * x * x * x * x;
        freshness += 0.5 * (1 - x);
      } else {
        const apron = 1 - (x - 1) / 0.8;
        logRadius += rimHeight * apron * apron;
      }
    }
    const r = Math.exp(logRadius);
    position.setXYZ(i, direction.x * r * a, direction.y * r * c, direction.z * r * b);
    let tint = 0;
    for (let k = 0; k < tintDirections.length; k++)
      tint += Math.cos(2.2 * Math.PI * direction.dot(tintDirections[k]) + tintPhases[k]);
    // About ±6% patchiness; crater interiors expose slightly brighter, less weathered material.
    const modulation = 1 + 0.025 * tint + 0.06 * Math.min(1, freshness);
    colors[i * 3] = modulation;
    colors[i * 3 + 1] = modulation;
    colors[i * 3 + 2] = modulation;
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  // Low-frequency lumps shift the mass centre: recentre on the volume centroid so the
  // body spins about (and sits at) its ephemeris position, then record the true reach.
  const index = geometry.getIndex()!;
  const p0 = new Vector3(), p1 = new Vector3(), p2 = new Vector3(), cross = new Vector3();
  const centroid = new Vector3();
  let volume = 0;
  for (let i = 0; i < index.count; i += 3) {
    p0.fromBufferAttribute(position, index.getX(i));
    p1.fromBufferAttribute(position, index.getX(i + 1));
    p2.fromBufferAttribute(position, index.getX(i + 2));
    const signed = p0.dot(cross.crossVectors(p1, p2)) / 6;
    volume += signed;
    centroid.addScaledVector(p0.add(p1).add(p2), signed / 4);
  }
  if (volume !== 0) geometry.translate(-centroid.x / volume, -centroid.y / volume, -centroid.z / volume);
  let extent = 0;
  for (let i = 0; i < position.count; i++) extent = Math.max(extent, p0.fromBufferAttribute(position, i).length());
  geometry.userData.extent = extent;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}
