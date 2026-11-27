import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { deepDisplayName, MILKY_WAY_REF, searchDeepSky, type DeepRef, type DeepSkyCatalog } from "../../data/deep/deepSky";
import { galaxyDistancePc, morphologyLabel } from "../../data/deep/galaxies";
import { NEBULA_KIND_LABEL } from "../../data/deep/nebulae";
import { searchPlanets } from "../../data/stars/exoplanets";
import { searchStars, starDesignations, starDisplayName, starDistancePc, type StarCatalog } from "../../data/stars/starCatalog";
import { LY_PER_PC } from "../../engine/stars/stellarPhysics";
import { useExplorationStore } from "../../stores/explorationStore";
import { useStellarStore } from "../../stores/stellarStore";
import { Modal } from "../panels/Modal";
import { distanceText } from "./format";
import { useDeepSkyCatalog } from "./useDeepSkyCatalog";
import { useStarCatalog } from "./useStarCatalog";

const STAR_SUGGESTIONS = ["Proxima Centauri", "TRAPPIST-1", "Sirius", "51 Pegasi", "Betelgeuse", "HR 8799"];
const GALAXY_SUGGESTIONS = ["Andromeda Galaxy", "Large Magellanic Cloud", "Triangulum Galaxy", "Whirlpool Galaxy", "Sombrero Galaxy", "Centaurus A", "M 87"];
const NEBULA_SUGGESTIONS = ["Orion Nebula", "Crab Nebula", "Ring Nebula", "Helix Nebula", "Eagle Nebula", "Lagoon Nebula", "Carina Nebula", "Cygnus Loop", "Tarantula Nebula", "Horsehead Nebula"];

/** Which suggestions to offer first (the navigation rail opens the dialog on a collection). */
export type SearchFocus = "stars" | "galaxies" | "nebulae";

type Result = { kind: "star"; star: number; planet: number | null } | { kind: "deep"; ref: DeepRef };

function suggestions(stars: StarCatalog | null, deep: DeepSkyCatalog | null, focus: SearchFocus): Result[] {
  const starResults: Result[] = stars ? STAR_SUGGESTIONS.flatMap((name) => searchStars(stars, name, 1)).map((star) => ({ kind: "star", star, planet: null })) : [];
  const pick = (names: string[]) => deep ? names.flatMap((name) => searchDeepSky(deep, name, 1)).map((ref): Result => ({ kind: "deep", ref })) : [];
  const galaxies: Result[] = [{ kind: "deep", ref: MILKY_WAY_REF }, ...pick(GALAXY_SUGGESTIONS)];
  const nebulae = pick(NEBULA_SUGGESTIONS);
  if (focus === "galaxies") return [...galaxies, ...nebulae.slice(0, 3), ...starResults.slice(0, 2)];
  if (focus === "nebulae") return [...nebulae, ...galaxies.slice(0, 3), ...starResults.slice(0, 2)];
  return [...starResults, ...galaxies.slice(0, 4), ...nebulae.slice(0, 4)];
}

function deepDetails(catalog: DeepSkyCatalog | null, ref: DeepRef): { subtitle: string; distance: string } {
  if (ref.kind === "milky-way") return { subtitle: "Our Galaxy · barred spiral", distance: "We are here" };
  if (!catalog) return { subtitle: "", distance: "" };
  if (ref.kind === "galaxy") {
    const g = catalog.galaxies;
    return {
      subtitle: [morphologyLabel(g.tType[ref.index], g.flags[ref.index]), ...g.names[ref.index].slice(1, 2)].join(" · "),
      distance: distanceText(galaxyDistancePc(g, ref.index)),
    };
  }
  const nebula = catalog.nebulae.nebulae[ref.index];
  return { subtitle: [NEBULA_KIND_LABEL[nebula.kind], ...nebula.names.slice(1, 2)].join(" · "), distance: distanceText(nebula.distancePc) };
}

export function StarSearchDialog() {
  const [query, setQuery] = useState("");
  const catalog = useStarCatalog();
  const deep = useDeepSkyCatalog();
  const focus = useExplorationStore((s) => (s.collection === "Galaxies" || s.collection === "Deep space" ? "galaxies" : s.collection === "Nebulae" ? "nebulae" : "stars"));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const results = useMemo<Result[]>(() => {
    if (query.trim().length < 2) return suggestions(catalog, deep, focus);
    const needle = query.trim().toLowerCase();
    // A query that names a planet ("TRAPPIST-1 e") lists the planet first.
    const planets: Result[] = catalog ? searchPlanets(catalog.systems, query, 6).map(([star, planet]) => ({ kind: "star", star, planet })) : [];
    const exact = planets.filter((p) => p.kind === "star" && p.planet !== null && catalog?.systems.get(p.star)?.planets[p.planet]?.name.toLowerCase() === needle);
    const stars: Result[] = catalog ? searchStars(catalog, query, 8).map((star) => ({ kind: "star", star, planet: null })) : [];
    const deepResults: Result[] = deep ? searchDeepSky(deep, query, 8).map((ref) => ({ kind: "deep", ref })) : [];
    // Exact deep-sky names ("M 31", "Orion Nebula") outrank partial star matches.
    const deepFirst = deepResults.filter((r) => r.kind === "deep" && deepDisplayName(deep, r.ref).toLowerCase().startsWith(needle));
    return [...exact, ...deepFirst, ...stars, ...deepResults.filter((r) => !deepFirst.includes(r)), ...planets.filter((p) => !exact.includes(p))].slice(0, 16);
  }, [catalog, deep, query, focus]);
  const choose = (result: Result) => {
    if (result.kind === "star") useStellarStore.getState().flyTo(result.star, result.planet);
    else useStellarStore.getState().flyToDeep(result.ref, result.ref.kind === "milky-way" ? 60_000 : undefined);
    useExplorationStore.getState().openDialog(null);
  };
  const counts = [
    catalog && `${catalog.count.toLocaleString("en-US")} STARS`,
    catalog && `${(catalog.exoplanets?.planetCount ?? 0).toLocaleString("en-US")} PLANETS`,
    deep && `${deep.galaxies.count.toLocaleString("en-US")} GALAXIES`,
    deep && `${deep.nebulae.nebulae.length.toLocaleString("en-US")} NEBULAE`,
  ].filter(Boolean);
  return (
    <Modal title="Where to?" eyebrow={counts.length ? `SEARCH ${counts.join(" · ")}` : "SEARCH THE UNIVERSE"} className="search-dialog">
      <form onSubmit={(event) => { event.preventDefault(); if (results[0] !== undefined) choose(results[0]); }}>
        <label className="search-input">
          <Search size={16} aria-hidden="true" />
          <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Sirius, TRAPPIST-1 e, Andromeda, M 42, Crab Nebula…" aria-label="Search stars, planets, galaxies and nebulae" />
        </label>
      </form>
      <div className="search-results" aria-label="Search results" role="listbox">
        {!catalog && !deep ? <p>Loading the catalogues…</p> : results.length === 0 ? <p>No catalogued star, planet, galaxy or nebula matches.</p> : results.map((result) => {
          if (result.kind === "deep") {
            const { subtitle, distance } = deepDetails(deep, result.ref);
            return (
              <button key={`deep:${result.ref.kind}:${result.ref.index}`} role="option" aria-selected={false} onClick={() => choose(result)}>
                <span>
                  <strong>{deepDisplayName(deep, result.ref)}</strong>
                  <small>{subtitle}</small>
                </span>
                <small>{distance}</small>
              </button>
            );
          }
          const system = catalog?.systems.get(result.star);
          const planet = result.planet !== null ? system?.planets[result.planet] : undefined;
          const distance = result.star === 0 ? "Our star" : catalog ? `${(starDistancePc(catalog, result.star) * LY_PER_PC).toFixed(1)} ly` : "";
          return (
            <button key={`${result.star}:${result.planet ?? ""}`} role="option" aria-selected={false} onClick={() => choose(result)}>
              <span>
                <strong>{planet ? planet.name : catalog ? starDisplayName(catalog, result.star) : ""}</strong>
                <small>
                  {planet && catalog ? `Planet of ${starDisplayName(catalog, result.star)}` : catalog ? starDesignations(catalog, result.star).slice(1, 3).join(" · ") : ""}
                  {!planet && system && ` · ${system.planets.length} planet${system.planets.length === 1 ? "" : "s"}`}
                </small>
              </span>
              <small>{distance}</small>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
