import { objectById } from "../catalog";
import type { Exoplanet, PlanetarySystem } from "./exoplanets";

const KM_PER_AU = 149_597_870.7;
const EARTH_RADIUS_KM = 6371.0;
const EARTH_MASS_KG = 5.9722e24;
export const SOLAR_PLANET_IDS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"] as const;

/**
 * Our own planets as a planetary system in star mode, from the bundled catalogue (NASA
 * fact-sheet values). Star mode places them with JPL's approximate elements; the Solar
 * System view has their full ephemerides, maps and descents.
 */
export function solarPlanetarySystem(): PlanetarySystem {
  const planets: Exoplanet[] = SOLAR_PLANET_IDS.flatMap((id) => {
    const body = objectById[id];
    if (!body) return [];
    return [{
      name: body.name, objectId: id, color: body.color,
      periodDays: body.orbitalPeriodDays, semiMajorAxisAu: body.semiMajorAxisKm / KM_PER_AU, semiMajorAxisCalculated: false,
      radiusEarth: body.radiusKm / EARTH_RADIUS_KM, radiusCalculated: false,
      massEarth: body.massKg / EARTH_MASS_KG, massKind: "mass", equilibriumCalculated: false,
      method: "Solar System", transiting: false, controversial: false,
    }];
  });
  return {
    host: "Sun", otherHostNames: [], star: 0, inHyg: true, solarSystem: true,
    temperatureK: 5772, temperatureEstimated: false, radiusSolar: 1, massSolar: 1, logLuminosity: 0,
    spectralType: "G2V", distancePc: 0, starCount: 1, planets,
  };
}
