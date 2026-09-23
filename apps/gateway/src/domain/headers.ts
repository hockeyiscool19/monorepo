/**
 * HTTP header lists and the hop-by-hop filtering a proxy must apply in both directions
 * (RFC 9110 §7.6.1). Names are compared case-insensitively and emitted lower-cased.
 */

/** An ordered list of header name/value pairs; duplicates (e.g. several `set-cookie`) are allowed. */
export type HeaderList = ReadonlyArray<readonly [name: string, value: string]>;

/** Headers that describe the current connection only and must never be forwarded. */
export const HOP_BY_HOP_HEADERS: ReadonlySet<string> = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/** Headers that belong to the inbound hop for other reasons: `host` names the gateway, not the upstream. */
export const GATEWAY_ONLY_HEADERS: ReadonlySet<string> = new Set(["host"]);

/** Names listed in a `Connection` header value (`Connection: close, x-foo` → `["close", "x-foo"]`). */
export function connectionTokens(headers: HeaderList): ReadonlySet<string> {
  const tokens = new Set<string>();
  for (const [name, value] of headers) {
    if (name.toLowerCase() !== "connection") continue;
    for (const token of value.split(",")) {
      const trimmed = token.trim().toLowerCase();
      if (trimmed !== "") tokens.add(trimmed);
    }
  }
  return tokens;
}

/**
 * Drop hop-by-hop headers, every header named in `Connection`, every `proxy-*` header and `host`.
 * Everything else is kept in order, with the name lower-cased.
 */
export function stripHopByHop(headers: HeaderList): HeaderList {
  const named = connectionTokens(headers);
  return headers.flatMap(([name, value]) => {
    const lower = name.toLowerCase();
    const drop =
      HOP_BY_HOP_HEADERS.has(lower) ||
      GATEWAY_ONLY_HEADERS.has(lower) ||
      named.has(lower) ||
      lower.startsWith("proxy-");
    return drop ? [] : [[lower, value] as const];
  });
}

/** Remove every header whose lower-cased name is in `names`. */
export function withoutHeaders(headers: HeaderList, names: ReadonlySet<string>): HeaderList {
  return headers.filter(([name]) => !names.has(name.toLowerCase()));
}

/** The value of the first header called `name` (case-insensitive), or undefined. */
export function headerValue(headers: HeaderList, name: string): string | undefined {
  const wanted = name.toLowerCase();
  return headers.find(([candidate]) => candidate.toLowerCase() === wanted)?.[1];
}

/** Every value of the headers called `name` (case-insensitive), in order. */
export function headerValues(headers: HeaderList, name: string): string[] {
  const wanted = name.toLowerCase();
  return headers.filter(([candidate]) => candidate.toLowerCase() === wanted).map(([, value]) => value);
}

/**
 * Headers the gateway alone may send to a guarded app's upstream: Cloud Run reads the gateway's identity
 * token from `x-serverless-authorization`, so a caller's own value is dropped before forwarding.
 */
export const GATEWAY_CREDENTIAL_HEADERS: ReadonlySet<string> = new Set(["x-serverless-authorization"]);

/** The token of the first `Authorization: Bearer <token>` header (scheme case-insensitive), or undefined. */
export function bearerToken(headers: HeaderList): string | undefined {
  const value = headerValue(headers, "authorization");
  if (value === undefined) return undefined;
  const match = /^Bearer +(\S+) *$/i.exec(value.trim());
  return match?.[1];
}
