/**
 * The 3D star catalogue (HYG v4.1: Hipparcos, Yale Bright Star and Gliese catalogues,
 * David Nash / astronexus.com, CC BY-SA 4.0), prepared by scripts/prepare-stars.py.
 *
 * Positions are J2000 heliocentric parsecs in the engine's axes (+X equinox, +Y ecliptic
 * north, −Z ecliptic east). Index 0 is the Sun. Distances come from catalogue parallaxes
 * and carry their uncertainties; proper motion is not applied.
 *
 * Exoplanet systems (NASA Exoplanet Archive) are merged in at load: hosts that are HYG stars
 * gain a system; hosts that are not are appended after the HYG stars (index ≥ hygCount).
 */
import { parseExoplanetFile, searchPlanets, type ExoplanetData, type PlanetarySystem } from "./exoplanets";
import { solarPlanetarySystem } from "./solarSystemPlanets";
import { celestialService } from "../../services/api";

const text = (buffer: ArrayBuffer) => new TextDecoder().decode(buffer);

export const STAR_RECORD_BYTES = 20;
const HEADER_BYTES = 16;
const NO_COLOR = 32767;

export interface StarNames {
  proper?: string;
  bayer?: string;
  flam?: string;
  con?: string;
  gl?: string;
  hd?: string;
  var?: string;
  /** NASA Exoplanet Archive host name, for planet hosts. */
  host?: string;
  /** Index of the system's primary star when this is a companion. */
  primary?: number;
}

export interface StarCatalog {
  count: number;
  /** x, y, z per star, parsecs, engine axes (Float64 for precise rebasing). */
  positions: Float64Array;
  /** Absolute visual magnitude. */
  absMag: Float32Array;
  /** B−V colour index; NaN when unknown. */
  colorIndex: Float32Array;
  /** Hipparcos number, 0 when none. */
  hip: Int32Array;
  /** Effective temperature (K) where a measured value is known (planet hosts); NaN otherwise. */
  temperatureK: Float32Array;
  /** Radius (solar radii) where a measured value is known (planet hosts); NaN otherwise. */
  radiusSolar: Float32Array;
  names: Map<number, StarNames>;
  attribution: string;
  license: string;
  /** Number of HYG stars; later indices are planet hosts placed from the exoplanet archive. */
  hygCount: number;
  /** Confirmed planetary systems keyed by host star index. */
  systems: Map<number, PlanetarySystem>;
  exoplanets: { source: string; acknowledgement: string; retrieved: string; planetCount: number } | null;
}

export function parseStarCatalog(buffer: ArrayBuffer, names: Record<string, StarNames> = {}, attribution = "", license = ""): StarCatalog {
  const view = new DataView(buffer);
  if (buffer.byteLength < HEADER_BYTES || String.fromCharCode(...new Uint8Array(buffer, 0, 4)) !== "UCST")
    throw new Error("Not a Universal Cosmos star catalogue.");
  const version = view.getUint32(4, true), count = view.getUint32(8, true), record = view.getUint32(12, true);
  if (version !== 1 || record !== STAR_RECORD_BYTES || buffer.byteLength !== HEADER_BYTES + count * record)
    throw new Error("Unsupported or truncated star catalogue.");
  const positions = new Float64Array(count * 3);
  const absMag = new Float32Array(count), colorIndex = new Float32Array(count), hip = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const offset = HEADER_BYTES + i * record;
    positions[i * 3] = view.getFloat32(offset, true);
    positions[i * 3 + 1] = view.getFloat32(offset + 4, true);
    positions[i * 3 + 2] = view.getFloat32(offset + 8, true);
    absMag[i] = view.getInt16(offset + 12, true) / 100;
    const color = view.getInt16(offset + 14, true);
    colorIndex[i] = color === NO_COLOR ? Number.NaN : color / 1000;
    hip[i] = view.getInt32(offset + 16, true);
  }
  const nameMap = new Map<number, StarNames>();
  for (const [key, value] of Object.entries(names)) nameMap.set(Number(key), value);
  return {
    count, positions, absMag, colorIndex, hip, names: nameMap, attribution, license,
    temperatureK: new Float32Array(count).fill(Number.NaN), radiusSolar: new Float32Array(count).fill(Number.NaN),
    hygCount: count, systems: new Map(), exoplanets: null,
  };
}

/** A copy of a HYG catalogue with planet hosts attached (matched) or appended (archive-only). */
export function mergeExoplanets(base: StarCatalog, data: ExoplanetData): StarCatalog {
  const count = base.hygCount + data.appended.length;
  const grow = <T extends Float32Array | Float64Array | Int32Array>(array: T, make: (n: number) => T, perStar = 1, fill = 0): T => {
    const next = make(count * perStar);
    next.fill(fill);
    next.set(array.subarray(0, base.hygCount * perStar));
    return next;
  };
  const catalog: StarCatalog = {
    ...base,
    count,
    positions: grow(base.positions, (n) => new Float64Array(n), 3),
    absMag: grow(base.absMag, (n) => new Float32Array(n)),
    colorIndex: grow(base.colorIndex, (n) => new Float32Array(n), 1, Number.NaN),
    hip: grow(base.hip, (n) => new Int32Array(n)),
    temperatureK: grow(base.temperatureK, (n) => new Float32Array(n), 1, Number.NaN),
    radiusSolar: grow(base.radiusSolar, (n) => new Float32Array(n), 1, Number.NaN),
    names: new Map(base.names),
    systems: new Map(),
    exoplanets: { source: data.source, acknowledgement: data.acknowledgement, retrieved: data.retrieved, planetCount: data.planetCount },
  };
  const attach = (star: number, system: Omit<PlanetarySystem, "star" | "inHyg">, inHyg: boolean) => {
    catalog.systems.set(star, { ...system, star, inHyg });
    // Spectroscopic host parameters are better than estimates from B−V.
    if (system.temperatureK !== undefined) catalog.temperatureK[star] = system.temperatureK;
    if (system.radiusSolar !== undefined) catalog.radiusSolar[star] = system.radiusSolar;
    catalog.names.set(star, { ...catalog.names.get(star), host: system.host });
  };
  for (const [star, system] of data.matched) if (star > 0 && star < base.hygCount) attach(star, system, true);
  data.appended.forEach((host, offset) => {
    const star = base.hygCount + offset;
    catalog.positions.set(host.position, star * 3);
    catalog.absMag[star] = host.absMag;
    attach(star, host.system, false);
  });
  return catalog;
}

let pending: Promise<StarCatalog> | null = null;

/** The exoplanet systems file; star mode still works (without planets) if it is unavailable. */
function loadExoplanetFile(): Promise<unknown> {
  return celestialService.getCatalogueFile("stars/exoplanets.json")
    .then((buffer) => JSON.parse(text(buffer)) as unknown)
    .catch(() => null);
}

/**
 * Load and parse the catalogue once per page (~2.2 MB binary, names index and exoplanets),
 * through the CelestialService: bundled files, or the backend's database in HTTP mode.
 */
export function loadStarCatalog(): Promise<StarCatalog> {
  pending ??= Promise.all([
    celestialService.getCatalogueFile("stars/hyg-v41.bin"),
    celestialService.getCatalogueFile("stars/hyg-v41-names.json")
      .then((buffer) => JSON.parse(text(buffer)) as { names: Record<string, StarNames>; attribution: string; license: string }),
    loadExoplanetFile(),
  ]).then(([buffer, meta, exoplanets]) => {
    let catalog = parseStarCatalog(buffer, meta.names, meta.attribution, meta.license);
    if (exoplanets !== null) {
      try {
        catalog = mergeExoplanets(catalog, parseExoplanetFile(exoplanets, catalog.count));
      } catch (error) {
        console.warn("Exoplanet systems unavailable:", error);
      }
    }
    // The Sun is a planetary system too.
    catalog.systems.set(0, solarPlanetarySystem());
    return catalog;
  })
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}

let spectra: Promise<string[]> | null = null;
/** Spectral types (one per star), loaded on first need. */
export function loadSpectralTypes(): Promise<string[]> {
  spectra ??= celestialService.getCatalogueFile("stars/hyg-v41-spect.txt")
    .then((buffer) => text(buffer).split(/\r?\n/))
    .catch((error: unknown) => {
      spectra = null;
      throw error;
    });
  return spectra;
}

const GREEK: Record<string, string> = {
  Alp: "α", Bet: "β", Gam: "γ", Del: "δ", Eps: "ε", Zet: "ζ", Eta: "η", The: "θ", Iot: "ι", Kap: "κ",
  Lam: "λ", Mu: "μ", Nu: "ν", Xi: "ξ", Omi: "ο", Pi: "π", Rho: "ρ", Sig: "σ", Tau: "τ", Ups: "υ",
  Phi: "φ", Chi: "χ", Psi: "ψ", Ome: "ω",
};
const GREEK_NAME: Record<string, string> = {
  Alp: "alpha", Bet: "beta", Gam: "gamma", Del: "delta", Eps: "epsilon", Zet: "zeta", Eta: "eta", The: "theta",
  Iot: "iota", Kap: "kappa", Lam: "lambda", Mu: "mu", Nu: "nu", Xi: "xi", Omi: "omicron", Pi: "pi", Rho: "rho",
  Sig: "sigma", Tau: "tau", Ups: "upsilon", Phi: "phi", Chi: "chi", Psi: "psi", Ome: "omega",
};
const SUPERSCRIPT: Record<string, string> = { "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };

/** IAU constellation abbreviations → genitive forms, for Bayer/Flamsteed names. */
export const CONSTELLATION_GENITIVE: Record<string, string> = {
  And: "Andromedae", Ant: "Antliae", Aps: "Apodis", Aqr: "Aquarii", Aql: "Aquilae", Ara: "Arae", Ari: "Arietis",
  Aur: "Aurigae", Boo: "Boötis", Cae: "Caeli", Cam: "Camelopardalis", Cnc: "Cancri", CVn: "Canum Venaticorum",
  CMa: "Canis Majoris", CMi: "Canis Minoris", Cap: "Capricorni", Car: "Carinae", Cas: "Cassiopeiae", Cen: "Centauri",
  Cep: "Cephei", Cet: "Ceti", Cha: "Chamaeleontis", Cir: "Circini", Col: "Columbae", Com: "Comae Berenices",
  CrA: "Coronae Australis", CrB: "Coronae Borealis", Crv: "Corvi", Crt: "Crateris", Cru: "Crucis", Cyg: "Cygni",
  Del: "Delphini", Dor: "Doradus", Dra: "Draconis", Equ: "Equulei", Eri: "Eridani", For: "Fornacis", Gem: "Geminorum",
  Gru: "Gruis", Her: "Herculis", Hor: "Horologii", Hya: "Hydrae", Hyi: "Hydri", Ind: "Indi", Lac: "Lacertae",
  Leo: "Leonis", LMi: "Leonis Minoris", Lep: "Leporis", Lib: "Librae", Lup: "Lupi", Lyn: "Lyncis", Lyr: "Lyrae",
  Men: "Mensae", Mic: "Microscopii", Mon: "Monocerotis", Mus: "Muscae", Nor: "Normae", Oct: "Octantis",
  Oph: "Ophiuchi", Ori: "Orionis", Pav: "Pavonis", Peg: "Pegasi", Per: "Persei", Phe: "Phoenicis", Pic: "Pictoris",
  Psc: "Piscium", PsA: "Piscis Austrini", Pup: "Puppis", Pyx: "Pyxidis", Ret: "Reticuli", Sge: "Sagittae",
  Sgr: "Sagittarii", Sco: "Scorpii", Scl: "Sculptoris", Sct: "Scuti", Ser: "Serpentis", Sex: "Sextantis",
  Tau: "Tauri", Tel: "Telescopii", Tri: "Trianguli", TrA: "Trianguli Australis", Tuc: "Tucanae", UMa: "Ursae Majoris",
  UMi: "Ursae Minoris", Vel: "Velorum", Vir: "Virginis", Vol: "Volantis", Vul: "Vulpeculae",
};

/** "α Centauri", "61 Cygni" style designation, or null. */
export function bayerFlamsteed(names: StarNames | undefined): string | null {
  if (!names?.con) return null;
  const constellation = CONSTELLATION_GENITIVE[names.con] ?? names.con;
  if (names.bayer) {
    const [letter, index] = names.bayer.split("-");
    const greek = GREEK[letter] ?? letter;
    return `${greek}${index ? index.split("").map((d) => SUPERSCRIPT[d] ?? d).join("") : ""} ${constellation}`;
  }
  if (names.flam) return `${names.flam} ${constellation}`;
  return null;
}

/** Best display name: IAU proper name, then Bayer/Flamsteed, Gliese, HIP, HD. */
export function starDisplayName(catalog: StarCatalog, index: number): string {
  const names = catalog.names.get(index);
  if (index === 0) return "Sun";
  if (names?.proper) return names.proper;
  const classical = bayerFlamsteed(names);
  if (classical) return classical;
  if (names?.host) return names.host;
  if (names?.gl) return names.gl;
  if (catalog.hip[index]) return `HIP ${catalog.hip[index]}`;
  if (names?.hd) return `HD ${names.hd}`;
  return `HYG star ${index}`;
}

/** All alternative designations for the information panel. */
export function starDesignations(catalog: StarCatalog, index: number): string[] {
  const names = catalog.names.get(index);
  return [
    names?.proper, bayerFlamsteed(names), names?.host, ...(catalog.systems.get(index)?.otherHostNames ?? []), names?.gl,
    catalog.hip[index] ? `HIP ${catalog.hip[index]}` : undefined,
    names?.hd ? `HD ${names.hd}` : undefined,
  ].filter((value, position, list): value is string => !!value && list.indexOf(value) === position);
}

export function starDistancePc(catalog: StarCatalog, index: number, x = 0, y = 0, z = 0): number {
  return Math.hypot(catalog.positions[index * 3] - x, catalog.positions[index * 3 + 1] - y, catalog.positions[index * 3 + 2] - z);
}

/** Case-insensitive search over named stars; prefix matches first, then by brightness. */
export function searchStars(catalog: StarCatalog, query: string, limit = 12): number[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const hipMatch = /^hip\s*(\d+)$/.exec(needle);
  if (hipMatch) {
    const hip = Number(hipMatch[1]);
    for (let i = 0; i < catalog.count; i++) if (catalog.hip[i] === hip) return [i];
    return [];
  }
  const hits: { index: number; rank: number }[] = [];
  for (const [index] of catalog.names) {
    const designations = starDesignations(catalog, index).map((name) => name.toLowerCase());
    if (index === 0) designations.push("sun", "sol");
    // Spelled Greek letters ("tau ceti", "alpha centauri") and constellation abbreviations.
    const names = catalog.names.get(index);
    if (names?.bayer && names.con) {
      const [letter] = names.bayer.split("-");
      designations.push(`${GREEK_NAME[letter] ?? letter.toLowerCase()} ${(CONSTELLATION_GENITIVE[names.con] ?? names.con).toLowerCase()}`,
        `${letter.toLowerCase()} ${names.con.toLowerCase()}`);
    }
    const prefix = designations.some((name) => name.startsWith(needle));
    if (prefix || designations.some((name) => name.includes(needle)))
      hits.push({ index, rank: (prefix ? 0 : 100) + catalog.absMag[index] + 5 * Math.log10(Math.max(starDistancePc(catalog, index), 1e-6)) });
  }
  // A planet's name finds its host star ("TRAPPIST-1 e", "51 Peg b").
  for (const [star] of searchPlanets(catalog.systems, needle, limit))
    if (!hits.some((hit) => hit.index === star)) hits.push({ index: star, rank: 50 });
  return hits.sort((a, b) => a.rank - b.rank).slice(0, limit).map((hit) => hit.index);
}
