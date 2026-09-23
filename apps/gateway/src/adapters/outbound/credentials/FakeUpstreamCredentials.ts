import type { CredentialsRequest, UpstreamCredentials } from "../../../application/ports/UpstreamCredentials.js";
import type { HeaderList } from "../../../domain/headers.js";

/** The header a FakeUpstreamCredentials adds unless told otherwise. */
export const FAKE_CREDENTIAL: readonly [string, string] = ["x-serverless-authorization", "Bearer fake-gateway-token"];

/** UpstreamCredentials for tests: adds fixed headers, records every request, and can be told to fail. */
export class FakeUpstreamCredentials implements UpstreamCredentials {
  /** Every request, in order. */
  readonly calls: CredentialsRequest[] = [];
  private readonly headers: HeaderList;
  private failure: Error | undefined;

  constructor(headers: HeaderList = [FAKE_CREDENTIAL]) {
    this.headers = headers;
  }

  /** Reject every request with `error` (UpstreamError plays an unreachable metadata server). */
  fail(error: Error): this {
    this.failure = error;
    return this;
  }

  async headersFor(request: CredentialsRequest): Promise<HeaderList> {
    this.calls.push(request);
    if (this.failure !== undefined) throw this.failure;
    return this.headers;
  }
}
