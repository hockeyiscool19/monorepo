/** Log verbosity, lowest to highest severity. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Every valid LOG_LEVEL value. */
export const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

/** Structured fields attached to one log line. */
export type LogFields = Readonly<Record<string, unknown>>;

/** The logging surface adapters use. Domain and application code never log; they return or throw. */
export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

/** A logger that discards everything; the default under test. */
export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** A printable description of an unknown thrown value. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (cause: ${error.cause.message})` : "";
    return `${error.name}: ${error.message}${cause}`;
  }
  return String(error);
}
