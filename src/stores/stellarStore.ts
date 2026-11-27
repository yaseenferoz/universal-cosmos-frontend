import { create } from "zustand";
import type { DeepRef } from "../data/deep/deepSky";
import type { StellarTelemetry } from "../engine/stars/StellarEngine";

/** Simulated days per real second; the first entry is real time. */
export const TIME_RATES = [
  { label: "Real time", daysPerSecond: 1 / 86400 },
  { label: "1 day / s", daysPerSecond: 1 },
  { label: "1 week / s", daysPerSecond: 7 },
  { label: "1 month / s", daysPerSecond: 30.44 },
  { label: "1 year / s", daysPerSecond: 365.25 },
] as const;

/** React-side state of the interstellar view. The engine owns per-frame state. */
interface StellarState {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  /** Galaxy and nebula catalogue (optional: the star map works without it). */
  deepStatus: "idle" | "loading" | "ready" | "error";
  selected: number | null;
  /** Planet index within the selected star's system. */
  selectedPlanet: number | null;
  /** Selected galaxy, nebula or the Milky Way (exclusive with a selected star). */
  selectedDeep: DeepRef | null;
  telemetry: StellarTelemetry | null;
  /** Faintest apparent magnitude drawn (naked eye ≈ 6.5). */
  magnitudeLimit: number;
  /** Rings around stars with known planets. */
  showPlanetHosts: boolean;
  /** Index into TIME_RATES. */
  timeRate: number;
  /** Increments to ask the engine to return planet positions to the present. */
  timeResetRequest: number;
  /** Increments to turn the surface explorer toward the host star. */
  faceStarRequest: number;
  flyRequest: number;
  flyTarget: { star: number; planet: number | null } | null;
  deepFlyRequest: number;
  /** A deep-sky flight not yet handed to the engine (it may not be mounted yet). */
  deepFlyTarget: { ref: DeepRef; distancePc?: number } | null;
  select: (index: number | null, planet?: number | null) => void;
  selectDeep: (ref: DeepRef | null) => void;
  flyTo: (index: number, planet?: number | null) => void;
  /** Fly to a galaxy, nebula or the Milky Way (optionally to a given distance, parsecs). */
  flyToDeep: (ref: DeepRef, distancePc?: number) => void;
  setMagnitudeLimit: (limit: number) => void;
  setShowPlanetHosts: (visible: boolean) => void;
  setTimeRate: (rate: number) => void;
  resetTime: () => void;
  faceStar: () => void;
}

export const useStellarStore = create<StellarState>((set) => ({
  status: "idle",
  error: null,
  deepStatus: "idle",
  selected: null,
  selectedPlanet: null,
  selectedDeep: null,
  telemetry: null,
  magnitudeLimit: 6.5,
  showPlanetHosts: false,
  timeRate: 0,
  timeResetRequest: 0,
  faceStarRequest: 0,
  flyRequest: 0,
  flyTarget: null,
  deepFlyRequest: 0,
  deepFlyTarget: null,
  select: (selected, planet = null) => set((state) => ({
    selected, selectedPlanet: selected === null ? null : planet, selectedDeep: selected === null ? state.selectedDeep : null,
  })),
  selectDeep: (selectedDeep) => set((state) => ({
    selectedDeep, selected: selectedDeep ? null : state.selected, selectedPlanet: selectedDeep ? null : state.selectedPlanet,
  })),
  flyTo: (index, planet = null) => set((state) => ({
    selected: index, selectedPlanet: planet, selectedDeep: null, flyTarget: { star: index, planet }, flyRequest: state.flyRequest + 1,
  })),
  flyToDeep: (ref, distancePc) => set((state) => ({
    selectedDeep: ref, selected: null, selectedPlanet: null, deepFlyTarget: { ref, distancePc }, deepFlyRequest: state.deepFlyRequest + 1,
  })),
  setMagnitudeLimit: (limit) => set({ magnitudeLimit: Number.isFinite(limit) ? Math.min(12, Math.max(2, limit)) : 6.5 }),
  setShowPlanetHosts: (showPlanetHosts) => set({ showPlanetHosts }),
  setTimeRate: (rate) => set({ timeRate: Number.isInteger(rate) && rate >= 0 && rate < TIME_RATES.length ? rate : 0 }),
  resetTime: () => set((state) => ({ timeRate: 0, timeResetRequest: state.timeResetRequest + 1 })),
  faceStar: () => set((state) => ({ faceStarRequest: state.faceStarRequest + 1 })),
}));
