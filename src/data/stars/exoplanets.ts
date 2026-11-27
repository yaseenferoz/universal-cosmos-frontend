/**
 * Confirmed exoplanet systems from the NASA Exoplanet Archive (Planetary Systems Composite
 * Parameters), prepared by scripts/prepare-exoplanets.py into public/stars/exoplanets.json.
 *
 * Composite parameters combine publications per planet; values the archive calculated (not
 * published) are flagged. Hosts already in HYG keep their HYG position; the rest are placed
 * from the archive's RA, Dec and distance (ICRS, parsecs, engine axes).
 */

/** How a mass was obtained: true mass, minimum mass (M sin i), or a mass-radius relation. */
export type MassKind = "mass" | "minimum" | "relation" | "unknown";

export interface Exoplanet {
  name: string;
  periodDays?: number;
  semiMajorAxisAu?: number;
  semiMajorAxisCalculated: boolean;
  eccentricity?: number;
  inclinationDeg?: number;
  /** Published argument of periastron; host/planet conventions can differ by 180°. */
  periastronArgumentDeg?: number;
  /** Transit midpoint or time of inferior conjunction (BJD). */
  conjunctionJd?: number;
  /** Time of periastron (BJD). */
  periastronJd?: number;
  radiusEarth?: number;
  radiusCalculated: boolean;
  massEarth?: number;
  massKind: MassKind;
  equilibriumK?: number;
  equilibriumCalculated: boolean;
  /** Stellar flux received, in units of Earth's. */
  insolationEarth?: number;
  method: string;
  year?: number;
  facility?: string;
  transiting: boolean;
  controversial: boolean;
  /** Solar System planets: catalogue id (positions and descents come from the Solar System view). */
  objectId?: string;
  /** Measured mean colour (hex), used instead of the illustrative class colour. */
  color?: string;
}

export interface PlanetarySystem {
  host: string;
  otherHostNames: string[];
  /** Catalogue star index of the host. */
  star: number;
  /** True when the host is a HYG star (position from HYG), false when placed from the archive. */
  inHyg: boolean;
  /** Our own Solar System (the Sun's planets). */
  solarSystem?: boolean;
  temperatureK?: number;
  /** Temperature from a main-sequence mass relation (no measured value). */
  temperatureEstimated: boolean;
  radiusSolar?: number;
  massSolar?: number;
  logLuminosity?: number;
  spectralType?: string;
  distancePc?: number;
  starCount?: number;
  /** For archive-placed hosts: how the absolute magnitude was obtained. */
  magnitudeFrom?: "V" | "luminosity" | "radius" | "gaia" | "mass";
  planets: Exoplanet[];
}

/** A host that is not in HYG, to append to the catalogue. */
export interface ArchiveHost {
  system: Omit<PlanetarySystem, "star" | "inHyg">;
  position: [number, number, number];
  absMag: number;
}

export interface ExoplanetData {
  /** Hosts matched to HYG, keyed by HYG index. */
  matched: Map<number, Omit<PlanetarySystem, "star" | "inHyg">>;
  appended: ArchiveHost[];
  source: string;
  acknowledgement: string;
  retrieved: string;
  planetCount: number;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const str = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const MASS_KIND: Record<string, MassKind> = { s: "minimum", r: "relation", u: "unknown" };
const MAGNITUDE_FROM = new Set(["V", "luminosity", "radius", "gaia", "mass"]);

function parsePlanet(raw: unknown, host: string, methods: string[], facilities: string[]): Exoplanet | null {
  if (!isObject(raw)) return null;
  const name = str(raw.name) ?? (str(raw.n) ? `${host} ${str(raw.n)}` : undefined);
  if (!name) return null;
  const methodIndex = num(raw.method), facilityIndex = num(raw.fac);
  const eccentricity = num(raw.e);
  return {
    name,
    periodDays: num(raw.p) !== undefined && num(raw.p)! > 0 ? num(raw.p) : undefined,
    semiMajorAxisAu: num(raw.a) !== undefined && num(raw.a)! > 0 ? num(raw.a) : undefined,
    semiMajorAxisCalculated: raw.aCalc === 1,
    eccentricity: eccentricity !== undefined && eccentricity >= 0 && eccentricity < 1 ? eccentricity : undefined,
    inclinationDeg: num(raw.i),
    periastronArgumentDeg: num(raw.w),
    conjunctionJd: num(raw.tc),
    periastronJd: num(raw.tp),
    radiusEarth: num(raw.r) !== undefined && num(raw.r)! > 0 ? num(raw.r) : undefined,
    radiusCalculated: raw.rCalc === 1,
    massEarth: num(raw.m) !== undefined && num(raw.m)! > 0 ? num(raw.m) : undefined,
    massKind: typeof raw.mk === "string" ? MASS_KIND[raw.mk] ?? "unknown" : "mass",
    equilibriumK: num(raw.teq),
    equilibriumCalculated: raw.teqCalc === 1,
    insolationEarth: num(raw.s),
    method: (methodIndex !== undefined ? methods[methodIndex] : undefined) ?? "Unknown",
    year: num(raw.year),
    facility: facilityIndex !== undefined ? facilities[facilityIndex] : undefined,
    transiting: raw.tr === 1,
    controversial: raw.controversial === 1,
  };
}

/** Validate the prepared file; malformed systems and planets are skipped, not guessed. */
export function parseExoplanetFile(input: unknown, hygCount: number): ExoplanetData {
  if (!isObject(input) || !isObject(input.meta) || !Array.isArray(input.systems))
    throw new Error("Not a Universal Cosmos exoplanet file.");
  const meta = input.meta;
  const methods = Array.isArray(meta.methods) ? meta.methods.map((m) => String(m)) : [];
  const facilities = Array.isArray(meta.facilities) ? meta.facilities.map((f) => String(f)) : [];
  const matched = new Map<number, Omit<PlanetarySystem, "star" | "inHyg">>();
  const appended: ArchiveHost[] = [];
  let planetCount = 0;
  for (const raw of input.systems) {
    if (!isObject(raw) || !str(raw.host) || !Array.isArray(raw.planets)) continue;
    const host = str(raw.host)!;
    const planets = raw.planets.map((planet) => parsePlanet(planet, host, methods, facilities)).filter((p): p is Exoplanet => p !== null);
    if (planets.length === 0) continue;
    const measuredTeff = num(raw.teff);
    const system: Omit<PlanetarySystem, "star" | "inHyg"> = {
      host,
      otherHostNames: Array.isArray(raw.alsoHosts) ? raw.alsoHosts.map((h) => String(h)) : [],
      temperatureK: measuredTeff ?? num(raw.teffEst),
      temperatureEstimated: measuredTeff === undefined && num(raw.teffEst) !== undefined,
      radiusSolar: num(raw.rad),
      massSolar: num(raw.mass),
      logLuminosity: num(raw.lum),
      spectralType: str(raw.spt),
      distancePc: num(raw.dist),
      starCount: num(raw.stars),
      magnitudeFrom: typeof raw.mvFrom === "string" && MAGNITUDE_FROM.has(raw.mvFrom) ? raw.mvFrom as PlanetarySystem["magnitudeFrom"] : undefined,
      planets,
    };
    const star = num(raw.star);
    if (star !== undefined) {
      if (!Number.isInteger(star) || star < 0 || star >= hygCount) continue;
      const existing = matched.get(star);
      if (existing) existing.planets.push(...planets);
      else matched.set(star, system);
    } else {
      const position = Array.isArray(raw.pos) ? raw.pos.map(num) : [];
      const absMag = num(raw.mv);
      if (position.length !== 3 || position.some((c) => c === undefined) || absMag === undefined) continue;
      appended.push({ system, position: position as [number, number, number], absMag });
    }
    planetCount += planets.length;
  }
  return {
    matched, appended, planetCount,
    source: str(meta.source) ?? "NASA Exoplanet Archive",
    acknowledgement: str(meta.acknowledgement) ?? "",
    retrieved: str(meta.retrieved) ?? "unknown",
  };
}

/** Planets whose name contains the query (case-insensitive), as [star, planet] pairs. */
export function searchPlanets(systems: Map<number, PlanetarySystem>, query: string, limit = 12): [number, number][] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const prefix: [number, number][] = [], other: [number, number][] = [];
  for (const [star, system] of systems) {
    system.planets.forEach((planet, index) => {
      const name = planet.name.toLowerCase();
      if (name.startsWith(needle)) prefix.push([star, index]);
      else if (name.includes(needle)) other.push([star, index]);
    });
  }
  return [...prefix, ...other].slice(0, limit);
}
