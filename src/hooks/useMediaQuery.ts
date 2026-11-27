import { useSyncExternalStore } from "react";

/** Phones in either orientation: narrow portrait screens or short landscape ones. */
export const COMPACT_SCREEN_QUERY = "(max-width: 700px), (max-height: 550px)";

/** Whether a CSS media query matches, kept in sync as the window resizes or rotates. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}
