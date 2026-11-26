import type { CelestialObject } from "../../types/celestial";

const normalize = (value: string) => value.normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
  .replace(/\b(moons|satellites)\b/g, "satellite")
  .replace(/\bmoon\b/g, "satellite")
  .replace(/\basteroids\b/g, "asteroid");

/** Parent-qualified searches (e.g. Saturn moons) and ordinary names/categories. */
export function searchCatalog(objects: readonly CelestialObject[], query: string): CelestialObject[] {
  const term = normalize(query);
  const tokens = term.split(/\s+/);
  return objects.filter((object) => {
    const parent = tokens.length > 1 ? objects.find(({ id }) => id === object.parentId)?.name ?? "" : "";
    const searchable = normalize(`${object.name} ${object.category} ${parent}`);
    return tokens.every((token) => searchable.includes(token));
  }).sort((a, b) => rank(a, term) - rank(b, term));
}

/** Exact name, then name prefix, then name substring, then category/parent matches. */
function rank(object: CelestialObject, term: string): number {
  const name = normalize(object.name);
  if (name === term) return 0;
  if (name.startsWith(term)) return 1;
  if (name.includes(term)) return 2;
  return 3;
}
