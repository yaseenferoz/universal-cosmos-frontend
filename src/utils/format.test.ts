import { describe, expect, it } from "vitest";
import {
  formatNumber,
  formatSimulationClock,
  formatSimulationDate,
} from "./format";

describe("display formatting", () => {
  it("uses a stable UTC epoch across local timezones", () => {
    expect(formatSimulationDate(0)).toBe("01 Jan 2026");
    expect(formatSimulationDate(31)).toBe("01 Feb 2026");
    expect(formatSimulationDate(-1)).toBe("31 Dec 2025");
  });
  it("formats physical values without losing requested precision", () => {
    expect(formatNumber(12756)).toBe("12,756");
    expect(formatNumber(9.81, 2)).toBe("9.81");
  });
  it("uses the configured visualization epoch for the clock", () => {
    expect(formatSimulationClock(0.5)).toBe("12:00");
    expect(formatSimulationClock(1, "2026-05-04T18:30:00.000Z")).toBe("18:30");
  });
});
