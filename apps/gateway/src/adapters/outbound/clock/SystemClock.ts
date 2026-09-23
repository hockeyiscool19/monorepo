import type { Clock } from "../../../application/ports/Clock.js";

/** The wall clock. */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}
