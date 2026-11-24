import { SIMULATION_EPOCH } from "../data/catalog";

const MILLISECONDS_PER_DAY = 86_400_000;
export const REAL_TIME_DAYS_PER_SECOND = 1 / 86_400;

/** The same UTC instant is used by clock labels and time-dependent orientation. */
export function simulationUtcMs(days: number, epoch = SIMULATION_EPOCH): number {
  return Date.parse(epoch) + days * MILLISECONDS_PER_DAY;
}

/** UTC elapsed days from the visual orbit model's fixed phase reference. */
export function daysSinceModelEpoch(nowMs: number, epoch = SIMULATION_EPOCH): number {
  return (nowMs - Date.parse(epoch)) / MILLISECONDS_PER_DAY;
}

export function advanceSimulationDays(
  days: number, deltaSeconds: number, playing: boolean, speed: number,
  nowMs: number, epoch = SIMULATION_EPOCH,
): number {
  if (!playing) return days;
  if (speed === REAL_TIME_DAYS_PER_SECOND) return daysSinceModelEpoch(nowMs, epoch);
  return Math.max(-365_250, Math.min(365_250, days + deltaSeconds * speed));
}
