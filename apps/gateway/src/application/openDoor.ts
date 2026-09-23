import { decideAccess } from "../domain/access.js";
import { bearerToken } from "../domain/headers.js";
import { liveAppPart, NO_APP_PART, startSession, type AppPart, type Envelope } from "../domain/session.js";
import { deny, nowSeconds, readDoorCookies, requireDoor, sealedDoorCookie, verifyFor, type DoorCookies, type DoorDeps, type DoorRequest } from "./door.js";

/** What `POST <app.path>/__door/session` answers: who is now signed in at this door, and the cookie that says so. */
export interface OpenDoorResult {
  readonly appId: string;
  readonly uid: string;
  /** The person's `groups` claim, as sealed into the session. */
  readonly groups: readonly string[];
  /** Unix seconds when the platform session ends. */
  readonly expiresAt: number;
  /** The door's Set-Cookie: the sealed envelope. */
  readonly setCookie: string;
}

/**
 * The app cookie a new session starts with. It is kept only when the envelope already in the browser belongs to
 * the same person (an expired session still names its owner), so signing in as someone else on a shared browser
 * never inherits the previous person's app session. With no envelope at all, an unsealed `__session` from before
 * the door is adopted: that is how an existing app login migrates into the envelope.
 */
function startingAppPart(cookies: DoorCookies, uid: string, now: number): AppPart {
  if (cookies.envelope !== undefined) return cookies.envelope.p?.uid === uid ? liveAppPart(cookies.envelope, now) : NO_APP_PART;
  return cookies.legacy === undefined ? NO_APP_PART : { a: cookies.legacy, ax: null };
}

/**
 * Use case: sign a browser in at one door. Verifies the `Authorization: Bearer` Firebase ID token for the
 * registry's `platform.auth.projectId`, applies the app's policy, and seals a new platform session
 * (`sessionHours` long, never extended) with the app part chosen by `startingAppPart` into the app's cookie.
 * Rejects with AccessDeniedError — door_unconfigured; sign_in_required (no token: nothing changes; a refused
 * token: the door session ends too); group_required (the door session ends too) — SessionTooLargeError, and
 * UpstreamError when Google's signing keys cannot be fetched.
 */
export async function openDoor(deps: DoorDeps, request: DoorRequest): Promise<OpenDoorResult> {
  const { app } = request;
  const door = requireDoor(request.registry, app, deps.sealer);
  const token = bearerToken(request.headers);
  if (token === undefined) throw deny(app, "sign_in_required", "no bearer token");
  const identity = await verifyFor(deps.verifier, token, door.auth, app, true);
  const decision = decideAccess(app, identity.groups);
  if (!decision.allowed) {
    throw deny(app, decision.reason, `not in the groups of ${app.id}`, { uid: identity.uid, endsSession: true });
  }
  const now = nowSeconds(deps.clock);
  const session = startSession(identity, now, door.auth.sessionHours);
  const cookies = readDoorCookies(request.headers, door.sealer, app.id);
  const envelope: Envelope = { p: session, ...startingAppPart(cookies, identity.uid, now) };
  return {
    appId: app.id,
    uid: identity.uid,
    groups: identity.groups,
    expiresAt: session.exp,
    setCookie: sealedDoorCookie(door.sealer, app, envelope, now, request.secureCookie),
  };
}
