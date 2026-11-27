import type { Exoplanet, PlanetarySystem } from "../../data/stars/exoplanets";
import type { LandingDescriptor } from "../../data/landingRegistry";
import { reliefScaleFor, type PlanetaryEnvironment } from "../../data/planetaryEnvironments";
import { hexToLinear, surfaceClassProfile } from "../../data/surfaceProfiles";
import type { GiantAtmosphereProfile } from "../effects/GiantPlanetAtmosphere";
import type { CelestialObject } from "../../types/celestial";
import { resolveOrbit } from "./keplerOrbit";
import { describePlanet, type PlanetLook } from "./planetAppearance";
import { blackbodyLinearRgb, SOLAR_TEMPERATURE_K } from "./stellarPhysics";

/**
 * What a descent to an exoplanet shows, built from archive values plus stated assumptions.
 * No exoplanet surface or cloud deck has been observed. Each landing records what is
 * measured (size, mass, orbit, starlight, host colour) and what is assumed (surface type,
 * atmosphere, rotation).
 *
 * - Planets below the radius valley (1.75 R⊕) are drawn as bare rock without an atmosphere.
 *   That is the conservative case: JWST thermal measurements of hot rocky planets around M
 *   dwarfs (e.g. TRAPPIST-1 b, LHS 3844 b) show no thick atmospheres, and for the rest it is unknown.
 * - Larger planets have hydrogen-rich envelopes with no reachable surface, so the descent is
 *   a flight above the cloud deck. The scale height H = kT/(μ m_u g) uses μ = 2.3 (H₂/He),
 *   the equilibrium temperature and the surface gravity from mass and radius.
 * - Planets inside the tidal-locking distance (≈ 0.4 AU × (M★/M☉)^⅓ after a few Gyr;
 *   Kasting, Whitmire & Reynolds 1993) keep one face to the star. Others get an
 *   illustrative day (24 h for rocky planets, 10 h for giants).
 */
export interface ExoplanetLanding {
  id: string;
  object: CelestialObject;
  descriptor: LandingDescriptor;
  mode: "surface" | "atmosphere";
  tidallyLocked: boolean;
  rotationHours: number;
  /** Colour of the host's light relative to sunlight (linear RGB, luminance 1: eye-adapted). */
  starlight: [number, number, number];
  /** Stellar flux relative to Earth's, when known or computable. */
  insolationEarth?: number;
  gravityMs2: number;
  gravityFrom: "mass" | "minimum-mass" | "estimated-mass";
  scaleHeightKm?: number;
  summary: string;
  assumptions: string[];
}

const EARTH_RADIUS_KM = 6371;
const EARTH_MASS_KG = 5.9722e24;
const EARTH_GRAVITY = 9.807;
const BOLTZMANN = 1.380649e-23;
const ATOMIC_MASS = 1.66053907e-27;
const AU_KM = 149_597_870.7;

export function landingId(planetName: string): string {
  return `exoplanet:${planetName}`;
}

/**
 * Host light colour relative to the Sun's (a G2 star gives white), at the same luminance:
 * the eye adapts to brightness but not fully to colour, so red-dwarf light stays orange.
 */
export function starlightTint(temperatureK: number | undefined): [number, number, number] {
  const star = blackbodyLinearRgb(temperatureK ?? SOLAR_TEMPERATURE_K);
  const sun = blackbodyLinearRgb(SOLAR_TEMPERATURE_K);
  const ratio = star.map((c, i) => c / Math.max(sun[i], 1e-6));
  const luminance = 0.2126 * ratio[0] + 0.7152 * ratio[1] + 0.0722 * ratio[2];
  return ratio.map((c) => Math.min(4, c / Math.max(luminance, 1e-6))) as [number, number, number];
}

/** Tidally locked after a few Gyr inside ≈ 0.4 AU (M★/M☉)^⅓ (Kasting et al. 1993). */
export function expectedTidallyLocked(semiMajorAxisAu: number, starMassSolar = 1): boolean {
  return semiMajorAxisAu < 0.4 * Math.cbrt(Math.max(0.05, starMassSolar));
}

/** Mass estimate from radius (inverse of the Chen & Kipping 2017 relation), Earth masses. */
function massFromRadius(radiusEarth: number): number {
  if (radiusEarth < 1.23) return radiusEarth ** (1 / 0.279);
  if (radiusEarth < 14.3) return (radiusEarth / 0.808) ** (1 / 0.589);
  return 318; // Giants: radius barely depends on mass; Jupiter's mass is the typical value.
}

/** Atmospheric scale height (km) for an H₂/He envelope. */
export function scaleHeightKm(temperatureK: number, gravityMs2: number, meanMolecularMass = 2.3): number {
  return (BOLTZMANN * temperatureK) / (meanMolecularMass * ATOMIC_MASS * Math.max(0.1, gravityMs2)) / 1000;
}

function linearToHex([r, g, b]: readonly number[]): string {
  const encode = (value: number) => {
    const v = Math.max(0, Math.min(1, value));
    const srgb = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255).toString(16).padStart(2, "0");
  };
  return `#${encode(r)}${encode(g)}${encode(b)}`;
}

/** A colour as it looks under this starlight (reflectance × illumination). */
function lit(hex: string, tint: readonly number[]): string {
  return linearToHex(hexToLinear(hex).map((c, i) => c * tint[i]));
}

function insolation(planet: Exoplanet, system: PlanetarySystem, semiMajorAxisAu: number | undefined): number | undefined {
  if (planet.insolationEarth !== undefined) return planet.insolationEarth;
  if (semiMajorAxisAu === undefined) return undefined;
  const luminosity = system.logLuminosity !== undefined ? 10 ** system.logLuminosity
    : system.radiusSolar !== undefined && system.temperatureK !== undefined ? system.radiusSolar ** 2 * (system.temperatureK / SOLAR_TEMPERATURE_K) ** 4
      : undefined;
  return luminosity === undefined ? undefined : luminosity / semiMajorAxisAu ** 2;
}

/** Cloud-deck colours by equilibrium temperature (Sudarsky et al. 2000 classes), before starlight. */
function giantSky(kind: PlanetLook["kind"], temperatureK: number): { zenith: string; horizon: string; deck: string } {
  if (kind === "sub-neptune") return { zenith: "#5d7186", horizon: "#b3bcc4", deck: "#7f8b95" };
  if (kind === "neptune") return { zenith: "#2c5f8f", horizon: "#9cc6dc", deck: "#86b3cf" };
  if (temperatureK < 150) return { zenith: "#3f6fa6", horizon: "#d9cdb5", deck: "#cdb795" };
  if (temperatureK < 350) return { zenith: "#4a78ad", horizon: "#e3e6ea", deck: "#dcdfe3" };
  if (temperatureK < 800) return { zenith: "#24489a", horizon: "#7d9bd1", deck: "#3b5fae" };
  if (temperatureK < 1400) return { zenith: "#1a202b", horizon: "#4c4e57", deck: "#34363d" };
  return { zenith: "#2a1b17", horizon: "#6d4a3a", deck: "#5a3e33" };
}

export function exoplanetLanding(system: PlanetarySystem, index: number): ExoplanetLanding {
  const planet = system.planets[index];
  if (!planet) throw new Error("No such planet in this system.");
  const orbit = resolveOrbit(planet, system.massSolar);
  const { size, equilibriumK, look } = describePlanet(planet, system, orbit?.semiMajorAxisAu);
  const radiusKm = size.radiusEarth * EARTH_RADIUS_KM;
  const temperature = equilibriumK ?? 300;
  const massEarth = planet.massEarth ?? massFromRadius(size.radiusEarth);
  const gravityFrom: ExoplanetLanding["gravityFrom"] = planet.massEarth === undefined ? "estimated-mass"
    : planet.massKind === "minimum" ? "minimum-mass" : "mass";
  const gravityMs2 = (EARTH_GRAVITY * massEarth) / size.radiusEarth ** 2;
  const tint = starlightTint(system.temperatureK);
  const tidallyLocked = orbit ? expectedTidallyLocked(orbit.semiMajorAxisAu, system.massSolar) : false;
  const solid = look.kind === "rocky" || look.kind === "hot-rocky" || look.kind === "cold-rocky";
  const rotationHours = tidallyLocked && orbit ? orbit.periodDays * 24 : solid ? 24 : 10;
  const id = landingId(planet.name);
  const assumptions: string[] = [];
  if (size.from !== "archive") assumptions.push(size.from === "unknown" ? "Size unknown: drawn at Earth's radius." : "Radius estimated from mass (Chen & Kipping 2017).");
  if (gravityFrom !== "mass") assumptions.push(gravityFrom === "minimum-mass" ? "Gravity uses the minimum mass (M sin i); the true value may be higher." : "Gravity uses a mass estimated from the radius.");
  assumptions.push(tidallyLocked
    ? "Assumed tidally locked (expected this close to its star): the star stays fixed in the sky."
    : `Rotation unknown: shown with an illustrative ${rotationHours}-hour day.`);
  let descriptor: LandingDescriptor;
  let summary: string;
  let scale: number | undefined;
  if (solid) {
    const { reliefM, featureScaleM } = reliefScaleFor(radiusKm);
    const surface = look.kind === "hot-rocky"
      ? surfaceClassProfile("volcanic", "#4d4540", 0, {
        ground: { slopeColor: "+20%", patchColor: "-35%", patchAmount: 0.55, patchCoverage: 0.35, accentColor: "#120f0e", gloss: 0.1 },
        summary: "Dark basalt plains and lava channels; at this temperature the dayside may be partly molten.",
      })
      : look.kind === "cold-rocky"
        ? surfaceClassProfile("ice-cratered", "#aeb3ba", 0.7, { summary: "Cold, frost-covered rocky plains with craters." })
        : surfaceClassProfile("regolith", "#6c6259", 0.6, { summary: "Bare rocky plains with craters and scattered blocks." });
    const environment: PlanetaryEnvironment = {
      mode: "surface", groundColor: surface.groundColor, skyColor: "#000000", horizonColor: "#000000",
      hazeHeightM: 0, hazeOpacity: 0, nightSkyTransmission: 1, nightSkyAdaptation: 1, cloudStructure: 0, solarOpticalDepth: 0,
      reliefM, featureScaleM,
      description: `${surface.summary} Shown without an atmosphere, lit by ${system.host}'s light; its sibling planets appear in the sky where their orbits place them.`,
    };
    descriptor = { environment, surface, optics: { directOpticalDepth: 0, diffuseStrength: 0, extinctionPerM: 0, asymmetry: 0 } };
    summary = surface.summary;
    assumptions.push("Shown airless with a bare rocky surface. Whether it has an atmosphere, water or life is unknown; the terrain is procedural.");
  } else {
    scale = scaleHeightKm(temperature, gravityMs2);
    const colors = giantSky(look.kind, temperature);
    const zenith = lit(colors.zenith, tint), horizon = lit(colors.horizon, tint), deck = lit(colors.deck, tint);
    const giant: GiantAtmosphereProfile = {
      deckAltitudeKm: 10,
      zenithOpticalDepth: look.kind === "sub-neptune" ? 0.55 : 0.35,
      zenithColor: zenith, horizonColor: horizon, deckColor: deck,
      scaleHeightKm: Math.min(2000, Math.max(5, scale)),
      hazeDepth: look.kind === "sub-neptune" ? 0.6 : 0.4,
      // Water clouds make lightning plausible in cool giants; otherwise none is drawn.
      lightning: temperature < 400 ? 0.6 : 0,
      convection: look.kind === "giant" ? 0.9 : look.kind === "neptune" ? 0.5 : 0.3,
    };
    const environment: PlanetaryEnvironment = {
      mode: "atmosphere", groundColor: deck, skyColor: zenith, horizonColor: horizon,
      hazeHeightM: 250_000, hazeOpacity: 1, nightSkyTransmission: 0.6, nightSkyAdaptation: 1, cloudStructure: 0.4,
      solarOpticalDepth: 4, reliefM: 0, featureScaleM: 10_000,
      description: `Flight above the cloud deck of a ${look.label.toLowerCase()}: there is no solid surface to stand on. Scale height ≈ ${Math.round(scale)} km from its temperature and gravity.`,
    };
    descriptor = { environment, giant, optics: { directOpticalDepth: 8, diffuseStrength: 0.8, extinctionPerM: 0, asymmetry: 0.6 } };
    summary = `${look.label}: flight above the cloud deck.`;
    assumptions.push("Hydrogen–helium envelope assumed (μ = 2.3). Cloud colours follow the temperature class (Sudarsky et al. 2000) and are illustrative.");
  }
  const object: CelestialObject = {
    id, name: planet.name, category: "Exoplanet", parentId: null,
    description: `${planet.name}, a planet of ${system.host} (NASA Exoplanet Archive).`,
    radiusKm, massKg: massEarth * EARTH_MASS_KG, gravityMs2,
    orbitalPeriodDays: orbit?.periodDays ?? 0, rotationPeriodHours: rotationHours,
    semiMajorAxisKm: (orbit?.semiMajorAxisAu ?? 0) * AU_KM, axialTiltDeg: 0, color: linearToHex(look.base),
    source: { label: "NASA Exoplanet Archive", url: "https://exoplanetarchive.ipac.caltech.edu/" },
    display: { radius: 1, orbitRadius: 0, initialPhase: 0, inclination: 0 }, facts: [],
  };
  return {
    id, object, descriptor, mode: solid ? "surface" : "atmosphere", tidallyLocked, rotationHours, starlight: tint,
    insolationEarth: insolation(planet, system, orbit?.semiMajorAxisAu), gravityMs2, gravityFrom, scaleHeightKm: scale,
    summary, assumptions,
  };
}
