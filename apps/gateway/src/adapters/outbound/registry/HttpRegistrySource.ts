import type { Clock } from "../../../application/ports/Clock.js";
import type { RegistrySource } from "../../../application/ports/RegistrySource.js";
import { RegistryUnavailableError } from "../../../domain/errors.js";
import { parseRegistry } from "../../../domain/parseRegistry.js";
import type { Registry } from "../../../domain/registry.js";
import { describeError, silentLogger, type Logger } from "../log/Logger.js";

/** The subset of `fetch` this adapter uses; tests pass a stub. */
export type RegistryFetch = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

/** Which copy the source is currently serving. */
export type RegistryOrigin = "live" | "fallback";

/** Construction options. */
export interface HttpRegistrySourceOptions {
  /** The published registry, e.g. `https://eisensoftware.com/registry.json`. */
  readonly url: string;
  /** How long a successful fetch is reused. */
  readonly ttlSeconds: number;
  readonly clock: Clock;
  /** Produces the bundled snapshot; called only when no live or cached copy exists. */
  readonly fallback: () => Registry | Promise<Registry>;
  readonly fetchFn?: RegistryFetch;
  readonly log?: Logger;
  /** Time allowed for one fetch of the registry. */
  readonly fetchTimeoutMs?: number;
  /** After a failed refresh, how long the stale or fallback copy is served before retrying. */
  readonly retrySeconds?: number;
}

interface Cached {
  readonly registry: Registry;
  readonly origin: RegistryOrigin;
  readonly expiresAt: number;
}

/**
 * Fetches the published registry over HTTP and caches it for `ttlSeconds`.
 * When a refresh fails (network, non-2xx, invalid document) it keeps serving the last good copy;
 * with no copy at all it serves the bundled snapshot. Either way it retries after
 * `retrySeconds` (default: min(ttl, 30 s)). Concurrent loads share one in-flight fetch.
 */
export class HttpRegistrySource implements RegistrySource {
  private readonly options: HttpRegistrySourceOptions;
  private readonly fetchFn: RegistryFetch;
  private readonly log: Logger;
  private readonly fetchTimeoutMs: number;
  private readonly retryMs: number;
  private cached: Cached | undefined;
  private inflight: Promise<Registry> | undefined;

  constructor(options: HttpRegistrySourceOptions) {
    this.options = options;
    this.fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
    this.log = options.log ?? silentLogger;
    this.fetchTimeoutMs = options.fetchTimeoutMs ?? 5000;
    this.retryMs = (options.retrySeconds ?? Math.min(options.ttlSeconds, 30)) * 1000;
  }

  /** Where the registry currently served comes from; undefined before the first load. */
  get origin(): RegistryOrigin | undefined {
    return this.cached?.origin;
  }

  async load(): Promise<Registry> {
    const now = this.options.clock.now();
    if (this.cached !== undefined && now < this.cached.expiresAt) return this.cached.registry;
    if (this.inflight === undefined) {
      this.inflight = this.refresh(now).finally(() => {
        this.inflight = undefined;
      });
    }
    return this.inflight;
  }

  private async refresh(now: number): Promise<Registry> {
    try {
      const registry = await this.fetchLive();
      this.cached = { registry, origin: "live", expiresAt: now + this.options.ttlSeconds * 1000 };
      this.log.debug("registry refreshed", { url: this.options.url, apps: registry.apps.length });
      return registry;
    } catch (error) {
      this.log.warn("registry fetch failed", { url: this.options.url, error: describeError(error) });
      if (this.cached !== undefined) {
        this.cached = { ...this.cached, expiresAt: now + this.retryMs };
        return this.cached.registry;
      }
      const registry = await this.loadFallback(error);
      this.cached = { registry, origin: "fallback", expiresAt: now + this.retryMs };
      return registry;
    }
  }

  private async loadFallback(liveError: unknown): Promise<Registry> {
    try {
      const registry = await this.options.fallback();
      this.log.warn("serving bundled registry snapshot", { generatedAt: registry.generatedAt });
      return registry;
    } catch (fallbackError) {
      throw new RegistryUnavailableError(
        `registry unavailable: live fetch failed (${describeError(liveError)}) and fallback failed (${describeError(fallbackError)})`,
        { cause: fallbackError },
      );
    }
  }

  private async fetchLive(): Promise<Registry> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
    try {
      const response = await this.fetchFn(this.options.url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} from ${this.options.url}`);
      const document: unknown = await response.json();
      return parseRegistry(document, { generatedAt: new Date(this.options.clock.now()).toISOString() });
    } finally {
      clearTimeout(timer);
    }
  }
}
