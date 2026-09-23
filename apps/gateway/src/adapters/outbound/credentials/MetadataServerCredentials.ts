import { decodeJwt } from "jose";
import type { Clock } from "../../../application/ports/Clock.js";
import type { CredentialsRequest, UpstreamCredentials } from "../../../application/ports/UpstreamCredentials.js";
import { originOf } from "../../../domain/cors.js";
import { UpstreamError } from "../../../domain/errors.js";
import type { HeaderList } from "../../../domain/headers.js";

/** The metadata server's endpoint for an ID token of the service's own account. */
export const METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

/** Where Cloud Run reads the caller's identity from when `Authorization` belongs to the app. */
export const CREDENTIAL_HEADER = "x-serverless-authorization";

/** The subset of `fetch` this adapter uses; tests pass a stub. */
export type MetadataFetch = (
  url: string,
  init: { readonly headers: Record<string, string>; readonly signal: AbortSignal },
) => Promise<Response>;

/** Construction options. */
export interface MetadataServerCredentialsOptions {
  /** Decides when a cached token is due for renewal. */
  readonly clock: Clock;
  readonly fetchFn?: MetadataFetch;
  /** Time allowed for one metadata request (default 2 s). */
  readonly timeoutMs?: number;
  /** A cached token is renewed this long before its `exp` (default 300 s). */
  readonly refreshBeforeSeconds?: number;
}

interface Cached {
  readonly token: string;
  readonly refreshAtMs: number;
}

/** The `exp` of a JWT, read without verification (the metadata server is the trusted source), or undefined. */
function expiryOf(token: string): number | undefined {
  try {
    const { exp } = decodeJwt(token);
    return typeof exp === "number" ? exp : undefined;
  } catch {
    return undefined;
  }
}

/**
 * UpstreamCredentials from the Cloud Run metadata server: an ID token whose audience is the upstream's origin
 * (what Cloud Run IAM checks), sent as `x-serverless-authorization: Bearer <token>` so the app keeps its own
 * `Authorization`. Tokens are cached per audience until five minutes before their `exp` (a token without a
 * readable `exp` is not cached), and concurrent requests share one fetch. Any failure is UpstreamError.
 */
export class MetadataServerCredentials implements UpstreamCredentials {
  private readonly clock: Clock;
  private readonly fetchFn: MetadataFetch;
  private readonly timeoutMs: number;
  private readonly refreshBeforeMs: number;
  private readonly cache = new Map<string, Cached>();
  private readonly inflight = new Map<string, Promise<string>>();

  constructor(options: MetadataServerCredentialsOptions) {
    this.clock = options.clock;
    this.fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.refreshBeforeMs = (options.refreshBeforeSeconds ?? 300) * 1000;
  }

  async headersFor(request: CredentialsRequest): Promise<HeaderList> {
    const audience = originOf(request.url);
    if (audience === undefined) throw new UpstreamError(request.url, "invalid_url");
    return [[CREDENTIAL_HEADER, `Bearer ${await this.tokenFor(audience)}`]];
  }

  private async tokenFor(audience: string): Promise<string> {
    const cached = this.cache.get(audience);
    if (cached !== undefined && this.clock.now() < cached.refreshAtMs) return cached.token;
    let pending = this.inflight.get(audience);
    if (pending === undefined) {
      pending = this.fetchToken(audience).finally(() => this.inflight.delete(audience));
      this.inflight.set(audience, pending);
    }
    return pending;
  }

  private async fetchToken(audience: string): Promise<string> {
    const url = `${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}&format=full`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let token: string;
    try {
      const response = await this.fetchFn(url, { headers: { "Metadata-Flavor": "Google" }, signal: controller.signal });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(`metadata server answered HTTP ${response.status}`);
      }
      token = (await response.text()).trim();
    } catch (error) {
      throw new UpstreamError(url, controller.signal.aborted ? "timeout" : "network", { cause: error });
    } finally {
      clearTimeout(timer);
    }
    if (token === "") throw new UpstreamError(url, "network", { cause: new Error("metadata server returned no token") });
    const exp = expiryOf(token);
    if (exp !== undefined) this.cache.set(audience, { token, refreshAtMs: exp * 1000 - this.refreshBeforeMs });
    return token;
  }
}
