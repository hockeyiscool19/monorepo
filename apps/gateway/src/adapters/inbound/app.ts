import { createHash } from "node:crypto";
import { Hono, type Context } from "hono";
import { aggregateHealth } from "../../application/aggregateHealth.js";
import { getRegistry } from "../../application/getRegistry.js";
import type { Clock } from "../../application/ports/Clock.js";
import type { RegistrySource } from "../../application/ports/RegistrySource.js";
import type { UpstreamHttp } from "../../application/ports/UpstreamHttp.js";
import { resolveAndForward } from "../../application/resolveAndForward.js";
import type { HeaderList } from "../../domain/headers.js";
import type { Logger } from "../outbound/log/Logger.js";
import { corsMiddleware } from "./cors.js";
import { errorResponse } from "./errors.js";
import type { Settings } from "./settings.js";

/** Everything the HTTP surface needs; `bootstrap.ts` assembles it. */
export interface AppDeps {
  readonly registry: RegistrySource;
  readonly upstream: UpstreamHttp;
  readonly clock: Clock;
  readonly settings: Settings;
  readonly log: Logger;
}

/** `GET <prefix>/registry` is cacheable for a minute; the published file uses the same policy. */
export const REGISTRY_CACHE_CONTROL = "public, max-age=60";

const BODYLESS_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

/**
 * The Hono application: CORS, the three route families and error mapping.
 * Routes (with `<prefix>` = settings.apiPrefix, `/api` by default):
 * - `GET <prefix>/registry`  → the registry JSON with ETag and Cache-Control (304 on If-None-Match)
 * - `GET <prefix>/health`    → gateway + per-app health, always 200
 * - `ANY <prefix>/<app>/*`   → forwarded to the app's `api.baseUrl`
 * Pure wiring: no environment access, no adapter construction.
 */
export function createApp(deps: AppDeps): Hono {
  const { settings, log } = deps;
  const prefix = settings.apiPrefix;
  const app = new Hono();

  app.onError((error, c) => errorResponse(error, log, { method: c.req.method, path: c.req.path }));
  app.notFound((c) =>
    c.json({ error: "not_found", routes: [`${prefix}/registry`, `${prefix}/health`, `${prefix}/<app>/...`] }, 404),
  );

  app.use("*", async (c, next) => {
    const started = deps.clock.now();
    await next();
    c.res.headers.set("x-gateway-version", settings.gatewayVersion);
    log.debug("request", { method: c.req.method, path: c.req.path, status: c.res.status, ms: deps.clock.now() - started });
  });
  app.use(`${prefix}/*`, corsMiddleware({ registry: deps.registry, portalOrigins: settings.portalOrigins, log }));

  app.get(`${prefix}/registry`, async (c) => {
    const registry = await getRegistry({ registry: deps.registry });
    const body = JSON.stringify(registry);
    const etag = `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`;
    const headers: Record<string, string> = { etag, "cache-control": REGISTRY_CACHE_CONTROL };
    if (etagMatches(c.req.header("if-none-match"), etag)) return new Response(null, { status: 304, headers });
    return c.body(body, 200, { ...headers, "content-type": "application/json; charset=utf-8" });
  });

  app.get(`${prefix}/health`, async (c) => {
    const report = await aggregateHealth({
      registry: deps.registry,
      upstream: deps.upstream,
      clock: deps.clock,
      gatewayVersion: settings.gatewayVersion,
    });
    return c.json(report, 200, { "cache-control": "no-store" });
  });

  const proxy = async (c: Context): Promise<Response> => {
    const url = new URL(c.req.url);
    const method = c.req.method.toUpperCase();
    const result = await resolveAndForward(
      { registry: deps.registry, upstream: deps.upstream, apiPrefix: prefix, upstreamTimeoutMs: settings.upstreamTimeoutMs },
      {
        method,
        path: url.pathname,
        search: url.search,
        headers: headerList(c.req.raw.headers),
        body: BODYLESS_METHODS.has(method) ? null : await c.req.raw.arrayBuffer(),
      },
    );
    const headers = new Headers();
    for (const [name, value] of result.headers) headers.append(name, value);
    headers.set("x-upstream-app", result.appId);
    return new Response(result.body, { status: result.status, headers });
  };
  app.all(`${prefix}/:app/*`, proxy);
  app.all(`${prefix}/:app`, proxy);

  return app;
}

function headerList(headers: Headers): HeaderList {
  const list: Array<readonly [string, string]> = [];
  headers.forEach((value, name) => list.push([name, value]));
  return list;
}

function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (ifNoneMatch === undefined) return false;
  return ifNoneMatch.split(",").some((candidate) => {
    const trimmed = candidate.trim();
    return trimmed === "*" || trimmed === etag || trimmed === `W/${etag}`;
  });
}
