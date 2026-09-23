import type { MiddlewareHandler } from "hono";
import type { RegistrySource } from "../../application/ports/RegistrySource.js";
import { allowedOrigins, isOriginAllowed } from "../../domain/cors.js";
import type { Registry } from "../../domain/registry.js";
import { describeError, type Logger } from "../outbound/log/Logger.js";

/** What the CORS middleware needs. */
export interface CorsOptions {
  readonly registry: RegistrySource;
  readonly portalOrigins: readonly string[];
  readonly log: Logger;
}

const ALLOW_METHODS = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";
const DEFAULT_ALLOW_HEADERS = "Content-Type, Authorization";
const EXPOSE_HEADERS = "ETag, X-Gateway-Version, X-Upstream-App";
const MAX_AGE_SECONDS = "600";

/**
 * CORS for browsers: the allow-list is the configured portal origins (or the registry's
 * `platform.domain`) plus every app's web origin. Allowed origins get credentials and the
 * gateway's headers exposed; other origins get no `Access-Control-*` headers at all.
 * Preflights (OPTIONS + Access-Control-Request-Method) are answered here with 204 and never
 * forwarded. Every response varies on Origin so shared caches keep origins apart.
 */
export function corsMiddleware(options: CorsOptions): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header("origin");
    const allowed =
      origin !== undefined && isOriginAllowed(allowedOrigins(await loadQuietly(options), options.portalOrigins), origin);
    const requestedMethod = c.req.header("access-control-request-method");

    if (c.req.method === "OPTIONS" && origin !== undefined && requestedMethod !== undefined) {
      const headers = new Headers({ vary: "Origin" });
      if (allowed) {
        headers.set("access-control-allow-origin", origin);
        headers.set("access-control-allow-credentials", "true");
        headers.set("access-control-allow-methods", ALLOW_METHODS);
        headers.set("access-control-allow-headers", c.req.header("access-control-request-headers") ?? DEFAULT_ALLOW_HEADERS);
        headers.set("access-control-max-age", MAX_AGE_SECONDS);
        headers.append("vary", "Access-Control-Request-Headers");
      }
      return new Response(null, { status: 204, headers });
    }

    await next();
    const vary = c.res.headers.get("vary") ?? "";
    if (!/(^|,\s*)origin(\s*,|$)/i.test(vary)) c.res.headers.append("vary", "Origin");
    if (allowed && origin !== undefined) {
      c.res.headers.set("access-control-allow-origin", origin);
      c.res.headers.set("access-control-allow-credentials", "true");
      c.res.headers.set("access-control-expose-headers", EXPOSE_HEADERS);
    }
  };
}

async function loadQuietly(options: CorsOptions): Promise<Registry | undefined> {
  try {
    return await options.registry.load();
  } catch (error) {
    options.log.debug("cors: registry unavailable, allowing portal origins only", { error: describeError(error) });
    return undefined;
  }
}
