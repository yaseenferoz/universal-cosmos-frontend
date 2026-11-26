import { ArrowUpRight } from "lucide-react";
import { imageryFor } from "../../data/imagery";
import { shapeModelFor } from "../../data/shapeModels";
import type { ObjectId } from "../../types/celestial";
import { useExplorationStore } from "../../stores/explorationStore";

export function ImageryCredits({ id }: { id: ObjectId }) {
  const status = useExplorationStore((state) => state.imageryStatus);
  const imagery = imageryFor(id);
  const model = shapeModelFor(id);
  const loadMessages =
    status?.objectId === id
      ? status.messages.filter((message) => !imagery.missing.includes(message))
      : [];
  const layers = (
    ["surface", "clouds", "night", "normal", "roughness", "rings"] as const
  ).flatMap((layer) => {
    const asset = imagery[layer];
    return asset ? [{ layer, asset }] : [];
  });
  return (
    <details className="imagery-credits">
      <summary>Imagery & scientific context</summary>
      <p>
        Images are historical composites or maps, not live observations.
        Lighting and atmosphere are rendering approximations.
      </p>
      {model && (
        <div className="imagery-credit">
          <span>SHAPE + ATLAS · NASA MODEL</span>
          <a href={model.sourceUrl} target="_blank" rel="noreferrer">
            {model.title} ({model.credit})
            <ArrowUpRight size={12} />
          </a>
          <p>
            Local {(model.bytes / 1e6).toFixed(1)} MB GLB, {model.triangles.toLocaleString("en-US")} triangles.
            Scaled to the catalog mean radius and aligned to its principal axes; prime meridian,
            spin phase and baked lighting are approximate. {model.notes}
          </p>
        </div>
      )}
      {id === "iss" && <div className="imagery-credit">
        <a href="https://science.nasa.gov/resource/international-space-station-3d-model/" target="_blank" rel="noreferrer">NASA / VTAD exterior model <ArrowUpRight size={12} /></a>
        <a href="https://github.com/nasa/astrobee_media" target="_blank" rel="noreferrer">NASA Astrobee / IGOAL interior models <ArrowUpRight size={12} /></a>
        <p>Visit ISS loads the detailed models. Seven connected interior modules; historical configuration, approximate lighting and station attitude. Orbit is a fixed-altitude demonstration, not a TLE prediction.</p>
      </div>}
      {layers.map(({ layer, asset }) => (
        <div className="imagery-credit" key={layer}>
          <span>
            {layer.toUpperCase()} ·{" "}
            {asset.kind === "observational"
              ? "OBSERVATIONAL MAP"
              : "DERIVED MAP"}
          </span>
          <a href={asset.sourceUrl} target="_blank" rel="noreferrer">
            {asset.title}{model && layer === "surface" ? " (fallback only)" : ""}
            <ArrowUpRight size={12} />
          </a>
          <p>
            {asset.attribution}
            <br />
            {asset.license}
            <br />
            Source: {asset.sourceResolution.join(" × ")} px
          </p>
          <p>{asset.notes}</p>
        </div>
      ))}
      {imagery.missing.length > 0 && (
        <div className="imagery-missing">
          <strong>Unavailable imagery</strong>
          {imagery.missing.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
      {loadMessages.length > 0 && (
        <div className="imagery-missing">
          <strong>Current load status</strong>
          {loadMessages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
      <p>
        Background stars are procedural. Planets, moons and small bodies use
        JPL-based positions; the ISS uses a circular model orbit. Not suitable for observation planning.
      </p>
    </details>
  );
}
