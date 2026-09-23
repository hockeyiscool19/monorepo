import { decideAccess, isHealthExempt } from "../domain/access.js";
import { withPrivateCaching, withVary } from "../domain/caching.js";
import { bearerToken, GATEWAY_CREDENTIAL_HEADERS, stripHopByHop, withoutHeaders, type HeaderList } from "../domain/headers.js";
import { isGuarded, type GuardedApp, type Registry } from "../domain/registry.js";
import { resolveRoute } from "../domain/routes.js";
import { deny, requireDoor, verifyFor, type AccessDeps, type BodyReader } from "./door.js";
import type { RegistrySource } from "./ports/RegistrySource.js";
import type { UpstreamHttp } from "./ports/UpstreamHttp.js";

/** The inbound request, already decoded from the transport: path, query, headers and a reader for its body. */
export interface InboundRequest {
  readonly method: string;
  /** URL path, e.g. `/api/vale/grocery/health`. */
  readonly path: string;
  /** Query string including the leading `?`, or "". */
  readonly search: string;
  readonly headers: HeaderList;
  /** The buffered body, read only once the request may be forwarded (never for a refused one). */
  readonly body: BodyReader;
}

/** What the transport needs to answer: the owning app, the status, filtered headers and the body stream. */
export interface ForwardResult {
  readonly appId: string;
  readonly status: number;
  readonly headers: HeaderList;
  readonly body: ReadableStream<Uint8Array> | null;
  /** The platform user a guarded app's API let through; undefined when no token was checked. For logs. */
  readonly uid?: string | undefined;
}

/** What `resolveAndForward` needs. */
export interface ResolveAndForwardDeps {
  readonly registry: RegistrySource;
  readonly upstream: UpstreamHttp;
  /** Mount point of the gateway, e.g. `/api`. */
  readonly apiPrefix: string;
  readonly upstreamTimeoutMs: number;
  /** The policy and upstream credentials of apps with an `access` block. */
  readonly access: AccessDeps;
}

/**
 * The API policy of a guarded app: a bearer token that passes the app's policy in the current registry, except
 * for GET/HEAD of exactly `<prefix>/<id><api.healthPath>`; ACCESS_MODE=open skips it. Like the door, it is
 * closed (door_unconfigured) without an enabled `platform.auth` and a SESSION_SECRET. Resolves with the uid
 * that passed, or undefined when no check applied.
 */
async function authorizeApiCall(
  deps: ResolveAndForwardDeps,
  registry: Registry,
  app: GuardedApp,
  request: InboundRequest,
): Promise<string | undefined> {
  if (isHealthExempt(app, request.method, request.path, deps.apiPrefix) || deps.access.mode === "open") return undefined;
  const door = requireDoor(registry, app, deps.access.sealer);
  const token = bearerToken(request.headers);
  if (token === undefined) throw deny(app, "sign_in_required", "no bearer token");
  const identity = await verifyFor(deps.access.verifier, token, door.auth, app, false);
  const decision = decideAccess(app, identity.groups);
  if (!decision.allowed) throw deny(app, decision.reason, `not in the groups of ${app.id}`, { uid: identity.uid });
  return identity.uid;
}

/**
 * Use case: resolve `<prefix>/<id><rest>` against the registry and forward the request to the
 * app's `api.baseUrl`, preserving method, path remainder, query, body and end-to-end headers.
 * Hop-by-hop headers are stripped in both directions. For an app with an `access` block the API
 * policy applies first, the gateway's upstream credentials replace any the caller sent, and the
 * answer is cached privately and varies on Authorization.
 * Rejects with UnknownAppError (no such app or no `api`), AccessDeniedError (the policy),
 * UpstreamError (no response or no credentials) or the registry errors of RegistrySource.
 */
export async function resolveAndForward(deps: ResolveAndForwardDeps, request: InboundRequest): Promise<ForwardResult> {
  const registry = await deps.registry.load();
  const route = resolveRoute(registry, request.path, request.search, deps.apiPrefix);
  const guarded = isGuarded(route.app);
  const uid = guarded ? await authorizeApiCall(deps, registry, route.app, request) : undefined;
  const headers = guarded
    ? [
        ...withoutHeaders(stripHopByHop(request.headers), GATEWAY_CREDENTIAL_HEADERS),
        ...(await deps.access.credentials.headersFor({ url: route.upstreamUrl })),
      ]
    : stripHopByHop(request.headers);
  const response = await deps.upstream.forward({
    method: request.method,
    url: route.upstreamUrl,
    headers,
    body: await request.body(),
    timeoutMs: deps.upstreamTimeoutMs,
  });
  const answered = stripHopByHop(response.headers);
  return {
    appId: route.app.id,
    status: response.status,
    headers: guarded ? withVary(withPrivateCaching(answered), "Authorization") : answered,
    body: response.body,
    uid,
  };
}
