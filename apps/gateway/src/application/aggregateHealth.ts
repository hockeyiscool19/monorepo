import { UpstreamError } from "../domain/errors.js";
import type { AppManifest, AppStatus } from "../domain/registry.js";
import { healthUrl } from "../domain/routes.js";
import { credentialsFor } from "./door.js";
import type { Clock } from "./ports/Clock.js";
import type { RegistrySource } from "./ports/RegistrySource.js";
import type { UpstreamCredentials } from "./ports/UpstreamCredentials.js";
import type { UpstreamHttp } from "./ports/UpstreamHttp.js";

/** Time allowed for each health probe unless the caller says otherwise. */
export const DEFAULT_HEALTH_TIMEOUT_MS = 3000;

/** One app's line in the health report. `ok` is null for apps without an `api` block. */
export interface AppHealth {
  readonly id: string;
  readonly status: AppStatus;
  readonly ok: boolean | null;
  readonly httpStatus: number | null;
  readonly latencyMs: number | null;
  /** Present only when the probe obtained no response (`timeout`, `network`, `invalid_url`). */
  readonly error?: string;
}

/** The body of `GET <prefix>/health`. The gateway itself is `ok` whenever it can answer. */
export interface HealthReport {
  readonly gateway: { readonly ok: true; readonly version: string };
  readonly apps: readonly AppHealth[];
}

/** What `aggregateHealth` needs. */
export interface AggregateHealthDeps {
  readonly registry: RegistrySource;
  readonly upstream: UpstreamHttp;
  readonly clock: Clock;
  readonly gatewayVersion: string;
  /** The gateway's own credentials, sent to the upstreams of apps with an `access` block. */
  readonly credentials: UpstreamCredentials;
  readonly timeoutMs?: number;
}

async function probe(deps: AggregateHealthDeps, app: AppManifest): Promise<AppHealth> {
  const url = healthUrl(app);
  if (url === undefined) return { id: app.id, status: app.status, ok: null, httpStatus: null, latencyMs: null };
  const started = deps.clock.now();
  try {
    const response = await deps.upstream.forward({
      method: "GET",
      url,
      headers: [
        ["accept", "application/json"],
        ["user-agent", `eisensoftware-gateway/${deps.gatewayVersion}`],
        ...(await credentialsFor(deps.credentials, app, url)),
      ],
      body: null,
      timeoutMs: deps.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS,
    });
    if (response.body !== null) await response.body.cancel().catch(() => undefined);
    return {
      id: app.id,
      status: app.status,
      ok: response.status >= 200 && response.status < 300,
      httpStatus: response.status,
      latencyMs: deps.clock.now() - started,
    };
  } catch (error) {
    return {
      id: app.id,
      status: app.status,
      ok: false,
      httpStatus: null,
      latencyMs: deps.clock.now() - started,
      error: error instanceof UpstreamError ? error.reason : "error",
    };
  }
}

/**
 * Use case: probe every app's `api.baseUrl + api.healthPath` in parallel and report per app.
 * Guarded apps' probes carry the gateway's upstream credentials (a failure to get them fails that probe).
 * A failing or slow upstream never fails the report; it is marked `ok: false`.
 * Rejects only when the registry itself is unavailable.
 */
export async function aggregateHealth(deps: AggregateHealthDeps): Promise<HealthReport> {
  const registry = await deps.registry.load();
  const apps = await Promise.all(registry.apps.map((app) => probe(deps, app)));
  return { gateway: { ok: true, version: deps.gatewayVersion }, apps };
}
