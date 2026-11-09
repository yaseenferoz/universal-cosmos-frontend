import { ChevronDown, ChevronUp, Sun } from "lucide-react";
import { useState } from "react";
import { useExplorationStore } from "../../stores/explorationStore";
import { useRenderingStore } from "../../stores/renderingStore";
import { ASTRONOMICAL_UNIT_KM } from "../../data/catalog";

export function SolarObservationControls() {
  const selected = useExplorationStore((state) => state.selectedId);
  const viewMode = useExplorationStore((state) => state.viewMode);
  const objects = useExplorationStore((state) => state.objects);
  const telemetry = useRenderingStore((state) => state.telemetry);
  const solarFilter = useRenderingStore((state) => state.solarFilter);
  const automatic = useRenderingStore((state) => state.automaticExposure);
  const [collapsed, setCollapsed] = useState(() => matchMedia("(max-width: 720px)").matches);
  if (selected !== "sun" || viewMode !== "exploration") return null;
  return (
    <section className="solar-controls glass" aria-label="Solar observation">
      <span className="eyebrow">SOLAR OBSERVATION</span>
      <h2>
        <Sun size={16} /> Our nearest star
        <button
          className="lunar-collapse"
          aria-expanded={!collapsed}
          aria-controls="solar-observation-details"
          aria-label={
            collapsed ? "Expand solar controls" : "Collapse solar controls"
          }
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </h2>
      <div id="solar-observation-details" hidden={collapsed}>
        <dl className="solar-readouts">
          <div>
            <dt>Distance from Sun center</dt>
            <dd>{telemetry.distanceAu.toFixed(4)} AU</dd>
          </div>
          <div>
            <dt>Apparent diameter</dt>
            <dd>{(telemetry.angularDiameterDeg * 60).toFixed(2)} arcmin</dd>
          </div>
          <div>
            <dt>Unobscured solar irradiance</dt>
            <dd>
              {telemetry.irradianceWm2.toLocaleString(undefined, {
                maximumFractionDigits: 1,
              })}{" "}
              W/m²
            </dd>
          </div>
          <div>
            <dt>Photosphere visible</dt>
            <dd>{(telemetry.visibleFraction * 100).toFixed(1)}%</dd>
          </div>
        </dl>
        <label className="solar-distance-label" htmlFor="solar-distance">
          Observe at a mean orbital distance
        </label>
        <select
          id="solar-distance"
          value=""
          onChange={(event) => {
            if (event.target.value)
              useRenderingStore
                .getState()
                .observeSunAt(Number(event.target.value));
          }}
        >
          <option value="">Choose a distance…</option>
          {objects
            .filter((object) =>
              ["mercury", "earth", "mars", "jupiter", "neptune"].includes(object.id),
            )
            .map((object) => (
              <option
                key={object.id}
                value={object.semiMajorAxisKm / ASTRONOMICAL_UNIT_KM}
              >
                {object.name} ·{" "}
                {(object.semiMajorAxisKm / ASTRONOMICAL_UNIT_KM).toFixed(2)} AU
              </option>
            ))}
        </select>
        <p>
          The Sun keeps its physical size. These viewpoints use mean distances,
          not observed planetary positions.
        </p>
        <button
          className="solar-filter-button"
          aria-pressed={solarFilter && automatic}
          onClick={() => {
            useRenderingStore.getState().setAutomaticExposure(true);
            useRenderingStore.getState().setSolarFilter(!(solarFilter && automatic));
          }}
        >
          {solarFilter && automatic ? "Solar detail filter on" : "Inspect photosphere with solar filter"}
        </button>
        <p>
          {solarFilter && automatic
            ? "Filtered exposure reveals limb darkening and modeled surface detail. Turn it off for the bright sky view."
            : "The bright disk can saturate at scene exposure. Optical bloom is a camera effect, separate from the faint corona."}
        </p>
        <button
          className="solar-exposure-button"
          onClick={() => useExplorationStore.getState().openDialog("settings")}
        >
          Exposure, bloom & corona
        </button>
        <details className="lunar-source-details">
          <summary>Solar model & limits</summary>
          <p>
            White HDR photosphere with approximate limb darkening. Granulation
            is a procedural reconstruction, not an observation. Corona
            brightness and optical sampling are illustrative; no prominence
            dataset is installed.
          </p>
          <p>
            Radius: 695,700 km. Irradiance: 1,361 W/m² at 1 AU, scaled by
            inverse square distance. Eclipse geometry follows this application's
            modeled orbits, not predictions for the displayed date.
          </p>
          <a
            href="https://solarscience.msfc.nasa.gov/surface.shtml"
            target="_blank"
            rel="noreferrer"
          >
            NASA: the solar surface
          </a>
        </details>
      </div>
    </section>
  );
}
