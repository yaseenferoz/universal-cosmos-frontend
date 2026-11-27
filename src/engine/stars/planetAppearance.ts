import type { Exoplanet, PlanetarySystem } from "../../data/stars/exoplanets";
import { SOLAR_TEMPERATURE_K } from "./stellarPhysics";
import { hexToLinear } from "../../data/surfaceProfiles";

const AU_PER_SOLAR_RADIUS = 695_700 / 149_597_870.7;

/**
 * Exoplanet size and an ILLUSTRATIVE appearance. No exoplanet has been imaged as a resolved
 * disk; colours here follow broad physical classes, not observations:
 * - Radius from the archive, else from mass with the Chen & Kipping 2017 (ApJ 834:17)
 *   power laws.
 * - Rocky below 1.75 R⊕ (the radius valley, Fulton et al. 2017), or up to 2.5 R⊕ when a
 *   measured mass and radius give at least 70% of the density of an Earth-like rock/iron
 *   composition (R ≈ M^0.27, Zeng et al. 2016); sub-Neptune to 4 R⊕, Neptune-like to 8 R⊕,
 *   giant above.
 * - Giant colours follow Sudarsky, Burrows & Hubeny 2000 classes by equilibrium temperature:
 *   ammonia clouds (< 150 K), water clouds (< 350 K), cloud-free blue (< 800 K), alkali-metal
 *   dark (< 1400 K), silicate clouds (hotter). Hot planets also glow thermally on the night side.
 */
export type PlanetKind = "rocky" | "hot-rocky" | "cold-rocky" | "sub-neptune" | "neptune" | "giant";

export interface PlanetLook {
  kind: PlanetKind;
  /** Short human description of the class. */
  label: string;
  /** Linear RGB. */
  base: [number, number, number];
  band: [number, number, number];
  /** 0 = surface mottling, 1 = latitude cloud bands. */
  banded: number;
  /** Atmospheric haze strength 0..1 (soft terminator, limb glow). */
  haze: number;
  /** Night-side thermal glow (linear RGB, before the star's light). */
  emission: [number, number, number];
}

export interface PlanetSize {
  radiusEarth: number;
  from: "archive" | "archive-calculated" | "mass-relation" | "unknown";
}

/** Chen & Kipping 2017 mean mass–radius relation (Earth units). */
export function radiusFromMass(massEarth: number): number {
  if (massEarth < 2.04) return massEarth ** 0.279;
  if (massEarth < 132) return 0.808 * massEarth ** 0.589;
  return 17.74 * massEarth ** -0.044;
}

export function planetSize(planet: Exoplanet): PlanetSize {
  if (planet.radiusEarth !== undefined)
    return { radiusEarth: planet.radiusEarth, from: planet.radiusCalculated ? "archive-calculated" : "archive" };
  if (planet.massEarth !== undefined) return { radiusEarth: radiusFromMass(planet.massEarth), from: "mass-relation" };
  return { radiusEarth: 1, from: "unknown" };
}

/**
 * Equilibrium temperature (K, zero albedo, full redistribution): the archive value, else from
 * insolation (278.6 K × S^¼), else from the host's temperature and radius and the orbit.
 */
export function equilibriumTemperature(planet: Exoplanet, system: Pick<PlanetarySystem, "temperatureK" | "radiusSolar">, semiMajorAxisAu?: number): number | undefined {
  if (planet.equilibriumK !== undefined) return planet.equilibriumK;
  if (planet.insolationEarth !== undefined) return 278.6 * planet.insolationEarth ** 0.25;
  const a = semiMajorAxisAu ?? planet.semiMajorAxisAu;
  if (a === undefined || a <= 0) return undefined;
  // T_eq = T★ √(R★ / 2a); a Sun-like host when the archive lists neither.
  const radiusAu = (system.radiusSolar ?? 1) * AU_PER_SOLAR_RADIUS;
  return (system.temperatureK ?? SOLAR_TEMPERATURE_K) * Math.sqrt(radiusAu / (2 * a));
}

function glow(temperatureK: number, from: number, strength: number, tint: [number, number, number]): [number, number, number] {
  // Visible thermal emission is faint until ~2000 K, then rises steeply (Wien tail).
  const k = Math.min(1, Math.max(0, (temperatureK - from) / 2500) ** 1.5) * strength;
  return [tint[0] * k, tint[1] * k, tint[2] * k];
}

/**
 * Bulk density relative to an Earth-like composition of the same mass (Zeng et al. 2016,
 * R ≈ M^0.27), when both mass and radius are measured; otherwise undefined.
 */
export function rockDensityRatio(planet: Exoplanet): number | undefined {
  if (planet.massEarth === undefined || planet.massKind !== "mass" || planet.radiusEarth === undefined || planet.radiusCalculated) return undefined;
  return planet.massEarth / planet.radiusEarth ** 3 / planet.massEarth ** (1 - 3 * 0.27);
}

export function planetLook(radiusEarth: number, equilibriumK: number | undefined, massEarth?: number, densityRatio?: number): PlanetLook {
  const t = equilibriumK ?? 300;
  const ember: [number, number, number] = [1, 0.28, 0.05];
  const rocky = radiusEarth < 1.75 || (radiusEarth < 2.5 && densityRatio !== undefined && densityRatio >= 0.7);
  if (rocky) {
    if (t > 1100)
      return { kind: "hot-rocky", label: "Hot rocky planet (dayside likely molten)", base: [0.09, 0.075, 0.07], band: [0.2, 0.12, 0.08], banded: 0, haze: 0, emission: glow(t, 900, 1.2, ember) };
    if (t < 180)
      return { kind: "cold-rocky", label: "Cold rocky planet", base: [0.5, 0.5, 0.52], band: [0.75, 0.77, 0.8], banded: 0, haze: 0.05, emission: [0, 0, 0] };
    return { kind: "rocky", label: "Rocky planet", base: [0.36, 0.3, 0.25], band: [0.22, 0.2, 0.19], banded: 0, haze: 0.12, emission: [0, 0, 0] };
  }
  if (radiusEarth < 4)
    return { kind: "sub-neptune", label: "Sub-Neptune (likely thick hydrogen or steam envelope)", base: [0.55, 0.62, 0.68], band: [0.45, 0.52, 0.6], banded: 0.35, haze: 0.6, emission: glow(t, 1000, 0.5, ember) };
  if (radiusEarth < 8)
    return { kind: "neptune", label: "Neptune-like planet", base: [0.28, 0.5, 0.72], band: [0.22, 0.4, 0.62], banded: 0.5, haze: 0.55, emission: glow(t, 1000, 0.5, ember) };
  const massive = massEarth !== undefined && massEarth > 4100 ? " (near brown-dwarf mass)" : "";
  if (t < 150)
    return { kind: "giant", label: `Gas giant with ammonia clouds${massive}`, base: [0.78, 0.68, 0.52], band: [0.55, 0.4, 0.28], banded: 1, haze: 0.35, emission: [0, 0, 0] };
  if (t < 350)
    return { kind: "giant", label: `Gas giant with water clouds${massive}`, base: [0.86, 0.87, 0.88], band: [0.7, 0.74, 0.8], banded: 1, haze: 0.4, emission: [0, 0, 0] };
  if (t < 800)
    return { kind: "giant", label: `Warm giant, cloud-free blue sky${massive}`, base: [0.18, 0.34, 0.7], band: [0.14, 0.26, 0.58], banded: 0.6, haze: 0.5, emission: [0, 0, 0] };
  if (t < 1400)
    return { kind: "giant", label: `Hot Jupiter, dark alkali-metal atmosphere${massive}`, base: [0.09, 0.09, 0.11], band: [0.12, 0.1, 0.1], banded: 0.6, haze: 0.3, emission: glow(t, 1000, 0.8, ember) };
  return { kind: "giant", label: `Very hot Jupiter with silicate clouds${massive}`, base: [0.3, 0.22, 0.19], band: [0.42, 0.28, 0.2], banded: 0.8, haze: 0.3, emission: glow(t, 900, 1, [1, 0.42, 0.12]) };
}

export interface PlanetDescription {
  size: PlanetSize;
  equilibriumK: number | undefined;
  look: PlanetLook;
}

/** Size, temperature and illustrative class of a planet, computed the same way everywhere. */
export function describePlanet(planet: Exoplanet, system: Pick<PlanetarySystem, "temperatureK" | "radiusSolar">, semiMajorAxisAu?: number): PlanetDescription {
  const size = planetSize(planet);
  const equilibriumK = equilibriumTemperature(planet, system, semiMajorAxisAu);
  const look = planetLook(size.radiusEarth, equilibriumK, planet.massEarth, rockDensityRatio(planet));
  if (planet.color) {
    // Solar System planets: their measured mean colour.
    const base = hexToLinear(planet.color);
    return { size, equilibriumK, look: { ...look, base, band: base.map((c) => c * 0.75) as [number, number, number], emission: [0, 0, 0] } };
  }
  return { size, equilibriumK, look };
}
