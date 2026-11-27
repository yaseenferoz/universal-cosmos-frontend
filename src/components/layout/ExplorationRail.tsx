import {
  ArrowRight,
  BookOpen,
  Cloud,
  CircleDot,
  Compass,
  Galaxy,
  HelpCircle,
  Orbit,
  Sparkles,
} from "lucide-react";
import { MILKY_WAY_REF } from "../../data/deep/deepSky";
import { useExplorationStore } from "../../stores/explorationStore";
import { useStellarStore } from "../../stores/stellarStore";

/** The 2MASS galaxies reach about 300 Mpc; from 700 Mpc the whole survey fits the view. */
const COSMIC_WEB_DISTANCE_PC = 7e8;

const collections = [
  { name: "Galaxies", label: "Galaxies", icon: Galaxy },
  { name: "Nebulae", label: "Nebulae", icon: Cloud },
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
        <button className="rail-link" onClick={() => setViewMode("stars")}>
          <Sparkles size={18} />
          <span>Nearby stars</span>
        </button>
        {collections.map(({ name, label, icon: Icon }) => (
          <button
            className="rail-link"
            key={name}
            onClick={() => openCollection(name)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
        <button
          className="rail-link"
          onClick={() => {
            setViewMode("stars");
            useStellarStore.getState().flyToDeep(MILKY_WAY_REF, COSMIC_WEB_DISTANCE_PC);
          }}
        >
          <Compass size={18} />
          <span>Deep space · cosmic web</span>
        </button>
        <a className="rail-link" href="/solar-system.html">
          <BookOpen size={18} aria-hidden="true" />
          <span>Exploration guides</span>
        </a>
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
      <a
        className="developer-credit"
        href="/about.html"
        aria-label="About Universal Cosmos, developed by Yaseen Feroz"
      >
        <span>About Universal Cosmos<br />Developed by <strong>Yaseen Feroz</strong></span>
        <ArrowRight size={14} aria-hidden="true" />
      </a>
    </aside>
  );
}
