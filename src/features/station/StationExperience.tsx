import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowDown, ArrowUp, ArrowRight, ChevronUp, ChevronDown, DoorOpen, Pause, Play, RotateCcw, Satellite, SkipBack, SkipForward, SlidersHorizontal, X } from "lucide-react";
import { COMPACT_SCREEN_QUERY, useMediaQuery } from "../../hooks/useMediaQuery";
import { useExplorationStore } from "../../stores/explorationStore";
import { useStationStore } from "../../stores/stationStore";
import { stationModules, type StationModuleId } from "../../engine/station/StationLayout";
import { stationRegions } from "../../data/stationRegions";
import type { StationEngine, StationMotion, StationState } from "../../engine/station/StationEngine";
import { DEFAULT_STATION_ORBIT_SPEED, STATION_ORBIT_SPEEDS } from "../../engine/station/stationSpeeds";

const initial: StationState = { mode: "exterior", status: "loading", message: "Preparing station visit…", moduleId: "node_1", orbit: {
  playing: true, speed: DEFAULT_STATION_ORBIT_SPEED, elapsedSeconds: 0, progress: 0, latitudeDeg: 0, longitudeDeg: 20, sunAltitudeDeg: 45,
} };
const coordinate = (degrees: number, positive: string, negative: string) => `${Math.abs(degrees).toFixed(1)}° ${degrees >= 0 ? positive : negative}`;
export function StationExperience() {
  const viewport = useRef<HTMLDivElement>(null);
  const engine = useRef<StationEngine | null>(null);
  const quality = useExplorationStore((state) => state.quality);
  const [state, setState] = useState(initial);
  const [retry, setRetry] = useState(0);
  // On phones the controls start closed so the station fills the screen; they open as a sheet.
  const compact = useMediaQuery(COMPACT_SCREEN_QUERY);
  const [controlsOpen, setControlsOpen] = useState(() => !matchMedia(COMPACT_SCREEN_QUERY).matches);
  /** After picking a view on a phone, close the sheet so the result is visible. */
  const chosen = () => { if (compact) setControlsOpen(false); };
  const exit = () => {
    useExplorationStore.getState().selectObject("earth");
    useStationStore.getState().leave();
  };
  useEffect(() => {
    const container = viewport.current;
    if (!container) return;
    let cancelled = false;
    import("../../engine/station/StationEngine").then(({ StationEngine }) => {
      if (cancelled) return;
      engine.current = new StationEngine(container, quality, (next) => { if (!cancelled) setState(next); });
    }).catch((error: unknown) => {
      if (!cancelled) setState({ ...initial, status: "error", message: error instanceof Error ? error.message : "3D viewer unavailable." });
    });
    return () => { cancelled = true; engine.current?.dispose(); engine.current = null; };
  }, [quality, retry]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (state.mode === "interior") engine.current?.showExterior();
        else { useExplorationStore.getState().selectObject("earth"); useStationStore.getState().leave(); }
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [state.mode]);
  const module = stationModules.find(({ id }) => id === state.moduleId) ?? stationModules[0];
  const motionButton = (motion: StationMotion, label: string, icon: React.ReactNode) => <button
    key={motion} aria-label={label} title={label}
    onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); engine.current?.setMotion(motion, true); }}
    onPointerUp={() => engine.current?.setMotion(motion, false)}
    onPointerCancel={() => engine.current?.setMotion(motion, false)}
    onLostPointerCapture={() => engine.current?.setMotion(motion, false)}
    onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); engine.current?.setMotion(motion, true); } }}
    onKeyUp={() => engine.current?.setMotion(motion, false)}
    onBlur={() => engine.current?.setMotion(motion, false)}
  >{icon}</button>;
  return <main className={`station-experience${controlsOpen ? " has-open-controls" : ""}`} aria-label="International Space Station visit">
    <div ref={viewport} className="station-viewport" />
    <header className="station-header glass">
      <div><span className="eyebrow">UNIVERSAL COSMOS / ORBITAL LABORATORY</span><h1>International Space Station</h1></div>
      <button aria-expanded={controlsOpen} aria-controls="station-controls" aria-label={controlsOpen ? "Hide controls" : "Show controls"} onClick={() => setControlsOpen((open) => !open)}>
        {controlsOpen ? <X size={16} aria-hidden="true" /> : <SlidersHorizontal size={16} aria-hidden="true" />}
        <span className="station-button-text">{controlsOpen ? "Hide controls" : "Show controls"}</span>
      </button>
      <button onClick={exit} aria-label="Return to Earth"><ArrowLeft size={16} aria-hidden="true" /> <span className="station-button-text">Return to Earth</span></button>
    </header>
    {controlsOpen && <section id="station-controls" className="station-panel glass" aria-label="Station exploration controls">
      <div className="station-tabs" role="group" aria-label="Visit mode">
        <button aria-pressed={state.mode === "exterior"} onClick={() => { engine.current?.showExterior(); chosen(); }}><Satellite size={15} /> Exterior</button>
        <button aria-pressed={state.mode === "interior"} disabled={state.status === "loading"} onClick={() => { void engine.current?.showInterior(); chosen(); }}><DoorOpen size={15} /> Enter station</button>
      </div>
      {state.mode === "exterior" ? <>
        <h2>400 km above Earth</h2>
        <p>Explore NASA’s station model from every angle. Scroll or pinch to approach.</p>
        <div className="station-presets">
          <button onClick={() => { engine.current?.exteriorView("front"); chosen(); }}>Front</button>
          <button onClick={() => { engine.current?.exteriorView("arrays"); chosen(); }}>Solar arrays</button>
          <button onClick={() => { engine.current?.exteriorView("earth"); chosen(); }}>Earth backdrop</button>
          <button onClick={() => { engine.current?.exteriorView("sun"); chosen(); }}>Sunward view</button>
          <button onClick={() => { engine.current?.resetExterior(); chosen(); }} aria-label="Reset exterior view"><RotateCcw size={14} /></button>
        </div>
      </> : <>
        <label htmlFor="station-module">EXPLORE A MODULE</label>
        <select id="station-module" value={state.moduleId} disabled={state.status !== "ready"} onChange={(event) => { engine.current?.visitModule(event.target.value as StationModuleId); chosen(); }}>
          {stationModules.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}
        </select>
        <h2>{module.name}</h2><p>{module.role}. Drag to look; float through the connected hatches.</p>
        <button disabled={state.status !== "ready"} onClick={() => { engine.current?.visitModule("cupola"); chosen(); }}>Go to Cupola · Earth view</button>
      </>}
      <div className="station-orbit-controls">
        <h2>Earth observation</h2>
        <p>Simulated 400 km orbit · 51.6° inclination. The station holds a nadir-facing attitude while Earth turns below.</p>
        <div className="station-orbit-actions">
          <button onClick={() => engine.current?.setOrbitPlaying(!state.orbit.playing)} aria-label={state.orbit.playing ? "Pause simulated orbit" : "Play simulated orbit"}>
            {state.orbit.playing ? <Pause size={15} /> : <Play size={15} />}{state.orbit.playing ? "Pause" : "Play"}
          </button>
          <label htmlFor="station-orbit-speed">Speed</label>
          <select id="station-orbit-speed" value={state.orbit.speed} onChange={(event) => engine.current?.setOrbitSpeed(Number(event.target.value))}>
            {STATION_ORBIT_SPEEDS.map((speed) => <option key={speed} value={speed}>{speed === 1 ? "1× real time" : `${speed}×`}</option>)}
          </select>
        </div>
        <label htmlFor="station-orbit-progress">Position in current orbit</label>
        <input id="station-orbit-progress" type="range" min={0} max={1000} step={1} value={Math.round(state.orbit.progress * 1000)} onChange={(event) => engine.current?.setOrbitProgress(Number(event.target.value) / 1000)} />
        <div className="station-orbit-actions station-orbit-skip">
          <button onClick={() => engine.current?.skipOrbit(-1)} aria-label="Previous simulated orbit"><SkipBack size={15} /> Previous orbit</button>
          <button onClick={() => engine.current?.skipOrbit(1)} aria-label="Next simulated orbit">Next orbit <SkipForward size={15} /></button>
        </div>
        <label htmlFor="station-region">Jump to next daylight pass near</label>
        <select id="station-region" defaultValue="" onChange={(event) => { engine.current?.jumpToRegion(event.target.value); event.currentTarget.value = ""; chosen(); }}>
          <option value="" disabled>Choose a region</option>
          {stationRegions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
        </select>
        <p className="station-orbit-readout" aria-live="off">Above {coordinate(state.orbit.latitudeDeg, "N", "S")}, {coordinate(state.orbit.longitudeDeg, "E", "W")} · {state.orbit.sunAltitudeDeg > 3 ? "daylight" : state.orbit.sunAltitudeDeg < -3 ? "night" : "twilight"}</p>
        <p className="station-orbit-note">Imagery is historical and cloud-free; this route is illustrative, not the ISS's live position.</p>
      </div>
      <details className="station-sources"><summary>Model & scientific context</summary>
        <p>The main simulation pauses during this visit. This is a circular 400 km, 51.6° orbital reconstruction with Earth rotation and changing Sun direction. Its initial ascending node, station attitude and Sun phase are illustrative; no dated orbital epoch or TLE is used.</p>
        <p><a href="https://science.nasa.gov/resource/international-space-station-3d-model/" target="_blank" rel="noreferrer">Exterior: NASA / VTAD</a>, scaled to a 109 m span. Historical hardware configuration and fixed solar arrays.</p>
        <p><a href="https://github.com/nasa/astrobee_media" target="_blank" rel="noreferrer">Interior: NASA Astrobee / IGOAL</a>. Seven connected modules with source geometry and textures. Russian modules and current equipment changes are not included. Navigation uses NASA simulator keep-in volumes.</p>
        <p>Microgravity is orbital free fall. Movement here is a controlled camera, not an astronaut dynamics simulation. Earth uses NASA's historical cloud-free Blue Marble mosaic, up to its native 8K resolution on supported desktop hardware. High/Auto desktop adds a feathered 500 m Blue Marble Next Generation crop while passing central Africa (July 2004); the rest remains the older global composite.</p>
      </details>
    </section>}
    {state.status !== "ready" && <div className="station-status glass" role={state.status === "error" ? "alert" : "status"}>
      <p>{state.message}</p>
      {state.status === "error" && <button onClick={() => { setState(initial); setRetry((value) => value + 1); }}>Reload station</button>}
    </div>}
    {state.mode === "interior" && state.status === "ready" && <nav className="station-movement glass" aria-label="Float inside the ISS">
      {motionButton("left", "Float left", <ArrowLeft size={18} />)}
      {motionButton("forward", "Float forward", <ArrowUp size={18} />)}
      {motionButton("back", "Float backward", <ArrowDown size={18} />)}
      {motionButton("right", "Float right", <ArrowRight size={18} />)}
      {motionButton("up", "Float up", <ChevronUp size={18} />)}
      {motionButton("down", "Float down", <ChevronDown size={18} />)}
      <span>WASD / arrows · Q down · E up</span>
    </nav>}
    <footer className="station-caption">{state.mode === "interior" ? "NASA INTERIOR MODELS · SEVEN CONNECTED MODULES" : "NASA EXTERIOR MODEL · 360° FLY-AROUND"}<span>ILLUSTRATIVE ORBIT & LIGHTING</span></footer>
  </main>;
}
