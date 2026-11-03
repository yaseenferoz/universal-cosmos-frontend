import { useEffect } from "react";
import { useExplorationStore } from "../stores/explorationStore";
import { useLunarStore } from "../stores/lunarStore";

export function useExplorationShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = useExplorationStore.getState();
      if (event.key === "Escape") {
        if (state.dialog) state.openDialog(null);
        else if (state.mobileNavigationOpen)
          useExplorationStore.setState({ mobileNavigationOpen: false });
        else if (
          !["orbit", "error"].includes(useLunarStore.getState().telemetry.phase)
        )
          useLunarStore.getState().returnToOrbit();
        else state.clearSelection();
        return;
      }
      const target = event.target;
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      if (event.key === "/" && !state.dialog) {
        event.preventDefault();
        state.openDialog("search");
      }
      if (event.key === "?" && !state.dialog) {
        event.preventDefault();
        state.openDialog("help");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
