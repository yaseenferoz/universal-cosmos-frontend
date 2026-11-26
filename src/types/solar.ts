export interface SolarTelemetry {
  distanceAu: number;
  angularDiameterDeg: number;
  irradianceWm2: number;
  visibleFraction: number;
  /** Fraction of the solar disk visible from the inspected body's center (eclipses). */
  targetSunlitFraction: number;
  /** Body casting the shadow when the inspected body is eclipsed, else null. */
  targetShadowCasterId: string | null;
  effectiveExposureEv: number;
  physicalScale: boolean;
}

export const initialSolarTelemetry: SolarTelemetry = {
  distanceAu: 1,
  angularDiameterDeg: 0.5329,
  irradianceWm2: 1361,
  visibleFraction: 1,
  targetSunlitFraction: 1,
  targetShadowCasterId: null,
  effectiveExposureEv: 0,
  physicalScale: true,
};
