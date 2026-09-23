import type { LogFields, Logger, LogLevel } from "./Logger.js";

const RANK: Readonly<Record<LogLevel, number>> = { debug: 10, info: 20, warn: 30, error: 40 };
/** Cloud Logging reads `severity` from JSON lines on stdout. */
const SEVERITY: Readonly<Record<LogLevel, string>> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
};

/** Writes one JSON object per line to stdout, at or above the configured level. */
export class JsonLogger implements Logger {
  private readonly threshold: number;
  private readonly write: (line: string) => void;

  constructor(level: LogLevel, write: (line: string) => void = defaultWrite) {
    this.threshold = RANK[level];
    this.write = write;
  }

  debug(message: string, fields?: LogFields): void {
    this.emit("debug", message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.emit("info", message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.emit("warn", message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.emit("error", message, fields);
  }

  private emit(level: LogLevel, message: string, fields: LogFields = {}): void {
    if (RANK[level] < this.threshold) return;
    this.write(JSON.stringify({ severity: SEVERITY[level], message, ...fields, time: new Date().toISOString() }));
  }
}

function defaultWrite(line: string): void {
  process.stdout.write(`${line}\n`);
}
