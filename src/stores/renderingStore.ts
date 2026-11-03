import { create } from "zustand";
import { initialSolarTelemetry, type SolarTelemetry } from "../types/solar";
import type { DiagnosticTelemetry } from "../types/diagnostics";

interface RenderingState {
  automaticExposure: boolean;
  exposureEv: number;
  corona: boolean;
  solarFilter: boolean;
  bloomStrength: number;
  diagnosticsEnabled: boolean;
  diagnostics: DiagnosticTelemetry | null;
  lookAtSunRequest: number;
  daySideRequest: number;
  telemetry: SolarTelemetry;
  solarDistanceRequest: number;
  requestedDistanceAu: number;
  setAutomaticExposure: (automatic: boolean) => void;
  setExposure: (ev: number) => void;
  setCorona: (visible: boolean) => void;
  setSolarFilter: (enabled: boolean) => void;
  setBloomStrength: (strength: number) => void;
  resetExposure: () => void;
  setDiagnosticsEnabled: (enabled: boolean) => void;
  lookAtSun: () => void;
  goToDaySide: () => void;
  observeSunAt: (distanceAu: number) => void;
}

/** Global imaging controls are independent of the lunar navigation session. */
export const useRenderingStore = create<RenderingState>((set) => ({
  automaticExposure: true,
  exposureEv: 0,
  corona: true,
  solarFilter: false,
  bloomStrength: 0.35,
  diagnosticsEnabled: false,
  diagnostics: null,
  lookAtSunRequest: 0,
  daySideRequest: 0,
  telemetry: initialSolarTelemetry,
  solarDistanceRequest: 0,
  requestedDistanceAu: 1,
  setAutomaticExposure: (automaticExposure) =>
    set((state) => ({
      automaticExposure,
      // Freeze the current displayed exposure when switching to manual control.
      exposureEv: automaticExposure ? 0 : state.telemetry.effectiveExposureEv,
    })),
  setExposure: (value) =>
    set((state) => ({
      exposureEv: Number.isFinite(value)
        ? Math.max(
            state.automaticExposure ? -6 : -20,
            Math.min(state.automaticExposure ? 6 : 12, value),
          )
        : 0,
    })),
  setCorona: (corona) => set({ corona }),
  setSolarFilter: (solarFilter) => set({ solarFilter }),
  setBloomStrength: (strength) => set({
    bloomStrength: Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0.35,
  }),
  resetExposure: () => set({ automaticExposure: true, exposureEv: 0, solarFilter: false }),
  setDiagnosticsEnabled: (diagnosticsEnabled) => set({ diagnosticsEnabled }),
  lookAtSun: () => set((state) => ({ lookAtSunRequest: state.lookAtSunRequest + 1 })),
  goToDaySide: () => set((state) => ({ daySideRequest: state.daySideRequest + 1 })),
  observeSunAt: (distanceAu) => {
    if (!Number.isFinite(distanceAu) || distanceAu < 0.006 || distanceAu > 50)
      return;
    set((state) => ({
      requestedDistanceAu: distanceAu,
      solarDistanceRequest: state.solarDistanceRequest + 1,
    }));
  },
}));
