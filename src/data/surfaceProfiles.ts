import type { CelestialObject, ObjectId } from "../types/celestial";
import { registeredLanding } from "./landingRegistry";
import { objectById } from "./catalog";
import { generatedOrbits } from "./generatedBodies";
import { craterDensityFor, environmentFor } from "./planetaryEnvironments";

/**
 * Landing-scale surface classes for worlds without a measured terrain package, chosen from
 * each body's imaged geology. Everything a class produces (relief features, ground pattern,
 * rock population) is a procedural illustration of that geology, not a map of the site.
 *
 * - regolith: dusty impact regolith, craters, scattered blocks (NEAR at Eros, Dawn at Vesta).
 * - rubble: boulder-dominated rubble pile with little fine regolith (OSIRIS-REx at Bennu,
 *   Hayabusa2 at Ryugu, Hayabusa at Itokawa).
 * - comet: dark dust deposits, terraces and cliffs, pits and exposed ice (Rosetta at 67P).
 * - ice-cratered: bright, heavily cratered water ice (Cassini at Mimas, Tethys, Rhea).
 * - ice-ridged: young ice cut by double ridges with reddish-brown margins, little cratering
 *   (Galileo at Europa; Cassini at Enceladus).
 * - ice-grooved: swaths of parallel grooves in bright ice beside dark, older terrain (Ganymede).
 * - dark-lag: dark sublimation lag with bright frost on knobs and crater rims (Callisto).
 * - volcanic: sulfur plains, sulfur-dioxide frost, black lava in paterae; no craters (Io).
 * - pebble: rounded water-ice pebbles on dark sand (Huygens at Titan).
 * - volatile-ice: nitrogen/methane ice with convection cells, sublimation pits and
 *   tholin-stained troughs (New Horizons at Pluto).
 * - cantaloupe: dimpled terrain and dark plume streaks (Voyager 2 at Triton).
 */
export type SurfaceKind =
  | "regolith" | "rubble" | "comet" | "ice-cratered" | "ice-ridged" | "ice-grooved"
  | "dark-lag" | "volcanic" | "pebble" | "volatile-ice" | "cantaloupe";

/** Display albedo colours are sRGB hex values, like map pixels. */
export interface GroundAppearance {
  /** Mottling strength of the base colour (0–0.5). */
  mottle: number;
  /** Colour exposed on steep slopes (fresh material on airless worlds). */
  slopeColor: string;
  slopeExposure: number;
  /** Patchy secondary deposits (e.g. Io's SO₂ frost, comet ice glints). */
  patchColor: string;
  patchAmount: number;
  /** Patch noise scale, meters (a power of two ≤ 4096 so patterns stay seamless). */
  patchScaleM: number;
  /** Fraction of the area the patches cover (0–1). */
  patchCoverage: number;
  /** Colour of the relief feature material (ridge margins, lava, frost, tholins...). */
  accentColor: string;
  /** How much photographic grain and bump the ground shows (ice is smoother). */
  grain: number;
  /** 0 = matte regolith, 1 = glossy ice. */
  gloss: number;
}

export interface RockPopulation {
  /** Multiplier on the quality preset's rock count (0 = none). */
  density: number;
  /** Largest rock width, meters, near the observer. */
  maxWidthM: number;
  /** Smallest rock width, meters. */
  minWidthM: number;
  /** Size distribution exponent: larger = more small rocks. */
  sizeExponent: number;
  /** Superellipsoid exponent: 2 = rounded pebble, 4+ = angular block. */
  shapeExponent: number;
  /** Height-to-width ratio range. */
  flatness: [number, number];
  /** Placement radius, meters. */
  rangeM: number;
  /** Rock colour relative to the ground colour, and its spread. */
  brightness: number;
  brightnessSpread: number;
}

export interface SurfaceProfile {
  kind: SurfaceKind;
  /** Base ground colour when no landing-site map colour is available. */
  groundColor: string;
  craterDensity: number;
  ground: GroundAppearance;
  rocks: RockPopulation;
  /** One-line description of the reconstructed surface for the UI. */
  summary: string;
}

const KIND_BY_ID: Partial<Record<ObjectId, SurfaceKind>> = {
  io: "volcanic", europa: "ice-ridged", enceladus: "ice-ridged", ganymede: "ice-grooved",
  callisto: "dark-lag", phoebe: "dark-lag", titan: "pebble", triton: "cantaloupe",
  pluto: "volatile-ice", eris: "volatile-ice", makemake: "volatile-ice",
  mimas: "ice-cratered", tethys: "ice-cratered", dione: "ice-cratered", rhea: "ice-cratered",
  iapetus: "ice-cratered", hyperion: "ice-cratered", miranda: "ice-cratered", ariel: "ice-cratered",
  umbriel: "ice-cratered", titania: "ice-cratered", oberon: "ice-cratered", charon: "ice-cratered",
  haumea: "ice-cratered", ceres: "regolith", vesta: "regolith", phobos: "regolith", deimos: "regolith",
};

/** Rubble-pile size limit: kilometre-scale and smaller asteroids imaged so far are rubble piles. */
const RUBBLE_RADIUS_KM = 1.5;

export function surfaceKindFor(object: Pick<CelestialObject, "id" | "parentId" | "category" | "radiusKm">): SurfaceKind {
  const known = KIND_BY_ID[object.id];
  if (known) return known;
  const category = object.category.toLowerCase();
  if (category.includes("comet")) return "comet";
  if (object.parentId === "sun") return object.radiusKm < RUBBLE_RADIUS_KM && category.includes("asteroid") ? "rubble" : "regolith";
  if (object.parentId === "pluto") return "ice-cratered";
  // Captured irregular moons: dark, cratered regolith; Saturn's and beyond: icy.
  if (generatedOrbits.get(object.id)?.referencePlane === "ecliptic") return "regolith";
  return object.parentId && ["saturn", "uranus", "neptune"].includes(object.parentId) ? "ice-cratered" : "regolith";
}

const GROUND: Record<SurfaceKind, GroundAppearance> = {
  regolith: { mottle: 0.14, slopeColor: "+25%", slopeExposure: 0.5, patchColor: "-15%", patchAmount: 0.35, patchScaleM: 256, patchCoverage: 0.35, accentColor: "+10%", grain: 0.85, gloss: 0 },
  rubble: { mottle: 0.22, slopeColor: "+20%", slopeExposure: 0.3, patchColor: "+45%", patchAmount: 0.25, patchScaleM: 8, patchCoverage: 0.2, accentColor: "+15%", grain: 1, gloss: 0 },
  comet: { mottle: 0.12, slopeColor: "-15%", slopeExposure: 0.4, patchColor: "#d8dee6", patchAmount: 0.9, patchScaleM: 4, patchCoverage: 0.015, accentColor: "+12%", grain: 0.7, gloss: 0 },
  "ice-cratered": { mottle: 0.07, slopeColor: "+10%", slopeExposure: 0.5, patchColor: "-18%", patchAmount: 0.4, patchScaleM: 512, patchCoverage: 0.3, accentColor: "+8%", grain: 0.35, gloss: 0.35 },
  "ice-ridged": { mottle: 0.06, slopeColor: "#dde8ee", slopeExposure: 0.4, patchColor: "#c9d6dd", patchAmount: 0.4, patchScaleM: 256, patchCoverage: 0.4, accentColor: "#8f6447", grain: 0.25, gloss: 0.5 },
  "ice-grooved": { mottle: 0.09, slopeColor: "+12%", slopeExposure: 0.4, patchColor: "-12%", patchAmount: 0.3, patchScaleM: 512, patchCoverage: 0.35, accentColor: "#5a5148", grain: 0.4, gloss: 0.3 },
  "dark-lag": { mottle: 0.12, slopeColor: "#cfd3d6", slopeExposure: 0.35, patchColor: "-15%", patchAmount: 0.3, patchScaleM: 128, patchCoverage: 0.35, accentColor: "#dfe3e6", grain: 0.7, gloss: 0.1 },
  volcanic: { mottle: 0.12, slopeColor: "#c0743a", slopeExposure: 0.35, patchColor: "#e9e5d8", patchAmount: 0.75, patchScaleM: 256, patchCoverage: 0.3, accentColor: "#2b2522", grain: 0.45, gloss: 0.05 },
  pebble: { mottle: 0.1, slopeColor: "+10%", slopeExposure: 0.2, patchColor: "-20%", patchAmount: 0.3, patchScaleM: 64, patchCoverage: 0.4, accentColor: "+15%", grain: 0.8, gloss: 0.1 },
  "volatile-ice": { mottle: 0.08, slopeColor: "+8%", slopeExposure: 0.3, patchColor: "#efe6da", patchAmount: 0.5, patchScaleM: 128, patchCoverage: 0.35, accentColor: "#6b3a2a", grain: 0.3, gloss: 0.4 },
  cantaloupe: { mottle: 0.08, slopeColor: "+10%", slopeExposure: 0.35, patchColor: "#e6dcd4", patchAmount: 0.4, patchScaleM: 256, patchCoverage: 0.35, accentColor: "#4f4540", grain: 0.35, gloss: 0.35 },
};

const ROCKS: Record<SurfaceKind, RockPopulation> = {
  regolith: { density: 1, maxWidthM: 0.8, minWidthM: 0.05, sizeExponent: 5, shapeExponent: 2.8, flatness: [0.35, 0.9], rangeM: 65, brightness: 1.05, brightnessSpread: 0.35 },
  // Bennu: boulders >1 m everywhere, the largest tens of meters across.
  rubble: { density: 1.5, maxWidthM: 9, minWidthM: 0.25, sizeExponent: 2.6, shapeExponent: 3.6, flatness: [0.45, 0.95], rangeM: 65, brightness: 1.05, brightnessSpread: 0.6 },
  comet: { density: 0.6, maxWidthM: 4, minWidthM: 0.2, sizeExponent: 3.2, shapeExponent: 3.2, flatness: [0.4, 0.85], rangeM: 65, brightness: 1.1, brightnessSpread: 0.35 },
  "ice-cratered": { density: 0.45, maxWidthM: 1.4, minWidthM: 0.08, sizeExponent: 4.5, shapeExponent: 4.5, flatness: [0.4, 0.8], rangeM: 65, brightness: 1.08, brightnessSpread: 0.2 },
  "ice-ridged": { density: 0.35, maxWidthM: 2, minWidthM: 0.1, sizeExponent: 4, shapeExponent: 6, flatness: [0.35, 0.7], rangeM: 65, brightness: 1.1, brightnessSpread: 0.15 },
  "ice-grooved": { density: 0.4, maxWidthM: 1.5, minWidthM: 0.08, sizeExponent: 4.5, shapeExponent: 4.5, flatness: [0.4, 0.8], rangeM: 65, brightness: 1.05, brightnessSpread: 0.25 },
  "dark-lag": { density: 0.6, maxWidthM: 1.5, minWidthM: 0.08, sizeExponent: 4, shapeExponent: 3.4, flatness: [0.4, 0.9], rangeM: 65, brightness: 1.35, brightnessSpread: 0.5 },
  volcanic: { density: 0.3, maxWidthM: 1.2, minWidthM: 0.08, sizeExponent: 4, shapeExponent: 4, flatness: [0.3, 0.7], rangeM: 65, brightness: 0.35, brightnessSpread: 0.3 },
  // Huygens: rounded 2–15 cm pebbles within a few meters of the probe.
  pebble: { density: 1.5, maxWidthM: 0.16, minWidthM: 0.03, sizeExponent: 1.8, shapeExponent: 2, flatness: [0.55, 0.85], rangeM: 9, brightness: 1.9, brightnessSpread: 0.35 },
  "volatile-ice": { density: 0.15, maxWidthM: 2.5, minWidthM: 0.2, sizeExponent: 3, shapeExponent: 5, flatness: [0.4, 0.8], rangeM: 65, brightness: 1.05, brightnessSpread: 0.2 },
  cantaloupe: { density: 0.2, maxWidthM: 1.5, minWidthM: 0.1, sizeExponent: 4, shapeExponent: 4, flatness: [0.4, 0.8], rangeM: 65, brightness: 1.05, brightnessSpread: 0.2 },
};

const SUMMARY: Record<SurfaceKind, string> = {
  regolith: "Dusty impact regolith with craters of many sizes and scattered ejecta blocks.",
  rubble: "Rubble pile: boulders of all sizes with little fine regolith between them.",
  comet: "Dark dust deposits with terraces, cliffs and pits; rare bright patches of exposed ice.",
  "ice-cratered": "Bright water ice saturated with craters, fresh walls brighter than the plains.",
  "ice-ridged": "Young ice crossed by double ridges with reddish-brown margins; few craters.",
  "ice-grooved": "Swaths of parallel grooves in bright ice beside darker, older cratered terrain.",
  "dark-lag": "Dark dusty lag deposit; bright frost caps knobs and crater rims.",
  volcanic: "Sulfur-rich plains, white sulfur-dioxide frost and black lava in volcanic depressions; no impact craters.",
  pebble: "Dark sand strewn with rounded water-ice pebbles, as seen by Huygens.",
  "volatile-ice": "Nitrogen-methane ice plains with convection cells, sublimation pits and tholin-stained troughs.",
  cantaloupe: "Dimpled 'cantaloupe' ice terrain with dark plume streaks.",
};

const profiles = new Map<ObjectId, SurfaceProfile | undefined>();

/** Surface profile for a body with a synthesized landing environment, else undefined. */
export function surfaceProfileFor(id: ObjectId): SurfaceProfile | undefined {
  const registered = registeredLanding(id);
  if (registered) return registered.surface;
  if (profiles.has(id)) return profiles.get(id);
  const object = objectById[id];
  const environment = environmentFor(id);
  const dedicated = ["mercury", "venus", "earth", "mars", "moon"].includes(id);
  let profile: SurfaceProfile | undefined;
  if (object && environment?.mode === "surface" && !dedicated) {
    const kind = surfaceKindFor(object);
    profile = {
      kind,
      groundColor: environment.groundColor,
      craterDensity: kind === "volcanic" || kind === "pebble" ? 0 : craterDensityFor(object),
      ground: GROUND[kind],
      rocks: ROCKS[kind],
      summary: SUMMARY[kind],
    };
  }
  profiles.set(id, profile);
  return profile;
}

/**
 * A profile for one surface class with a given ground colour, for bodies outside the
 * catalogue (exoplanets). `ground` overrides parts of the class palette.
 */
export function surfaceClassProfile(kind: SurfaceKind, groundColor: string, craterDensity: number,
  options: { ground?: Partial<GroundAppearance>; rocks?: Partial<RockPopulation>; summary?: string } = {}): SurfaceProfile {
  return {
    kind, groundColor, craterDensity,
    ground: { ...GROUND[kind], ...options.ground },
    rocks: { ...ROCKS[kind], ...options.rocks },
    summary: options.summary ?? SUMMARY[kind],
  };
}

/**
 * Resolve a palette entry against the ground colour: "#rrggbb" is absolute, "+25%" /
 * "-15%" scale the ground colour's brightness. Returns linear RGB.
 */
export function resolvePaletteColor(entry: string, groundLinear: readonly [number, number, number]): [number, number, number] {
  const relative = /^([+-]\d+(?:\.\d+)?)%$/.exec(entry);
  if (relative) {
    const factor = 1 + Number(relative[1]) / 100;
    return groundLinear.map((channel) => Math.min(1, channel * factor)) as [number, number, number];
  }
  return hexToLinear(entry);
}

export function hexToLinear(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return channels.map((byte) => {
    const c = byte / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}
