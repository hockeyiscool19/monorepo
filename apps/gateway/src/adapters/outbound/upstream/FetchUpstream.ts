import type { UpstreamHttp, UpstreamRequest, UpstreamResponse } from "../../../application/ports/UpstreamHttp.js";
import { UpstreamError } from "../../../domain/errors.js";
import { withoutHeaders, type HeaderList } from "../../../domain/headers.js";

/** The subset of `fetch` this adapter uses; tests pass a stub. */
export type UpstreamFetch = (url: URL, init: FetchInit) => Promise<Response>;

/** The request init this adapter builds. */
export interface FetchInit {
  readonly method: string;
  readonly headers: Headers;
  readonly body?: ArrayBuffer;
  readonly redirect: "manual";
  readonly signal: AbortSignal;
}

/** Methods that never carry a body. */
const BODYLESS_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

/**
 * Request headers this adapter owns: `fetch` computes `content-length` from the buffered body,
 * sets `host` from the URL, and negotiates only content encodings it can decode.
 */
const ADAPTER_OWNED_REQUEST_HEADERS: ReadonlySet<string> = new Set(["content-length", "host", "accept-encoding"]);

/** `fetch` decodes gzip/br/deflate bodies, so the framing headers of the encoded body no longer apply. */
const ENCODED_BODY_HEADERS: ReadonlySet<string> = new Set(["content-encoding", "content-length"]);

/**
 * UpstreamHttp on the global `fetch` (undici). Redirects are passed through, not followed.
 * Response bodies stream; a `content-encoding` the runtime decoded is dropped together with
 * `content-length`, so the headers describe the bytes actually delivered.
 */
export class FetchUpstream implements UpstreamHttp {
  private readonly fetchFn: UpstreamFetch;

  constructor(fetchFn: UpstreamFetch = (url, init) => fetch(url, init)) {
    this.fetchFn = fetchFn;
  }

  async forward(request: UpstreamRequest): Promise<UpstreamResponse> {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch (error) {
      throw new UpstreamError(request.url, "invalid_url", { cause: error });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const init: FetchInit = {
        method: request.method,
        headers: toHeaders(withoutHeaders(request.headers, ADAPTER_OWNED_REQUEST_HEADERS)),
        redirect: "manual",
        signal: controller.signal,
        ...(bodyFor(request)),
      };
      const response = await this.fetchFn(url, init);
      return { status: response.status, headers: responseHeaders(response.headers), body: response.body };
    } catch (error) {
      throw new UpstreamError(request.url, controller.signal.aborted ? "timeout" : "network", { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }
}

function bodyFor(request: UpstreamRequest): { body?: ArrayBuffer } {
  if (request.body === null || BODYLESS_METHODS.has(request.method.toUpperCase())) return {};
  return { body: request.body };
}

function toHeaders(list: HeaderList): Headers {
  const headers = new Headers();
  for (const [name, value] of list) headers.append(name, value);
  return headers;
}

function responseHeaders(headers: Headers): HeaderList {
  const list: Array<readonly [string, string]> = [];
  headers.forEach((value, name) => {
    if (name === "set-cookie") return;
    list.push([name, value]);
  });
  for (const cookie of headers.getSetCookie()) list.push(["set-cookie", cookie]);
  return headers.has("content-encoding") ? withoutHeaders(list, ENCODED_BODY_HEADERS) : list;
}
