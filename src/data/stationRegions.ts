/** Named targets for the illustrative ISS ground-track search, not live passes. */
export interface StationRegion { id: string; name: string; latitudeDeg: number; longitudeDeg: number }
export const stationRegions: readonly StationRegion[] = [
  { id: "africa", name: "Central Africa", latitudeDeg: 0, longitudeDeg: 20 },
  { id: "sahara", name: "Sahara", latitudeDeg: 23, longitudeDeg: 12 },
  { id: "mediterranean", name: "Mediterranean", latitudeDeg: 36, longitudeDeg: 16 },
  { id: "india", name: "India", latitudeDeg: 20, longitudeDeg: 78 },
  { id: "australia", name: "Australia", latitudeDeg: -25, longitudeDeg: 134 },
  { id: "pacific", name: "Pacific Ocean", latitudeDeg: 0, longitudeDeg: -150 },
  { id: "south_america", name: "South America", latitudeDeg: -15, longitudeDeg: -60 },
  { id: "north_america", name: "North America", latitudeDeg: 38, longitudeDeg: -100 },
];
