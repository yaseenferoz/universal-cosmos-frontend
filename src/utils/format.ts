export function formatSimulationDate(
  days: number,
  epoch = "2026-01-01T00:00:00.000Z",
): string {
  const date = new Date(Date.parse(epoch) + days * 86_400_000);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatSimulationClock(
  days: number,
  epoch = "2026-01-01T00:00:00.000Z",
  showSeconds = false,
): string {
  const date = new Date(Date.parse(epoch) + days * 86_400_000);
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    ...(showSeconds ? { second: "2-digit" as const } : {}),
    timeZone: "UTC",
    hourCycle: "h23",
  }).format(date);
}
