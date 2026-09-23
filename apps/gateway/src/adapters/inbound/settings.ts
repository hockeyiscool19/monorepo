import { inspect } from "node:util";
import { ACCESS_MODES, type AccessMode } from "../../domain/access.js";
import { DEFAULT_API_PREFIX } from "../../domain/routes.js";
import { LOG_LEVELS, type LogLevel } from "../outbound/log/Logger.js";
import { MIN_SECRET_BYTES } from "../outbound/session/AesGcmSessionSealer.js";

/** How the gateway proves its own identity to guarded upstreams: a metadata-server ID token, or nothing. */
export type UpstreamAuth = "metadata" | "none";
/** Every valid UPSTREAM_AUTH. */
export const UPSTREAM_AUTHS: readonly UpstreamAuth[] = ["metadata", "none"];

/**
 * Key material that never prints: String(), template literals, JSON.stringify and util.inspect all show
 * "[redacted]". `reveal()` hands a copy to the one adapter that needs the bytes (the session sealer).
 */
export class SecretBytes {
  readonly #bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.#bytes = Uint8Array.from(bytes);
  }

  /** A copy of the bytes. */
  reveal(): Uint8Array {
    return Uint8Array.from(this.#bytes);
  }

  /** How many bytes the secret has. */
  get length(): number {
    return this.#bytes.length;
  }

  toString(): string {
    return "[redacted]";
  }

  toJSON(): string {
    return "[redacted]";
  }

  [inspect.custom](): string {
    return "SecretBytes([redacted])";
  }
}

/**
 * Runtime configuration. Every field maps to one environment variable. SESSION_SECRET and
 * SESSION_SECRET_PREVIOUS are secrets: they are held as SecretBytes, which never print, and no
 * error message or log line quotes them. Everything else is plain configuration.
 */
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
  /** SESSION_SECRET — seals the door's envelope (base64/base64url, ≥ 32 bytes). Unset: guarded apps answer door_unconfigured. */
  readonly sessionSecret: SecretBytes | undefined;
  /** SESSION_SECRET_PREVIOUS — the secret being rotated out: envelopes it sealed still open until they expire. */
  readonly sessionSecretPrevious: SecretBytes | undefined;
  /** ACCESS_MODE — `enforce` (default) or `open` (no door at all; local development, refused on Cloud Run). */
  readonly accessMode: AccessMode;
  /** FIREBASE_AUTH_EMULATOR_HOST — accept the Auth emulator's unsigned tokens (local only, refused on Cloud Run). */
  readonly authEmulatorHost: string | undefined;
  /** UPSTREAM_AUTH — `metadata` (default on Cloud Run) sends guarded upstreams an ID token; `none` sends nothing. */
  readonly upstreamAuth: UpstreamAuth;
}

/** The values used when the environment says nothing (and K_SERVICE is unset). */
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
  sessionSecret: undefined,
  sessionSecretPrevious: undefined,
  accessMode: "enforce",
  authEmulatorHost: undefined,
  upstreamAuth: "none",
};

/** An environment map; `process.env` or a test's literal. */
export type Env = Readonly<Record<string, string | undefined>>;

/** A variable could not be parsed, or is refused in this environment. The message names it, never a secret's value. */
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

function optionalText(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value === "" ? undefined : value;
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

function choice<T extends string>(env: Env, name: string, allowed: readonly T[], fallback: T): T {
  const raw = text(env, name, fallback).toLowerCase();
  const value = allowed.find((candidate) => candidate === raw);
  if (value === undefined) throw new SettingsError(name, `expected one of ${allowed.join(", ")}, got "${raw}"`);
  return value;
}

function logLevel(env: Env, name: string, fallback: LogLevel): LogLevel {
  return choice(env, name, LOG_LEVELS, fallback);
}

function pathPrefix(env: Env, name: string, fallback: string): string {
  const value = text(env, name, fallback);
  if (!/^\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/.test(value)) {
    throw new SettingsError(name, `expected a path like /api, got "${value}"`);
  }
  return value;
}

/** A secret in base64 or base64url of at least MIN_SECRET_BYTES bytes. Its value never appears in an error. */
function secret(env: Env, name: string): SecretBytes | undefined {
  const raw = optionalText(env, name);
  if (raw === undefined) return undefined;
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) throw new SettingsError(name, "expected base64 or base64url (value not shown)");
  const bytes = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (bytes.length < MIN_SECRET_BYTES) {
    throw new SettingsError(name, `expected at least ${MIN_SECRET_BYTES} bytes once decoded, got ${bytes.length} (value not shown)`);
  }
  return new SecretBytes(bytes);
}

function emulatorHost(env: Env, name: string): string | undefined {
  const value = optionalText(env, name);
  if (value !== undefined && !/^(\[[0-9A-Fa-f:]+\]|[A-Za-z0-9.-]+):\d{1,5}$/.test(value)) {
    throw new SettingsError(name, `expected host:port like 127.0.0.1:9099, got "${value}"`);
  }
  return value;
}

/**
 * Build Settings from an environment map. Only `bootstrap.ts` passes `process.env`; tests pass literals.
 * Unset or blank variables take their defaults; an unparsable value throws SettingsError. On Cloud Run
 * (K_SERVICE set) ACCESS_MODE=open and FIREBASE_AUTH_EMULATOR_HOST are refused and UPSTREAM_AUTH defaults
 * to `metadata`. SESSION_SECRET_PREVIOUS without SESSION_SECRET is refused.
 */
export function settingsFromEnv(env: Env): Settings {
  const onCloudRun = optionalText(env, "K_SERVICE") !== undefined;
  const settings: Settings = {
    port: integer(env, "PORT", DEFAULT_SETTINGS.port, 1),
    registryUrl: text(env, "REGISTRY_URL", DEFAULT_SETTINGS.registryUrl),
    registryFile: optionalText(env, "REGISTRY_FILE"),
    registryTtlSeconds: integer(env, "REGISTRY_TTL_SECONDS", DEFAULT_SETTINGS.registryTtlSeconds, 1),
    portalOrigins: list(env, "PORTAL_ORIGIN"),
    gatewayVersion: text(env, "GATEWAY_VERSION", DEFAULT_SETTINGS.gatewayVersion),
    logLevel: logLevel(env, "LOG_LEVEL", DEFAULT_SETTINGS.logLevel),
    apiPrefix: pathPrefix(env, "GATEWAY_PATH", DEFAULT_SETTINGS.apiPrefix),
    upstreamTimeoutMs: integer(env, "UPSTREAM_TIMEOUT_MS", DEFAULT_SETTINGS.upstreamTimeoutMs, 1),
    sessionSecret: secret(env, "SESSION_SECRET"),
    sessionSecretPrevious: secret(env, "SESSION_SECRET_PREVIOUS"),
    accessMode: choice(env, "ACCESS_MODE", ACCESS_MODES, DEFAULT_SETTINGS.accessMode),
    authEmulatorHost: emulatorHost(env, "FIREBASE_AUTH_EMULATOR_HOST"),
    upstreamAuth: choice(env, "UPSTREAM_AUTH", UPSTREAM_AUTHS, onCloudRun ? "metadata" : "none"),
  };
  if (settings.sessionSecretPrevious !== undefined && settings.sessionSecret === undefined) {
    throw new SettingsError("SESSION_SECRET_PREVIOUS", "is set but SESSION_SECRET is not");
  }
  if (onCloudRun && settings.accessMode === "open") {
    throw new SettingsError("ACCESS_MODE", "open is refused on Cloud Run (K_SERVICE is set)");
  }
  if (onCloudRun && settings.authEmulatorHost !== undefined) {
    throw new SettingsError("FIREBASE_AUTH_EMULATOR_HOST", "the Auth emulator is refused on Cloud Run (K_SERVICE is set)");
  }
  return settings;
}
