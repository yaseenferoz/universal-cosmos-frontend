import { beforeEach, describe, expect, it } from "vitest";
import { useExplorationStore } from "./explorationStore";

const initialState = useExplorationStore.getState();
beforeEach(() => useExplorationStore.setState(initialState, true));
describe("exploration state", () => {
  it("repeated object targeting requests a new flight and closes dialogs", () => {
    const store = useExplorationStore.getState();
    store.openDialog("search");
    store.selectObject("earth");
    store.selectObject("earth");
    expect(useExplorationStore.getState()).toMatchObject({
      selectedId: "earth",
      focusRequest: 2,
      informationOpen: false,
      dialog: null,
    });
  });
  it("bounds simulation speed and star density including invalid numeric input", () => {
    const store = useExplorationStore.getState();
    store.setSpeed(Infinity);
    store.setStarDensity(-4);
    expect(useExplorationStore.getState()).toMatchObject({
      speed: 0.01,
      starDensity: 0.25,
    });
  });
  it("resets the view independently of the simulation clock", () => {
    useExplorationStore.setState({ simulationDays: 42, playing: false });
    useExplorationStore.getState().resetView();
    expect(useExplorationStore.getState()).toMatchObject({
      selectedId: "moon",
      simulationDays: 42,
      playing: false,
      resetViewRequest: 1,
    });
    useExplorationStore.getState().resetTime();
    expect(useExplorationStore.getState()).toMatchObject({
      simulationDays: 0,
      resetTimeRequest: 1,
    });
  });
  it("keeps exploration and scaled overview distinct while preserving the clock", () => {
    const store = useExplorationStore.getState();
    useExplorationStore.setState({ simulationDays: 23 });
    store.setViewMode("overview");
    expect(useExplorationStore.getState()).toMatchObject({
      viewMode: "overview",
      selectedId: null,
      simulationDays: 23,
    });
    store.selectObject("saturn");
    expect(useExplorationStore.getState()).toMatchObject({
      viewMode: "exploration",
      selectedId: "saturn",
      simulationDays: 23,
      informationOpen: false,
    });
    store.resetView();
    expect(useExplorationStore.getState().viewMode).toBe("exploration");
  });
  it("remembers the primary world when focus is released or overview is opened", () => {
    const store = useExplorationStore.getState();
    store.selectObject("saturn");
    store.clearSelection();
    store.resetView();
    expect(useExplorationStore.getState().selectedId).toBe("saturn");
    store.setViewMode("overview");
    store.setViewMode("exploration");
    expect(useExplorationStore.getState()).toMatchObject({
      selectedId: "saturn",
      viewMode: "exploration",
      lastTargetId: "saturn",
    });
  });
});
