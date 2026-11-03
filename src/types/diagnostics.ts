import type { ObjectId } from "./celestial";

export interface DiagnosticVector {
  x: number;
  y: number;
  z: number;
}

/** Positions are CPU model kilometers; directions use the active render world's axes. */
export interface DiagnosticTelemetry {
  scaleMode: "exploration" | "overview";
  /** Overview has no physical camera position or camera distance in kilometers. */
  cameraPositionKm: DiagnosticVector | null;
  cameraSunDistanceKm: number | null;
  /** Apparent angle of the rendered disk; overview deliberately exaggerates it. */
  sunAngularDiameterRad: number;
  cameraFovDeg: number;
  cameraSunDirection: DiagnosticVector;
  selectedId: ObjectId | null;
  selectedPositionKm: DiagnosticVector | null;
  planetSunDirection: DiagnosticVector | null;
  selectedPhaseAngleDeg: number | null;
  effectiveExposureEv: number;
  automaticExposure: boolean;
  canLookAtSun: boolean;
  canGoToDaySide: boolean;
}
