import { useEffect, useRef } from "react";
import type { UniverseEngine } from "../../engine/core/UniverseEngine";
import { celestialService } from "../../services/api";
import { useExplorationStore } from "../../stores/explorationStore";
import { useLunarStore } from "../../stores/lunarStore";
import { useRenderingStore } from "../../stores/renderingStore";

/** The engine, not React, owns frame-by-frame state. This bridge only sends commands. */
export function UniverseViewport() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const controller = new AbortController();
    let engine: UniverseEngine | undefined;
    let unsubscribe: (() => void) | undefined;
    let unsubscribeLunar: (() => void) | undefined;
    let unsubscribeRendering: (() => void) | undefined;
    useLunarStore.getState().resetSession();
    useRenderingStore.setState({ diagnostics: null });
    useExplorationStore.setState({ status: "loading", error: null });
    const fail = (reason: unknown) => {
      if (controller.signal.aborted) return;
      useExplorationStore.setState({
        status: "error",
        error: reason instanceof Error ? reason.message : String(reason),
      });
    };
    Promise.all([
      import("../../engine/core/UniverseEngine"),
      celestialService.getObjects({ signal: controller.signal }),
      celestialService.getSystem("solar", { signal: controller.signal }),
    ])
      .then(([module, objects, system]) => {
        if (controller.signal.aborted) return;
        if (
          !system.objectIds.every((id) =>
            objects.some((object) => object.id === id),
          )
        )
          throw new Error(
            "The Solar System catalog is incomplete. Check the data source.",
          );
        useExplorationStore.setState({
          objects,
          simulationEpoch: system.visualizationEpoch,
        });
        engine = new module.UniverseEngine(element, {
          objects,
          onSelect: (id) => useExplorationStore.getState().selectObject(id),
          onTelemetry: (telemetry) =>
            useExplorationStore.setState({
              simulationDays: telemetry.simulationDays,
              fps: telemetry.fps,
              cameraDistance: telemetry.cameraDistance,
              effectiveQuality: telemetry.quality,
            }),
          onReady: () => {
            if (!controller.signal.aborted)
              useExplorationStore.setState({ status: "ready" });
          },
          onError: fail,
          onLunarTelemetry: (telemetry) => {
            if (!controller.signal.aborted)
              useLunarStore.setState({ telemetry });
          },
          onSolarTelemetry: (telemetry) => {
            if (!controller.signal.aborted)
              useRenderingStore.setState({ telemetry });
          },
          onDiagnostics: (diagnostics) => {
            if (!controller.signal.aborted)
              useRenderingStore.setState({ diagnostics });
          },
          onAssetStatus: (imageryStatus) => {
            if (!controller.signal.aborted)
              useExplorationStore.setState({ imageryStatus });
          },
        });
        const initial = useExplorationStore.getState();
        engine.setPlayback(initial.playing, initial.speed);
        engine.setTime(initial.simulationDays);
        engine.setQuality(initial.quality);
        engine.setStarDensity(initial.starDensity);
        engine.setOrbitsVisible(initial.showOrbits);
        engine.setLabelsVisible(initial.showLabels);
        engine.setViewMode(initial.viewMode);
        if (initial.viewMode === "exploration" && initial.selectedId)
          engine.focusObject(initial.selectedId, true);
        engine.setCameraMode(initial.cameraMode);
        engine.setObserverEyeHeight(useLunarStore.getState().eyeHeightM);
        const imaging = useRenderingStore.getState();
        engine.setAutomaticExposure(imaging.automaticExposure);
        engine.setExposureEv(imaging.exposureEv);
        engine.setSolarCorona(imaging.corona);
        engine.setSolarFilter(imaging.solarFilter);
        engine.setBloomStrength(imaging.bloomStrength);
        engine.setDiagnosticsEnabled(imaging.diagnosticsEnabled);
        unsubscribeRendering = useRenderingStore.subscribe(
          (state, previous) => {
            if (!engine) return;
            if (state.automaticExposure !== previous.automaticExposure)
              engine.setAutomaticExposure(state.automaticExposure);
            if (state.exposureEv !== previous.exposureEv)
              engine.setExposureEv(state.exposureEv);
            if (state.corona !== previous.corona)
              engine.setSolarCorona(state.corona);
            if (state.solarFilter !== previous.solarFilter)
              engine.setSolarFilter(state.solarFilter);
            if (state.bloomStrength !== previous.bloomStrength)
              engine.setBloomStrength(state.bloomStrength);
            if (state.diagnosticsEnabled !== previous.diagnosticsEnabled)
              engine.setDiagnosticsEnabled(state.diagnosticsEnabled);
            if (state.lookAtSunRequest !== previous.lookAtSunRequest) {
              const mode = useExplorationStore.getState().cameraMode;
              useExplorationStore.getState().setCameraMode("free");
              if (!engine.lookAtSun()) useExplorationStore.getState().setCameraMode(mode);
            }
            if (state.daySideRequest !== previous.daySideRequest) {
              const mode = useExplorationStore.getState().cameraMode;
              useExplorationStore.getState().setCameraMode("orbit");
              if (!engine.goToDaySide()) useExplorationStore.getState().setCameraMode(mode);
            }
            if (state.solarDistanceRequest !== previous.solarDistanceRequest) {
              useExplorationStore.getState().setCameraMode("orbit");
              engine.observeSunAtDistance(state.requestedDistanceAu);
            }
          },
        );
        unsubscribeLunar = useLunarStore.subscribe((state, previous) => {
          if (!engine) return;
          if (state.descentRequest !== previous.descentRequest) {
            // Lunar return restores OrbitControls; keep its UI mode in sync from entry.
            useExplorationStore.getState().setCameraMode("orbit");
            engine.beginLunarDescent();
          }
          if (state.returnRequest !== previous.returnRequest)
            engine.returnFromLunarSurface();
          if (state.eyeHeightM !== previous.eyeHeightM)
            engine.setObserverEyeHeight(state.eyeHeightM);
          if (state.movement !== previous.movement)
            engine.setSurfaceMovement(
              state.movement.forward,
              state.movement.right,
            );
        });
        unsubscribe = useExplorationStore.subscribe((state, previous) => {
          if (!engine) return;
          if (state.viewMode !== previous.viewMode)
            engine.setViewMode(state.viewMode);
          if (
            state.playing !== previous.playing ||
            state.speed !== previous.speed
          )
            engine.setPlayback(state.playing, state.speed);
          if (state.quality !== previous.quality)
            engine.setQuality(state.quality);
          if (state.starDensity !== previous.starDensity)
            engine.setStarDensity(state.starDensity);
          if (state.showOrbits !== previous.showOrbits)
            engine.setOrbitsVisible(state.showOrbits);
          if (state.showLabels !== previous.showLabels)
            engine.setLabelsVisible(state.showLabels);
          if (state.cameraMode !== previous.cameraMode)
            engine.setCameraMode(state.cameraMode);
          if (state.focusRequest !== previous.focusRequest && state.selectedId)
            engine.focusObject(state.selectedId);
          if (previous.selectedId !== null && state.selectedId === null)
            engine.clearFocus();
          if (state.resetViewRequest !== previous.resetViewRequest)
            engine.resetView();
          if (state.resetTimeRequest !== previous.resetTimeRequest)
            engine.setTime(0);
        });
      })
      .catch(fail);
    return () => {
      controller.abort();
      unsubscribe?.();
      unsubscribeLunar?.();
      unsubscribeRendering?.();
      engine?.dispose();
    };
  }, []);
  return (
    <div
      ref={container}
      className="universe-viewport"
      role="region"
      aria-label="Universe exploration viewport"
    />
  );
}
