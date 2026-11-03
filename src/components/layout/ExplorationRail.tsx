import {
  ArrowUpRight,
  CircleDot,
  Compass,
  Eclipse,
  Galaxy,
  HelpCircle,
  Orbit,
  Sparkles,
} from "lucide-react";
import { useExplorationStore } from "../../stores/explorationStore";

const collections = [
  { name: "Stars", icon: Sparkles },
  { name: "Galaxies", icon: Galaxy },
  { name: "Nebulae", icon: Eclipse },
  { name: "Deep space", icon: Compass },
];

export function ExplorationRail() {
  const open = useExplorationStore((s) => s.mobileNavigationOpen);
  const openCollection = useExplorationStore((s) => s.openCollection);
  const setViewMode = useExplorationStore((s) => s.setViewMode);
  if (!open) return null;
  return (
    <aside
      className={`exploration-rail ${open ? "is-open" : ""}`}
      aria-label="Explore collections"
    >
      <div className="rail-section-title">
        NAVIGATE <span>OUR UNIVERSE</span>
      </div>
      <nav>
        <button
          className="rail-link active"
          onClick={() => setViewMode("overview")}
        >
          <Orbit size={18} />
          <span>Solar System overview</span>
          <span className="nav-indicator" />
        </button>
        {collections.map(({ name, icon: Icon }) => (
          <button
            className="rail-link"
            key={name}
            onClick={() => openCollection(name)}
          >
            <Icon size={18} />
            <span>{name}</span>
            <ArrowUpRight size={12} className="future-arrow" />
          </button>
        ))}
      </nav>
      <div className="rail-location">
        <CircleDot size={14} />
        <div>
          <span>OUR COSMIC NEIGHBORHOOD</span>
          <p>
            Milky Way <span>/</span> Orion Arm
          </p>
        </div>
      </div>
      <button
        className="help-link"
        onClick={() => useExplorationStore.getState().openDialog("help")}
      >
        <HelpCircle size={16} /> Flight manual <span>?</span>
      </button>
    </aside>
  );
}
