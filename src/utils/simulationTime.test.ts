import { describe, expect, it } from "vitest";
import { advanceSimulationDays, daysSinceModelEpoch, REAL_TIME_DAYS_PER_SECOND } from "./simulationTime";

describe("model clock", () => {
  const epoch = "2026-01-01T00:00:00.000Z";
  const noon = Date.parse("2026-01-02T12:00:00.000Z");

  it("uses the actual UTC instant for real-time playback, including after a hidden tab", () => {
    expect(daysSinceModelEpoch(noon, epoch)).toBe(1.5);
    expect(advanceSimulationDays(0, 0.016, true, REAL_TIME_DAYS_PER_SECOND, noon, epoch)).toBe(1.5);
    expect(advanceSimulationDays(0, 0.1, true, REAL_TIME_DAYS_PER_SECOND, noon + 3_600_000, epoch)).toBeCloseTo(1.5 + 1 / 24);
  });

  it("holds a paused clock and preserves deliberate accelerated playback", () => {
    expect(advanceSimulationDays(5, 1, false, REAL_TIME_DAYS_PER_SECOND, noon, epoch)).toBe(5);
    expect(advanceSimulationDays(5, 2, true, 0.1, noon, epoch)).toBe(5.2);
  });
});
