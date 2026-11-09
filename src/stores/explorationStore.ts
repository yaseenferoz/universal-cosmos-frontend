import { create } from "zustand";
import type { CelestialObject, ObjectId, Quality } from "../types/celestial";
import { SIMULATION_EPOCH } from "../data/catalog";
import { daysSinceModelEpoch, REAL_TIME_DAYS_PER_SECOND } from "../utils/simulationTime";

export const TIME_SPEEDS = [REAL_TIME_DAYS_PER_SECOND, 0.01, 0.1, 1, 10, 100] as const;
export type CameraMode = "orbit" | "free";
export type ViewMode = "exploration" | "overview";
export type DialogName = "search" | "settings" | "help" | "collection" | null;

interface ExplorationState {
  objects: CelestialObject[];
  selectedId: ObjectId | null;
  lastTargetId: ObjectId;
  informationOpen: boolean;
  playing: boolean;
  speed: number;
  simulationDays: number;
  simulationEpoch: string;
  quality: Quality;
  starDensity: number;
  showOrbits: boolean;
  showLabels: boolean;
  cameraMode: CameraMode;
  viewMode: ViewMode;
  imageryStatus: {
    objectId: ObjectId;
    state: string;
    messages: string[];
  } | null;
  dialog: DialogName;
  collection: string;
  mobileNavigationOpen: boolean;
  status: "loading" | "ready" | "error";
  error: string | null;
  fps: number;
  effectiveQuality: string;
  cameraDistance: number;
  focusRequest: number;
  resetViewRequest: number;
  resetTimeRequest: number;
  selectObject: (id: ObjectId) => void;
  clearSelection: () => void;
  setInformationOpen: (open: boolean) => void;
  togglePlayback: () => void;
  setSpeed: (speed: number) => void;
  setQuality: (quality: Quality) => void;
  setStarDensity: (density: number) => void;
  setShowOrbits: (show: boolean) => void;
  setShowLabels: (show: boolean) => void;
  setCameraMode: (mode: CameraMode) => void;
  setViewMode: (mode: ViewMode) => void;
  openDialog: (dialog: DialogName) => void;
  openCollection: (collection: string) => void;
  resetView: () => void;
  resetTime: () => void;
}

export const useExplorationStore = create<ExplorationState>((set) => ({
  objects: [],
  selectedId: "earth",
  lastTargetId: "earth",
  informationOpen: false,
  playing: true,
  speed: REAL_TIME_DAYS_PER_SECOND,
  simulationDays: daysSinceModelEpoch(Date.now()),
  simulationEpoch: SIMULATION_EPOCH,
  quality: "auto",
  starDensity: 1,
  showOrbits: true,
  showLabels: true,
  cameraMode: "orbit",
  viewMode: "exploration",
  imageryStatus: null,
  dialog: null,
  collection: "Stars",
  mobileNavigationOpen: false,
  status: "loading",
  error: null,
  fps: 0,
  effectiveQuality: "auto",
  cameraDistance: 0,
  focusRequest: 0,
  resetViewRequest: 0,
  resetTimeRequest: 0,
  selectObject: (id) =>
    set((state) => ({
      selectedId: id,
      lastTargetId: id,
      informationOpen: state.informationOpen,
      viewMode: "exploration",
      imageryStatus: null,
      focusRequest: state.focusRequest + 1,
      dialog: null,
      mobileNavigationOpen: false,
      cameraMode: "orbit",
    })),
  clearSelection: () => set({ selectedId: null, informationOpen: false }),
  setInformationOpen: (open) => set({ informationOpen: open }),
  togglePlayback: () => set((state) => ({ playing: !state.playing })),
  setSpeed: (speed) =>
    set({
      speed: Number.isFinite(speed)
        ? Math.max(REAL_TIME_DAYS_PER_SECOND, Math.min(100, speed))
        : REAL_TIME_DAYS_PER_SECOND,
    }),
  setQuality: (quality) => set({ quality }),
  setStarDensity: (density) =>
    set({
      starDensity: Number.isFinite(density)
        ? Math.max(0.25, Math.min(2, density))
        : 1,
    }),
  setShowOrbits: (showOrbits) => set({ showOrbits }),
  setShowLabels: (showLabels) => set({ showLabels }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setViewMode: (viewMode) =>
    set((state) => ({
      viewMode,
      selectedId:
        viewMode === "overview"
          ? null
          : (state.selectedId ?? state.lastTargetId),
      informationOpen: false,
      mobileNavigationOpen: false,
      dialog: null,
      cameraMode: "orbit",
      imageryStatus: null,
      resetViewRequest:
        state.viewMode === viewMode
          ? state.resetViewRequest + 1
          : state.resetViewRequest,
    })),
  openDialog: (dialog) => set({ dialog, mobileNavigationOpen: false }),
  openCollection: (collection) =>
    set({ collection, dialog: "collection", mobileNavigationOpen: false }),
  resetView: () =>
    set((state) => ({
      resetViewRequest: state.resetViewRequest + 1,
      selectedId:
        state.viewMode === "overview"
          ? null
          : (state.selectedId ?? state.lastTargetId),
      informationOpen: false,
      cameraMode: "orbit",
      dialog: null,
      mobileNavigationOpen: false,
    })),
  resetTime: () =>
    set((state) => ({
      simulationDays: daysSinceModelEpoch(Date.now(), state.simulationEpoch),
      resetTimeRequest: state.resetTimeRequest + 1,
    })),
}));
