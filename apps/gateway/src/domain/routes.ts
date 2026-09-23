/**
 * Route resolution: `<prefix>/<id><rest><search>` → the app that owns `<id>` and the upstream URL
 * `api.baseUrl + <rest> + <search>`. Pure string work; no I/O.
 */

import { UnknownAppError } from "./errors.js";
import { appsWithApi, findApp, type AppManifest, type Registry } from "./registry.js";

/** Where the gateway is mounted unless `platform.gateway.path` / GATEWAY_PATH says otherwise. */
export const DEFAULT_API_PREFIX = "/api";

/** The two parts of a proxied path. `rest` keeps its leading slash and may be empty. */
export interface ApiPathParts {
  readonly id: string;
  readonly rest: string;
}

/** A resolved proxy route. */
export interface RouteMatch {
  readonly app: AppManifest;
  readonly upstreamUrl: string;
}

/**
 * Split `<prefix>/<id><rest>` into its parts. Returns undefined when `pathname` is not under
 * `prefix` or names no id (`/api`, `/api/`).
 */
export function splitApiPath(pathname: string, prefix: string = DEFAULT_API_PREFIX): ApiPathParts | undefined {
  const base = prefix.endsWith("/") ? prefix : `${prefix}/`;
  if (!pathname.startsWith(base)) return undefined;
  const remainder = pathname.slice(base.length);
  const slash = remainder.indexOf("/");
  const id = slash === -1 ? remainder : remainder.slice(0, slash);
  if (id === "") return undefined;
  return { id, rest: slash === -1 ? "" : remainder.slice(slash) };
}

/** Join an app's `api.baseUrl` with the remaining request path without doubling or dropping a slash. */
export function joinUpstream(baseUrl: string, rest: string): string {
  if (rest === "") return baseUrl;
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return rest.startsWith("/") ? base + rest : `${base}/${rest}`;
}

/** Ids of the apps the gateway can front, in registry order; the 404 body lists them. */
export function apiAppIds(registry: Registry): readonly string[] {
  return appsWithApi(registry).map((app) => app.id);
}

/**
 * Resolve an inbound path and query string to the upstream URL that serves it.
 * Throws UnknownAppError when the id is not in the registry or the app has no `api` block.
 */
export function resolveRoute(
  registry: Registry,
  pathname: string,
  search: string,
  prefix: string = DEFAULT_API_PREFIX,
): RouteMatch {
  const parts = splitApiPath(pathname, prefix);
  const id = parts?.id ?? "";
  const app = findApp(registry, id);
  if (parts === undefined || app === undefined || app.api === undefined) {
    throw new UnknownAppError(id, apiAppIds(registry));
  }
  return { app, upstreamUrl: joinUpstream(app.api.baseUrl, parts.rest) + search };
}

/** The absolute URL the health fan-out probes for an app, or undefined when it has no `api`. */
export function healthUrl(app: AppManifest): string | undefined {
  return app.api === undefined ? undefined : joinUpstream(app.api.baseUrl, app.api.healthPath);
}
