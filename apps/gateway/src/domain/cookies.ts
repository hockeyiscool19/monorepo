/**
 * Cookies as the door reads and writes them (RFC 6265): the pairs of a request's `Cookie` header, the
 * upstream's `Set-Cookie` lines, and the door's own `Set-Cookie`. Pure string work; times are Unix seconds.
 */

/** The one cookie Firebase Hosting forwards to Cloud Run: the door's envelope and each app's own state. */
export const SESSION_COOKIE = "__session";

/** One pair of a Cookie header. A segment without `=` keeps an empty name and its text as the value. */
export interface CookiePair {
  readonly name: string;
  readonly value: string;
}

/** Every pair of a Cookie header value, in order, duplicates kept. */
export function parseCookieHeader(header: string): CookiePair[] {
  const pairs: CookiePair[] = [];
  for (const segment of header.split(";")) {
    const trimmed = segment.trim();
    if (trimmed === "") continue;
    const eq = trimmed.indexOf("=");
    pairs.push(
      eq === -1 ? { name: "", value: trimmed } : { name: trimmed.slice(0, eq).trim(), value: trimmed.slice(eq + 1).trim() },
    );
  }
  return pairs;
}

/** A Cookie header value from pairs (`a=1; b=2`); a nameless pair is written as its value alone. */
export function serializeCookiePairs(pairs: readonly CookiePair[]): string {
  return pairs.map(({ name, value }) => (name === "" ? value : `${name}=${value}`)).join("; ");
}

/** The parts of one Set-Cookie line the door needs. `expires` is Unix seconds. */
export interface SetCookie {
  readonly name: string;
  readonly value: string;
  readonly maxAge?: number;
  readonly expires?: number;
}

/**
 * Parse one Set-Cookie header value. Returns undefined when the line has no `name=value` pair with a name.
 * Of repeated Max-Age or Expires attributes the last one counts; an unparsable one is ignored, as browsers do.
 */
export function parseSetCookie(header: string): SetCookie | undefined {
  const [pair = "", ...attributes] = header.split(";");
  const eq = pair.indexOf("=");
  const name = eq === -1 ? "" : pair.slice(0, eq).trim();
  if (name === "") return undefined;
  const value = pair.slice(eq + 1).trim();
  let maxAge: number | undefined;
  let expires: number | undefined;
  for (const attribute of attributes) {
    const at = attribute.indexOf("=");
    const key = (at === -1 ? attribute : attribute.slice(0, at)).trim().toLowerCase();
    const argument = at === -1 ? "" : attribute.slice(at + 1).trim();
    if (key === "max-age" && /^-?\d+$/.test(argument)) maxAge = Number(argument);
    if (key === "expires") {
      const ms = Date.parse(argument);
      if (!Number.isNaN(ms)) expires = Math.floor(ms / 1000);
    }
  }
  return { name, value, ...(maxAge === undefined ? {} : { maxAge }), ...(expires === undefined ? {} : { expires }) };
}

/** What a Set-Cookie does to its cookie at a given time: removes it, or keeps it until `expiresAt` (null: session). */
export type CookieEffect =
  | { readonly deleted: true }
  | { readonly deleted: false; readonly expiresAt: number | null };

/**
 * The effect of `cookie` at `now`: an empty value, Max-Age ≤ 0 or an Expires in the past deletes it; otherwise it
 * lives until now + Max-Age (Max-Age wins over Expires), until Expires, or for the browser session.
 */
export function cookieEffect(cookie: SetCookie, now: number): CookieEffect {
  if (cookie.value === "") return { deleted: true };
  if (cookie.maxAge !== undefined) {
    return cookie.maxAge <= 0 ? { deleted: true } : { deleted: false, expiresAt: now + cookie.maxAge };
  }
  if (cookie.expires !== undefined) {
    return cookie.expires <= now ? { deleted: true } : { deleted: false, expiresAt: cookie.expires };
  }
  return { deleted: false, expiresAt: null };
}

/** The door's own cookie: `__session`, scoped to the app's path. */
export interface DoorCookie {
  readonly value: string;
  /** The app's path, e.g. `/vale`. */
  readonly path: string;
  /** Seconds; 0 removes the cookie. */
  readonly maxAge: number;
  /** False only for plain http to a loopback host (see secureCookieFor). */
  readonly secure: boolean;
}

/** The door's Set-Cookie: `__session=<value>; Path=<path>; Max-Age=<n>; HttpOnly; SameSite=Lax[; Secure]`. */
export function serializeDoorCookie(cookie: DoorCookie): string {
  const parts = [
    `${SESSION_COOKIE}=${cookie.value}`,
    `Path=${cookie.path}`,
    `Max-Age=${cookie.maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (cookie.secure) parts.push("Secure");
  return parts.join("; ");
}

/** The Set-Cookie that removes the door's cookie at `path`. */
export function clearedDoorCookie(path: string, secure: boolean): string {
  return serializeDoorCookie({ value: "", path, maxAge: 0, secure });
}

/** True for loopback host names: `localhost`, `*.localhost`, 127.0.0.0/8 and `::1` (bracketed or not). */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127(\.\d{1,3}){3}$/.test(host);
}

/**
 * Whether the door's Set-Cookie carries `Secure` for a request to `requestUrl`: always, except for plain http to
 * a loopback host, where a browser would drop a Secure cookie (local development without TLS).
 */
export function secureCookieFor(requestUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return true;
  }
  return !(url.protocol === "http:" && isLoopbackHost(url.hostname));
}
