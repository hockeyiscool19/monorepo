/**
 * Which browser origins may call the gateway with credentials: the portal, plus every app's
 * own web origin (an app's UI served from its Cloud Run URL calls its API through the gateway).
 */

import type { Registry } from "./registry.js";

/** Normalise a URL or origin string to `scheme://host[:port]`; undefined when it does not parse. */
export function originOf(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.origin === "null" ? undefined : parsed.origin;
  } catch {
    return undefined;
  }
}

/** The origins a platform domain implies: the apex and its `www` alias, both over https. */
export function platformOrigins(domain: string): readonly string[] {
  return [`https://${domain}`, `https://www.${domain}`];
}

/**
 * The allow-list: `portalOrigins` when configured, otherwise the origins implied by
 * `platform.domain`; plus the origin of every app's `web.url` and `web.altUrl`.
 * A missing registry (load failure) still yields the portal origins.
 */
export function allowedOrigins(registry: Registry | undefined, portalOrigins: readonly string[]): ReadonlySet<string> {
  const candidates: string[] = [...portalOrigins];
  if (portalOrigins.length === 0 && registry?.platform !== undefined) {
    candidates.push(...platformOrigins(registry.platform.domain));
  }
  for (const app of registry?.apps ?? []) {
    candidates.push(app.web.url);
    if (app.web.altUrl !== undefined) candidates.push(app.web.altUrl);
  }
  const allowed = new Set<string>();
  for (const candidate of candidates) {
    const origin = originOf(candidate);
    if (origin !== undefined) allowed.add(origin);
  }
  return allowed;
}

/** True when `origin` (the request's `Origin` header) is in the allow-list. */
export function isOriginAllowed(allowed: ReadonlySet<string>, origin: string | undefined): boolean {
  if (origin === undefined) return false;
  const normalised = originOf(origin);
  return normalised !== undefined && allowed.has(normalised);
}
