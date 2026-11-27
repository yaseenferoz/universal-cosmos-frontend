import { Clock, Galaxy, Orbit, Search, Sparkles, Undo2 } from "lucide-react";
import { deepDisplayName, MILKY_WAY_REF } from "../../data/deep/deepSky";
import { starDisplayName } from "../../data/stars/starCatalog";
import { useExplorationStore } from "../../stores/explorationStore";
import { TIME_RATES, useStellarStore } from "../../stores/stellarStore";
import { dateText, distanceText } from "./format";
import { bundledFallbacks } from "../../services/api/catalogueOrigin";
import { catalogueSourceMode } from "../../services/api";
import { useDeepSkyCatalog } from "./useDeepSkyCatalog";
import { useStarCatalog } from "./useStarCatalog";

/** Location caption, faintest-star and planet controls, and the way back to the Solar System. */
export function StellarHud() {
  const status = useStellarStore((s) => s.status);
  const error = useStellarStore((s) => s.error);
  const telemetry = useStellarStore((s) => s.telemetry);
  const limit = useStellarStore((s) => s.magnitudeLimit);
  const showHosts = useStellarStore((s) => s.showPlanetHosts);
  const timeRate = useStellarStore((s) => s.timeRate);
  const catalog = useStarCatalog();
  const deep = useDeepSkyCatalog();
  const deepStatus = useStellarStore((s) => s.deepStatus);
  const focusedDeep = telemetry?.focusedDeep ?? null;
  const system = catalog && telemetry && !focusedDeep ? catalog.systems.get(telemetry.focused) : undefined;
  const starName = catalog && telemetry ? starDisplayName(catalog, telemetry.focused) : null;
  const planetName = system && telemetry?.focusedPlanet !== null && telemetry?.focusedPlanet !== undefined
    ? system.planets[telemetry.focusedPlanet]?.name : undefined;
  const focusName = focusedDeep ? deepDisplayName(deep, focusedDeep) : planetName ?? starName;
  const eyebrow = focusedDeep?.kind === "milky-way" ? "OUR GALAXY" : focusedDeep?.kind === "galaxy" ? "GALAXY"
    : focusedDeep?.kind === "nebula" ? "NEBULA" : focusedDeep?.kind === "cluster" ? "STAR CLUSTER" : system ? "PLANETARY SYSTEM"
      : (telemetry?.fromSunPc ?? 0) > 30_000 ? "INTERGALACTIC SPACE" : "STELLAR NEIGHBOURHOOD";
  const exposure = telemetry?.exposureMag ?? 0;
  const hostCount = catalog?.systems.size ?? 0;
  return (
    <>
      <div className="scene-caption">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{focusName ?? "Stars"}</h1>
        <p>
          {status === "loading" && "Loading the star catalogue and planetary systems…"}
          {status === "error" && `Star catalogue unavailable: ${error}`}
          {status === "ready" && telemetry && (
            <>
              {telemetry.flying ? "Travelling · " : ""}{distanceText(telemetry.fromSunPc)} from the Sun
              {(telemetry.focused !== 0 || planetName || focusedDeep) && ` · ${distanceText(telemetry.fromFocusPc)} from ${focusName}`}
            </>
          )}
        </p>
        <p>
          {focusedDeep?.kind === "milky-way"
            ? "Model of our Galaxy from measured structure (Reid et al. 2019 arms) · details illustrative"
            : focusedDeep?.kind === "galaxy"
              ? "Catalogue position, distance, size and tilt · spiral pattern illustrative"
              : focusedDeep?.kind === "nebula"
                ? "Published distance and catalogued outline · interior illustrative"
                : focusedDeep?.kind === "cluster"
                  ? "Measured distance and population · individual stars sampled statistically"
                : system?.solarSystem
                  ? "Our planets, placed with JPL's approximate elements · explore them in the Solar System view"
                  : system
                    ? `${system.planets.length} confirmed planet${system.planets.length === 1 ? "" : "s"} (NASA Exoplanet Archive) · planet looks illustrative`
                    : "Real catalogue positions (HYG v4.1) · true 3D distances"}
          {exposure > 0.3 && ` · exposure +${exposure.toFixed(1)} mag`}
          {deepStatus === "error" && " · galaxies and nebulae unavailable"}
          {catalogueSourceMode() === "http" && bundledFallbacks().length > 0 && " · catalogues from bundled files (not yet imported into the backend)"}
        </p>
      </div>
      <div className="stellar-controls glass" role="group" aria-label="Star view controls">
        <label>
          <span>Faintest star · magnitude {limit.toFixed(1)}</span>
          <input type="range" min={3} max={10} step={0.5} value={limit}
            aria-valuetext={`magnitude ${limit.toFixed(1)}${limit === 6.5 ? ", naked eye" : ""}`}
            onChange={(event) => useStellarStore.getState().setMagnitudeLimit(Number(event.target.value))} />
        </label>
        {system && telemetry && (
          <label className="time-control">
            <span className="time-date"><Clock size={11} aria-hidden="true" /> Planets on {dateText(telemetry.jd)}</span>
            <span className="time-row">
              <select value={timeRate} aria-label="Planet motion speed"
                onChange={(event) => useStellarStore.getState().setTimeRate(Number(event.target.value))}>
                {TIME_RATES.map((rate, index) => <option key={rate.label} value={index}>{rate.label}</option>)}
              </select>
              <button type="button" onClick={() => useStellarStore.getState().resetTime()}>Now</button>
            </span>
          </label>
        )}
        <div className="stellar-actions">
        <button aria-pressed={showHosts} className={showHosts ? "is-active" : undefined}
          title={`Ring the ${hostCount.toLocaleString("en-US")} stars with confirmed planets`}
          onClick={() => useStellarStore.getState().setShowPlanetHosts(!showHosts)}>
          <Sparkles size={14} aria-hidden="true" /> <span className="control-text">Stars with planets</span>
        </button>
        <button onClick={() => { useExplorationStore.setState({ collection: "Stars" }); useExplorationStore.getState().openDialog("search"); }}>
          <Search size={14} aria-hidden="true" /> <span className="control-text">Search stars, galaxies, nebulae</span>
        </button>
        <button onClick={() => useStellarStore.getState().flyToDeep(MILKY_WAY_REF, 60_000)} title="Fly out of the Milky Way and look back at it">
          <Galaxy size={14} aria-hidden="true" /> <span className="control-text">See our Galaxy</span>
        </button>
        <button onClick={() => useStellarStore.getState().flyTo(0)}>
          <Orbit size={14} aria-hidden="true" /> <span className="control-text">Fly home to the Sun</span>
        </button>
        <button onClick={() => useExplorationStore.getState().setViewMode("exploration")}>
          <Undo2 size={14} aria-hidden="true" /> <span className="control-text">Back to Solar System</span>
        </button>
        </div>
      </div>
      <div className="interaction-hint">
        <span>Drag to look · Scroll to travel in/out · Click a star, galaxy or nebula · Double-click to fly</span>
      </div>
    </>
  );
}
