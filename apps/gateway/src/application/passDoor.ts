import { decideAccess } from "../domain/access.js";
import { withPrivateCaching } from "../domain/caching.js";
import { parseSetCookie, SESSION_COOKIE, type SetCookie } from "../domain/cookies.js";
import { GATEWAY_CREDENTIAL_HEADERS, stripHopByHop, withoutHeaders, type HeaderList } from "../domain/headers.js";
import { joinUpstream } from "../domain/routes.js";
import { applyAppCookie, isSessionLive, liveAppPart } from "../domain/session.js";
import {
  credentialsFor,
  deny,
  doorUpstreamHeaders,
  nowSeconds,
  readDoorCookies,
  requireDoor,
  sealedDoorCookie,
  type DoorDeps,
  type DoorRequest,
} from "./door.js";

/** What the door answers for a request it let through. */
export interface PassDoorResult {
  readonly appId: string;
  /** The platform user let through; undefined when ACCESS_MODE=open. */
  readonly uid: string | undefined;
  readonly status: number;
  /** The upstream's headers without hop-by-hop ones, cached privately, with the app's `__session` re-sealed. */
  readonly headers: HeaderList;
  readonly body: ReadableStream<Uint8Array> | null;
}

/** The upstream's headers, with the Set-Cookies for `__session` taken out (in order) and everything else kept. */
function takeAppCookies(headers: HeaderList): { readonly rest: HeaderList; readonly appCookies: readonly SetCookie[] } {
  const rest: Array<readonly [string, string]> = [];
  const appCookies: SetCookie[] = [];
  for (const header of headers) {
    const cookie = header[0] === "set-cookie" ? parseSetCookie(header[1]) : undefined;
    if (cookie?.name === SESSION_COOKIE) appCookies.push(cookie);
    else rest.push(header);
  }
  return { rest, appCookies };
}

/** ACCESS_MODE=open: no door at all. The request goes through as it came, cookies untouched. */
async function forwardOpen(deps: DoorDeps, request: DoorRequest, url: string): Promise<PassDoorResult> {
  const credentials = await credentialsFor(deps.credentials, request.app, url);
  const response = await deps.upstream.forward({
    method: request.method,
    url,
    headers: [...withoutHeaders(stripHopByHop(request.headers), GATEWAY_CREDENTIAL_HEADERS), ...credentials],
    body: await request.body(),
    timeoutMs: deps.upstreamTimeoutMs,
  });
  const headers = withPrivateCaching(stripHopByHop(response.headers));
  return { appId: request.app.id, uid: undefined, status: response.status, headers, body: response.body };
}

/**
 * Use case: take a request through a guarded app's door (any method, any path under `<app.path>` except the
 * session endpoint). The envelope must open for this app, its platform session must be live, and its groups
 * must pass the app's policy in the CURRENT registry — re-checked on every request. The request then goes to
 * `web.url` + path + query with every `__session` removed and `__session=<the app's own cookie>` added when the
 * envelope carries one. A `__session` the app sets (or deletes) is re-sealed, with the unchanged platform part,
 * into one door Set-Cookie; every other Set-Cookie, redirects and the body pass through untouched.
 * ACCESS_MODE=open skips the door entirely (credentials still apply). The request body is read only once the
 * request is let through.
 * Rejects with AccessDeniedError (door_unconfigured, sign_in_required, session_expired, group_required),
 * SessionTooLargeError (the upstream body is cancelled) and UpstreamError.
 */
export async function passDoor(deps: DoorDeps, request: DoorRequest): Promise<PassDoorResult> {
  const { app } = request;
  const url = joinUpstream(app.web.url, request.path) + request.search;
  if (deps.mode === "open") return forwardOpen(deps, request, url);

  const door = requireDoor(request.registry, app, deps.sealer);
  const now = nowSeconds(deps.clock);
  const cookies = readDoorCookies(request.headers, door.sealer, app.id);
  const envelope = cookies.envelope;
  const session = envelope?.p ?? null;
  if (envelope === undefined || session === null) throw deny(app, "sign_in_required", "no door session");
  if (!isSessionLive(session, now, door.auth.sessionHours)) {
    throw deny(app, "session_expired", "the door session is over", { uid: session.uid });
  }
  const decision = decideAccess(app, session.groups);
  if (!decision.allowed) throw deny(app, decision.reason, `not in the groups of ${app.id}`, { uid: session.uid });

  const appPart = liveAppPart(envelope, now);
  const credentials = await credentialsFor(deps.credentials, app, url);
  const response = await deps.upstream.forward({
    method: request.method,
    url,
    headers: doorUpstreamHeaders(request.headers, cookies.others, appPart.a, credentials),
    body: await request.body(),
    timeoutMs: deps.upstreamTimeoutMs,
  });

  const { rest, appCookies } = takeAppCookies(stripHopByHop(response.headers));
  const last = appCookies[appCookies.length - 1];
  let resealed: HeaderList = [];
  if (last !== undefined) {
    try {
      const next = { p: session, ...applyAppCookie(last, now) };
      resealed = [["set-cookie", sealedDoorCookie(door.sealer, app, next, now, request.secureCookie)]];
    } catch (error) {
      await response.body?.cancel().catch(() => undefined);
      throw error;
    }
  }
  const headers = [...withPrivateCaching(rest), ...resealed];
  return { appId: app.id, uid: session.uid, status: response.status, headers, body: response.body };
}
