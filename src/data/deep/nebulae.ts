/**
 * Nebulae prepared by scripts/prepare-deep-sky.py into public/deep/nebulae.json: planetary
 * nebulae with Gaia EDR3 central-star distances (Chornay & Walton 2021), HII regions from the
 * WISE catalogue (Anderson et al. 2014; maser-parallax or kinematic distances), supernova
 * remnants (Green 2025) and named NGC/IC/Messier nebulae (OpenNGC) with published distances
 * (SIMBAD's literature list, preferring the most recent parallax-based value).
 *
 * Positions are heliocentric parsecs in the engine's axes; the radius is the catalogued
 * angular radius at the adopted distance. The 3D shape behind that outline is not observed.
 */

export type NebulaKind = "emission" | "planetary" | "supernova" | "reflection" | "dark";
const KINDS = new Set<NebulaKind>(["emission", "planetary", "supernova", "reflection", "dark"]);

export interface Nebula {
  names: string[];
  kind: NebulaKind;
  /** Heliocentric position, parsecs, engine axes. */
  position: [number, number, number];
  radiusPc: number;
  /** Apparent minor/major axis ratio of the catalogued outline. */
  axisRatio: number;
  /** Unit vector of the outline's major axis on the sky, engine axes. */
  majorAxis: [number, number, number];
  distancePc: number;
  /** Published range (e.g. 16th–84th percentile) where given. */
  distanceRange?: [number, number];
  method: string;
  /** ADS bibcode (or "OpenNGC") of the adopted distance. */
  reference: string;
  catalogues: string[];
  /** Catalogued angular diameter, arcminutes. */
  angularSizeArcmin: number;
  /** Supernova remnant filled by a pulsar wind (Green's type F, e.g. the Crab) rather than a shell. */
  filled: boolean;
}

export interface NebulaCatalog {
  nebulae: Nebula[];
  sources: string[];
  retrieved: string;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const vector = (value: unknown): [number, number, number] | undefined => {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const v = value.map(num);
  return v.every((c) => c !== undefined) ? (v as [number, number, number]) : undefined;
};

/** Validate the prepared file; malformed entries are skipped. */
export function parseNebulaFile(input: unknown): NebulaCatalog {
  if (!isObject(input) || !isObject(input.meta) || !Array.isArray(input.nebulae)) throw new Error("Not a Universal Cosmos nebula catalogue.");
  const nebulae: Nebula[] = [];
  for (const raw of input.nebulae) {
    if (!isObject(raw) || !Array.isArray(raw.names) || raw.names.length === 0) continue;
    const kind = raw.kind as NebulaKind;
    const position = vector(raw.p), majorAxis = vector(raw.axis);
    const radiusPc = num(raw.r), distancePc = num(raw.d);
    if (!KINDS.has(kind) || !position || !majorAxis || !radiusPc || !distancePc || radiusPc <= 0) continue;
    const lo = num(raw.lo), hi = num(raw.hi);
    nebulae.push({
      names: raw.names.map((n) => String(n)), kind, position, radiusPc, majorAxis, distancePc,
      axisRatio: Math.min(1, Math.max(0.1, num(raw.q) ?? 1)),
      distanceRange: lo !== undefined && hi !== undefined && lo > 0 && hi > lo ? [lo, hi] : undefined,
      method: typeof raw.method === "string" ? raw.method : "Literature",
      reference: typeof raw.ref === "string" ? raw.ref : "",
      catalogues: Array.isArray(raw.src) ? raw.src.map((s) => String(s)) : [],
      angularSizeArcmin: num(raw.angle) ?? 0,
      filled: raw.filled === true,
    });
  }
  const meta = input.meta;
  return {
    nebulae,
    sources: Array.isArray(meta.sources) ? meta.sources.map((s) => String(s)) : [],
    retrieved: typeof meta.retrieved === "string" ? meta.retrieved : "unknown",
  };
}

export const NEBULA_KIND_LABEL: Record<NebulaKind, string> = {
  emission: "Emission nebula (HII region)",
  planetary: "Planetary nebula",
  supernova: "Supernova remnant",
  reflection: "Reflection nebula",
  dark: "Dark nebula",
};
