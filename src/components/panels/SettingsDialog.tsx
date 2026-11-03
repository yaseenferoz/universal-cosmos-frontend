import { Check, Monitor, Orbit, Sparkles, Tags } from "lucide-react";
import { useExplorationStore } from "../../stores/explorationStore";
import type { Quality } from "../../types/celestial";
import { Modal } from "./Modal";
import { useRenderingStore } from "../../stores/renderingStore";

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      className={`toggle ${checked ? "enabled" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span>{checked && <Check size={10} />}</span>
    </button>
  );
}

export function SettingsDialog() {
  const quality = useExplorationStore((s) => s.quality);
  const density = useExplorationStore((s) => s.starDensity);
  const orbits = useExplorationStore((s) => s.showOrbits);
  const labels = useExplorationStore((s) => s.showLabels);
  const effectiveQuality = useExplorationStore((s) => s.effectiveQuality);
  const fps = useExplorationStore((s) => s.fps);
  const exposureEv = useRenderingStore((s) => s.exposureEv);
  const automaticExposure = useRenderingStore((s) => s.automaticExposure);
  const effectiveEv = useRenderingStore((s) => s.telemetry.effectiveExposureEv);
  const corona = useRenderingStore((s) => s.corona);
  const solarFilter = useRenderingStore((s) => s.solarFilter);
  const bloomStrength = useRenderingStore((s) => s.bloomStrength);
  const { setQuality, setStarDensity, setShowOrbits, setShowLabels } =
    useExplorationStore.getState();
  return (
    <Modal
      title="Make space your own."
      eyebrow="EXPLORATION SETTINGS"
      className="settings-dialog"
    >
      <div className="settings-section">
        <div className="setting-label">
          <Monitor size={18} />
          <div>
            <h3>Rendering quality</h3>
            <p>Auto adapts to your device and frame rate.</p>
          </div>
        </div>
        <div className="quality-options">
          {(["auto", "low", "medium", "high"] as Quality[]).map((value) => (
            <button
              className={quality === value ? "selected" : ""}
              key={value}
              onClick={() => setQuality(value)}
              aria-pressed={quality === value}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="setting-footnote">
          Active preset: {effectiveQuality}. Observed frame rate:{" "}
          {Math.round(fps)} fps. Quality controls drawing resolution and optical effect limits.
        </p>
        <div className="exposure-setting">
          <div className="exposure-auto-row">
            <span>Automatic exposure</span>
            <Toggle
              checked={automaticExposure}
              onChange={useRenderingStore.getState().setAutomaticExposure}
              label="Automatic exposure"
            />
          </div>
          <label htmlFor="exposure-ev">
            <span>
              {automaticExposure ? "Exposure compensation" : "Manual exposure"}
            </span>
            <span>
              {exposureEv > 0 ? "+" : ""}
              {exposureEv.toFixed(1)} EV
            </span>
          </label>
          <input
            id="exposure-ev"
            type="range"
            min={automaticExposure ? -6 : -20}
            max={automaticExposure ? 6 : 12}
            step="0.5"
            value={exposureEv}
            onChange={(event) =>
              useRenderingStore
                .getState()
                .setExposure(Number(event.target.value))
            }
          />
          <p className="setting-footnote">
            Active exposure: {effectiveEv.toFixed(1)} EV. Each +1 EV doubles
            exposure. Scene metering preserves the selected world's daylight
            exposure; a night-side view stays dark. Values are relative, not
            calibrated camera settings.
          </p>
          <button className="reset-exposure-button" onClick={useRenderingStore.getState().resetExposure}>Reset scene exposure</button>
          <div className="exposure-auto-row">
            <span>Solar detail filter</span>
            <Toggle
              checked={solarFilter}
              onChange={useRenderingStore.getState().setSolarFilter}
              label="Solar detail filter"
            />
          </div>
          <p className="setting-footnote">
            With automatic exposure, filter a visible Sun to reveal its
            photosphere. This can darken nearby planets. Manual exposure takes precedence.
          </p>
          <div className="bloom-control">
            <label htmlFor="solar-bloom"><span>Optical bloom / glare</span><span>{bloomStrength === 0 ? "Off" : `${Math.round(bloomStrength * 100)}%`}</span></label>
            <input id="solar-bloom" type="range" min="0" max="1" step="0.05" value={bloomStrength} onChange={(event) => useRenderingStore.getState().setBloomStrength(Number(event.target.value))} />
            <p className="setting-footnote">A bounded camera-optics approximation around bright sunlight. It does not enlarge the physical Sun or represent its corona. Set to zero for geometry inspection.</p>
          </div>
          <div className="exposure-auto-row">
            <span>Faint solar corona</span>
            <Toggle
              checked={corona}
              onChange={useRenderingStore.getState().setCorona}
              label="Show solar corona"
            />
          </div>
          <p className="setting-footnote">
            The approximate corona is most visible during occultation or at
            higher exposure. Low quality omits it.
          </p>
        </div>
      </div>
      <button className="solar-filter-button" onClick={() => {
        useRenderingStore.getState().setDiagnosticsEnabled(true);
        useExplorationStore.getState().setInformationOpen(false);
        useExplorationStore.getState().openDialog(null);
      }}>Open rendering diagnostics</button>
      <div className="settings-section">
        <div className="setting-label">
          <Sparkles size={18} />
          <div>
            <h3>Background stars</h3>
            <p>Subtle procedural points, not an observed star catalog.</p>
          </div>
          <span className="setting-value">{density.toFixed(2)}×</span>
        </div>
        <input
          className="density-range"
          type="range"
          min="0.25"
          max="2"
          step="0.25"
          value={density}
          aria-label="Star density"
          onChange={(event) => setStarDensity(Number(event.target.value))}
        />
        <div className="range-labels">
          <span>Quiet sky</span>
          <span>Star-rich sky</span>
        </div>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <Orbit size={18} />
          <div>
            <h3>Orbital paths</h3>
            <p>Show modeled paths in Solar System overview.</p>
          </div>
        </div>
        <Toggle
          checked={orbits}
          onChange={setShowOrbits}
          label="Show orbital paths"
        />
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <Tags size={18} />
          <div>
            <h3>Object labels</h3>
            <p>Find your bearings among the planets.</p>
          </div>
        </div>
        <Toggle
          checked={labels}
          onChange={setShowLabels}
          label="Show object labels"
        />
      </div>
      <div className="settings-note">
        Exploration uses a uniform physical scale. Overview exaggerates sizes
        and compresses distances with normalized lighting. Orbital motion in
        both modes is a circular approximation, not measured positions at the
        displayed time.
      </div>
    </Modal>
  );
}
