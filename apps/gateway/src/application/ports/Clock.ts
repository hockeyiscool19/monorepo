/**
 * Outbound port: the time source. Use cases measure latency and adapters expire caches through
 * it, so tests can drive time deterministically. `now()` never fails.
 */
export interface Clock {
  /** Milliseconds since the Unix epoch. */
  now(): number;
}
