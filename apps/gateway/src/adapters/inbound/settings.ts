import { DEFAULT_API_PREFIX } from "../../domain/routes.js";
import { LOG_LEVELS, type LogLevel } from "../outbound/log/Logger.js";

/** Runtime configuration. Every field maps to one environment variable; none is a secret. */
export interface Settings {
  /** PORT — Cloud Run injects it. */
  readonly port: number;
  /** REGISTRY_URL — the published registry. */
  readonly registryUrl: string;
  /** REGISTRY_FILE — when set, a local file (or a directory holding `registry.json`) replaces the URL. */
  readonly registryFile: string | undefined;
  /** REGISTRY_TTL_SECONDS — how long a fetched registry is reused. */
  readonly registryTtlSeconds: number;
  /** PORTAL_ORIGIN — comma-separated; empty means "derive from platform.domain in the registry". */
  readonly portalOrigins: readonly string[];
  /** GATEWAY_VERSION — reported in `X-Gateway-Version` and the health body. */
  readonly gatewayVersion: string;
  /** LOG_LEVEL */
  readonly logLevel: LogLevel;
  /** GATEWAY_PATH — where the gateway is mounted; must equal `platform.gateway.path`. */
  readonly apiPrefix: string;
  /** UPSTREAM_TIMEOUT_MS — time allowed for an upstream to start answering a proxied request. */
  readonly upstreamTimeoutMs: number;
}

/** The values used when the environment says nothing. */
export const DEFAULT_SETTINGS: Settings = {
  port: 8080,
  registryUrl: "https://eisensoftware.com/registry.json",
  registryFile: undefined,
  registryTtlSeconds: 300,
  portalOrigins: [],
  gatewayVersion: "dev",
  logLevel: "info",
  apiPrefix: DEFAULT_API_PREFIX,
  upstreamTimeoutMs: 60_000,
};

/** An environment map; `process.env` or a test's literal. */
export type Env = Readonly<Record<string, string | undefined>>;

/** A variable could not be parsed. The message names it. */
export class SettingsError extends Error {
  constructor(variable: string, detail: string) {
    super(`${variable}: ${detail}`);
    this.name = "SettingsError";
  }
}

function text(env: Env, name: string, fallback: string): string {
  const value = env[name]?.trim();
  return value === undefined || value === "" ? fallback : value;
}

function integer(env: Env, name: string, fallback: number, min: number): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) throw new SettingsError(name, `expected an integer >= ${min}, got "${raw}"`);
  return value;
}

function list(env: Env, name: string): readonly string[] {
  return (env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function logLevel(env: Env, name: string, fallback: LogLevel): LogLevel {
  const raw = text(env, name, fallback).toLowerCase();
  const level = LOG_LEVELS.find((candidate) => candidate === raw);
  if (level === undefined) throw new SettingsError(name, `expected one of ${LOG_LEVELS.join(", ")}, got "${raw}"`);
  return level;
}

function pathPrefix(env: Env, name: string, fallback: string): string {
  const value = text(env, name, fallback);
  if (!/^\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/.test(value)) {
    throw new SettingsError(name, `expected a path like /api, got "${value}"`);
  }
  return value;
}

/**
 * Build Settings from an environment map. Only `bootstrap.ts` passes `process.env`; tests pass
 * literals. Unset or blank variables take their defaults; an unparsable value throws SettingsError.
 */
export function settingsFromEnv(env: Env): Settings {
  const registryFile = env["REGISTRY_FILE"]?.trim();
  return {
    port: integer(env, "PORT", DEFAULT_SETTINGS.port, 1),
    registryUrl: text(env, "REGISTRY_URL", DEFAULT_SETTINGS.registryUrl),
    registryFile: registryFile === undefined || registryFile === "" ? undefined : registryFile,
    registryTtlSeconds: integer(env, "REGISTRY_TTL_SECONDS", DEFAULT_SETTINGS.registryTtlSeconds, 1),
    portalOrigins: list(env, "PORTAL_ORIGIN"),
    gatewayVersion: text(env, "GATEWAY_VERSION", DEFAULT_SETTINGS.gatewayVersion),
    logLevel: logLevel(env, "LOG_LEVEL", DEFAULT_SETTINGS.logLevel),
    apiPrefix: pathPrefix(env, "GATEWAY_PATH", DEFAULT_SETTINGS.apiPrefix),
    upstreamTimeoutMs: integer(env, "UPSTREAM_TIMEOUT_MS", DEFAULT_SETTINGS.upstreamTimeoutMs, 1),
  };
}
