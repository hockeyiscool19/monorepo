import type { JWTPayload } from "jose";
import { AccessDeniedError } from "../../../domain/errors.js";
import type { VerifiedIdentity } from "../../../domain/session.js";

/** The issuer of a project's Firebase ID tokens. */
export function firebaseIssuer(projectId: string): string {
  return `https://securetoken.google.com/${projectId}`;
}

/** Claims every Firebase ID token must carry (jose checks presence; `exp` is otherwise optional to it). */
export const REQUIRED_CLAIMS: readonly string[] = ["exp", "iat", "sub", "auth_time"];

/** Clock skew tolerated when token times are checked, in seconds. */
export const CLOCK_TOLERANCE_SECONDS = 5;

/** The longest `sub` (uid) Firebase issues. */
const MAX_SUB_LENGTH = 128;

/** A refused token: sign_in_required, with a reason for logs. Never carries the token or its claims. */
export function refused(detail: string): AccessDeniedError {
  return new AccessDeniedError("sign_in_required", `ID token refused: ${detail}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const optionalString = <K extends string>(key: K, value: unknown): Partial<Record<K, string>> =>
  (typeof value === "string" ? { [key]: value } : {}) as Partial<Record<K, string>>;

/**
 * The identity in a payload whose signature, `iss`, `aud` and `exp` are already checked, after the checks jose
 * does not make: `sub` a non-empty string of at most 128 characters, `iat` and `auth_time` numbers not in the
 * future (beyond `tolerance` seconds of `now`), and a real sign-in — an anonymous Firebase user is nobody the
 * door can admit. `groups` is the custom claim when it is an array of strings, else [].
 * Throws AccessDeniedError(sign_in_required).
 */
export function identityFromClaims(payload: JWTPayload, now: number, tolerance: number): VerifiedIdentity {
  const { sub, iat } = payload;
  const authTime = payload["auth_time"];
  if (typeof sub !== "string" || sub === "" || sub.length > MAX_SUB_LENGTH) {
    throw refused("sub must be a non-empty string of at most 128 characters");
  }
  if (typeof iat !== "number" || iat > now + tolerance) throw refused("iat is in the future");
  if (typeof authTime !== "number" || authTime > now + tolerance) throw refused("auth_time is missing or in the future");
  const firebase = isRecord(payload["firebase"]) ? payload["firebase"] : {};
  const provider = firebase["sign_in_provider"];
  if (provider === "anonymous") throw refused("anonymous sign-ins are not accepted");
  const groups = payload["groups"];
  return {
    uid: sub,
    ...optionalString("email", payload["email"]),
    emailVerified: payload["email_verified"] === true,
    ...optionalString("name", payload["name"]),
    ...optionalString("picture", payload["picture"]),
    ...optionalString("provider", provider),
    groups: Array.isArray(groups) && groups.every((group) => typeof group === "string") ? [...(groups as string[])] : [],
  };
}
