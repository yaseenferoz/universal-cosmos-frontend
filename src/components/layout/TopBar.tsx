import { Menu, Orbit, Search, Settings2 } from "lucide-react";
import { useExplorationStore } from "../../stores/explorationStore";
import {
  formatSimulationClock,
  formatSimulationDate,
} from "../../utils/format";
import { REAL_TIME_DAYS_PER_SECOND } from "../../utils/simulationTime";

export function TopBar() {
  const days = useExplorationStore((s) => s.simulationDays);
  const epoch = useExplorationStore((s) => s.simulationEpoch);
  const speed = useExplorationStore((s) => s.speed);
  const playing = useExplorationStore((s) => s.playing);
  const openDialog = useExplorationStore((s) => s.openDialog);
  const mobileOpen = useExplorationStore((s) => s.mobileNavigationOpen);
  const viewMode = useExplorationStore((s) => s.viewMode);
  const setViewMode = useExplorationStore((s) => s.setViewMode);
  return (
    <header className="top-bar">
      <a
        className="brand"
        href="#"
        onClick={(event) => {
          event.preventDefault();
          useExplorationStore.getState().selectObject("earth");
        }}
        aria-label="Universal Cosmos — Earth orbit"
      >
        <span className="brand-mark">
          <Orbit size={33} strokeWidth={1.15} />
        </span>
        <span className="brand-type">
          <span>UNIVERSAL</span>
          <strong>
            COSMOS<span className="brand-period">.</span>
          </strong>
        </span>
      </a>
      <div
        className="scene-switcher"
        role="group"
        aria-label="Scene representation"
      >
        <button
          aria-pressed={viewMode === "exploration"}
          onClick={() => setViewMode("exploration")}
        >
          Exploration
        </button>
        <button
          aria-label="Solar System overview"
          aria-pressed={viewMode === "overview"}
          onClick={() => setViewMode("overview")}
        >
          Overview
        </button>
      </div>
      <div className="top-actions">
        <div className="simulation-date">
          <span>{playing && speed === REAL_TIME_DAYS_PER_SECOND ? "CURRENT UTC · MODELED ORBITS" : "SIMULATED UTC · MODELED ORBITS"}</span>
          <time>
            {formatSimulationDate(days, epoch)}
            <span className="clock-time">
              {" "}
              {formatSimulationClock(days, epoch, playing && speed === REAL_TIME_DAYS_PER_SECOND)}
            </span>
          </time>
        </div>
        <button
          className="icon-button search-trigger"
          aria-label="Search celestial objects"
          onClick={() => openDialog("search")}
          title="Search objects (/)"
        >
          <Search size={19} />
          <kbd>/</kbd>
        </button>
        <button
          className="icon-button"
          aria-label="Open settings"
          onClick={() => openDialog("settings")}
        >
          <Settings2 size={19} />
        </button>
        <button
          className="icon-button navigation-toggle"
          aria-label={
            mobileOpen ? "Close exploration menu" : "Open exploration menu"
          }
          aria-expanded={mobileOpen}
          onClick={() =>
            useExplorationStore.setState({ mobileNavigationOpen: !mobileOpen })
          }
        >
          <Menu size={20} />
        </button>
      </div>
    </header>
  );
}
