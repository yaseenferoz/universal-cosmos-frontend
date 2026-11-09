import { ArrowUpRight } from "lucide-react";
import { imageryById } from "../../data/imagery";
import type { ObjectId } from "../../types/celestial";
import { useExplorationStore } from "../../stores/explorationStore";

export function ImageryCredits({ id }: { id: ObjectId }) {
  const status = useExplorationStore((state) => state.imageryStatus);
  const imagery = imageryById[id];
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
      {id === "deimos" && (
        <div className="imagery-credit">
          <span>SHAPE + ATLAS · NASA MODEL</span>
          <a href="https://science.nasa.gov/resource/deimos-mars-moon-3d-model/" target="_blank" rel="noreferrer">
            NASA/JPL-Caltech Deimos 3D model
            <ArrowUpRight size={12} />
          </a>
          <p>Local 1.6 MB GLB with a 1024 px texture atlas. Its irregular outline is scaled to the catalog mean radius; orientation and baked lighting are approximate.</p>
        </div>
      )}
      {layers.map(({ layer, asset }) => (
        <div className="imagery-credit" key={layer}>
          <span>
            {layer.toUpperCase()} ·{" "}
            {asset.kind === "observational"
              ? "OBSERVATIONAL MAP"
              : "DERIVED MAP"}
          </span>
          <a href={asset.sourceUrl} target="_blank" rel="noreferrer">
            {asset.title}{id === "deimos" && layer === "surface" ? " (fallback only)" : ""}
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
        Background stars are procedural. Orbital phases are chosen for this
        model; the clock is not a scientific ephemeris.
      </p>
    </details>
  );
}
