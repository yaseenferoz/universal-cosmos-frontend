import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { useState } from "react";
import { planetaryEnvironments } from "../../data/planetaryEnvironments";
import { useExplorationStore } from "../../stores/explorationStore";
import { useLunarStore } from "../../stores/lunarStore";
import { MovementButton } from "./LunarSurfaceControls";

export function PlanetaryDescentControls() {
  const [collapsed, setCollapsed] = useState(true);
  const selected = useExplorationStore(s => s.selectedId);
  const objects = useExplorationStore(s => s.objects);
  const mode = useExplorationStore(s => s.viewMode);
  const ready = useExplorationStore(s => s.status === "ready");
  const t = useLunarStore(s => s.telemetry);
  const body = objects.find(o => o.id === selected);
  const environment = selected ? planetaryEnvironments[selected] : undefined;
  if (!body || !environment || mode !== "exploration" || !ready) return null;
  const atmospheric = environment.mode === "atmosphere";
  const active = !["orbit", "error"].includes(t.phase);
  const exploring = t.phase === "surface";
  const phase = t.phase === "surface" ? atmospheric ? "EXPLORING ATMOSPHERE" : "ON THE SURFACE"
    : t.phase === "ascending" ? "RETURNING TO ORBIT" : active ? "DESCENDING" : "PLANETARY EXPLORATION";
  return <>
    <section className={`lunar-controls glass ${active ? "is-active" : ""} ${collapsed ? "is-collapsed" : "is-expanded"}`} aria-label={`${body.name} exploration`}>
      <span className="eyebrow">{phase}</span>
      <h2><button className="lunar-collapse" aria-label={collapsed ? `Open ${body.name} exploration controls` : `Close ${body.name} exploration controls`} aria-expanded={!collapsed} aria-controls="planetary-descent-details" onClick={() => setCollapsed(!collapsed)}><span>{body.name}</span>{collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button></h2>
      <div hidden={collapsed} id="planetary-descent-details">
        <p className="lunar-coverage">Demonstration · reconstructed environment</p>
        <p>{environment.description}</p>
        {t.error && <p className="lunar-error" role="alert">{t.error}</p>}
        {active && <dl className="lunar-readouts">
          <div><dt>Latitude / longitude</dt><dd>{t.latDeg.toFixed(3)}° / {t.lonDeg.toFixed(3)}° E</dd></div>
          <div><dt>{atmospheric ? "Above reference radius" : "Height above terrain"}</dt><dd>{t.altitudeM >= 1000 ? `${(t.altitudeM / 1000).toFixed(1)} km` : `${t.altitudeM.toFixed(1)} m`}</dd></div>
          <div><dt>Modeled Sun altitude</dt><dd>{t.solarAltitudeDeg.toFixed(1)}°</dd></div>
        </dl>}
        <button className="lunar-primary" disabled={t.phase === "ascending"} onClick={() => active ? useLunarStore.getState().returnToOrbit() : useLunarStore.getState().beginDescent()}>
          {active ? <RotateCcw size={14} /> : <ArrowDown size={14} />}
          {active ? t.phase === "loading" ? "Cancel descent" : "Return to orbit" : atmospheric ? "Descend into atmosphere" : "Descend to surface"}
        </button>
        <details className="lunar-source-details"><summary>Environment & limits</summary><p>Generated terrain/haze are illustrative. Positions, lighting and rotation follow the current circular-orbit model. This is not a measured landing site, weather simulation or ephemeris. Use Go to Day Side before entry for a daylight view.</p><p>The night background uses a <a href="https://svs.gsfc.nasa.gov/4851/" target="_blank" rel="noreferrer">NASA SVS Milky Way map</a>, source-derived stars, and enhanced <a href="https://lambda.gsfc.nasa.gov/product/foreground/fg_halpha_info.html" target="_blank" rel="noreferrer">H-alpha gas emission</a>. Local sky alignment and atmospheric extinction are approximate. Dense Venus and giant-planet haze obscures it.</p></details>
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
