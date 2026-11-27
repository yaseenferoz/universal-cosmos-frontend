import { useEffect, useState } from "react";
import { loadSpectralTypes, loadStarCatalog, type StarCatalog } from "../../data/stars/starCatalog";


/** The shared, lazily loaded star catalogue (null while loading or unavailable). */
export function useStarCatalog(): StarCatalog | null {
  const [catalog, setCatalog] = useState<StarCatalog | null>(null);
  useEffect(() => {
    let live = true;
    loadStarCatalog().then((value) => { if (live) setCatalog(value); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return catalog;
}

/** Spectral types, loaded on first use. */
export function useSpectralTypes(enabled: boolean): string[] | null {
  const [types, setTypes] = useState<string[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadSpectralTypes().then((value) => { if (live) setTypes(value); }).catch(() => undefined);
    return () => { live = false; };
  }, [enabled]);
  return types;
}
