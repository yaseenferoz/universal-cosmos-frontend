import type { ObjectId } from "./celestial";

export type LunarPhase =
  | "orbit"
  | "loading"
  | "approach"
  | "descending"
  | "surface"
  | "ascending"
  | "error";

export interface LunarTelemetry {
  bodyId?: ObjectId;
  reconstruction?: boolean;
  atmospheric?: boolean;
  phase: LunarPhase;
  latDeg: number;
  lonDeg: number;
  elevationM: number;
  altitudeM: number;
  resolutionM: number;
  sourceId: string;
  coverageNotice: string;
  visibleTiles: number;
  pendingTiles: number;
  residentBytes: number;
  solarAltitudeDeg: number;
  error: string | null;
}

export const initialLunarTelemetry: LunarTelemetry = {
  phase: "orbit",
  latDeg: 20.1908,
  lonDeg: 30.7717,
  elevationM: 0,
  altitudeM: 0,
  resolutionM: 0,
  sourceId: "",
  coverageNotice: "",
  visibleTiles: 0,
  pendingTiles: 0,
  residentBytes: 0,
  solarAltitudeDeg: 0,
  error: null,
};
