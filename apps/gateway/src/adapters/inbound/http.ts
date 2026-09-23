import type { HeaderList } from "../../domain/headers.js";

/** Methods whose requests never carry a body worth forwarding. */
export const BODYLESS_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

/** A Fetch `Headers` as an ordered header list (names lower-cased; `set-cookie` kept one per line). */
export function headerList(headers: Headers): HeaderList {
  const list: Array<readonly [string, string]> = [];
  headers.forEach((value, name) => {
    if (name !== "set-cookie") list.push([name, value]);
  });
  for (const cookie of headers.getSetCookie()) list.push(["set-cookie", cookie]);
  return list;
}

/** A header list as Fetch `Headers`, duplicates appended. */
export function toHeaders(list: HeaderList): Headers {
  const headers = new Headers();
  for (const [name, value] of list) headers.append(name, value);
  return headers;
}

/** The buffered body of `request`, or null for a bodyless method. */
export async function bufferedBody(request: Request, method: string): Promise<ArrayBuffer | null> {
  return BODYLESS_METHODS.has(method) ? null : request.arrayBuffer();
}
