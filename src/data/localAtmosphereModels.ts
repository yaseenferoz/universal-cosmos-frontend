import type { ObjectId } from "../types/celestial";

export interface LocalAtmosphereModel {
  /** Display optical depths and extinction, not measured aerosol/pressure retrievals. */
  directOpticalDepth: number;
  diffuseStrength: number;
  extinctionPerM: number;
  /** Bounded anisotropy for a Henyey–Greenstein-like forward scattering lobe. */
  asymmetry: number;
}
const airless: LocalAtmosphereModel = { directOpticalDepth: 0, diffuseStrength: 0, extinctionPerM: 0, asymmetry: 0 };
/** Qualitative regimes informed by NASA planet fact pages; numerical tuning is illustrative. */
const models: Partial<Record<ObjectId, LocalAtmosphereModel>> = {
  earth: { directOpticalDepth: 0.16, diffuseStrength: 0.48, extinctionPerM: 0.000025, asymmetry: 0.7 },
  venus: { directOpticalDepth: 6, diffuseStrength: 0.8, extinctionPerM: 0.0002, asymmetry: 0.55 },
  mars: { directOpticalDepth: 0.35, diffuseStrength: 0.25, extinctionPerM: 0.00012, asymmetry: 0.65 },
  jupiter: { directOpticalDepth: 8, diffuseStrength: 0.8, extinctionPerM: 0, asymmetry: 0.6 },
  saturn: { directOpticalDepth: 8, diffuseStrength: 0.8, extinctionPerM: 0, asymmetry: 0.6 },
  uranus: { directOpticalDepth: 8, diffuseStrength: 0.8, extinctionPerM: 0, asymmetry: 0.5 },
  neptune: { directOpticalDepth: 8, diffuseStrength: 0.8, extinctionPerM: 0, asymmetry: 0.55 },
};
export function localAtmosphereModel(bodyId: ObjectId): LocalAtmosphereModel {
  return models[bodyId] ?? airless;
}
