import type { CelestialService } from "../../types/celestial";
import { CelestialApiError } from "./errors";
import { HttpCelestialService } from "./HttpCelestialService";
import { LocalCelestialService } from "./LocalCelestialService";

export { CelestialApiError } from "./errors";
export { HttpCelestialService } from "./HttpCelestialService";
export { LocalCelestialService } from "./LocalCelestialService";
export type { CelestialService } from "../../types/celestial";

export function createCelestialService(
  source = "local",
  baseUrl = "",
): CelestialService {
  if (source === "local") return new LocalCelestialService();
  if (source === "http") return new HttpCelestialService(baseUrl);
  throw new CelestialApiError('VITE_DATA_SOURCE must be "local" or "http".');
}

let service: CelestialService | undefined;

function getService(): CelestialService {
  service ??= createCelestialService(
    import.meta.env.VITE_DATA_SOURCE || "local",
    import.meta.env.VITE_API_BASE_URL || "",
  );
  return service;
}

// Defer configuration errors until the awaited request so React can show its error UI.
export const celestialService: CelestialService = {
  async getObjects(options) {
    return getService().getObjects(options);
  },
  async getObject(id, options) {
    return getService().getObject(id, options);
  },
  async search(query, options) {
    return getService().search(query, options);
  },
  async getSystem(id, options) {
    return getService().getSystem(id, options);
  },
  async getEphemeris(id, isoDate, options) {
    return getService().getEphemeris(id, isoDate, options);
  },
};
