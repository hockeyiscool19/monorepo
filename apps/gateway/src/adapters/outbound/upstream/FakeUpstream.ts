import type { UpstreamHttp, UpstreamRequest, UpstreamResponse } from "../../../application/ports/UpstreamHttp.js";
import { UpstreamError, type UpstreamFailureReason } from "../../../domain/errors.js";
import type { HeaderList } from "../../../domain/headers.js";

/** Produces the response for a matched request. */
export type FakeResponder = (request: UpstreamRequest) => UpstreamResponse | Promise<UpstreamResponse>;

interface Rule {
  readonly prefix: string;
  readonly respond: FakeResponder;
}

/**
 * An UpstreamHttp for tests: scripted by URL prefix, records every request, never touches the
 * network. Requests that match no rule fail like an unreachable host.
 */
export class FakeUpstream implements UpstreamHttp {
  /** Every request forwarded so far, in order. */
  readonly requests: UpstreamRequest[] = [];
  private readonly rules: Rule[] = [];

  /** Answer requests whose URL starts with `prefix`. Later rules do not override earlier ones. */
  on(prefix: string, respond: FakeResponder): this {
    this.rules.push({ prefix, respond });
    return this;
  }

  /** Answer requests whose URL starts with `prefix` with a fixed response. */
  reply(prefix: string, status: number, body?: string | object, headers: HeaderList = []): this {
    return this.on(prefix, () => fakeResponse(status, body, headers));
  }

  /** Fail requests whose URL starts with `prefix` as if no response arrived. */
  failOn(prefix: string, reason: UpstreamFailureReason = "network"): this {
    return this.on(prefix, (request) => {
      throw new UpstreamError(request.url, reason);
    });
  }

  async forward(request: UpstreamRequest): Promise<UpstreamResponse> {
    this.requests.push(request);
    const rule = this.rules.find((candidate) => request.url.startsWith(candidate.prefix));
    if (rule === undefined) throw new UpstreamError(request.url, "network", { cause: new Error("no fake rule") });
    return rule.respond(request);
  }
}

/** Build an UpstreamResponse from text or a JSON-serialisable object (or no body at all). */
export function fakeResponse(status: number, body?: string | object, headers: HeaderList = []): UpstreamResponse {
  if (body === undefined) return { status, headers, body: null };
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const contentType: HeaderList =
    typeof body === "string" ? [["content-type", "text/plain; charset=utf-8"]] : [["content-type", "application/json"]];
  return { status, headers: [...contentType, ...headers], body: new Blob([text]).stream() };
}
