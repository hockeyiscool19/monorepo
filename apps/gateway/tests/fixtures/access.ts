import { FakeClock } from "../../src/adapters/outbound/clock/FakeClock.js";
import { FakeUpstreamCredentials } from "../../src/adapters/outbound/credentials/FakeUpstreamCredentials.js";
import { FakeIdentityVerifier } from "../../src/adapters/outbound/identity/FakeIdentityVerifier.js";
import { AesGcmSessionSealer } from "../../src/adapters/outbound/session/AesGcmSessionSealer.js";
import { FakeUpstream } from "../../src/adapters/outbound/upstream/FakeUpstream.js";
import { bodyOf, type AccessDeps, type DoorDeps, type DoorRequest } from "../../src/application/door.js";
import type { SessionSealer } from "../../src/application/ports/SessionSealer.js";
import { AccessDeniedError } from "../../src/domain/errors.js";
import type { HeaderList } from "../../src/domain/headers.js";
import { isGuarded, type Registry } from "../../src/domain/registry.js";
import { startSession, type Envelope, type VerifiedIdentity } from "../../src/domain/session.js";
import { makeGuardedRegistry } from "./registry.js";

/** FakeClock's default start, in Unix seconds. */
export const NOW = 1_700_000_000;

/** The current session secret of the tests (32 bytes). */
export const SECRET = new Uint8Array(32).fill(7);
/** A secret being rotated out. */
export const OLD_SECRET = new Uint8Array(32).fill(9);

/** In group `owner`: passes the Vale door. */
export const OWNER: VerifiedIdentity = {
  uid: "uid-owner",
  email: "owner@example.test",
  emailVerified: true,
  name: "Owner",
  picture: "https://example.test/owner.png",
  provider: "google.com",
  groups: ["owner"],
};

/** In group `vale`: passes the Vale door. */
export const MEMBER: VerifiedIdentity = { uid: "uid-member", emailVerified: true, provider: "password", groups: ["vale"] };

/** Signed in, in no group: stopped by the Vale door. */
export const STRANGER: VerifiedIdentity = { uid: "uid-stranger", emailVerified: false, provider: "password", groups: [] };

/** Bearer tokens the fake verifier accepts. */
export const TOKENS = { owner: "token-owner", member: "token-member", stranger: "token-stranger" } as const;

/** A FakeIdentityVerifier that knows the three TOKENS. */
export function fakeVerifier(): FakeIdentityVerifier {
  return new FakeIdentityVerifier({ [TOKENS.owner]: OWNER, [TOKENS.member]: MEMBER, [TOKENS.stranger]: STRANGER });
}

/** The real sealer with SECRET. */
export function testSealer(): AesGcmSessionSealer {
  return new AesGcmSessionSealer({ current: SECRET });
}

/** AccessDeps from fakes: enforce mode, a sealer with SECRET, the fake verifier and credentials. */
export function fakeAccess(overrides: Partial<AccessDeps> = {}): AccessDeps & {
  readonly verifier: FakeIdentityVerifier;
  readonly credentials: FakeUpstreamCredentials;
} {
  return {
    verifier: fakeVerifier(),
    sealer: testSealer(),
    credentials: new FakeUpstreamCredentials(),
    mode: "enforce",
    ...overrides,
  } as AccessDeps & { readonly verifier: FakeIdentityVerifier; readonly credentials: FakeUpstreamCredentials };
}

/** An envelope with `identity`'s session started at `issuedAt` (12 h) and the given app part. */
export function envelopeFor(identity: VerifiedIdentity, issuedAt = NOW - 60, a: string | null = null, ax: number | null = null): Envelope {
  return { p: startSession(identity, issuedAt, 12), a, ax };
}

/** `envelope` sealed for `appId`. */
export function seal(envelope: Envelope, appId = "vale", sealer: SessionSealer = testSealer()): string {
  return sealer.seal({ appId, envelope });
}

/**
 * `value` with one character changed at `fromEnd` characters before its end (never the same character).
 * Keep `fromEnd` ≥ 2 for base64url: the last character may carry only padding bits.
 */
export function tamper(value: string, fromEnd = 5): string {
  const index = value.length - fromEnd;
  const replacement = value[index] === "A" ? "B" : "A";
  return `${value.slice(0, index)}${replacement}${value.slice(index + 1)}`;
}

/** The `__session` value a door Set-Cookie writes. */
export function cookieValue(setCookie: string | undefined): string {
  const match = /^__session=([^;]*)/.exec(setCookie ?? "");
  if (match === null) throw new Error("not a door Set-Cookie");
  return match[1] ?? "";
}

/** The attributes of a door Set-Cookie after its value, e.g. `Path=/vale; Max-Age=43200; HttpOnly; …`. */
export function cookieAttributes(setCookie: string | undefined): string {
  return (setCookie ?? "").split("; ").slice(1).join("; ");
}

/** DoorDeps from fakes, plus handles on each fake. */
export function doorDeps(overrides: Partial<AccessDeps> = {}) {
  const access = fakeAccess(overrides);
  const upstream = new FakeUpstream();
  const clock = new FakeClock();
  const deps: DoorDeps = { ...access, upstream, clock, upstreamTimeoutMs: 1000 };
  return { deps, upstream, clock, verifier: access.verifier, credentials: access.credentials };
}

/** A request to the first app of `registry` (GUARDED_VALE by default): GET /vale/ over https. */
export function doorRequest(overrides: Partial<Omit<DoorRequest, "app">> = {}, registry: Registry = makeGuardedRegistry()): DoorRequest {
  const app = registry.apps[0];
  if (app === undefined || !isGuarded(app)) throw new Error("the first fixture app must be guarded");
  return { registry, app, method: "GET", path: "/vale/", search: "", headers: [], body: bodyOf(null), secureCookie: true, ...overrides };
}

/** A Cookie header and an Authorization header, for request fixtures. */
export function withCookie(cookie: string, headers: HeaderList = []): HeaderList {
  return [...headers, ["cookie", cookie]];
}

/** The AccessDeniedError a promise rejects with (fails the test otherwise). */
export async function denialOf(promise: Promise<unknown>): Promise<AccessDeniedError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (error instanceof AccessDeniedError) return error;
  throw new Error(`expected AccessDeniedError, got ${String(error)}`);
}
