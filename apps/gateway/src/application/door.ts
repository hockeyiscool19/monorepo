/**
 * What the door's use cases share: their dependencies and request model, finding the door for a path, failing
 * closed when the door is not configured, reading a request's `__session` cookies, building what the app
 * receives, and sealing the door's cookie. Imports domain and ports only.
 */

import { doorAppFor, type AccessMode } from "../domain/access.js";
import { parseCookieHeader, serializeCookiePairs, serializeDoorCookie, SESSION_COOKIE, type CookiePair } from "../domain/cookies.js";
import { AccessDeniedError, SessionTooLargeError, type DenialDetails, type DenialReason } from "../domain/errors.js";
import { GATEWAY_CREDENTIAL_HEADERS, headerValues, stripHopByHop, withoutHeaders, type HeaderList } from "../domain/headers.js";
import type { AppManifest, GuardedApp, PlatformAuth, Registry } from "../domain/registry.js";
import { cookieMaxAge, MAX_SEALED_LENGTH, SEALED_PREFIX, type Envelope, type VerifiedIdentity } from "../domain/session.js";
import type { Clock } from "./ports/Clock.js";
import type { IdentityVerifier } from "./ports/IdentityVerifier.js";
import type { RegistrySource } from "./ports/RegistrySource.js";
import type { SessionSealer } from "./ports/SessionSealer.js";
import type { UpstreamCredentials } from "./ports/UpstreamCredentials.js";
import type { UpstreamHttp } from "./ports/UpstreamHttp.js";

/** The access machinery shared by the door, the API policy, whoAmI and the health probe. */
export interface AccessDeps {
  readonly verifier: IdentityVerifier;
  /** Undefined when SESSION_SECRET is not set: every guarded app is closed (door_unconfigured). */
  readonly sealer: SessionSealer | undefined;
  readonly credentials: UpstreamCredentials;
  readonly mode: AccessMode;
}

/** What the door's use cases need. */
export interface DoorDeps extends AccessDeps {
  readonly upstream: UpstreamHttp;
  readonly clock: Clock;
  /** Time an upstream gets to start answering a forwarded request. */
  readonly upstreamTimeoutMs: number;
}

/**
 * Reads the request body, buffered (null for bodyless methods). Use cases call it only once a request may be
 * forwarded, so a refused request's body is never read.
 */
export type BodyReader = () => Promise<ArrayBuffer | null>;

/** A BodyReader for a body already in hand (or none). */
export function bodyOf(body: ArrayBuffer | null): BodyReader {
  return async () => body;
}

/** A request under a guarded app's path, decoded from the transport, with the registry it was matched against. */
export interface DoorRequest {
  readonly registry: Registry;
  readonly app: GuardedApp;
  readonly method: string;
  /** URL path, e.g. `/vale/list`; forwarded whole (apps serve under their path). */
  readonly path: string;
  /** Query string including the leading `?`, or "". */
  readonly search: string;
  readonly headers: HeaderList;
  /** The body, read only after the door lets the request through. */
  readonly body: BodyReader;
  /** Whether the door's Set-Cookie carries Secure (false only for plain http to a loopback host). */
  readonly secureCookie: boolean;
}

/** A path matched to the guarded app that owns it, in the registry of this request. */
export interface DoorMatch {
  readonly registry: Registry;
  readonly app: GuardedApp;
}

/**
 * Use case: the guarded app whose path owns `pathname` in the current registry, or undefined when the path is
 * no door. Rejects with the RegistrySource errors (the door stays shut when the registry is unavailable).
 */
export async function findDoor(deps: { readonly registry: RegistrySource }, pathname: string): Promise<DoorMatch | undefined> {
  const registry = await deps.registry.load();
  const app = doorAppFor(registry, pathname);
  return app === undefined ? undefined : { registry, app };
}

/** A denial of `app`. Policy denials (sign_in_required, group_required) carry the groups that would pass. */
export function deny(app: GuardedApp, reason: DenialReason, message: string, details: DenialDetails = {}): AccessDeniedError {
  const groups = reason === "sign_in_required" || reason === "group_required" ? app.access.groups : undefined;
  return new AccessDeniedError(reason, message, { appId: app.id, groups, ...details });
}

/** The door's configuration for one request. */
export interface DoorParts {
  readonly auth: PlatformAuth;
  readonly sealer: SessionSealer;
}

/**
 * The platform sign-in and the sealer, or AccessDeniedError(door_unconfigured) when the registry has no enabled
 * `platform.auth` or SESSION_SECRET is not set: a door that cannot judge stays shut.
 */
export function requireDoor(registry: Registry, app: GuardedApp, sealer: SessionSealer | undefined): DoorParts {
  const auth = registry.platform?.auth;
  if (auth === undefined || !auth.enabled) throw deny(app, "door_unconfigured", "platform sign-in is missing or disabled");
  if (sealer === undefined) throw deny(app, "door_unconfigured", "SESSION_SECRET is not configured");
  return { auth, sealer };
}

/**
 * Verify a bearer token for `app`'s door. A token the verifier refuses becomes this app's sign_in_required
 * denial (`endsSession` says whether the answer must also end the browser's door session); UpstreamError passes.
 */
export async function verifyFor(
  verifier: IdentityVerifier,
  token: string,
  auth: PlatformAuth,
  app: GuardedApp,
  endsSession: boolean,
): Promise<VerifiedIdentity> {
  try {
    return await verifier.verify({ token, projectId: auth.projectId });
  } catch (error) {
    if (error instanceof AccessDeniedError) throw error.withDetails({ appId: app.id, groups: app.access.groups, endsSession });
    throw error;
  }
}

/** A request's cookies, sorted out for one door. */
export interface DoorCookies {
  /** The first `__session` value that opens as this app's envelope. */
  readonly envelope: Envelope | undefined;
  /** The first non-empty `__session` value not starting with `d1.`: the app's own cookie from before the door. */
  readonly legacy: string | undefined;
  /** Every cookie not named `__session`, in order, forwarded untouched. */
  readonly others: readonly CookiePair[];
}

/**
 * Try every `__session` value of every Cookie header: the first that opens as `appId`'s envelope wins, the first
 * unsealed one is the legacy app cookie, and anything else (another app's envelope, a tampered value, a retired
 * key) is ignored. With no sealer nothing opens.
 */
export function readDoorCookies(headers: HeaderList, sealer: SessionSealer | undefined, appId: string): DoorCookies {
  let envelope: Envelope | undefined;
  let legacy: string | undefined;
  const others: CookiePair[] = [];
  for (const header of headerValues(headers, "cookie")) {
    for (const pair of parseCookieHeader(header)) {
      if (pair.name !== SESSION_COOKIE) others.push(pair);
      else if (pair.value.startsWith(SEALED_PREFIX)) envelope ??= sealer?.open({ appId, value: pair.value });
      else if (pair.value !== "") legacy ??= pair.value;
    }
  }
  return { envelope, legacy, others };
}

/** Request headers never forwarded to a guarded app as the caller sent them. */
const DOOR_REPLACED_REQUEST_HEADERS: ReadonlySet<string> = new Set(["cookie", ...GATEWAY_CREDENTIAL_HEADERS]);

/**
 * What a guarded app receives: the caller's headers without hop-by-hop headers, Cookie and gateway credential
 * headers; then one Cookie header with the other cookies plus `__session=<appCookie>` when there is one (never
 * the envelope); then the gateway's own credentials.
 */
export function doorUpstreamHeaders(
  headers: HeaderList,
  others: readonly CookiePair[],
  appCookie: string | null,
  credentials: HeaderList,
): HeaderList {
  const pairs = appCookie === null ? others : [...others, { name: SESSION_COOKIE, value: appCookie }];
  const cookie: HeaderList = pairs.length === 0 ? [] : [["cookie", serializeCookiePairs(pairs)]];
  return [...withoutHeaders(stripHopByHop(headers), DOOR_REPLACED_REQUEST_HEADERS), ...cookie, ...credentials];
}

/** The gateway's credential headers for a request to `url`: only apps with an `access` block get any. */
export async function credentialsFor(credentials: UpstreamCredentials, app: AppManifest, url: string): Promise<HeaderList> {
  return app.access === undefined ? [] : credentials.headersFor({ url });
}

/** Seal `envelope` into the door's Set-Cookie for `app`; SessionTooLargeError when the sealed value is too long. */
export function sealedDoorCookie(sealer: SessionSealer, app: GuardedApp, envelope: Envelope, now: number, secure: boolean): string {
  const value = sealer.seal({ appId: app.id, envelope });
  if (value.length > MAX_SEALED_LENGTH) throw new SessionTooLargeError(app.id, value.length, MAX_SEALED_LENGTH);
  return serializeDoorCookie({ value, path: app.path, maxAge: cookieMaxAge(envelope, now), secure });
}

/** The clock's time in whole Unix seconds. */
export function nowSeconds(clock: Clock): number {
  return Math.floor(clock.now() / 1000);
}
