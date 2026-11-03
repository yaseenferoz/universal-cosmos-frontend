import type { ObjectId } from "./celestial";

/** Physical category used to select exploration rules, never a display label. */
export type DestinationClass =
  | "AIRLESS_SOLID"
  | "ATMOSPHERIC_SOLID"
  | "GAS_GIANT"
  | "ICE_GIANT"
  | "STAR"
  | "SMALL_BODY";

/** A capability is explicit so planned work cannot masquerade as a working mode. */
export type ExplorationCapability = "available" | "demonstration" | "planned" | "not-supported";

export interface ExplorationModes {
  orbital: ExplorationCapability;
  surface: ExplorationCapability;
  atmospheric: ExplorationCapability;
}

export interface EnvironmentProvenance {
  sourceLabel: string;
  sourceUrl: string;
  /** UTC reference or an explicit statement that the profile is a steady approximation. */
  referenceEpoch: string;
  coverage: string;
  reconstruction: "measured" | "hybrid" | "illustrative" | "unavailable";
}

/**
 * Static scientific-environment metadata. It deliberately contains no dynamic
 * positions: the sky engine must derive those from the active model/ephemeris.
 */
export interface PlanetaryExplorationProfile {
  objectId: ObjectId;
  classification: DestinationClass;
  modes: ExplorationModes;
  terrain: EnvironmentProvenance;
  sky: EnvironmentProvenance;
  notice: string;
}
