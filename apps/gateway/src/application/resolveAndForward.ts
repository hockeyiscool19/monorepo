import { stripHopByHop, type HeaderList } from "../domain/headers.js";
import { resolveRoute } from "../domain/routes.js";
import type { RegistrySource } from "./ports/RegistrySource.js";
import type { UpstreamHttp } from "./ports/UpstreamHttp.js";

/** The inbound request, already decoded from the transport: path, query, headers and buffered body. */
export interface InboundRequest {
  readonly method: string;
  /** URL path, e.g. `/api/vale/grocery/health`. */
  readonly path: string;
  /** Query string including the leading `?`, or "". */
  readonly search: string;
  readonly headers: HeaderList;
  readonly body: ArrayBuffer | null;
}

/** What the transport needs to answer: the owning app, the status, filtered headers and the body stream. */
export interface ForwardResult {
  readonly appId: string;
  readonly status: number;
  readonly headers: HeaderList;
  readonly body: ReadableStream<Uint8Array> | null;
}

/** What `resolveAndForward` needs. */
export interface ResolveAndForwardDeps {
  readonly registry: RegistrySource;
  readonly upstream: UpstreamHttp;
  /** Mount point of the gateway, e.g. `/api`. */
  readonly apiPrefix: string;
  readonly upstreamTimeoutMs: number;
}

/**
 * Use case: resolve `<prefix>/<id><rest>` against the registry and forward the request to the
 * app's `api.baseUrl`, preserving method, path remainder, query, body and end-to-end headers.
 * Hop-by-hop headers are stripped in both directions.
 * Rejects with UnknownAppError (no such app or no `api`), UpstreamError (no response) or the
 * registry errors of RegistrySource.
 */
export async function resolveAndForward(deps: ResolveAndForwardDeps, request: InboundRequest): Promise<ForwardResult> {
  const registry = await deps.registry.load();
  const route = resolveRoute(registry, request.path, request.search, deps.apiPrefix);
  const response = await deps.upstream.forward({
    method: request.method,
    url: route.upstreamUrl,
    headers: stripHopByHop(request.headers),
    body: request.body,
    timeoutMs: deps.upstreamTimeoutMs,
  });
  return {
    appId: route.app.id,
    status: response.status,
    headers: stripHopByHop(response.headers),
    body: response.body,
  };
}
