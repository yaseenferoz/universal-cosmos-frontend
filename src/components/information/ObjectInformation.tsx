import { ArrowUpRight, ChevronUp, Crosshair, Info, X } from "lucide-react";
import { useExplorationStore } from "../../stores/explorationStore";
import { formatNumber } from "../../utils/format";
import { ImageryCredits } from "./ImageryCredits";
import { ViewingActions } from "../controls/ViewingActions";
import { useRenderingStore } from "../../stores/renderingStore";

export function ObjectInformation() {
  const selectedId = useExplorationStore((s) => s.selectedId);
  const objects = useExplorationStore((s) => s.objects);
  const open = useExplorationStore((s) => s.informationOpen);
  const object = objects.find((item) => item.id === selectedId);
  if (!object) return null;
  if (!open)
    return (
      <button
        className="reopen-information glass"
        aria-label={`Open ${object.name} information`}
        onClick={() => {
          useRenderingStore.getState().setDiagnosticsEnabled(false);
          useExplorationStore.getState().setInformationOpen(true);
        }}
      >
        <Info size={15} />
        <span>
          {object.name}{" "}
          <span className="information-button-label">/ Object information</span>
        </span>
        <ChevronUp size={14} />
      </button>
    );
  const parent = objects.find((item) => item.id === object.parentId);
  const moons = objects.filter((item) => item.parentId === object.id && item.category === "Natural satellite");
  return (
    <aside
      className="object-information glass is-expanded"
      aria-label={`${object.name} information`}
    >
      <div className="panel-eyebrow">
        <span>
          <span className="status-dot" /> OBJECT IN FOCUS
        </span>
        <button
          className="icon-button small"
          aria-label="Collapse object information"
          onClick={() =>
            useExplorationStore.getState().setInformationOpen(false)
          }
        >
          <X size={15} />
        </button>
      </div>
      <div className="object-heading">
        <div>
          <span className="object-category">{object.category}</span>
          <h1>{object.name}</h1>
        </div>
      </div>
      <p className="object-description">{object.description}</p>
      <ViewingActions inline />
      {moons.length > 0 && <section className="related-destinations" aria-label={`Explore ${object.name}'s moons`}>
        <span className="eyebrow">MOONS IN THIS CATALOG ({moons.length})</span>
        <div className="destination-filters">
          {moons.map((moon) => <button key={moon.id} onClick={() => useExplorationStore.getState().selectObject(moon.id)}>
            {moon.name}<ArrowUpRight size={12} />
          </button>)}
        </div>
      </section>}
      <div className="information-details">
        <div className="detail-divider">
          <span>
            {object.backendId ? "REFERENCE PROFILE" : "PHYSICAL PROFILE"}
          </span>
          <span>01</span>
        </div>
        <dl className="physical-grid">
          <div>
            <dt>{object.id === "iss" ? "Reference span" : "Diameter"}</dt>
            <dd>
              {formatNumber(object.radiusKm * 2 * (object.id === "iss" ? 1000 : 1))} <small>{object.id === "iss" ? "m" : "km"}</small>
            </dd>
          </div>
          <div>
            <dt>{object.id === "iss" ? "Crew environment" : "Surface gravity"}</dt>
            <dd>
              {object.id === "iss" ? "Orbital free fall" : <>{formatNumber(object.gravityMs2, 2)} <small>m/s²</small></>}
            </dd>
          </div>
          <div>
            <dt>Orbital period</dt>
            <dd>
              {object.orbitalPeriodDays ? (
                <>
                  {formatNumber(object.orbitalPeriodDays * (object.id === "iss" ? 1440 : 1), 1)}{" "}
                  <small>{object.id === "iss" ? "min (model)" : "days"}</small>
                </>
              ) : (
                <span className="muted-value">Not modeled</span>
              )}
            </dd>
          </div>
          <div>
            <dt>{object.id === "iss" ? "Equatorial inclination" : "Axial tilt"}</dt>
            <dd>
              {formatNumber(object.id === "iss" ? 51.6 : object.axialTiltDeg, 2)}
              <small> °</small>
            </dd>
          </div>
        </dl>
        {parent && (
          <div className="distance-block">
            <div>
              <span>{object.id === "iss" ? "MODELED ALTITUDE ABOVE EARTH" : `MEAN DISTANCE FROM ${parent.name.toUpperCase()}`}</span>
              <ArrowUpRight size={14} />
            </div>
            <strong>
              {formatNumber(object.id === "iss" ? 400 : object.semiMajorAxisKm / 1_000_000, 3)}{" "}
              <span>{object.id === "iss" ? "km" : "million km"}</span>
            </strong>
            <span className="distance-line">
              <i />
              <i />
            </span>
          </div>
        )}
        <div className="science-note">
          <span className="science-dot" />
          Real object. Illustrative rendering.
          <p>
            Exploration uses physical scale. Circular orbits are modeled, not
            measured positions at the displayed time.
          </p>
          {object.backendId && (
            <p>
              Object identity is supplied by the connected backend. Physical
              values are from the bundled NASA reference catalog.
            </p>
          )}
          {object.id === "earth" && (
            <p>
              Earth rotation and seasonal daylight follow the displayed UTC using
              an approximate solar model. Clouds are a static composite, not live weather.
            </p>
          )}
        </div>
        <a
          className="source-link"
          href={object.source.url}
          target="_blank"
          rel="noreferrer"
        >
          {object.source.label}
          <ArrowUpRight size={12} />
        </a>
        <ImageryCredits id={object.id} />
        <details className="catalog-reference-notes">
          <summary>Reference notes</summary>
          {object.facts.map((fact) => <p key={fact.label}><strong>{fact.label}: </strong>{fact.value}</p>)}
        </details>
      </div>
      <button
        className="travel-button"
        onClick={() => useExplorationStore.getState().selectObject(object.id)}
      >
        <Crosshair size={17} />
        <span>Travel to {object.name}</span>
        <span>↗</span>
      </button>
    </aside>
  );
}
