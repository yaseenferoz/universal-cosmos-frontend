import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronUp, RotateCcw, Sun } from "lucide-react";
import { useMemo, useState } from "react";
import { exoplanetLanding, landingId } from "../../engine/stars/exoplanetLanding";
import { useLunarStore } from "../../stores/lunarStore";
import { useStellarStore } from "../../stores/stellarStore";
import { initialLunarTelemetry } from "../../types/lunar";
import { MovementButton } from "../controls/LunarSurfaceControls";
import { starDisplayName } from "../../data/stars/starCatalog";
import { formatNumber } from "./format";
import { useStarCatalog } from "./useStarCatalog";

/** Descend to the focused exoplanet, walk or fly there, and return to orbit. */
export function ExoplanetDescentControls() {
  const [collapsed, setCollapsed] = useState(true);
  const catalog = useStarCatalog();
  const stellar = useStellarStore((s) => s.telemetry);
  const lunar = useLunarStore((s) => s.telemetry);
  const system = catalog && stellar ? catalog.systems.get(stellar.focused) : undefined;
  const index = stellar?.focusedPlanet ?? null;
  // Our own planets are explored in the Solar System view.
  const landing = useMemo(() => (system && !system.solarSystem && index !== null && system.planets[index] ? exoplanetLanding(system, index) : null), [system, index]);
  if (!landing || !stellar || (stellar.flying && !stellar.descending)) return null;
  const t = lunar.bodyId === landingId(landing.object.name) ? lunar : initialLunarTelemetry;
  const atmospheric = landing.mode === "atmosphere";
  const active = stellar.descending || !["orbit", "error"].includes(t.phase);
  const exploring = t.phase === "surface";
  const phase = exploring ? atmospheric ? "EXPLORING ATMOSPHERE" : "ON THE SURFACE"
    : t.phase === "ascending" ? "RETURNING TO ORBIT" : t.phase === "loading" ? "PREPARING ENVIRONMENT" : active ? "DESCENDING" : "PLANETARY EXPLORATION";
  const name = landing.object.name;
  return <>
    <section className={`lunar-controls glass exoplanet-descent ${active ? "is-active" : ""} ${collapsed ? "is-collapsed" : "is-expanded"}`}
      data-exploration-mode={landing.mode} aria-label={`${name} exploration`}>
      <span className="eyebrow">{phase}</span>
      <h2>
        <button className="lunar-collapse" aria-expanded={!collapsed} aria-controls="exoplanet-descent-details"
          aria-label={collapsed ? `Open ${name} exploration controls` : `Close ${name} exploration controls`} onClick={() => setCollapsed(!collapsed)}>
          <span>{name}</span>{collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </h2>
      <p className="lunar-coverage">Illustrative reconstruction · archive measurements</p>
      {t.error && <p className="lunar-error" role="alert">{t.error}</p>}
      <button className="lunar-primary" disabled={t.phase === "ascending"}
        onClick={() => active ? useLunarStore.getState().returnToOrbit() : useLunarStore.getState().beginDescent()}>
        {active ? <RotateCcw size={14} /> : <ArrowDown size={14} />}
        {active ? t.phase === "loading" ? "Cancel descent" : "Return to orbit" : atmospheric ? "Descend into atmosphere" : "Descend to surface"}
      </button>
      {exploring && catalog && stellar && (
        <button className="lunar-primary face-star" onClick={() => useStellarStore.getState().faceStar()}>
          <Sun size={14} /> Face {starDisplayName(catalog, stellar.focused)}
        </button>
      )}
      <div hidden={collapsed} id="exoplanet-descent-details">
        <p>{landing.descriptor.environment.description}</p>
        <dl className="lunar-readouts">
          {landing.insolationEarth !== undefined && <div><dt>Starlight</dt><dd>{formatNumber(landing.insolationEarth)} × Earth's</dd></div>}
          <div><dt>{atmospheric ? "Gravity at 1 bar" : "Surface gravity"}</dt><dd>{(landing.gravityMs2 / 9.807).toFixed(2)} g{landing.gravityFrom === "mass" ? "" : " (est.)"}</dd></div>
          <div><dt>Day</dt><dd>{landing.tidallyLocked ? "Star fixed in the sky (tidally locked)" : `${landing.rotationHours} h (illustrative)`}</dd></div>
          {active && <>
            <div><dt>Latitude / longitude</dt><dd>{t.latDeg.toFixed(3)}° / {t.lonDeg.toFixed(3)}° E</dd></div>
            <div><dt>{atmospheric ? "Above reference radius" : "Height above terrain"}</dt><dd>{t.altitudeM >= 1000 ? `${(t.altitudeM / 1000).toFixed(1)} km` : `${t.altitudeM.toFixed(1)} m`}</dd></div>
            <div><dt>Star altitude</dt><dd>{t.solarAltitudeDeg.toFixed(1)}°</dd></div>
          </>}
        </dl>
        <details className="lunar-source-details">
          <summary>What is measured and what is assumed</summary>
          <p>Measured (NASA Exoplanet Archive): size or mass, orbit, starlight, and the star's temperature, which sets the colour of the light. The planet's place on its orbit, and so where its siblings and the star appear in its sky, follows the published timing where there is one.</p>
          <ul>{landing.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
          <p>Lighting is shown eye-adapted, as in Solar System descents. The terrain, rocks and clouds are procedural; no exoplanet's surface or cloud deck has been observed.</p>
        </details>
      </div>
    </section>
    {exploring && <div className="surface-movement" role="group" aria-label={atmospheric ? "Atmospheric movement" : "Surface movement"}>
      <span>{atmospheric ? "Drag to look · WASD or arrows to fly at fixed altitude" : "Drag to look · WASD or arrows to walk"}</span>
      <div className="movement-pad">
        <MovementButton label="Move forward" forward={1}><ArrowUp size={18} /></MovementButton>
        <MovementButton label="Move left" right={-1}><ArrowLeft size={18} /></MovementButton>
        <MovementButton label="Move backward" forward={-1}><ArrowDown size={18} /></MovementButton>
        <MovementButton label="Move right" right={1}><ArrowRight size={18} /></MovementButton>
      </div>
    </div>}
  </>;
}
