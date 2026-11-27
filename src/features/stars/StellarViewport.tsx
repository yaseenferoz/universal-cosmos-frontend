import { useEffect, useRef } from "react";
import type { StellarEngine } from "../../engine/stars/StellarEngine";
import { loadDeepSky } from "../../data/deep/deepSky";
import { loadStarCatalog } from "../../data/stars/starCatalog";
import { useExplorationStore } from "../../stores/explorationStore";
import { useLunarStore } from "../../stores/lunarStore";
import { TIME_RATES, useStellarStore } from "../../stores/stellarStore";

/** Mounts the interstellar engine; React only sends commands and receives throttled telemetry. */
export function StellarViewport() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let engine: StellarEngine | undefined;
    let unsubscribe: (() => void) | undefined;
    let unsubscribeQuality: (() => void) | undefined;
    let unsubscribeDescent: (() => void) | undefined;
    let cancelled = false;
    useStellarStore.setState({ status: "loading", error: null, telemetry: null, deepStatus: "loading" });
    // Galaxies and nebulae load alongside; the star map does not wait for them.
    const deepSky = loadDeepSky();
    Promise.all([import("../../engine/stars/StellarEngine"), loadStarCatalog()])
      .then(([module, catalog]) => {
        if (cancelled) return;
        engine = new module.StellarEngine(element, {
          catalog,
          quality: useExplorationStore.getState().quality,
          onSelect: (index, planet) => useStellarStore.getState().select(index, planet),
          onSelectDeep: (ref) => useStellarStore.getState().selectDeep(ref),
          onTelemetry: (telemetry) => { if (!cancelled) useStellarStore.setState({ telemetry }); },
          onDescentTelemetry: (telemetry) => { if (!cancelled) useLunarStore.setState({ telemetry }); },
          onReady: () => { if (!cancelled) useStellarStore.setState({ status: "ready" }); },
        });
        if (import.meta.env.DEV) Reflect.set(window, "__stellar", engine);
        const state = useStellarStore.getState();
        engine.setMagnitudeLimit(state.magnitudeLimit);
        engine.setHostMarkers(state.showPlanetHosts);
        engine.setTimeRate(TIME_RATES[state.timeRate].daysPerSecond);
        engine.select(state.selected, state.selectedPlanet);
        engine.selectDeep(state.selectedDeep);
        // A deep-sky flight requested before the view opened (e.g. from the navigation rail).
        if (state.deepFlyTarget) {
          engine.flyToDeep(state.deepFlyTarget.ref, state.deepFlyTarget.distancePc);
          useStellarStore.setState({ deepFlyTarget: null });
        }
        deepSky
          .then((catalog) => {
            if (cancelled || !engine) return;
            engine.setDeepSky(catalog);
            useStellarStore.setState({ deepStatus: "ready" });
          })
          .catch((reason: unknown) => {
            if (cancelled) return;
            console.warn("Galaxies and nebulae unavailable:", reason);
            useStellarStore.setState({ deepStatus: "error" });
          });
        unsubscribe = useStellarStore.subscribe((next, previous) => {
          if (!engine) return;
          if (next.selected !== previous.selected || next.selectedPlanet !== previous.selectedPlanet) engine.select(next.selected, next.selectedPlanet);
          if (next.magnitudeLimit !== previous.magnitudeLimit) engine.setMagnitudeLimit(next.magnitudeLimit);
          if (next.showPlanetHosts !== previous.showPlanetHosts) engine.setHostMarkers(next.showPlanetHosts);
          if (next.timeRate !== previous.timeRate) engine.setTimeRate(TIME_RATES[next.timeRate].daysPerSecond);
          if (next.timeResetRequest !== previous.timeResetRequest) engine.resetTime();
          if (next.faceStarRequest !== previous.faceStarRequest) engine.faceStar();
          if (next.flyRequest !== previous.flyRequest && next.flyTarget !== null) engine.flyTo(next.flyTarget.star, next.flyTarget.planet);
          if (next.selectedDeep !== previous.selectedDeep) engine.selectDeep(next.selectedDeep);
          if (next.deepFlyRequest !== previous.deepFlyRequest && next.deepFlyTarget !== null) {
            engine.flyToDeep(next.deepFlyTarget.ref, next.deepFlyTarget.distancePc);
            useStellarStore.setState({ deepFlyTarget: null });
          }
        });
        engine.setEyeHeight(useLunarStore.getState().eyeHeightM);
        // Descent commands share the Solar System's store (one exploration at a time).
        unsubscribeDescent = useLunarStore.subscribe((next, previous) => {
          if (!engine) return;
          if (next.descentRequest !== previous.descentRequest) engine.beginDescent();
          if (next.returnRequest !== previous.returnRequest) engine.returnFromSurface();
          if (next.eyeHeightM !== previous.eyeHeightM) engine.setEyeHeight(next.eyeHeightM);
          if (next.movement !== previous.movement) engine.setSurfaceMovement(next.movement.forward, next.movement.right);
        });
        unsubscribeQuality = useExplorationStore.subscribe((next, previous) => {
          if (engine && next.quality !== previous.quality) engine.setQuality(next.quality);
        });
      })
      .catch((reason: unknown) => {
        if (!cancelled) useStellarStore.setState({ status: "error", error: reason instanceof Error ? reason.message : String(reason) });
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
      unsubscribeQuality?.();
      unsubscribeDescent?.();
      engine?.dispose();
      useLunarStore.getState().resetSession();
      if (import.meta.env.DEV) Reflect.deleteProperty(window, "__stellar");
    };
  }, []);
  return <div ref={container} className="universe-viewport" role="region" aria-label="Interstellar exploration viewport" />;
}
