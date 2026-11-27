import { useEffect, useState } from "react";
import { loadDeepSky, type DeepSkyCatalog } from "../../data/deep/deepSky";

const BASE = import.meta.env.BASE_URL ?? "/";

/** The shared, lazily loaded galaxy and nebula catalogue (null while loading or unavailable). */
export function useDeepSkyCatalog(): DeepSkyCatalog | null {
  const [catalog, setCatalog] = useState<DeepSkyCatalog | null>(null);
  useEffect(() => {
    let live = true;
    loadDeepSky(BASE).then((value) => { if (live) setCatalog(value); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return catalog;
}
