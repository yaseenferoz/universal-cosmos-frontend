/**
 * Star clusters prepared by scripts/prepare-deep-sky.py (scripts/deep_sky_clusters.py) into
 * public/deep/clusters.json. Open clusters: Hunt & Reffert 2023 (Gaia DR3 distances, ages,
 * extinctions, radii and member counts; quality-cut). Globular clusters: Harris catalogue
 * (integrated magnitude, colour, metallicity, radii) with Gaia EDR3 parallax distances
 * (Vasiliev & Baumgardt 2021) where better than 5%. Heliocentric parsecs, engine axes.
 */

export type ClusterKind = "open" | "globular";

export interface StarCluster {
  names: string[];
  kind: ClusterKind;
  position: [number, number, number];
  distancePc: number;
  distanceRange?: [number, number];
  method: string;
  reference: string;
  /** Radius holding half the members (open) or the light (globular), parsecs. */
  halfRadiusPc: number;
  coreRadiusPc: number;
  /** Tidal radius, parsecs (0 when unknown). */
  tidalRadiusPc: number;
  /** Gaia DR3 members (open clusters). */
  members?: number;
  /** log10 of the age in years (globulars: an assumed typical 12.6 Gyr). */
  logAge: number;
  /** V-band extinction toward the cluster (open clusters). */
  extinctionV: number;
  /** Integrated absolute V magnitude, B−V and [Fe/H] (globulars). */
  absMagV?: number;
  colorBV?: number;
  metallicity?: number;
}

export interface ClusterCatalog {
  clusters: StarCluster[];
  sources: string[];
  globularAgeLog: number;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

/** Validate the prepared file; malformed entries are skipped. */
export function parseClusterFile(input: unknown): ClusterCatalog {
  if (!isObject(input) || !isObject(input.meta) || !Array.isArray(input.clusters)) throw new Error("Not a Universal Cosmos cluster catalogue.");
  const clusters: StarCluster[] = [];
  for (const raw of input.clusters) {
    if (!isObject(raw) || !Array.isArray(raw.names) || raw.names.length === 0) continue;
    const kind = raw.kind === "open" || raw.kind === "globular" ? raw.kind : null;
    const p = Array.isArray(raw.p) ? raw.p.map(num) : [];
    const distancePc = num(raw.d), halfRadiusPc = num(raw.r50), logAge = num(raw.age);
    if (!kind || p.length !== 3 || p.some((c) => c === undefined) || !distancePc || !halfRadiusPc || logAge === undefined) continue;
    if (kind === "open" && !num(raw.n)) continue;
    if (kind === "globular" && num(raw.mv) === undefined) continue;
    const lo = num(raw.lo), hi = num(raw.hi);
    clusters.push({
      names: raw.names.map((n) => String(n)), kind, position: p as [number, number, number], distancePc,
      distanceRange: lo !== undefined && hi !== undefined && hi > lo ? [lo, hi] : undefined,
      method: typeof raw.method === "string" ? raw.method : "", reference: typeof raw.ref === "string" ? raw.ref : "",
      halfRadiusPc, coreRadiusPc: num(raw.rc) ?? halfRadiusPc * 0.5, tidalRadiusPc: num(raw.rt) ?? 0,
      members: num(raw.n), logAge, extinctionV: num(raw.av) ?? 0,
      absMagV: num(raw.mv), colorBV: num(raw.bv), metallicity: num(raw.feh),
    });
  }
  const meta = input.meta;
  return {
    clusters,
    sources: Array.isArray(meta.sources) ? meta.sources.map((s) => String(s)) : [],
    globularAgeLog: num(meta.globularAgeLog) ?? 10.1,
  };
}

/** Age in readable units. */
export function ageText(logAge: number): string {
  const years = 10 ** logAge;
  if (years >= 1e9) return `${(years / 1e9).toFixed(1)} billion years`;
  return `${Math.round(years / 1e6).toLocaleString("en-US")} million years`;
}
