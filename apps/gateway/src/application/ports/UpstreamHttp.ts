import type { HeaderList } from "../../domain/headers.js";

/** One HTTP request to send to an upstream. `headers` are already free of hop-by-hop headers. */
export interface UpstreamRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: HeaderList;
  /** Buffered request body; null for bodyless methods. */
  readonly body: ArrayBuffer | null;
  /** Time allowed until the response headers arrive; the body may stream longer. */
  readonly timeoutMs: number;
}

/** The upstream's answer. `body` streams and must be consumed or cancelled by the caller. */
export interface UpstreamResponse {
  readonly status: number;
  readonly headers: HeaderList;
  readonly body: ReadableStream<Uint8Array> | null;
}

/**
 * Outbound port: send one request to an upstream and return whatever it answered.
 *
 * `forward()` resolves for every HTTP response, 4xx and 5xx included (they are the upstream's
 * answer, not a gateway failure), and does not follow redirects. It rejects with UpstreamError
 * only when no response is obtained: invalid URL, DNS/connect/TLS failure, connection reset, or
 * no response headers within `timeoutMs` (reason `timeout`). Adapters own connection-level
 * headers (`host`, `content-length`, `accept-encoding`) and hand back headers that describe
 * the body they return.
 */
export interface UpstreamHttp {
  forward(request: UpstreamRequest): Promise<UpstreamResponse>;
}
