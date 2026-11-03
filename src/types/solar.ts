export interface SolarTelemetry {
  distanceAu: number;
  angularDiameterDeg: number;
  irradianceWm2: number;
  visibleFraction: number;
  effectiveExposureEv: number;
  physicalScale: boolean;
}

export const initialSolarTelemetry: SolarTelemetry = {
  distanceAu: 1,
  angularDiameterDeg: 0.5329,
  irradianceWm2: 1361,
  visibleFraction: 1,
  effectiveExposureEv: 0,
  physicalScale: true,
};
