import type { CelestialObject, CoreObjectId, ObjectId } from "../types/celestial";
import { objectById } from "./catalog";
import { bodyAppearance } from "./bodyAppearance";
import { generatedOrbits } from "./generatedBodies";

export interface PlanetaryEnvironment {
  mode: "surface" | "atmosphere";
  groundColor: string;
  skyColor: string;
  horizonColor: string;
  /** Illustrative tint around the low Sun; omitted for unqualified atmospheres. */
  twilightColor?: string;
  /** Illustrative optical layer extent, meters; not measured scale height. */
  hazeHeightM: number;
  hazeOpacity: number;
  /** Illustrative clear-night transmission of the background sky, from 0 to 1. */
  nightSkyTransmission: number;
  /** Display-only dark adaptation for the mapped night sky; 1 means no gain. */
  nightSkyAdaptation: number;
  /** Strength of broad, illustrative cloud variation seen from below. */
  cloudStructure: number;
  /**
   * Vertical optical depth of the atmosphere for direct sunlight at the surface
   * (representative values: Mars dust ~0.6; Venus clouds ~30+, so no solar disk).
   */
  solarOpticalDepth: number;
  reliefM: number;
  /** Analytic terrain feature spacing, not measurement resolution. */
  featureScaleM: number;
  description: string;
}

/** Display reconstructions. Numerical parameters are art/model choices, never measurements. */
export const planetaryEnvironments: Partial<Record<CoreObjectId, PlanetaryEnvironment>> = {
  mercury: { mode: "surface", groundColor: "#8c8175", skyColor: "#000000", horizonColor: "#000000", hazeHeightM: 0, hazeOpacity: 0, nightSkyTransmission: 1, nightSkyAdaptation: 1, cloudStructure: 0, solarOpticalDepth: 0, reliefM: 500, featureScaleM: 6000, description: "Black airless sky, direct sunlight and reconstructed crater bowls/rims. No measured Mercury landing site is installed." },
  venus: { mode: "surface", groundColor: "#99734a", skyColor: "#b68d43", horizonColor: "#d5ad61", hazeHeightM: 100000, hazeOpacity: 1, nightSkyTransmission: 0, nightSkyAdaptation: 1, cloudStructure: 0.35, solarOpticalDepth: 35, reliefM: 350, featureScaleM: 5000, description: "Reconstructed rocky plains beneath opaque amber haze, with predominantly diffuse daylight. Stars are hidden from the surface. No radar elevation dataset is installed." },
  earth: { mode: "surface", groundColor: "#807866", skyColor: "#478ecb", horizonColor: "#c4d8df", twilightColor: "#e99752", hazeHeightM: 80000, hazeOpacity: 0.98, nightSkyTransmission: 0.62, nightSkyAdaptation: 1.4, cloudStructure: 0, solarOpticalDepth: 0.3, reliefM: 300, featureScaleM: 5000, description: "Reconstructed dry uplands, rolling hills and clear-air distance haze. This terrain is not georeferenced geography." },
  mars: { mode: "surface", groundColor: "#b58161", skyColor: "#987d68", horizonColor: "#d4b39a", twilightColor: "#759bc3", hazeHeightM: 60000, hazeOpacity: 0.55, nightSkyTransmission: 0.85, nightSkyAdaptation: 2.2, cloudStructure: 0, solarOpticalDepth: 0.6, reliefM: 450, featureScaleM: 6000, description: "Reconstructed layered uplands, shallow dunes, rocky soil and dusty sky. Stars become visible on the night side when dust is thin; dust properties are illustrative." },
  jupiter: { mode: "atmosphere", groundColor: "#bfa98d", skyColor: "#9b8975", horizonColor: "#d5c1a3", hazeHeightM: 250000, hazeOpacity: 1, nightSkyTransmission: 0.75, nightSkyAdaptation: 1, cloudStructure: 0.5, solarOpticalDepth: 4, reliefM: 0, featureScaleM: 10000, description: "Cloud-level flight about 15 km above Jupiter's ammonia-ice deck (~0.5 bar): thin bluish H2 sky, zonal bands in the observed colours, the Galilean moons overhead, lightning in the deep clouds at night. Cloud texture is procedural; band colours come from the Hubble map." },
  saturn: { mode: "atmosphere", groundColor: "#cfbf95", skyColor: "#b0a27e", horizonColor: "#d9cca7", hazeHeightM: 250000, hazeOpacity: 1, nightSkyTransmission: 0.6, nightSkyAdaptation: 1, cloudStructure: 0.4, solarOpticalDepth: 4, reliefM: 0, featureScaleM: 10000, description: "Cloud-level flight above Saturn's hazy ammonia deck: pale sky, observed band colours, the rings arching across the sky and the moons overhead. Cloud texture is procedural." },
  uranus: { mode: "atmosphere", groundColor: "#a4c5c3", skyColor: "#79a6a8", horizonColor: "#b5d3d1", hazeHeightM: 200000, hazeOpacity: 1, nightSkyTransmission: 0.5, nightSkyAdaptation: 1, cloudStructure: 0.25, solarOpticalDepth: 3, reliefM: 0, featureScaleM: 10000, description: "Cloud-level flight above Uranus's methane-ice deck (~1.2 bar): methane absorbs red light, so the sky is cyan; the Sun is a small bright star at 19 AU. Cloud texture is procedural." },
  neptune: { mode: "atmosphere", groundColor: "#83b7bd", skyColor: "#608eaa", horizonColor: "#a0c6ce", hazeHeightM: 200000, hazeOpacity: 1, nightSkyTransmission: 0.55, nightSkyAdaptation: 1, cloudStructure: 0.3, solarOpticalDepth: 3, reliefM: 0, featureScaleM: 10000, description: "Cloud-level flight above Neptune's methane-ice deck: blue-cyan sky, bright methane cirrus, the Sun a small brilliant star at 30 AU, Triton in the sky. Cloud texture is procedural." },
};

/**
 * Titan: Huygens (2005) landed on dark plains strewn with rounded water-ice pebbles under an
 * orange sky; surface daylight is roughly 1/1000 of Earth's and the solar disk is not seen
 * through the organic haze. Lakes, dunes and methane weather are not modeled here.
 */
const titan: PlanetaryEnvironment = {
  mode: "surface", groundColor: "#5c4a35", skyColor: "#b9772d", horizonColor: "#d39a52", twilightColor: "#8a4f1f",
  hazeHeightM: 200_000, hazeOpacity: 1, nightSkyTransmission: 0, nightSkyAdaptation: 1, cloudStructure: 0.12,
  solarOpticalDepth: 6, reliefM: 250, featureScaleM: 40,
  description: "Huygens-informed reconstruction: dense nitrogen atmosphere with orange organic haze (no solar disk; surface light ~1/1000 of Earth's) over dark, pebble-strewn plains. Terrain and lakes are not measured; relief is procedural.",
};

/**
 * Crater density of each world's surface (0 = resurfaced, 1 = saturated), from its imaged
 * geology: ancient Callisto and Rhea vs. young Europa, volcanic Io and Triton.
 */
const CRATER_DENSITY: Partial<Record<ObjectId, number>> = {
  io: 0, europa: 0.1, triton: 0.1, titan: 0.05, enceladus: 0.35, pluto: 0.3, ganymede: 0.5, ariel: 0.5,
  miranda: 0.5, charon: 0.6, titania: 0.8, dione: 0.8, ceres: 0.8, vesta: 0.8, tethys: 0.9, iapetus: 0.9,
  oberon: 0.9, callisto: 1, rhea: 1, mimas: 1, umbriel: 1, phoebe: 1, hyperion: 1,
};
/** Mean colours of installed maps where the albedo model's family colour is too generic. */
const MAP_GROUND: Partial<Record<ObjectId, string>> = {
  io: "#b09a64", titania: "#929292", triton: "#9fa294", pluto: "#8b7a73", charon: "#828282",
};
const PLANET_CATEGORIES = ["Terrestrial planet", "Gas giant", "Ice giant", "G-type main-sequence star"];

function srgbHex([r, g, b]: [number, number, number]): string {
  const encode = (value: number) => {
    const v = Math.max(0, Math.min(1, value));
    const srgb = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255).toString(16).padStart(2, "0");
  };
  return `#${encode(r)}${encode(g)}${encode(b)}`;
}

/** Crater density used by the procedural terrain (comets are pitted rather than cratered). */
export function craterDensityFor(object: Pick<CelestialObject, "id" | "category">): number {
  const known = CRATER_DENSITY[object.id];
  if (known !== undefined) return known;
  return object.category.toLowerCase().includes("comet") ? 0.3 : 0.75;
}

/** Relief and finest landform spacing that scale with body size (meters). */
export function reliefScaleFor(radiusKm: number): { reliefM: number; featureScaleM: number } {
  const radiusM = Math.max(1, radiusKm * 1000);
  const reliefM = Math.min(8000, Math.max(2, (0.15 * radiusM) / (1 + radiusKm / 40) ** 0.6));
  const featureScaleM = Math.min(150, Math.max(1.5, radiusM * 0.0004));
  return { reliefM, featureScaleM };
}

const synthesized = new Map<ObjectId, PlanetaryEnvironment | undefined>();

/**
 * Airless solid worlds without a hand-written profile: black sky, unfiltered sunlight,
 * stars at night, the parent planet and sibling moons in the sky (drawn by the main scene),
 * ground colour from the body's measured albedo/colour, and size-scaled procedural relief.
 */
function synthesizedEnvironment(id: ObjectId): PlanetaryEnvironment | undefined {
  if (synthesized.has(id)) return synthesized.get(id);
  const object = objectById[id];
  let environment: PlanetaryEnvironment | undefined;
  // The Moon keeps its measured LOLA terrain path; stations and stars are not landable.
  if (object && id !== "moon" && id !== "iss" && !PLANET_CATEGORIES.includes(object.category)) {
    const appearance = bodyAppearance(object, { irregularOrbit: generatedOrbits.get(id)?.referencePlane === "ecliptic" });
    const { reliefM, featureScaleM } = reliefScaleFor(object.radiusKm);
    const parent = object.parentId && object.parentId !== "sun" ? objectById[object.parentId]?.name : undefined;
    environment = {
      mode: "surface", groundColor: MAP_GROUND[id] ?? srgbHex(appearance.rgb), skyColor: "#000000", horizonColor: "#000000",
      hazeHeightM: 0, hazeOpacity: 0, nightSkyTransmission: 1, nightSkyAdaptation: 1, cloudStructure: 0,
      solarOpticalDepth: 0, reliefM, featureScaleM,
      description: `Airless surface: black sky, unfiltered sunlight and stars at night${parent ? `, ${parent} and its other moons in the sky` : ""}. Ground colour follows the measured albedo/colour; terrain is a procedural reconstruction on a spherical datum, not a measured shape or DEM.`,
    };
  }
  synthesized.set(id, environment);
  return environment;
}

export function environmentFor(id: ObjectId): PlanetaryEnvironment | undefined {
  if (id === "titan") return titan;
  return (planetaryEnvironments as Partial<Record<ObjectId, PlanetaryEnvironment>>)[id] ?? synthesizedEnvironment(id);
}
