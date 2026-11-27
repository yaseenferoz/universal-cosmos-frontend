import { ArrowLeft, Navigation, Orbit, X } from "lucide-react";
import { objectById } from "../../data/catalog";
import type { PlanetarySystem } from "../../data/stars/exoplanets";
import { useExplorationStore } from "../../stores/explorationStore";
import { useStellarStore } from "../../stores/stellarStore";
import { formatNumber, periodText } from "./format";

/** One of our own planets seen from star mode; the Solar System view is where to explore it. */
export function SolarPlanetInformation({ system, index }: { system: PlanetarySystem; index: number }) {
  const planet = system.planets[index];
  const body = planet?.objectId ? objectById[planet.objectId] : undefined;
  if (!planet || !body) return null;
  const explore = () => {
    useExplorationStore.getState().selectObject(body.id);
    useExplorationStore.getState().setViewMode("exploration");
  };
  const facts = [
    { label: "Radius", value: `${Math.round(body.radiusKm).toLocaleString("en-US")} km (${formatNumber(planet.radiusEarth ?? 1)} × Earth)` },
    { label: "Mass", value: `${formatNumber(planet.massEarth ?? 0, 3)} × Earth` },
    { label: "Orbital period", value: periodText(body.orbitalPeriodDays) },
    { label: "Distance from the Sun", value: `${formatNumber(planet.semiMajorAxisAu ?? 0, 3)} AU (mean)` },
    { label: "Surface gravity", value: `${body.gravityMs2.toFixed(2)} m/s²` },
    { label: "Category", value: body.category },
  ];
  return (
    <section className="object-information is-expanded glass star-information planet-information" aria-label={`${body.name} information`}>
      <div className="panel-eyebrow">
        <span>PLANET · SOLAR SYSTEM</span>
        <button className="icon-button" aria-label="Close planet information" onClick={() => useStellarStore.getState().select(null)}>
          <X size={14} />
        </button>
      </div>
      <h2>{body.name}</h2>
      <p className="star-designations">{body.description}</p>
      <dl className="physical-grid star-facts">
        {facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
      </dl>
      <div className="star-actions">
        <button className="lunar-primary" onClick={explore}>
          <Orbit size={14} /> Explore {body.name} in the Solar System
        </button>
        <button className="lunar-primary" onClick={() => useStellarStore.getState().flyTo(system.star, index)}>
          <Navigation size={14} /> Fly to {body.name}
        </button>
        <button className="lunar-primary" onClick={() => useStellarStore.getState().select(system.star)}>
          <ArrowLeft size={14} /> Sun
        </button>
      </div>
      <p className="star-provenance">
        Values from the bundled catalogue ({body.source.label}). Star mode places the planets with JPL's approximate Keplerian elements;
        the Solar System view has the full ephemerides, global maps and surface descents.
      </p>
    </section>
  );
}
