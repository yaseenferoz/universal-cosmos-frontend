import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowDown, ArrowUp, ArrowRight, ChevronUp, ChevronDown, DoorOpen, RotateCcw, Satellite } from "lucide-react";
import { useExplorationStore } from "../../stores/explorationStore";
import { useStationStore } from "../../stores/stationStore";
import { stationModules, type StationModuleId } from "../../engine/station/StationLayout";
import type { StationEngine, StationMotion, StationState } from "../../engine/station/StationEngine";

const initial: StationState = { mode: "exterior", status: "loading", message: "Preparing station visit…", moduleId: "node_1" };
export function StationExperience() {
  const viewport = useRef<HTMLDivElement>(null);
  const engine = useRef<StationEngine | null>(null);
  const quality = useExplorationStore((state) => state.quality);
  const [state, setState] = useState(initial);
  const [retry, setRetry] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(true);
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
  return <main className="station-experience" aria-label="International Space Station visit">
    <div ref={viewport} className="station-viewport" />
    <header className="station-header glass">
      <div><span className="eyebrow">UNIVERSAL COSMOS / ORBITAL LABORATORY</span><h1>International Space Station</h1></div>
      <button aria-expanded={controlsOpen} aria-controls="station-controls" onClick={() => setControlsOpen((open) => !open)}>{controlsOpen ? "Hide controls" : "Show controls"}</button>
      <button onClick={exit}><ArrowLeft size={16} /> Return to Earth</button>
    </header>
    {controlsOpen && <section id="station-controls" className="station-panel glass" aria-label="Station exploration controls">
      <div className="station-tabs" role="group" aria-label="Visit mode">
        <button aria-pressed={state.mode === "exterior"} onClick={() => engine.current?.showExterior()}><Satellite size={15} /> Exterior</button>
        <button aria-pressed={state.mode === "interior"} disabled={state.status === "loading"} onClick={() => void engine.current?.showInterior()}><DoorOpen size={15} /> Enter station</button>
      </div>
      {state.mode === "exterior" ? <>
        <h2>400 km above Earth</h2>
        <p>Explore NASA’s station model from every angle. Scroll or pinch to approach.</p>
        <div className="station-presets">
          <button onClick={() => engine.current?.exteriorView("front")}>Front</button>
          <button onClick={() => engine.current?.exteriorView("arrays")}>Solar arrays</button>
          <button onClick={() => engine.current?.exteriorView("earth")}>Earth backdrop</button>
          <button onClick={() => engine.current?.exteriorView("sun")}>Sunward view</button>
          <button onClick={() => engine.current?.resetExterior()} aria-label="Reset exterior view"><RotateCcw size={14} /></button>
        </div>
      </> : <>
        <label htmlFor="station-module">EXPLORE A MODULE</label>
        <select id="station-module" value={state.moduleId} disabled={state.status !== "ready"} onChange={(event) => engine.current?.visitModule(event.target.value as StationModuleId)}>
          {stationModules.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}
        </select>
        <h2>{module.name}</h2><p>{module.role}. Drag to look; float through the connected hatches.</p>
        <button disabled={state.status !== "ready"} onClick={() => engine.current?.visitModule("cupola")}>Go to Cupola · Earth view</button>
      </>}
      <details className="station-sources"><summary>Model & scientific context</summary>
        <p>The main simulation pauses during this visit. A fixed 400 km altitude, stationary lighting and geographic orientation illustrate the view; this is not live ISS tracking.</p>
        <p><a href="https://science.nasa.gov/resource/international-space-station-3d-model/" target="_blank" rel="noreferrer">Exterior: NASA / VTAD</a>, scaled to a 109 m span. Historical hardware configuration and fixed solar arrays.</p>
        <p><a href="https://github.com/nasa/astrobee_media" target="_blank" rel="noreferrer">Interior: NASA Astrobee / IGOAL</a>. Seven connected modules with source geometry and textures. Russian modules and current equipment changes are not included. Navigation uses NASA simulator keep-in volumes.</p>
        <p>Microgravity is orbital free fall. Movement here is a controlled camera, not an astronaut dynamics simulation. Earth uses NASA's historical cloud-free Blue Marble mosaic, up to its native 8K resolution on supported desktop hardware.</p>
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
