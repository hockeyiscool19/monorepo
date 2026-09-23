import type { Hono } from "hono";
import type { Clock } from "../../application/ports/Clock.js";
import type { IdentityVerifier } from "../../application/ports/IdentityVerifier.js";
import type { RegistrySource } from "../../application/ports/RegistrySource.js";
import type { SessionSealer } from "../../application/ports/SessionSealer.js";
import type { UpstreamCredentials } from "../../application/ports/UpstreamCredentials.js";
import type { UpstreamHttp } from "../../application/ports/UpstreamHttp.js";
import { SystemClock } from "../outbound/clock/SystemClock.js";
import { MetadataServerCredentials } from "../outbound/credentials/MetadataServerCredentials.js";
import { NoUpstreamCredentials } from "../outbound/credentials/NoUpstreamCredentials.js";
import { EmulatorIdTokenVerifier } from "../outbound/identity/EmulatorIdTokenVerifier.js";
import { FirebaseIdTokenVerifier } from "../outbound/identity/FirebaseIdTokenVerifier.js";
import { JsonLogger } from "../outbound/log/JsonLogger.js";
import type { Logger } from "../outbound/log/Logger.js";
import { FileRegistrySource } from "../outbound/registry/FileRegistrySource.js";
import { HttpRegistrySource } from "../outbound/registry/HttpRegistrySource.js";
import { readBundledSnapshot } from "../outbound/registry/bundledSnapshot.js";
import { AesGcmSessionSealer } from "../outbound/session/AesGcmSessionSealer.js";
import { FetchUpstream } from "../outbound/upstream/FetchUpstream.js";
import { createApp } from "./app.js";
import { DEFAULT_SETTINGS, settingsFromEnv, type Settings } from "./settings.js";

/** Overrides for `buildApp`. Anything omitted is built from the environment and real adapters. */
export interface BuildAppOptions {
  /** When given, the environment is not read; missing fields take DEFAULT_SETTINGS. */
  readonly settings?: Partial<Settings>;
  readonly registrySource?: RegistrySource;
  readonly upstream?: UpstreamHttp;
  readonly clock?: Clock;
  readonly log?: Logger;
  readonly identityVerifier?: IdentityVerifier;
  /** A sealer, or null for none (guarded apps answer door_unconfigured). Omitted: built from SESSION_SECRET. */
  readonly sessionSealer?: SessionSealer | null;
  readonly upstreamCredentials?: UpstreamCredentials;
}

/** The assembled service and the pieces it was built from (tests inspect them). */
export interface BuiltApp {
  readonly app: Hono;
  readonly settings: Settings;
  readonly registrySource: RegistrySource;
  readonly upstream: UpstreamHttp;
  readonly clock: Clock;
  readonly log: Logger;
  readonly identityVerifier: IdentityVerifier;
  readonly sessionSealer: SessionSealer | undefined;
  readonly upstreamCredentials: UpstreamCredentials;
}

/**
 * The composition root — the only place that reads `process.env` and wires adapters to ports.
 * Registry: `FileRegistrySource` when REGISTRY_FILE is set, otherwise `HttpRegistrySource`
 * (REGISTRY_URL, cached REGISTRY_TTL_SECONDS, bundled snapshot as fallback).
 * Upstream: `FetchUpstream`. Clock: `SystemClock`. Logs: JSON lines at LOG_LEVEL.
 * Identity: `EmulatorIdTokenVerifier` when FIREBASE_AUTH_EMULATOR_HOST is set, else `FirebaseIdTokenVerifier`.
 * Sessions: `AesGcmSessionSealer` from SESSION_SECRET (+ SESSION_SECRET_PREVIOUS), none without it.
 * Upstream credentials: `MetadataServerCredentials` for UPSTREAM_AUTH=metadata, else `NoUpstreamCredentials`.
 * Every piece can be replaced through `options`, which is how tests inject fakes.
 */
export function buildApp(options: BuildAppOptions = {}): BuiltApp {
  const settings: Settings =
    options.settings === undefined ? settingsFromEnv(process.env) : { ...DEFAULT_SETTINGS, ...options.settings };
  const log = options.log ?? new JsonLogger(settings.logLevel);
  const clock = options.clock ?? new SystemClock();
  const registrySource = options.registrySource ?? defaultRegistrySource(settings, clock, log);
  const upstream = options.upstream ?? new FetchUpstream();
  const identityVerifier = options.identityVerifier ?? defaultVerifier(settings, clock);
  const sessionSealer = options.sessionSealer === undefined ? defaultSealer(settings) : (options.sessionSealer ?? undefined);
  const upstreamCredentials = options.upstreamCredentials ?? defaultCredentials(settings, clock);
  log.info("access", {
    mode: settings.accessMode,
    door: sessionSealer === undefined ? "unconfigured (no SESSION_SECRET)" : "configured",
    rotation: settings.sessionSecretPrevious !== undefined,
    identity: settings.authEmulatorHost === undefined ? "firebase" : `auth emulator ${settings.authEmulatorHost}`,
    upstreamAuth: settings.upstreamAuth,
  });
  const app = createApp({
    registry: registrySource,
    upstream,
    clock,
    settings,
    log,
    verifier: identityVerifier,
    sealer: sessionSealer,
    credentials: upstreamCredentials,
  });
  return { app, settings, registrySource, upstream, clock, log, identityVerifier, sessionSealer, upstreamCredentials };
}

function defaultRegistrySource(settings: Settings, clock: Clock, log: Logger): RegistrySource {
  if (settings.registryFile !== undefined) {
    log.info("registry source: local file", { path: settings.registryFile });
    return new FileRegistrySource(settings.registryFile);
  }
  log.info("registry source: http", { url: settings.registryUrl, ttlSeconds: settings.registryTtlSeconds });
  return new HttpRegistrySource({
    url: settings.registryUrl,
    ttlSeconds: settings.registryTtlSeconds,
    clock,
    log,
    fallback: () => readBundledSnapshot(),
  });
}

function defaultVerifier(settings: Settings, clock: Clock): IdentityVerifier {
  return settings.authEmulatorHost === undefined ? new FirebaseIdTokenVerifier({ clock }) : new EmulatorIdTokenVerifier({ clock });
}

function defaultSealer(settings: Settings): SessionSealer | undefined {
  if (settings.sessionSecret === undefined) return undefined;
  return new AesGcmSessionSealer({
    current: settings.sessionSecret.reveal(),
    previous: settings.sessionSecretPrevious?.reveal(),
  });
}

function defaultCredentials(settings: Settings, clock: Clock): UpstreamCredentials {
  return settings.upstreamAuth === "metadata" ? new MetadataServerCredentials({ clock }) : new NoUpstreamCredentials();
}
