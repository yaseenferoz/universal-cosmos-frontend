import { ArrowDown, ArrowLeft, Navigation, X } from "lucide-react";
import type { PlanetarySystem } from "../../data/stars/exoplanets";
import type { StarCatalog } from "../../data/stars/starCatalog";
import { starDisplayName } from "../../data/stars/starCatalog";
import { resolveOrbit } from "../../engine/stars/keplerOrbit";
import { describePlanet } from "../../engine/stars/planetAppearance";
import { expectedTidallyLocked } from "../../engine/stars/exoplanetLanding";
import { useLunarStore } from "../../stores/lunarStore";
import { useStellarStore } from "../../stores/stellarStore";
import { formatNumber, periodText } from "./format";

const SIZE_NOTE = { archive: "", "archive-calculated": " (archive estimate)", "mass-relation": " (est. from mass)", unknown: " (unknown)" } as const;
const PHASE_NOTE = {
  transit: "from the measured transit time",
  conjunction: "from the published conjunction time",
  periastron: "from the published periastron time",
  illustrative: "illustrative (no published timing)",
} as const;

/** Archive facts for one exoplanet, with what is measured, calculated or assumed spelled out. */
export function PlanetInformation({ catalog, system, index }: { catalog: StarCatalog; system: PlanetarySystem; index: number }) {
  const planet = system.planets[index];
  if (!planet) return null;
  const orbit = resolveOrbit(planet, system.massSolar);
  const { size, equilibriumK, look } = describePlanet(planet, system, orbit?.semiMajorAxisAu);
  const host = starDisplayName(catalog, system.star);
  const mass = planet.massEarth === undefined ? "Unknown"
    : planet.massKind === "minimum" ? `≥ ${formatNumber(planet.massEarth)} × Earth (minimum, M sin i)`
      : `${formatNumber(planet.massEarth)} × Earth${planet.massKind === "relation" ? " (from a mass–radius relation)" : ""}`;
  const facts: { label: string; value: string }[] = [
    { label: "Radius", value: size.from === "unknown" ? "Unknown" : `${formatNumber(size.radiusEarth)} × Earth${SIZE_NOTE[size.from]}` },
    { label: "Mass", value: mass },
    { label: "Orbital period", value: orbit ? periodText(orbit.periodDays) + (planet.periodDays === undefined ? " (from Kepler's law)" : "") : "Unknown" },
    { label: "Distance from star", value: orbit ? `${formatNumber(orbit.semiMajorAxisAu, 4)} AU${orbit.semiMajorAxisFrom === "archive" ? "" : " (calculated)"}` : "Unknown" },
    { label: "Eccentricity", value: planet.eccentricity !== undefined ? formatNumber(planet.eccentricity, 3) : "Unknown (drawn circular)" },
    { label: "Inclination", value: orbit?.inclinationFrom === "measured" ? `${formatNumber(planet.inclinationDeg ?? 0, 1)}° to our sky` : orbit?.inclinationFrom === "transit" ? "≈ 90° (transits)" : "Unknown (drawn at 60°)" },
    { label: "Equilibrium temp.", value: equilibriumK !== undefined ? `${Math.round(equilibriumK)} K (${Math.round(equilibriumK - 273.15)} °C)${planet.equilibriumK === undefined || planet.equilibriumCalculated ? " est." : ""}` : "Unknown" },
    { label: "Starlight received", value: planet.insolationEarth !== undefined ? `${formatNumber(planet.insolationEarth)} × Earth` : "Unknown" },
    { label: "Discovered", value: `${planet.year ?? "—"} · ${planet.method}` },
    { label: "Rotation", value: orbit && expectedTidallyLocked(orbit.semiMajorAxisAu, system.massSolar) ? "Likely tidally locked" : "Unknown" },
    { label: "Facility", value: planet.facility ?? "—" },
  ];
  const back = () => useStellarStore.getState().select(system.star);
  const solid = look.kind === "rocky" || look.kind === "hot-rocky" || look.kind === "cold-rocky";
  const land = () => {
    const telemetry = useStellarStore.getState().telemetry;
    const here = telemetry?.focused === system.star && telemetry.focusedPlanet === index;
    // Fly there first if needed; the engine starts the descent on arrival.
    if (!here) useStellarStore.getState().flyTo(system.star, index);
    useLunarStore.getState().beginDescent();
  };
  return (
    <section className="object-information is-expanded glass star-information planet-information" aria-label={`${planet.name} information`}>
      <div className="panel-eyebrow">
        <span>EXOPLANET · {host.toUpperCase()}</span>
        <button className="icon-button" aria-label="Close planet information" onClick={() => useStellarStore.getState().select(null)}>
          <X size={14} />
        </button>
      </div>
      <h2>{planet.name}</h2>
      <p className="star-designations">{look.label}</p>
      {planet.controversial && <p className="planet-warning">The archive flags this planet's existence as questioned in the literature.</p>}
      <dl className="physical-grid star-facts">
        {facts.map((fact) => (
          <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
        ))}
      </dl>
      <div className="star-actions">
        <button className="lunar-primary" disabled={!orbit} onClick={land}>
          <ArrowDown size={14} /> {solid ? `Land on ${planet.name}` : `Descend into ${planet.name}`}
        </button>
        <button className="lunar-primary" disabled={!orbit} onClick={() => useStellarStore.getState().flyTo(system.star, index)}>
          <Navigation size={14} /> Fly to {planet.name}
        </button>
        <button className="lunar-primary" onClick={back}>
          <ArrowLeft size={14} /> {host}
        </button>
      </div>
      <p className="star-provenance">
        Parameters: {catalog.exoplanets?.source ?? "NASA Exoplanet Archive"} (retrieved {catalog.exoplanets?.retrieved ?? "—"}).
        {orbit && ` Position along the orbit ${PHASE_NOTE[orbit.phaseFrom]}; the orbit's rotation about our line of sight is unknown.`}
        {" "}The planet's appearance is illustrative, inferred from its size and temperature; no exoplanet has been imaged as a disk.
      </p>
    </section>
  );
}
