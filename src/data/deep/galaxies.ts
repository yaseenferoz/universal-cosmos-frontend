/**
 * Galaxies prepared by scripts/prepare-deep-sky.py into public/deep/galaxies.bin (+ .json).
 *
 * Local Volume galaxies (Karachentsev et al. 2013, UNGC) keep their redshift-independent
 * distances; 2MASS Redshift Survey galaxies take Cosmicflows-4 distances where measured and
 * otherwise the Hubble law (CMB frame, H0 = 74.6 km/s/Mpc, comoving distance). Positions are
 * heliocentric parsecs in the engine's axes. Visual magnitudes are estimates from B or Ks
 * photometry and typical colours by type; disk orientations come from the measured position
 * angle and axis ratio (which side is nearer is not known) or, flagged, a stand-in angle.
 */

export const GALAXY_RECORD_BYTES = 26;
const NO_TYPE = -128;

export const GALAXY_FLAGS = {
  barMask: 3,
  /** Position angle measured (otherwise a stand-in, so the disk's tilt on the sky is unknown). */
  oriented: 4,
  localVolume: 8,
  peculiar: 16,
  /** Distance from the Hubble law (redshift) rather than a distance indicator. */
  redshiftDistance: 32,
} as const;

export interface GalaxyCatalog {
  count: number;
  /** x, y, z per galaxy, parsecs, heliocentric engine axes (Float64 for rebasing). */
  positions: Float64Array;
  /** Disk (or optical) radius, parsecs. */
  radiusPc: Float32Array;
  /** Estimated absolute visual magnitude. */
  absMagV: Float32Array;
  /** Unit disk normal (symmetry axis for spheroids), engine axes. */
  normals: Float32Array;
  /** Intrinsic minor/major axis ratio used for the shape. */
  flattening: Float32Array;
  /** de Vaucouleurs T-type (−5 elliptical … 10 irregular); NaN when not classified. */
  tType: Float32Array;
  flags: Uint8Array;
  /** Index into `methods`. */
  method: Uint8Array;
  /** Distance uncertainty, percent; NaN when not given. */
  errorPct: Float32Array;
  names: string[][];
  methods: string[];
  sources: string[];
  retrieved: string;
  hubbleConstant: number;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

export function parseGalaxyFile(buffer: ArrayBuffer, meta: unknown): GalaxyCatalog {
  if (!isObject(meta) || typeof meta.count !== "number" || meta.recordBytes !== GALAXY_RECORD_BYTES || !Array.isArray(meta.names))
    throw new Error("Not a Universal Cosmos galaxy catalogue.");
  const count = meta.count;
  if (!Number.isInteger(count) || count < 0 || buffer.byteLength !== count * GALAXY_RECORD_BYTES || meta.names.length !== count)
    throw new Error("Truncated galaxy catalogue.");
  const view = new DataView(buffer);
  const positions = new Float64Array(count * 3), normals = new Float32Array(count * 3);
  const radiusPc = new Float32Array(count), absMagV = new Float32Array(count), flattening = new Float32Array(count);
  const tType = new Float32Array(count), errorPct = new Float32Array(count);
  const flags = new Uint8Array(count), method = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * GALAXY_RECORD_BYTES;
    positions[i * 3] = view.getFloat32(o, true);
    positions[i * 3 + 1] = view.getFloat32(o + 4, true);
    positions[i * 3 + 2] = view.getFloat32(o + 8, true);
    radiusPc[i] = view.getFloat32(o + 12, true);
    absMagV[i] = view.getInt16(o + 16, true) / 100;
    const nx = view.getInt8(o + 18), ny = view.getInt8(o + 19), nz = view.getInt8(o + 20);
    const length = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / length;
    normals[i * 3 + 1] = ny / length;
    normals[i * 3 + 2] = nz / length;
    flattening[i] = view.getUint8(o + 21) / 255;
    const t = view.getInt8(o + 22);
    tType[i] = t === NO_TYPE ? Number.NaN : t;
    flags[i] = view.getUint8(o + 23);
    method[i] = view.getUint8(o + 24);
    const error = view.getUint8(o + 25);
    errorPct[i] = error === 255 ? Number.NaN : error;
  }
  const strings = (value: unknown) => (Array.isArray(value) ? value.map((v) => String(v)) : []);
  return {
    count, positions, radiusPc, absMagV, normals, flattening, tType, flags, method, errorPct,
    names: meta.names.map((entry) => strings(entry)),
    methods: strings(meta.methods),
    sources: strings(meta.sources),
    retrieved: typeof meta.retrieved === "string" ? meta.retrieved : "unknown",
    hubbleConstant: typeof meta.hubbleConstant === "number" ? meta.hubbleConstant : 74.6,
  };
}

export type GalaxyMorphology = "elliptical" | "lenticular" | "spiral" | "irregular" | "unclassified";

export function galaxyMorphology(tType: number): GalaxyMorphology {
  if (!Number.isFinite(tType)) return "unclassified";
  if (tType <= -4) return "elliptical";
  if (tType <= 0) return "lenticular";
  if (tType <= 8) return "spiral";
  return "irregular";
}

const SPIRAL_STAGE = ["S0/a", "Sa", "Sab", "Sb", "Sbc", "Sc", "Scd", "Sd", "Sdm", "Sm", "Im"];

/** A readable Hubble-type label, e.g. "Barred spiral (SBb)". */
export function morphologyLabel(tType: number, flags: number): string {
  const bar = flags & GALAXY_FLAGS.barMask;
  const morphology = galaxyMorphology(tType);
  if (morphology === "unclassified") return "Galaxy (type not classified)";
  if (morphology === "elliptical") return "Elliptical galaxy (E)";
  if (morphology === "lenticular") return tType === 0 ? `Lenticular galaxy (${bar === 2 ? "SB0/a" : "S0/a"})` : `Lenticular galaxy (${bar === 2 ? "SB0" : "S0"})`;
  const stage = SPIRAL_STAGE[Math.max(0, Math.min(10, Math.round(tType)))];
  const prefix = bar === 2 ? "SB" : bar === 1 ? "SAB" : "S";
  if (morphology === "irregular") return tType >= 10 ? "Irregular galaxy (Im)" : `Magellanic spiral (${prefix}m)`;
  return `${bar === 2 ? "Barred spiral" : bar === 1 ? "Weakly barred spiral" : "Spiral"} galaxy (${prefix}${stage.slice(1)})`;
}

export function galaxyDistancePc(catalog: GalaxyCatalog, index: number): number {
  const p = catalog.positions;
  return Math.hypot(p[index * 3], p[index * 3 + 1], p[index * 3 + 2]);
}
