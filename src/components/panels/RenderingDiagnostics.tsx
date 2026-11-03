import { X } from "lucide-react";
import { useExplorationStore } from "../../stores/explorationStore";
import { useRenderingStore } from "../../stores/renderingStore";

function vector(value: { x: number; y: number; z: number } | null, position = false): string {
  if (!value) return "Not applicable";
  return [value.x, value.y, value.z].map((v) => position ? v.toExponential(5) : v.toFixed(5)).join(", ");
}

export function RenderingDiagnostics() {
  const enabled = useRenderingStore((s) => s.diagnosticsEnabled);
  const diagnostic = useRenderingStore((s) => s.diagnostics);
  const filter = useRenderingStore((s) => s.solarFilter);
  const objects = useExplorationStore((s) => s.objects);
  if (!enabled) return null;
  const object = objects.find((body) => body.id === diagnostic?.selectedId);
  return (
    <aside className="rendering-diagnostics glass" id="rendering-diagnostics" aria-label="Rendering diagnostics">
      <div className="diagnostic-heading">
        <h2>Rendering diagnostics</h2>
        <button className="icon-button small" aria-label="Close rendering diagnostics" onClick={() => useRenderingStore.getState().setDiagnosticsEnabled(false)}><X size={16} /></button>
      </div>
      {!diagnostic ? <p>Waiting for the next scene sample…</p> : <>
        <p>{diagnostic.scaleMode === "exploration" ? "Physical scale · 10,000 km / render unit" : "Overview · exaggerated display scale"}</p>
        <dl>
          <div><dt>Camera → Sun center</dt><dd>{diagnostic.cameraSunDistanceKm === null ? "No physical distance in Overview" : `${diagnostic.cameraSunDistanceKm.toLocaleString(undefined, { maximumFractionDigits: 0 })} km`}</dd></div>
          <div><dt>Sun angular diameter{diagnostic.scaleMode === "overview" ? " (display)" : ""}</dt><dd>{(diagnostic.sunAngularDiameterRad * 180 / Math.PI * 60).toFixed(3)} arcmin</dd></div>
          <div><dt>Vertical field of view</dt><dd>{diagnostic.cameraFovDeg.toFixed(2)}°</dd></div>
          <div><dt>Camera → Sun unit vector</dt><dd>{vector(diagnostic.cameraSunDirection)}</dd></div>
          <div><dt>Camera position · km</dt><dd>{vector(diagnostic.cameraPositionKm, true)}</dd></div>
          <div><dt>{object?.name ?? "Selected object"} position · km</dt><dd>{vector(diagnostic.selectedPositionKm, true)}</dd></div>
          <div><dt>Selected object → Sun unit vector</dt><dd>{vector(diagnostic.planetSunDirection)}</dd></div>
          <div><dt>Viewing phase angle</dt><dd>{diagnostic.selectedPhaseAngleDeg === null ? "Not applicable" : `${diagnostic.selectedPhaseAngleDeg.toFixed(2)}° · ${(50 * (1 + Math.cos(diagnostic.selectedPhaseAngleDeg * Math.PI / 180))).toFixed(1)}% lit disk`}</dd></div>
          <div><dt>Exposure</dt><dd>{diagnostic.effectiveExposureEv.toFixed(2)} EV · {diagnostic.automaticExposure ? filter ? "Solar filter" : "Automatic scene" : "Manual"}</dd></div>
        </dl>
        <p>Positions and directions use the heliocentric model axes (+Y up). They follow illustrative orbits, not an ephemeris. Camera values in Overview describe display geometry only. Samples update every 400 ms.</p>
        <button className="solar-filter-button" onClick={useRenderingStore.getState().resetExposure}>Reset scene exposure</button>
      </>}
    </aside>
  );
}
