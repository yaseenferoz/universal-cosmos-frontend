export class CelestialApiError extends Error {
  readonly status: number | null;

  constructor(
    message: string,
    status: number | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CelestialApiError";
    this.status = status;
  }
}

export function assertActive(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

export function normalizeEpoch(isoDate: string): string {
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp))
    throw new CelestialApiError("Enter a valid ephemeris date.");
  return new Date(timestamp).toISOString();
}
