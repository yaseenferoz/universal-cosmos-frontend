import { celestialService } from "../../services/api";
import { parseClusterFile, type ClusterCatalog } from "./clusters";
import { parseGalaxyFile, type GalaxyCatalog } from "./galaxies";
import { parseNebulaFile, type NebulaCatalog } from "./nebulae";

/** A galaxy, nebula or star cluster in the deep-sky catalogue, or our own Galaxy (a model, index 0). */
export type DeepKind = "galaxy" | "nebula" | "cluster" | "milky-way";
export interface DeepRef {
  kind: DeepKind;
  index: number;
}

export const MILKY_WAY_REF: DeepRef = { kind: "milky-way", index: 0 };

export interface DeepSkyCatalog {
  galaxies: GalaxyCatalog;
  nebulae: NebulaCatalog;
  clusters: ClusterCatalog;
  /** Lower-cased names for search, parallel to galaxies.names / nebulae, and without spaces or punctuation. */
  galaxyKeys: string[][];
  nebulaKeys: string[][];
  galaxyCompact: string[][];
  nebulaCompact: string[][];
  clusterKeys: string[][];
  clusterCompact: string[][];
}

export function sameDeep(a: DeepRef | null | undefined, b: DeepRef | null | undefined): boolean {
  return !!a && !!b && a.kind === b.kind && a.index === b.index;
}

// Spaces and punctuation are optional ('M31' = 'M 31'); hyphens are not ('M 3-1' is a different object).
const NORMALISE = /[\s'’.]+/g;

export const EMPTY_CLUSTERS: ClusterCatalog = { clusters: [], sources: [], globularAgeLog: 10.1 };

export function createDeepSkyCatalog(galaxies: GalaxyCatalog, nebulae: NebulaCatalog, clusters: ClusterCatalog = EMPTY_CLUSTERS): DeepSkyCatalog {
  const galaxyKeys = galaxies.names.map((names) => names.map((n) => n.toLowerCase()));
  const nebulaKeys = nebulae.nebulae.map((n) => n.names.map((name) => name.toLowerCase()));
  const clusterKeys = clusters.clusters.map((c) => c.names.map((name) => name.toLowerCase()));
  const compact = (keys: string[][]) => keys.map((names) => names.map((n) => n.replace(NORMALISE, "")));
  return {
    galaxies, nebulae, clusters, galaxyKeys, nebulaKeys, clusterKeys,
    galaxyCompact: compact(galaxyKeys), nebulaCompact: compact(nebulaKeys), clusterCompact: compact(clusterKeys),
  };
}

let pending: Promise<DeepSkyCatalog> | null = null;

/**
 * Galaxies, nebulae and clusters (≈2 MB compressed), loaded once and shared, through the
 * CelestialService: bundled files, or the backend's database in HTTP mode.
 */
export function loadDeepSky(): Promise<DeepSkyCatalog> {
  if (!pending) {
    const json = (path: "deep/galaxies.json" | "deep/nebulae.json" | "deep/clusters.json") =>
      celestialService.getCatalogueFile(path).then((buffer) => JSON.parse(new TextDecoder().decode(buffer)) as unknown);
    pending = Promise.all([
      celestialService.getCatalogueFile("deep/galaxies.bin"),
      json("deep/galaxies.json"),
      json("deep/nebulae.json"),
      // Clusters are optional: galaxies and nebulae still show without them.
      json("deep/clusters.json").catch(() => null),
    ]).then(([buffer, meta, nebulae, clusters]) => createDeepSkyCatalog(parseGalaxyFile(buffer, meta), parseNebulaFile(nebulae),
      clusters === null ? EMPTY_CLUSTERS : parseClusterFile(clusters)));
    pending.catch(() => { pending = null; });
  }
  return pending;
}

export function deepDisplayName(catalog: DeepSkyCatalog | null, ref: DeepRef): string {
  if (ref.kind === "milky-way") return "Milky Way";
  if (!catalog) return ref.kind === "galaxy" ? "Galaxy" : ref.kind === "cluster" ? "Star cluster" : "Nebula";
  if (ref.kind === "cluster") return catalog.clusters.clusters[ref.index]?.names[0] ?? "Star cluster";
  return (ref.kind === "galaxy" ? catalog.galaxies.names[ref.index]?.[0] : catalog.nebulae.nebulae[ref.index]?.names[0]) ?? "Unnamed";
}

/** Heliocentric position, parsecs, engine axes (the Milky Way's is supplied by the caller's model). */
export function deepPosition(catalog: DeepSkyCatalog, ref: DeepRef): [number, number, number] | null {
  if (ref.kind === "galaxy") {
    const p = catalog.galaxies.positions;
    return ref.index >= 0 && ref.index < catalog.galaxies.count ? [p[ref.index * 3], p[ref.index * 3 + 1], p[ref.index * 3 + 2]] : null;
  }
  if (ref.kind === "nebula") return catalog.nebulae.nebulae[ref.index]?.position ?? null;
  if (ref.kind === "cluster") return catalog.clusters.clusters[ref.index]?.position ?? null;
  return null;
}

function matchRank(keys: string[], compactKeys: string[], needle: string, compact: string): number {
  let rank = Infinity;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key === needle || compactKeys[i] === compact) return i * 0.01;
    if (rank > 1 && (key.startsWith(needle) || compactKeys[i].startsWith(compact))) rank = 1 + i * 0.01;
    else if (rank > 2 && key.includes(needle)) rank = 2 + i * 0.01;
  }
  return rank;
}

/**
 * Galaxies and nebulae whose names match (exact, then prefix, then substring; ties keep
 * catalogue order, which is brightest first for galaxies). "M31" matches "M 31".
 */
export function searchDeepSky(catalog: DeepSkyCatalog, query: string, limit = 10): DeepRef[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const compact = needle.replace(NORMALISE, "");
  const hits: { ref: DeepRef; rank: number }[] = [];
  if ("milky way".startsWith(needle) || compact === "milkyway" || needle === "galaxy" || needle === "our galaxy")
    hits.push({ ref: MILKY_WAY_REF, rank: -1 });
  const consider = (kind: "galaxy" | "nebula" | "cluster", keys: string[][], compactKeys: string[][]) => {
    for (let i = 0; i < keys.length; i++) {
      const rank = matchRank(keys[i], compactKeys[i], needle, compact);
      if (rank < Infinity) hits.push({ ref: { kind, index: i }, rank: rank + (kind === "galaxy" ? i * 1e-7 : 0) });
    }
  };
  consider("nebula", catalog.nebulaKeys, catalog.nebulaCompact);
  consider("cluster", catalog.clusterKeys, catalog.clusterCompact);
  consider("galaxy", catalog.galaxyKeys, catalog.galaxyCompact);
  return hits.sort((a, b) => a.rank - b.rank).slice(0, limit).map((hit) => hit.ref);
}
