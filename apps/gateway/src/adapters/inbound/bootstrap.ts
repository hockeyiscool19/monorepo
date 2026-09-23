import type { Hono } from "hono";
import type { Clock } from "../../application/ports/Clock.js";
import type { RegistrySource } from "../../application/ports/RegistrySource.js";
import type { UpstreamHttp } from "../../application/ports/UpstreamHttp.js";
import { SystemClock } from "../outbound/clock/SystemClock.js";
import { JsonLogger } from "../outbound/log/JsonLogger.js";
import type { Logger } from "../outbound/log/Logger.js";
import { FileRegistrySource } from "../outbound/registry/FileRegistrySource.js";
import { HttpRegistrySource } from "../outbound/registry/HttpRegistrySource.js";
import { readBundledSnapshot } from "../outbound/registry/bundledSnapshot.js";
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
}

/** The assembled service and the pieces it was built from (tests inspect them). */
export interface BuiltApp {
  readonly app: Hono;
  readonly settings: Settings;
  readonly registrySource: RegistrySource;
  readonly upstream: UpstreamHttp;
  readonly clock: Clock;
  readonly log: Logger;
}

/**
 * The composition root — the only place that reads `process.env` and wires adapters to ports.
 * Registry: `FileRegistrySource` when REGISTRY_FILE is set, otherwise `HttpRegistrySource`
 * (REGISTRY_URL, cached REGISTRY_TTL_SECONDS, bundled snapshot as fallback).
 * Upstream: `FetchUpstream`. Clock: `SystemClock`. Logs: JSON lines at LOG_LEVEL.
 * Every piece can be replaced through `options`, which is how tests inject fakes.
 */
export function buildApp(options: BuildAppOptions = {}): BuiltApp {
  const settings: Settings =
    options.settings === undefined ? settingsFromEnv(process.env) : { ...DEFAULT_SETTINGS, ...options.settings };
  const log = options.log ?? new JsonLogger(settings.logLevel);
  const clock = options.clock ?? new SystemClock();
  const registrySource = options.registrySource ?? defaultRegistrySource(settings, clock, log);
  const upstream = options.upstream ?? new FetchUpstream();
  const app = createApp({ registry: registrySource, upstream, clock, settings, log });
  return { app, settings, registrySource, upstream, clock, log };
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
