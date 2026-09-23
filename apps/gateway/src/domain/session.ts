/**
 * The door's session: the envelope sealed into a guarded app's `__session` cookie. Firebase Hosting forwards
 * only `__session` to Cloud Run, so one envelope carries both the platform session (`p`) and the app's own
 * `__session` value (`a`, expiring at `ax`). Times are Unix seconds. Pure: sealing lives behind SessionSealer.
 */

import { cookieEffect, type SetCookie } from "./cookies.js";

/** Prefix of a sealed envelope, format version 1: `d1.<iv>.<ciphertext>` in base64url. */
export const SEALED_PREFIX = "d1.";
/** Longest sealed value the door will set; browsers cap a whole cookie near 4096 bytes. */
export const MAX_SEALED_LENGTH = 3800;
/** Floor of the door cookie's Max-Age, in seconds. */
export const MIN_COOKIE_MAX_AGE = 60;
/** Clock skew tolerated between gateway instances when a session's `iat` is checked. */
export const SESSION_SKEW_SECONDS = 60;

/** Who a verified Firebase ID token says the caller is. `groups` is the `groups` custom claim ([] without one). */
export interface VerifiedIdentity {
  readonly uid: string;
  readonly email?: string;
  readonly emailVerified: boolean;
  readonly name?: string;
  readonly picture?: string;
  /** `firebase.sign_in_provider`, e.g. `google.com` or `password`. */
  readonly provider?: string;
  readonly groups: readonly string[];
}

/** The platform part of an envelope: who signed in, their groups at sign-in, and the session's lifetime. */
export interface PlatformSession {
  readonly uid: string;
  readonly email?: string;
  readonly name?: string;
  readonly groups: readonly string[];
  readonly iat: number;
  readonly exp: number;
}

/** The sealed plaintext. `a` is the app's own `__session` value; `ax` its expiry (null: a browser-session cookie). */
export interface Envelope {
  readonly p: PlatformSession | null;
  readonly a: string | null;
  readonly ax: number | null;
}

/** The app's own cookie as the envelope carries it. */
export interface AppPart {
  readonly a: string | null;
  readonly ax: number | null;
}

/** No app cookie. */
export const NO_APP_PART: AppPart = { a: null, ax: null };

/** A new platform session for `identity`, from `now` for `sessionHours`. */
export function startSession(identity: VerifiedIdentity, now: number, sessionHours: number): PlatformSession {
  return {
    uid: identity.uid,
    ...(identity.email === undefined ? {} : { email: identity.email }),
    ...(identity.name === undefined ? {} : { name: identity.name }),
    groups: identity.groups,
    iat: now,
    exp: now + sessionHours * 3600,
  };
}

/**
 * True while `session` may be used at `now`: it was not issued in the future (beyond instance skew) and has not
 * ended. It ends at the earlier of its own `exp` and `iat + sessionHours`, where `sessionHours` is the registry's
 * current value, so shortening it in the registry shortens sessions already issued.
 */
export function isSessionLive(session: PlatformSession, now: number, sessionHours: number): boolean {
  const end = Math.min(session.exp, session.iat + sessionHours * 3600);
  return session.iat <= now + SESSION_SKEW_SECONDS && now < end;
}

/** The app part of `envelope` still in force at `now`: an app cookie past its expiry is gone, as in a browser. */
export function liveAppPart(envelope: Envelope, now: number): AppPart {
  if (envelope.a === null || (envelope.ax !== null && envelope.ax <= now)) return NO_APP_PART;
  return { a: envelope.a, ax: envelope.ax };
}

/** The app part after the app answered with `cookie` (a Set-Cookie for `__session`) at `now`. */
export function applyAppCookie(cookie: SetCookie, now: number): AppPart {
  const effect = cookieEffect(cookie, now);
  return effect.deleted ? NO_APP_PART : { a: cookie.value, ax: effect.expiresAt };
}

/** Max-Age of the door cookie at `now`: until the later of the session's end and the app cookie's expiry, ≥ 60 s. */
export function cookieMaxAge(envelope: Envelope, now: number): number {
  const until = Math.max(envelope.p?.exp ?? 0, envelope.ax ?? 0);
  return Math.max(MIN_COOKIE_MAX_AGE, until - now);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isOptionalString = (value: unknown): boolean => value === undefined || typeof value === "string";

function parsePlatformSession(value: unknown): PlatformSession | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const { uid, email, name, groups, iat, exp } = value;
  if (typeof uid !== "string" || uid === "" || !isOptionalString(email) || !isOptionalString(name)) return undefined;
  if (!Array.isArray(groups) || !groups.every((group) => typeof group === "string")) return undefined;
  if (!isFiniteNumber(iat) || !isFiniteNumber(exp)) return undefined;
  return {
    uid,
    ...(typeof email === "string" ? { email } : {}),
    ...(typeof name === "string" ? { name } : {}),
    groups: groups as string[],
    iat,
    exp,
  };
}

/** Decrypted JSON as an Envelope, or undefined when it does not have the envelope's shape. */
export function parseEnvelope(value: unknown): Envelope | undefined {
  if (!isRecord(value)) return undefined;
  const p = parsePlatformSession(value["p"]);
  const { a, ax } = value;
  if (p === undefined) return undefined;
  if (a !== null && typeof a !== "string") return undefined;
  if (ax !== null && !isFiniteNumber(ax)) return undefined;
  return { p, a, ax };
}
