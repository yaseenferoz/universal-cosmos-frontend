import { Navigation, Orbit, X } from "lucide-react";
import { useMemo } from "react";
import type { PlanetarySystem } from "../../data/stars/exoplanets";
import { starDesignations, starDisplayName, starDistancePc } from "../../data/stars/starCatalog";
import { describePlanet } from "../../engine/stars/planetAppearance";
import { apparentMagnitude, LY_PER_PC, stellarEstimate } from "../../engine/stars/stellarPhysics";
import { useExplorationStore } from "../../stores/explorationStore";
import { useStellarStore } from "../../stores/stellarStore";
import { formatNumber as format, periodText } from "./format";
import { DeepInformation } from "./DeepInformation";
import { PlanetInformation } from "./PlanetInformation";
import { SolarPlanetInformation } from "./SolarPlanetInformation";
import { useSpectralTypes, useStarCatalog } from "./useStarCatalog";

const MAGNITUDE_FROM = {
  V: "from its V magnitude", luminosity: "from its luminosity", radius: "from its radius and temperature",
  gaia: "from its Gaia G magnitude", mass: "estimated from its mass",
} as const;

function PlanetList({ system }: { system: PlanetarySystem }) {
  return (
    <div className="planet-list">
      <h3>{system.solarSystem ? `${system.planets.length} planets` : system.planets.length === 1 ? "1 confirmed planet" : `${system.planets.length} confirmed planets`}</h3>
      <ul>
        {system.planets.map((planet, index) => {
          const { size, look } = describePlanet(planet, system);
          return (
            <li key={planet.name}>
              <button onClick={() => useStellarStore.getState().select(system.star, index)}>
                <span className={`planet-swatch kind-${look.kind}`} style={planet.color ? { background: planet.color } : undefined} aria-hidden="true" />
                <span>
                  <strong>{planet.name}</strong>
                  <small>
                    {size.from === "unknown" ? "size unknown" : `${format(size.radiusEarth, 1)} R⊕`}
                    {planet.periodDays !== undefined && ` · ${periodText(planet.periodDays)}`}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Catalogue facts and derived estimates for the selected star, or its selected planet. */
export function StarInformation() {
  const selected = useStellarStore((s) => s.selected);
  const selectedPlanet = useStellarStore((s) => s.selectedPlanet);
  const selectedDeep = useStellarStore((s) => s.selectedDeep);
  const catalog = useStarCatalog();
  const spectra = useSpectralTypes(selected !== null);
  const companions = useMemo(() => {
    const links = new Map<number, number[]>();
    if (!catalog) return links;
    for (const [index, names] of catalog.names) {
      if (names.primary === undefined) continue;
      links.set(names.primary, [...(links.get(names.primary) ?? []), index]);
    }
    return links;
  }, [catalog]);
  if (selectedDeep) return <DeepInformation selection={selectedDeep} />;
  if (!catalog || selected === null) return null;
  const system = catalog.systems.get(selected);
  if (system && selectedPlanet !== null)
    return system.solarSystem ? <SolarPlanetInformation system={system} index={selectedPlanet} />
      : <PlanetInformation catalog={catalog} system={system} index={selectedPlanet} />;
  const sun = selected === 0;
  const distancePc = starDistancePc(catalog, selected);
  const spectral = (selected < catalog.hygCount ? spectra?.[selected] : undefined) || system?.spectralType || undefined;
  const estimate = stellarEstimate(catalog.absMag[selected], catalog.colorIndex[selected], spectral);
  const names = catalog.names.get(selected);
  const primary = names?.primary ?? selected;
  const members = [primary, ...(companions.get(primary) ?? [])].filter((index) => index !== selected);
  const measured = system?.temperatureK !== undefined && !system.temperatureEstimated;
  const temperature = system?.temperatureK ?? estimate.temperatureK;
  const luminosity = system?.logLuminosity !== undefined ? 10 ** system.logLuminosity : estimate.luminosity;
  const radius = system?.radiusSolar ?? estimate.radiusSolar;
  const facts: { label: string; value: string }[] = sun ? [
    { label: "Spectral type", value: "G2V" },
    { label: "Absolute magnitude", value: "4.83" },
    { label: "Temperature", value: "5,772 K (IAU nominal)" },
  ] : [
    { label: "Distance from the Sun", value: `${format(distancePc * LY_PER_PC)} ly (${format(distancePc)} pc)` },
    { label: "Brightness from Earth", value: `magnitude ${apparentMagnitude(catalog.absMag[selected], distancePc).toFixed(2)}` },
    { label: "Absolute magnitude", value: catalog.absMag[selected].toFixed(2) },
    { label: "Spectral type", value: spectral ?? (spectra ? "Not catalogued" : "Loading…") },
    { label: measured ? "Temperature" : "Temperature (est.)", value: `${format(Math.round(temperature / 10) * 10, 0)} K${!system && estimate.temperatureFromClass ? " from class" : ""}` },
    { label: system?.logLuminosity !== undefined ? "Luminosity" : "Luminosity (est.)", value: `${format(luminosity, luminosity < 0.01 ? 5 : 2)} × Sun` },
    { label: system?.radiusSolar !== undefined ? "Radius" : "Radius (est.)", value: `${format(radius, radius < 0.1 ? 3 : 2)} × Sun` },
    ...(system?.massSolar !== undefined ? [{ label: "Mass", value: `${format(system.massSolar, 3)} × Sun` }] : []),
  ];
  return (
    <section className="object-information is-expanded glass star-information" aria-label={`${starDisplayName(catalog, selected)} information`}>
      <div className="panel-eyebrow">
        <span>{sun ? "OUR STAR" : system ? "STAR WITH PLANETS" : "STAR"}</span>
        <button className="icon-button" aria-label="Close star information" onClick={() => useStellarStore.getState().select(null)}>
          <X size={14} />
        </button>
      </div>
      <h2>{starDisplayName(catalog, selected)}</h2>
      <p className="star-designations">{starDesignations(catalog, selected).slice(1).join(" · ") || (system && !system.inHyg ? "Exoplanet host, NASA Exoplanet Archive" : "Catalogue star")}</p>
      <dl className="physical-grid star-facts">
        {facts.map((fact) => (
          <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
        ))}
      </dl>
      {members.length > 0 && (
        <p className="star-system">
          Multiple-star system with{" "}
          {members.slice(0, 4).map((index, position) => (
            <span key={index}>
              {position > 0 && ", "}
              <button className="text-link" onClick={() => useStellarStore.getState().select(index)}>{starDisplayName(catalog, index)}</button>
            </span>
          ))}
        </p>
      )}
      {system && <PlanetList system={system} />}
      <div className="star-actions">
        <button className="lunar-primary" onClick={() => useStellarStore.getState().flyTo(selected)}>
          <Navigation size={14} /> Fly to {sun ? "the Sun" : system ? "this system" : "this star"}
        </button>
        {sun && (
          <button className="lunar-primary" onClick={() => {
            useExplorationStore.getState().selectObject("sun");
            useExplorationStore.getState().setViewMode("exploration");
          }}>
            <Orbit size={14} /> Enter the Solar System
          </button>
        )}
      </div>
      <p className="star-provenance">
        {system && !system.inHyg
          ? `Position from RA, Dec and distance in the ${catalog.exoplanets?.source ?? "NASA Exoplanet Archive"}; absolute magnitude ${MAGNITUDE_FROM[system.magnitudeFrom ?? "V"]}.`
          : `Position and magnitude from the ${catalog.attribution} (${catalog.license}); distances from parallax, epoch J2000.`}
        {system && !system.solarSystem && " Stellar temperature, radius and mass from the NASA Exoplanet Archive."}
        {!sun && !system && " Temperature, luminosity and radius are estimates from catalogue colour and magnitude."}
      </p>
    </section>
  );
}
