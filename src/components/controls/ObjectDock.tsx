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
        <summary>Moons & asteroids ({additional.length})</summary>
        <div>{additional.map(destination)}</div>
      </details>}
    </section>
  );
}
