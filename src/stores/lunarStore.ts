import { create } from "zustand";
import { initialLunarTelemetry, type LunarTelemetry } from "../types/lunar";

interface LunarState {
  telemetry: LunarTelemetry;
  descentRequest: number;
  returnRequest: number;
  eyeHeightM: number;
  movement: { forward: number; right: number };
  beginDescent: () => void;
  returnToOrbit: () => void;
  setEyeHeight: (height: number) => void;
  setMovement: (forward: number, right: number) => void;
  resetSession: () => void;
}

export const useLunarStore = create<LunarState>((set) => ({
  telemetry: initialLunarTelemetry,
  descentRequest: 0,
  returnRequest: 0,
  eyeHeightM: 1.7,
  movement: { forward: 0, right: 0 },
  beginDescent: () =>
    set((state) => ({ descentRequest: state.descentRequest + 1 })),
  returnToOrbit: () =>
    set((state) => ({
      returnRequest: state.returnRequest + 1,
      movement: { forward: 0, right: 0 },
    })),
  setEyeHeight: (height) =>
    set({
      eyeHeightM: Number.isFinite(height)
        ? Math.max(0.8, Math.min(2.5, height))
        : 1.7,
    }),
  setMovement: (forward, right) =>
    set({
      movement: {
        forward: Math.max(-1, Math.min(1, forward || 0)),
        right: Math.max(-1, Math.min(1, right || 0)),
      },
    }),
  resetSession: () =>
    set({
      telemetry: initialLunarTelemetry,
      movement: { forward: 0, right: 0 },
    }),
}));
