import type { Handler } from "hono";
import { closeDoor } from "../../application/closeDoor.js";
import { findDoor, type DoorDeps, type DoorRequest } from "../../application/door.js";
import { openDoor } from "../../application/openDoor.js";
import { passDoor } from "../../application/passDoor.js";
import type { RegistrySource } from "../../application/ports/RegistrySource.js";
import { gateLocation, isDoorSessionPath, isNavigation } from "../../domain/access.js";
import { addVary, PRIVATE_NO_STORE } from "../../domain/caching.js";
import { clearedDoorCookie, secureCookieFor } from "../../domain/cookies.js";
import { AccessDeniedError } from "../../domain/errors.js";
import { headerValue } from "../../domain/headers.js";
import type { Logger } from "../outbound/log/Logger.js";
import { errorResponse } from "./errors.js";
import { bufferedBody, headerList, toHeaders } from "./http.js";

/** What the door's HTTP surface needs. */
export interface DoorRouteDeps extends DoorDeps {
  readonly registry: RegistrySource;
  readonly log: Logger;
}

const JSON_TYPE = "application/json; charset=utf-8";

/** Every door answer varies on Cookie; answers the door writes itself also get `cacheControl`. */
function doorAnswer(response: Response, cacheControl?: string): Response {
  response.headers.set("vary", addVary(response.headers.get("vary"), "Cookie"));
  if (cacheControl !== undefined) response.headers.set("cache-control", cacheControl);
  return response;
}

/** `POST` signs the browser in at this door, `DELETE` signs it out; any other method is 405. */
async function sessionEndpoint(deps: DoorRouteDeps, request: DoorRequest): Promise<Response> {
  if (request.method === "POST") {
    const opened = await openDoor(deps, request);
    deps.log.info("door opened", { app: opened.appId, uid: opened.uid, decision: "allowed" });
    const body = {
      app: opened.appId,
      uid: opened.uid,
      groups: opened.groups,
      expiresAt: new Date(opened.expiresAt * 1000).toISOString(),
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": JSON_TYPE, "set-cookie": opened.setCookie } });
  }
  if (request.method === "DELETE") {
    const closed = closeDoor(deps, request);
    deps.log.info("door closed", { app: closed.appId, uid: closed.uid, decision: "signed_out" });
    return new Response(null, { status: 204, headers: { "set-cookie": closed.setCookie } });
  }
  const body = JSON.stringify({ error: "method_not_allowed", allow: ["POST", "DELETE"] });
  return new Response(body, { status: 405, headers: { allow: "POST, DELETE", "content-type": JSON_TYPE } });
}

/**
 * The answer to a failed door request: a 303 back to the portal for a denied navigation, otherwise the JSON
 * error of errorResponse. A failed sign-in attempt (`endsSession`) also removes the door cookie.
 */
function refusal(error: unknown, request: DoorRequest, log: Logger): Response {
  const response = errorResponse(error, log, { method: request.method, path: request.path });
  if (!(error instanceof AccessDeniedError)) return response;
  const answer = isNavigation(request.method, headerValue(request.headers, "accept"))
    ? new Response(null, { status: 303, headers: { location: gateLocation(request.app.id, error.reason) } })
    : response;
  if (error.endsSession) answer.headers.append("set-cookie", clearedDoorCookie(request.app.path, request.secureCookie));
  return answer;
}

/**
 * The door's HTTP surface, mounted as the catch-all after the API routes. The registry of each request decides
 * whether the path belongs to an app with an `access` block (the registry changes at runtime); any other path
 * gets the gateway's 404. On a door path:
 * - `POST <app.path>/__door/session` → openDoor → 200 `{app, uid, groups, expiresAt}` and the sealed cookie;
 * - `DELETE <app.path>/__door/session` → closeDoor → 204 and a cookie that removes it; other methods → 405;
 * - anything else under `<app.path>` → passDoor → the app's answer, with `x-upstream-app`.
 * A denied navigation (GET/HEAD accepting text/html) is a 303 to `/?gate=<id>&reason=<reason>`; any other failure
 * is the JSON error of errorResponse. Every door answer varies on Cookie, and all but forwarded ones are
 * `private, no-store`. Logs carry app, uid, decision and reason — never tokens, cookies or envelopes.
 */
export function doorRoute(deps: DoorRouteDeps): Handler {
  return async (c) => {
    const url = new URL(c.req.url);
    const match = await findDoor(deps, url.pathname);
    if (match === undefined) return c.notFound();
    const method = c.req.method.toUpperCase();
    const session = isDoorSessionPath(match.app, url.pathname);
    const request: DoorRequest = {
      ...match,
      method,
      path: url.pathname,
      search: url.search,
      headers: headerList(c.req.raw.headers),
      body: () => bufferedBody(c.req.raw, method),
      secureCookie: secureCookieFor(c.req.url),
    };
    try {
      if (session) return doorAnswer(await sessionEndpoint(deps, request), PRIVATE_NO_STORE);
      const result = await passDoor(deps, request);
      deps.log.debug("door passed", { app: result.appId, uid: result.uid, decision: "allowed" });
      const headers = toHeaders(result.headers);
      headers.set("x-upstream-app", result.appId);
      return doorAnswer(new Response(result.body, { status: result.status, headers }));
    } catch (error) {
      return doorAnswer(refusal(error, request, deps.log), PRIVATE_NO_STORE);
    }
  };
}
