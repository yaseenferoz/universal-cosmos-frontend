import type { CatalogueFile } from "../../types/celestial";

/** Where each loaded catalogue file came from, for provenance notes in the interface. */
export type CatalogueOrigin = "backend" | "bundled";

const origins = new Map<CatalogueFile, CatalogueOrigin>();

export function recordCatalogueOrigin(path: CatalogueFile, origin: CatalogueOrigin): void {
  origins.set(path, origin);
}

/** Files loaded from the site's bundled copies although HTTP mode asked the backend. */
export function bundledFallbacks(): CatalogueFile[] {
  return [...origins].filter(([, origin]) => origin === "bundled").map(([path]) => path);
}
