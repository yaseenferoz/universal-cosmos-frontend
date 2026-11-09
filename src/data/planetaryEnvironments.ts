import type { ObjectId } from "../types/celestial";

export interface PlanetaryEnvironment {
  mode: "surface" | "atmosphere";
  groundColor: string;
  skyColor: string;
  horizonColor: string;
  /** Illustrative optical layer extent, meters; not measured scale height. */
  hazeHeightM: number;
  hazeOpacity: number;
  /** Illustrative clear-night transmission of the background sky, from 0 to 1. */
  nightSkyTransmission: number;
  /** Display-only dark adaptation for the mapped night sky; 1 means no gain. */
  nightSkyAdaptation: number;
  /** Strength of broad, illustrative cloud variation seen from below. */
  cloudStructure: number;
  reliefM: number;
  /** Analytic terrain feature spacing, not measurement resolution. */
  featureScaleM: number;
  description: string;
}

/** Display reconstructions. Numerical parameters are art/model choices, never measurements. */
export const planetaryEnvironments: Partial<Record<ObjectId, PlanetaryEnvironment>> = {
  mercury: { mode: "surface", groundColor: "#8c8175", skyColor: "#000000", horizonColor: "#000000", hazeHeightM: 0, hazeOpacity: 0, nightSkyTransmission: 1, nightSkyAdaptation: 1, cloudStructure: 0, reliefM: 500, featureScaleM: 6000, description: "Airless sky and reconstructed cratered terrain." },
  venus: { mode: "surface", groundColor: "#99734a", skyColor: "#b68d43", horizonColor: "#d5ad61", hazeHeightM: 100000, hazeOpacity: 1, nightSkyTransmission: 0, nightSkyAdaptation: 1, cloudStructure: 0.35, reliefM: 350, featureScaleM: 5000, description: "Reconstructed rocky ground beneath opaque amber cloud and haze. Stars are hidden from the surface. No radar elevation dataset is installed." },
  earth: { mode: "surface", groundColor: "#807866", skyColor: "#478ecb", horizonColor: "#c4d8df", hazeHeightM: 80000, hazeOpacity: 0.98, nightSkyTransmission: 0.62, nightSkyAdaptation: 1.4, cloudStructure: 0, reliefM: 300, featureScaleM: 5000, description: "Reconstructed dry-land landscape and daylight sky. This terrain is not georeferenced geography." },
  mars: { mode: "surface", groundColor: "#b58161", skyColor: "#987d68", horizonColor: "#d4b39a", hazeHeightM: 60000, hazeOpacity: 0.55, nightSkyTransmission: 0.85, nightSkyAdaptation: 2.2, cloudStructure: 0, reliefM: 450, featureScaleM: 6000, description: "Reconstructed rocky terrain and dusty sky. Stars become visible on the night side when dust is thin; dust properties are illustrative." },
  jupiter: { mode: "atmosphere", groundColor: "#bfa98d", skyColor: "#9b8975", horizonColor: "#d5c1a3", hazeHeightM: 250000, hazeOpacity: 1, nightSkyTransmission: 0, nightSkyAdaptation: 1, cloudStructure: 0.5, reliefM: 0, featureScaleM: 10000, description: "Guided cloud-level exploration, held 25 km above the catalog radius. No solid surface or calibrated pressure profile." },
  saturn: { mode: "atmosphere", groundColor: "#cfbf95", skyColor: "#b0a27e", horizonColor: "#d9cca7", hazeHeightM: 250000, hazeOpacity: 1, nightSkyTransmission: 0, nightSkyAdaptation: 1, cloudStructure: 0.4, reliefM: 0, featureScaleM: 10000, description: "Guided cloud-level exploration, held 25 km above the catalog radius. No solid surface or calibrated pressure profile." },
  uranus: { mode: "atmosphere", groundColor: "#a4c5c3", skyColor: "#79a6a8", horizonColor: "#b5d3d1", hazeHeightM: 200000, hazeOpacity: 1, nightSkyTransmission: 0, nightSkyAdaptation: 1, cloudStructure: 0.25, reliefM: 0, featureScaleM: 10000, description: "Reconstructed cyan haze above the reference radius. Atmospheric flight only; no ground." },
  neptune: { mode: "atmosphere", groundColor: "#83b7bd", skyColor: "#608eaa", horizonColor: "#a0c6ce", hazeHeightM: 200000, hazeOpacity: 1, nightSkyTransmission: 0, nightSkyAdaptation: 1, cloudStructure: 0.3, reliefM: 0, featureScaleM: 10000, description: "Reconstructed blue-green haze above the reference radius. Atmospheric flight only; no ground." },
};
