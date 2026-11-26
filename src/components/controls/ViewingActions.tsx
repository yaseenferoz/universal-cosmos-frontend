import { Orbit, ScanLine, Sun, Sunrise, Satellite } from "lucide-react";
import { useStationStore } from "../../stores/stationStore";
import { useExplorationStore } from "../../stores/explorationStore";
import { useLunarStore } from "../../stores/lunarStore";
import { useRenderingStore } from "../../stores/renderingStore";

export function ViewingActions({ inline = false }: { inline?: boolean }) {
  const selected = useExplorationStore((s) => s.selectedId);
  const mode = useExplorationStore((s) => s.viewMode);
  const informationOpen = useExplorationStore((s) => s.informationOpen);
  const phase = useLunarStore((s) => s.telemetry.phase);
  const solarAltitude = useLunarStore((s) => s.telemetry.solarAltitudeDeg);
  const automatic = useRenderingStore((s) => s.automaticExposure);
  const filter = useRenderingStore((s) => s.solarFilter);
  const ev = useRenderingStore((s) => s.telemetry.effectiveExposureEv);
  const diagnostics = useRenderingStore((s) => s.diagnosticsEnabled);
  const objects = useExplorationStore((s) => s.objects);
  const parentId = objects.find((object) => object.id === selected)?.parentId;
  const parent = parentId && parentId !== "sun" ? objects.find((object) => object.id === parentId) : undefined;
  const surface = phase === "surface";
  if (mode !== "exploration" || !selected || !(["orbit", "error"].includes(phase) || surface)) return null;
  if (!inline && informationOpen) return null;
  const imaging = useRenderingStore.getState();
  if (surface)
    return (
      <div className={`viewing-actions ${inline ? "is-inline" : "glass"}`}>
        <div className="viewing-action-row" role="group" aria-label="Viewing actions">
          <button onClick={imaging.lookAtSun} title="Turn to face the Sun (or its direction when it is below the horizon)">
            <Sun size={14} /><span>Look at Sun</span>
          </button>
          {parent && (
            <button onClick={imaging.lookAtParent} title={`Turn toward ${parent.name} (its bearing on the horizon if it never rises here)`}>
              <Orbit size={14} /><span>Look at {parent.name}</span>
            </button>
          )}
          {solarAltitude < 5 && (
            <button onClick={imaging.skipToDaylight} title="Advance the clock to the next local morning here (the Sun 20° up), then pause">
              <Sunrise size={14} /><span>Skip to daylight</span>
            </button>
          )}
        </div>
      </div>
    );
  return (
    <div className={`viewing-actions ${inline ? "is-inline" : "glass"}`}>
      <div className="viewing-action-row" role="group" aria-label="Viewing actions">
        {(selected === "earth" || selected === "iss") && <button onClick={useStationStore.getState().enter}>
          <Satellite size={15} /><span>Visit ISS</span>
        </button>}
        <button onClick={imaging.lookAtSun} title="Rotate toward the Sun without changing your position">
          <Sun size={14} /><span>Look at Sun</span>
        </button>
        {selected !== "sun" && (
          <button onClick={imaging.goToDaySide} title="Move around the selected world to its illuminated hemisphere">
            <Sunrise size={14} /><span>Go to Day Side</span>
          </button>
        )}
        <button
          aria-label={diagnostics ? "Close rendering diagnostics" : "Open rendering diagnostics"}
          aria-expanded={diagnostics}
          aria-controls="rendering-diagnostics"
          title="Rendering diagnostics"
          onClick={() => {
            useExplorationStore.getState().setInformationOpen(false);
            imaging.setDiagnosticsEnabled(!diagnostics);
          }}
        ><ScanLine size={15} /></button>
      </div>
      {(!automatic || filter) && (
        <div className="exposure-context">
          <span>{!automatic ? "Manual exposure" : "Solar detail filter"} · {ev.toFixed(1)} EV</span>
          <button onClick={imaging.resetExposure}>Reset exposure</button>
        </div>
      )}
    </div>
  );
}
