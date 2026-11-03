import type { ObjectId } from "../types/celestial";
import type { PlanetaryExplorationProfile } from "../types/planetaryExploration";
import { planetaryEnvironments } from "./planetaryEnvironments";

const nasaFacts = {
  sourceLabel: "NASA / NSSDCA Planetary Fact Sheets",
  sourceUrl: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/",
  referenceEpoch: "Steady reference profile; not a weather observation",
} as const;

const unsupported = {
  sourceLabel: "NASA / NSSDCA Planetary Fact Sheets",
  sourceUrl: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/",
  referenceEpoch: "Not applicable",
  coverage: "No solid surface is modeled",
  reconstruction: "unavailable",
} as const;

/** Current capabilities for the bundled ten-object catalog. */
export const explorationProfiles: Record<ObjectId, PlanetaryExplorationProfile> = {
  sun: {
    objectId: "sun", classification: "STAR",
    modes: { orbital: "available", surface: "not-supported", atmospheric: "not-supported" },
    terrain: unsupported, sky: unsupported,
    notice: "The Sun is observable from orbit only; a surface landing is physically unsupported.",
  },
  mercury: {
    objectId: "mercury", classification: "AIRLESS_SOLID",
    modes: { orbital: "available", surface: "planned", atmospheric: "not-supported" },
    terrain: { ...nasaFacts, coverage: "No landing terrain package is installed.", reconstruction: "unavailable" },
    sky: { ...nasaFacts, coverage: "Airless-sky profile is specified but not rendered from the surface.", reconstruction: "illustrative" },
    notice: "Surface descent awaits a verified Mercury terrain package.",
  },
  venus: {
    objectId: "venus", classification: "ATMOSPHERIC_SOLID",
    modes: { orbital: "available", surface: "planned", atmospheric: "planned" },
    terrain: { ...nasaFacts, coverage: "No radar terrain package is installed.", reconstruction: "unavailable" },
    sky: { ...nasaFacts, coverage: "No surface atmosphere profile is rendered.", reconstruction: "unavailable" },
    notice: "Neither atmospheric entry nor a surface landing is enabled yet.",
  },
  earth: {
    objectId: "earth", classification: "ATMOSPHERIC_SOLID",
    modes: { orbital: "available", surface: "planned", atmospheric: "planned" },
    terrain: { ...nasaFacts, coverage: "Orbital imagery only; no terrain landing package is installed.", reconstruction: "unavailable" },
    sky: { ...nasaFacts, coverage: "Orbital atmosphere is a display approximation, not a surface sky engine.", reconstruction: "illustrative" },
    notice: "Surface and atmospheric exploration require a terrain and sky dataset.",
  },
  moon: {
    objectId: "moon", classification: "AIRLESS_SOLID",
    modes: { orbital: "available", surface: "available", atmospheric: "not-supported" },
    terrain: {
      sourceLabel: "NASA LROC stereo elevation, LOLA, and LROC imagery",
      sourceUrl: "https://www.lroc.asu.edu/",
      referenceEpoch: "Static packaged regional products; see LUNAR_DATA.md",
      coverage: "Taurus-Littrow local and context coverage plus coarse global terrain",
      reconstruction: "measured",
    },
    sky: { ...nasaFacts, coverage: "Airless local sky; Sun uses the illustrative orbital model.", reconstruction: "hybrid" },
    notice: "The Moon is the only current measured surface destination.",
  },
  mars: {
    objectId: "mars", classification: "ATMOSPHERIC_SOLID",
    modes: { orbital: "available", surface: "planned", atmospheric: "planned" },
    terrain: { ...nasaFacts, coverage: "No landing terrain package is installed.", reconstruction: "unavailable" },
    sky: { ...nasaFacts, coverage: "No Martian sky profile is rendered from the surface.", reconstruction: "unavailable" },
    notice: "Surface descent awaits verified terrain and a qualified dust-atmosphere profile.",
  },
  jupiter: {
    objectId: "jupiter", classification: "GAS_GIANT",
    modes: { orbital: "available", surface: "not-supported", atmospheric: "planned" },
    terrain: unsupported,
    sky: { ...nasaFacts, coverage: "No altitude-dependent atmosphere profile is installed.", reconstruction: "unavailable" },
    notice: "Jupiter has no solid-surface landing mode; future exploration is atmospheric only.",
  },
  saturn: {
    objectId: "saturn", classification: "GAS_GIANT",
    modes: { orbital: "available", surface: "not-supported", atmospheric: "planned" },
    terrain: unsupported,
    sky: { ...nasaFacts, coverage: "No altitude-dependent atmosphere profile is installed.", reconstruction: "unavailable" },
    notice: "Saturn has no solid-surface landing mode; future exploration is atmospheric only.",
  },
  uranus: {
    objectId: "uranus", classification: "ICE_GIANT",
    modes: { orbital: "available", surface: "not-supported", atmospheric: "planned" },
    terrain: unsupported,
    sky: { ...nasaFacts, coverage: "No altitude-dependent atmosphere profile is installed.", reconstruction: "unavailable" },
    notice: "Uranus has no solid-surface landing mode; future exploration is atmospheric only.",
  },
  neptune: {
    objectId: "neptune", classification: "ICE_GIANT",
    modes: { orbital: "available", surface: "not-supported", atmospheric: "planned" },
    terrain: unsupported,
    sky: { ...nasaFacts, coverage: "No altitude-dependent atmosphere profile is installed.", reconstruction: "unavailable" },
    notice: "Neptune has no solid-surface landing mode; future exploration is atmospheric only.",
  },
};

// Generated environments expose an explicit demonstration capability. Measured
// support is reserved for the existing lunar package; giants never gain ground.
for (const profile of Object.values(explorationProfiles)) {
  const environment = planetaryEnvironments[profile.objectId];
  if (!environment) continue;
  profile.modes[environment.mode === "surface" ? "surface" : "atmospheric"] = "demonstration";
  profile.notice = environment.description;
  profile.sky = { ...profile.sky, reconstruction: "illustrative", coverage: "Analytic haze in modeled body-fixed coordinates; no measured atmosphere or star catalogue.", sourceLabel: "Universal Cosmos illustrative environment", sourceUrl: "", referenceEpoch: "Simulation epoch 2026-01-01; illustrative orientation" };
  if (environment.mode === "surface") profile.terrain = { ...profile.terrain, reconstruction: "illustrative", coverage: "Global analytic reconstructed terrain; no measured elevation data.", sourceLabel: "Universal Cosmos procedural reconstruction", sourceUrl: "", referenceEpoch: "Static generated geometry; no measurement epoch" };
}

export function explorationProfile(id: ObjectId): PlanetaryExplorationProfile {
  return explorationProfiles[id];
}
