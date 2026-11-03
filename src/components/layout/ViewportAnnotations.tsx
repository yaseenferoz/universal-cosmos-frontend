import { Info, MousePointer2 } from "lucide-react";
import { useExplorationStore } from "../../stores/explorationStore";

export function ViewportAnnotations() {
  const selectedId = useExplorationStore((s) => s.selectedId);
  const objects = useExplorationStore((s) => s.objects);
  const mode = useExplorationStore((s) => s.viewMode);
  const imagery = useExplorationStore((s) => s.imageryStatus);
  const object = objects.find((item) => item.id === selectedId);
  const assetIssue =
    imagery?.objectId === selectedId &&
    (imagery.state === "partial" || imagery.state === "missing");
  return (
    <>
      <div className="scene-caption">
        <span className="eyebrow">
          {mode === "overview"
            ? "SOLAR SYSTEM OVERVIEW"
            : (object?.category.toUpperCase() ?? "FREE EXPLORATION")}
        </span>
        <h1>
          {mode === "overview" ? "Our Solar System" : (object?.name ?? "Space")}
        </h1>
        <p>
          {mode === "overview"
            ? "Sizes exaggerated · Distances compressed"
            : "Physical scale · Modeled circular orbits"}
        </p>
        {assetIssue && (
          <button
            className="asset-notice"
            onClick={() =>
              useExplorationStore.getState().setInformationOpen(true)
            }
          >
            <Info size={12} />
            {selectedId === "sun"
              ? "Modeled photosphere · Procedural granulation"
              : selectedId === "venus" ? "Reconstructed visible-light clouds"
              : selectedId === "neptune" ? "Hubble mosaic · Reconstructed polar fill"
              : imagery?.state === "missing"
                ? "Verified imagery unavailable"
                : "Imagery has coverage or loading limits"}
            <span>View sources</span>
          </button>
        )}
      </div>
      <div className="interaction-hint">
        <MousePointer2 size={12} />
        <span className="desktop-hint">
          Drag to look<span>·</span>Scroll to approach
        </span>
        <span className="touch-hint">
          Drag to look<span>·</span>Pinch to approach
        </span>
      </div>
      <div className="model-context">
        ILLUSTRATIVE ORBITS<span>·</span>NOT AN EPHEMERIS
      </div>
    </>
  );
}
