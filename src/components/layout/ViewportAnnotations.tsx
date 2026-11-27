import { positionModelAt } from "../../engine/ephemeris/positionModel";
import { Info, MoonStar, MousePointer2 } from "lucide-react";
import { useExplorationStore } from "../../stores/explorationStore";
import { useRenderingStore } from "../../stores/renderingStore";

export function ViewportAnnotations() {
  const selectedId = useExplorationStore((s) => s.selectedId);
  const objects = useExplorationStore((s) => s.objects);
  const mode = useExplorationStore((s) => s.viewMode);
  const imagery = useExplorationStore((s) => s.imageryStatus);
  const days = useExplorationStore((s) => s.simulationDays);
  const epoch = useExplorationStore((s) => s.simulationEpoch);
  const object = objects.find((item) => item.id === selectedId);
  const sunlit = useRenderingStore((s) => s.telemetry.targetSunlitFraction);
  const casterId = useRenderingStore((s) => s.telemetry.targetShadowCasterId);
  const caster = casterId ? objects.find((item) => item.id === casterId) : undefined;
  // Explain a dark body: it is inside another body's shadow, not unlit by mistake.
  const eclipsed = mode === "exploration" && object && caster && sunlit < 0.9;
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
            : object
              ? `Physical scale · ${positionModelAt(object, Date.parse(epoch) + days * 86_400_000).caption}`
              : "Physical scale"}
        </p>
        {eclipsed && (
          <p className="eclipse-notice" role="status">
            <MoonStar size={12} aria-hidden="true" />
            {sunlit < 0.01
              ? `In ${caster.name}'s shadow · total eclipse`
              : `Partly in ${caster.name}'s shadow · ${Math.round(sunlit * 100)}% of the Sun visible`}
          </p>
        )}
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
        JPL-BASED POSITIONS<span>·</span>NOT FOR NAVIGATION
      </div>
    </>
  );
}
