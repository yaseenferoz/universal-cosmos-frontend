import { ArrowUpRight } from "lucide-react";
import { useExplorationStore } from "../../stores/explorationStore";
import type { CelestialObject } from "../../types/celestial";

/** An index marker rather than a synthetic planet illustration. */
export function PlanetSwatch({ object }: { object: CelestialObject }) {
  return (
    <span aria-hidden="true" className="object-index-mark">
      {object.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function ObjectDock() {
  const objects = useExplorationStore((s) => s.objects);
  const selectObject = useExplorationStore((s) => s.selectObject);
  const primary = objects.filter((object) =>
    ["sun", "mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune"].includes(object.id),
  );
  const additional = objects.filter((object) => !primary.includes(object));
  const destination = (object: CelestialObject) => (
    <button key={object.id} onClick={() => selectObject(object.id)} aria-label={`Travel to ${object.name}`}>
      {object.name}<ArrowUpRight size={12} />
    </button>
  );
  return (
    <section
      className="overview-destinations"
      aria-label="Solar System destinations"
    >
      <span className="eyebrow">SELECT A DESTINATION</span>
      <div>{primary.map(destination)}</div>
      {additional.length > 0 && <details className="additional-destinations">
        <summary>Moons, asteroids & stations ({additional.length})</summary>
        <div>{["earth", "mars", "jupiter", "saturn", "uranus", "neptune", "sun"].map((parentId) => {
          const children = additional.filter((object) => object.parentId === parentId);
          if (!children.length) return null;
          return <section key={parentId} className="destination-group">
            <h3>{parentId === "sun" ? "Asteroids & dwarf planets" : parentId === "earth" ? "Earth orbit" : `${objects.find((object) => object.id === parentId)?.name} moons`}</h3>
            <div>{children.map(destination)}</div>
          </section>;
        })}</div>
      </details>}
    </section>
  );
}
