import type { ObjectId } from "../types/celestial";
import type { GiantAtmosphereProfile } from "../engine/effects/GiantPlanetAtmosphere";
import type { LocalAtmosphereModel } from "./localAtmosphereModels";
import type { PlanetaryEnvironment } from "./planetaryEnvironments";
import type { SurfaceProfile } from "./surfaceProfiles";

/**
 * Landing data for bodies outside the bundled catalogue (exoplanets), registered for the
 * lifetime of a descent. The id-keyed lookups (environmentFor, surfaceProfileFor,
 * localAtmosphereModel, giantAtmosphereFor) consult this first, so the shared exploration
 * stack (terrain, scatter, sky, navigation) works unchanged.
 */
export interface LandingDescriptor {
  environment: PlanetaryEnvironment;
  /** Solid worlds: surface class for relief, ground shading and rocks. */
  surface?: SurfaceProfile;
  optics: LocalAtmosphereModel;
  /** Worlds without an accessible surface: cloud-deck flight. */
  giant?: GiantAtmosphereProfile;
}

const registry = new Map<ObjectId, LandingDescriptor>();

/** Register landing data; returns the function that removes it again. */
export function registerLanding(id: ObjectId, descriptor: LandingDescriptor): () => void {
  registry.set(id, descriptor);
  return () => {
    if (registry.get(id) === descriptor) registry.delete(id);
  };
}

export function registeredLanding(id: ObjectId): LandingDescriptor | undefined {
  return registry.get(id);
}
