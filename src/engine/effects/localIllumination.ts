import type { LocalAtmosphereModel } from "../../data/localAtmosphereModels";
import { skySolarIllumination } from "./PlanetarySky";

/** Finite spherical-shell air mass, normalized at zenith; illustrative 1% shell depth. */
export function atmosphericAirMass(solarCosine: number): number {
  const cosine = Math.max(0, Math.min(1, Number.isFinite(solarCosine) ? solarCosine : 0));
  // Rationalized form avoids subtraction cancellation at zenith.
  return 2.01 / (Math.sqrt(cosine * cosine + 0.0201) + cosine);
}

/** Linear sunlight multiplier. No persistent ambient solar glow on the night side. */
export function localIllumination(solarCosine: number, altitudeM: number, layerHeightM: number, model: LocalAtmosphereModel) {
  const depth = layerHeightM > 0 && Number.isFinite(altitudeM)
    ? Math.max(0, Math.min(1, 1 - Math.max(0, altitudeM) / layerHeightM)) ** 2 : 0;
  const direct = Number.isFinite(solarCosine) && solarCosine > -0.005
    ? Math.exp(-model.directOpticalDepth * depth * atmosphericAirMass(solarCosine)) : 0;
  const diffuse = model.diffuseStrength * depth * skySolarIllumination(solarCosine);
  return { direct, diffuse };
}
