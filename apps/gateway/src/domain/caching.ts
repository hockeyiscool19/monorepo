/**
 * Cache rules for answers that depend on who is asking. The door's answers (and a guarded app's API answers)
 * must never be stored by a shared cache such as the Firebase Hosting CDN, so they are `private`, and the
 * door's vary on `Cookie`. Pure.
 */

import type { HeaderList } from "./headers.js";

/** Cache-Control of every answer the door writes itself: denials, sign-in and sign-out. */
export const PRIVATE_NO_STORE = "private, no-store";

/** Upstream directives a private answer keeps; each only limits what a browser may cache. */
const KEPT_DIRECTIVES: ReadonlySet<string> = new Set(["max-age", "immutable", "no-cache", "no-store", "must-revalidate"]);

/**
 * Cache-Control for an upstream answer forwarded to one person: `private` followed by the upstream's max-age,
 * immutable, no-cache, no-store and must-revalidate directives (first of each). `public`, `s-maxage` and every
 * other directive are dropped, `no-cache="…"` becomes a bare `no-cache`, and a malformed max-age is dropped.
 * When nothing is left — or the upstream sent no Cache-Control — the answer is `private, no-store`.
 */
export function privateCacheControl(values: readonly string[]): string {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    for (const raw of value.split(",")) {
      const directive = raw.trim();
      const eq = directive.indexOf("=");
      const name = (eq === -1 ? directive : directive.slice(0, eq)).trim().toLowerCase();
      if (!KEPT_DIRECTIVES.has(name) || seen.has(name)) continue;
      if (name === "max-age") {
        const seconds = eq === -1 ? "" : directive.slice(eq + 1).trim();
        if (!/^\d+$/.test(seconds)) continue;
        kept.push(`max-age=${seconds}`);
      } else {
        kept.push(name);
      }
      seen.add(name);
    }
  }
  return kept.length === 0 ? PRIVATE_NO_STORE : ["private", ...kept].join(", ");
}

/** `headers` with every Cache-Control replaced by one privateCacheControl of them, appended last. */
export function withPrivateCaching(headers: HeaderList): HeaderList {
  const isCacheControl = ([name]: readonly [string, string]): boolean => name.toLowerCase() === "cache-control";
  const values = headers.filter(isCacheControl).map(([, value]) => value);
  return [...headers.filter((header) => !isCacheControl(header)), ["cache-control", privateCacheControl(values)]];
}

/** A Vary value that also names `field`; unchanged when it already does or is `*`. */
export function addVary(existing: string | null | undefined, field: string): string {
  const fields = (existing ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
  if (fields.some((item) => item === "*" || item.toLowerCase() === field.toLowerCase())) return fields.join(", ");
  return [...fields, field].join(", ");
}

/** `headers` with every Vary merged into one, appended last, that also names `field`. */
export function withVary(headers: HeaderList, field: string): HeaderList {
  const isVary = ([name]: readonly [string, string]): boolean => name.toLowerCase() === "vary";
  const existing = headers.filter(isVary).map(([, value]) => value).join(", ");
  return [...headers.filter((header) => !isVary(header)), ["vary", addVary(existing, field)]];
}
