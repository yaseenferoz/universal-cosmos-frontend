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
  return (
    <section
      className="overview-destinations"
      aria-label="Solar System destinations"
    >
      <span className="eyebrow">SELECT A DESTINATION</span>
      <div>
        {objects.map((object) => (
          <button
            key={object.id}
            onClick={() => selectObject(object.id)}
            aria-label={`Travel to ${object.name}`}
          >
            {object.name}
            <ArrowUpRight size={12} />
          </button>
        ))}
      </div>
    </section>
  );
}
