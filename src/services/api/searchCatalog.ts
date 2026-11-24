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
  }).sort((a, b) => Number(normalize(b.name) === term) - Number(normalize(a.name) === term));
}
