import {
  Crosshair,
  Move3D,
  Pause,
  Play,
  RotateCcw,
  TimerReset,
} from "lucide-react";
import {
  TIME_SPEEDS,
  useExplorationStore,
} from "../../stores/explorationStore";
import { useLunarStore } from "../../stores/lunarStore";

export function BottomControls() {
  const playing = useExplorationStore((s) => s.playing);
  const speed = useExplorationStore((s) => s.speed);
  const cameraMode = useExplorationStore((s) => s.cameraMode);
  const viewMode = useExplorationStore((s) => s.viewMode);
  const phase = useLunarStore((s) => s.telemetry.phase);
  const atmospheric = useLunarStore((s) => s.telemetry.atmospheric);
  const lunarActive = !["orbit", "error"].includes(phase);
  const { togglePlayback, setSpeed, setCameraMode, resetView, resetTime } =
    useExplorationStore.getState();
  return (
    <div
      className="bottom-controls glass"
      role="toolbar"
      aria-label="Simulation and camera controls"
    >
      <button
        className="play-button"
        aria-label={playing ? "Pause simulation" : "Play simulation"}
        onClick={togglePlayback}
      >
        {playing ? (
          <Pause size={16} fill="currentColor" />
        ) : (
          <Play size={16} fill="currentColor" />
        )}
      </button>
      <label className="speed-control">
        <span>TIME FLOW</span>
        <select
          aria-label="Simulation speed"
          value={speed}
          onChange={(event) => setSpeed(Number(event.target.value))}
        >
          {TIME_SPEEDS.map((value) => (
            <option key={value} value={value}>
              {value} day{value === 1 ? "" : "s"} / sec
            </option>
          ))}
        </select>
      </label>
      <button
        className="icon-button time-reset"
        onClick={resetTime}
        aria-label="Reset simulation time"
        title="Reset to the visualization epoch"
      >
        <TimerReset size={17} />
      </button>
      <span className="control-divider" />
      {lunarActive ? (
        <span className="camera-mode" aria-label={atmospheric ? "Atmospheric camera" : "Surface camera"}>
          <Move3D size={17} />
          <span>{atmospheric ? "Atmospheric camera" : "Surface camera"}</span>
        </span>
      ) : (
        <button
          className="camera-mode"
          aria-label={`Camera mode: ${cameraMode}. Switch to ${cameraMode === "orbit" ? "free flight" : "orbit"}`}
          onClick={() =>
            setCameraMode(cameraMode === "orbit" ? "free" : "orbit")
          }
        >
          {cameraMode === "orbit" ? (
            <Crosshair size={17} />
          ) : (
            <Move3D size={17} />
          )}
          <span>{cameraMode === "orbit" ? "Orbit camera" : "Free flight"}</span>
        </button>
      )}
      <span className="control-divider" />
      <button
        className="reset-view"
        onClick={
          lunarActive
            ? () => useLunarStore.getState().returnToOrbit()
            : resetView
        }
        aria-label={
          lunarActive
            ? "Return to orbit"
            : viewMode === "overview"
              ? "Reset Solar System overview"
              : "Reset orbital view"
        }
      >
        <RotateCcw size={16} />
        <span>{lunarActive ? "Return to orbit" : "Reset view"}</span>
      </button>
    </div>
  );
}
