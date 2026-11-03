import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  MapPin,
  RotateCcw,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useExplorationStore } from "../../stores/explorationStore";
import { useLunarStore } from "../../stores/lunarStore";
import { moonTerrainManifest } from "../../services/terrain/moonManifest";

const phaseLabels = {
  orbit: "LUNAR SURFACE EXPLORER",
  loading: "LOADING MEASURED TERRAIN",
  approach: "APPROACHING TAURUS–LITTROW",
  descending: "DESCENDING TO THE MOON",
  surface: "ON THE LUNAR SURFACE",
  ascending: "RETURNING TO ORBIT",
  error: "TERRAIN UNAVAILABLE",
};

export function MovementButton({
  label,
  forward = 0,
  right = 0,
  children,
}: {
  label: string;
  forward?: number;
  right?: number;
  children: ReactNode;
}) {
  const stop = () => useLunarStore.getState().setMovement(0, 0);
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        useLunarStore.getState().setMovement(forward, right);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onBlur={stop}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          useLunarStore.getState().setMovement(forward, right);
        }
      }}
      onKeyUp={stop}
    >
      {children}
    </button>
  );
}

export function LunarSurfaceControls() {
  const [collapsed, setCollapsed] = useState(false);
  const selected = useExplorationStore((state) => state.selectedId);
  const viewMode = useExplorationStore((state) => state.viewMode);
  const ready = useExplorationStore((state) => state.status === "ready");
  const telemetry = useLunarStore((state) => state.telemetry);
  const eyeHeight = useLunarStore((state) => state.eyeHeightM);
  if (selected !== "moon" || viewMode !== "exploration" || !ready) return null;
  const active = !["orbit", "error"].includes(telemetry.phase);
  const site = moonTerrainManifest.landingRegion;
  return (
    <>
      <section
        className={`lunar-controls glass ${active ? "is-active" : ""}`}
        aria-label="Lunar surface exploration"
      >
        <span className="eyebrow">{phaseLabels[telemetry.phase]}</span>
        <h2>
          <MapPin size={15} />
          Taurus–Littrow
          <button
            type="button"
            className="lunar-collapse"
            aria-label={
              collapsed ? "Expand lunar controls" : "Collapse lunar controls"
            }
            aria-expanded={!collapsed}
            aria-controls="lunar-control-details"
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </h2>
        <div id="lunar-control-details" hidden={collapsed}>
          {!active ? (
            <>
              <p>
                Apollo 17 region · {site.latDeg.toFixed(3)}° N,{" "}
                {site.lonDeg.toFixed(3)}° E
              </p>
              <p>Measured lunar terrain. Native DEM: 5 m per sample.</p>
              {telemetry.error && (
                <p className="lunar-error" role="alert">
                  {telemetry.error}
                </p>
              )}
              <button
                className="lunar-primary"
                onClick={() => useLunarStore.getState().beginDescent()}
              >
                <ArrowDown size={15} />
                {telemetry.phase === "error"
                  ? "Retry descent"
                  : "Descend to surface"}
              </button>
            </>
          ) : (
            <>
              {telemetry.phase === "loading" ? (
                <p role="status">
                  Loading regional elevation and orbital coverage…
                </p>
              ) : (
                <>
                  <dl className="lunar-readouts">
                    <div>
                      <dt>Latitude / longitude</dt>
                      <dd>
                        {telemetry.latDeg.toFixed(4)}° /{" "}
                        {telemetry.lonDeg.toFixed(4)}° E
                      </dd>
                    </div>
                    <div>
                      <dt>Height above terrain</dt>
                      <dd>
                        {telemetry.altitudeM >= 1000
                          ? `${(telemetry.altitudeM / 1000).toFixed(2)} km`
                          : `${telemetry.altitudeM.toFixed(1)} m`}
                      </dd>
                    </div>
                    <div>
                      <dt>Datum elevation</dt>
                      <dd>{telemetry.elevationM.toFixed(1)} m</dd>
                    </div>
                    <div>
                      <dt>Sun altitude</dt>
                      <dd>{telemetry.solarAltitudeDeg.toFixed(1)}°</dd>
                    </div>
                  </dl>
                  {telemetry.phase === "surface" && (
                    <label className="lunar-eye-height">
                      Observer eye height
                      <select
                        aria-label="Observer eye height"
                        value={eyeHeight}
                        onChange={(event) =>
                          useLunarStore
                            .getState()
                            .setEyeHeight(Number(event.target.value))
                        }
                      >
                        <option value={1.2}>1.2 m</option>
                        <option value={1.7}>1.7 m</option>
                        <option value={2}>2 m</option>
                        <option value={2.5}>2.5 m</option>
                      </select>
                    </label>
                  )}
                  <p className="lunar-stream-status">
                    {telemetry.visibleTiles} terrain patches ·{" "}
                    {telemetry.pendingTiles} loading ·{" "}
                    {(telemetry.residentBytes / 1048576).toFixed(1)} MB data
                    cache
                  </p>
                  <p className="lunar-stream-status">
                    Elevation source spacing:{" "}
                    {telemetry.resolutionM >= 1000
                      ? `${(telemetry.resolutionM / 1000).toFixed(1)} km`
                      : `${telemetry.resolutionM.toFixed(0)} m`}
                    . Interpolated terrain, no added detail.
                  </p>
                  {telemetry.coverageNotice && (
                    <p className="lunar-coverage" role="status">
                      {telemetry.coverageNotice}
                    </p>
                  )}
                </>
              )}
              <button
                className="lunar-primary"
                disabled={telemetry.phase === "ascending"}
                onClick={() => useLunarStore.getState().returnToOrbit()}
              >
                <RotateCcw size={14} />
                {telemetry.phase === "loading"
                  ? "Cancel loading"
                  : "Return to orbit"}
              </button>
            </>
          )}
          <details className="lunar-source-details">
            <summary>Terrain source & limits</summary>
            <p>
              NASA LROC Apollo 17 DTM; elevations relative to a 1,737.4 km
              reference sphere. 5 m sampling does not resolve individual rocks
              or footprints. No invented surface detail is added.
            </p>
            <p>
              Orbital orientation and solar geometry follow the illustrative
              model, not ephemerides. Moon sky is airless and black.
            </p>
            {moonTerrainManifest.sources.map((source) => (
              <p key={source.id}>
                <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
                <br />
                {source.attribution}
                <br />
                {source.notes}
              </p>
            ))}
          </details>
        </div>
      </section>
      {telemetry.phase === "surface" && (
        <div
          className="surface-movement"
          role="group"
          aria-label="Surface movement"
        >
          <span>Drag to look · WASD or hold on-screen arrows to walk</span>
          <div className="movement-pad">
            <MovementButton label="Walk forward" forward={1}>
              <ArrowUp size={18} />
            </MovementButton>
            <MovementButton label="Walk left" right={-1}>
              <ArrowLeft size={18} />
            </MovementButton>
            <MovementButton label="Walk backward" forward={-1}>
              <ArrowDown size={18} />
            </MovementButton>
            <MovementButton label="Walk right" right={1}>
              <ArrowRight size={18} />
            </MovementButton>
          </div>
        </div>
      )}
    </>
  );
}
