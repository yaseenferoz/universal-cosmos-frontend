import { useState, type ReactNode } from "react";
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
        <div>{destinationGroups(additional, objects).map(({ key, title, children }) =>
          <DestinationGroup key={key} title={title} items={children} render={destination} />)}</div>
      </details>}
    </section>
  );
}

interface Group { key: string; title: string; children: CelestialObject[] }

/** Groups by parent; Sun-orbiting bodies split into dwarf planets, asteroids and comets. */
function destinationGroups(additional: CelestialObject[], objects: CelestialObject[]): Group[] {
  const groups: Group[] = [];
  const add = (key: string, title: string, children: CelestialObject[]) => {
    if (children.length) groups.push({ key, title, children });
  };
  add("earth", "Earth orbit", additional.filter((object) => object.parentId === "earth"));
  for (const parentId of ["mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]) {
    const parent = objects.find((object) => object.id === parentId);
    add(parentId, `${parent?.name ?? parentId} moons`, additional.filter((object) => object.parentId === parentId));
  }
  const solar = additional.filter((object) => object.parentId === "sun");
  const isComet = (object: CelestialObject) => /comet/i.test(object.category);
  const isDwarf = (object: CelestialObject) => /dwarf|neptunian|kuiper|detached/i.test(object.category);
  add("dwarf", "Dwarf planets & trans-Neptunian objects", solar.filter((object) => isDwarf(object) && !isComet(object)));
  add("asteroids", "Asteroids", solar.filter((object) => !isDwarf(object) && !isComet(object)));
  add("comets", "Comets", solar.filter(isComet));
  return groups;
}

/** Collapsed by default; buttons render only when opened, so hundreds of moons cost nothing. */
function DestinationGroup({ title, items, render }: { title: string; items: CelestialObject[]; render: (object: CelestialObject) => ReactNode }) {
  const [open, setOpen] = useState(items.length <= 12);
  return <details className="destination-group" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><h3>{title} ({items.length})</h3></summary>
    {open && <div>{items.map(render)}</div>}
  </details>;
}
