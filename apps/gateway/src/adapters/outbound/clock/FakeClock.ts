import type { Clock } from "../../../application/ports/Clock.js";

/** A clock that only moves when told to; for tests of caching and latency. */
export class FakeClock implements Clock {
  private current: number;

  constructor(startMs = 1_700_000_000_000) {
    this.current = startMs;
  }

  now(): number {
    return this.current;
  }

  /** Move time forward by `ms`. */
  advance(ms: number): void {
    this.current += ms;
  }
}
