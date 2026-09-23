import { createLocalJWKSet, errors, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { FakeClock } from "../../../../src/adapters/outbound/clock/FakeClock.js";
import { FirebaseIdTokenVerifier, SECURETOKEN_JWKS_URL } from "../../../../src/adapters/outbound/identity/FirebaseIdTokenVerifier.js";
import { AccessDeniedError, UpstreamError } from "../../../../src/domain/errors.js";
import { denialOf, NOW } from "../../../fixtures/access.js";
import { idTokenClaims, signIdToken, signingKey, unsignedToken, type SigningKey } from "../../../fixtures/tokens.js";

const PROJECT = "demo-eisen";
let key: SigningKey;
let impostor: SigningKey;
let keys: JWTVerifyGetKey;

beforeAll(async () => {
  key = await signingKey("k1");
  impostor = await signingKey("k1");
  keys = createLocalJWKSet({ keys: [key.jwk, (await signingKey("k2")).jwk] });
});

function verifier(clock = new FakeClock(), keySet: JWTVerifyGetKey = keys) {
  return new FirebaseIdTokenVerifier({ clock, keys: keySet });
}

async function tokenWith(overrides: JWTPayload = {}, signer: SigningKey = key, header: Record<string, string> = {}): Promise<string> {
  return signIdToken(signer, idTokenClaims(PROJECT, NOW, overrides), header);
}

describe("FirebaseIdTokenVerifier", () => {
  it("accepts a valid token and reads the identity from its claims", async () => {
    expect(await verifier().verify({ token: await tokenWith(), projectId: PROJECT })).toEqual({
      uid: "uid-1",
      email: "person@example.test",
      emailVerified: true,
      name: "Person",
      picture: "https://example.test/person.png",
      provider: "google.com",
      groups: ["owner"],
    });
  });

  it("reads groups only from an array of strings, and leaves absent profile fields out", async () => {
    const minimal = { email: undefined, email_verified: undefined, name: undefined, picture: undefined, firebase: undefined };
    for (const groups of [undefined, "owner", ["owner", 1], { owner: true }]) {
      const identity = await verifier().verify({ token: await tokenWith({ ...minimal, groups }), projectId: PROJECT });
      expect(identity).toEqual({ uid: "uid-1", emailVerified: false, groups: [] });
    }
  });

  it("refuses the wrong audience, the wrong issuer, an expired token and a token from the future", async () => {
    const cases: JWTPayload[] = [
      { aud: "other-project" },
      { iss: "https://securetoken.google.com/other-project" },
      { iss: "https://accounts.google.com" },
      { exp: NOW - 6 },
      { nbf: NOW + 60 },
      { iat: NOW + 60 },
      { auth_time: NOW + 60 },
    ];
    for (const overrides of cases) {
      const denial = await denialOf(verifier().verify({ token: await tokenWith(overrides), projectId: PROJECT }));
      expect(denial.reason).toBe("sign_in_required");
    }
  });

  it("tolerates a few seconds of clock skew, no more", async () => {
    expect((await verifier().verify({ token: await tokenWith({ exp: NOW - 4, iat: NOW + 4 }), projectId: PROJECT })).uid).toBe("uid-1");
  });

  it("requires exp, iat, sub and auth_time, and a sub of 1 to 128 characters", async () => {
    for (const overrides of [{ exp: undefined }, { iat: undefined }, { sub: undefined }, { auth_time: undefined }, { sub: "" }, { sub: "u".repeat(129) }]) {
      await expect(verifier().verify({ token: await tokenWith(overrides), projectId: PROJECT })).rejects.toBeInstanceOf(AccessDeniedError);
    }
    expect((await verifier().verify({ token: await tokenWith({ sub: "u".repeat(128) }), projectId: PROJECT })).uid).toHaveLength(128);
  });

  it("refuses a bad signature, an unknown key id and an unsigned (alg none) token", async () => {
    const forged = await tokenWith({}, impostor);
    const unknownKid = await tokenWith({}, key, { kid: "k9" });
    const none = unsignedToken(idTokenClaims(PROJECT, NOW));
    for (const token of [forged, unknownKid, none, `${(await tokenWith()).slice(0, -4)}AAAA`, "not.a.jwt", ""]) {
      const denial = await denialOf(verifier().verify({ token, projectId: PROJECT }));
      expect(denial.reason).toBe("sign_in_required");
      expect(denial.message).not.toContain(token === "" ? "\u0000" : token);
    }
  });

  it("refuses anonymous sign-ins", async () => {
    const anonymous = await tokenWith({ firebase: { sign_in_provider: "anonymous", identities: {} }, groups: ["owner"] });
    expect((await denialOf(verifier().verify({ token: anonymous, projectId: PROJECT }))).message).toContain("anonymous");
  });

  it("checks times against the injected clock", async () => {
    const clock = new FakeClock();
    const token = await tokenWith();
    expect((await verifier(clock).verify({ token, projectId: PROJECT })).uid).toBe("uid-1");
    clock.advance(3600 * 1000 + 10_000);
    expect((await denialOf(verifier(clock).verify({ token, projectId: PROJECT }))).reason).toBe("sign_in_required");
  });

  it("reports an unreachable or broken key set as UpstreamError, not as a bad token", async () => {
    const failures: Array<[unknown, string]> = [
      [new TypeError("fetch failed"), "network"],
      [new errors.JWKSTimeout(), "timeout"],
      [new errors.JWKSInvalid("JSON Web Key Set malformed"), "network"],
      [new errors.JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response"), "network"],
    ];
    for (const [failure, reason] of failures) {
      const broken: JWTVerifyGetKey = async () => {
        throw failure;
      };
      const error = await verifier(new FakeClock(), broken)
        .verify({ token: await tokenWith(), projectId: PROJECT })
        .catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(UpstreamError);
      expect(error).toMatchObject({ url: SECURETOKEN_JWKS_URL, reason });
    }
  });

  it("uses Google's securetoken key set by default without fetching it up front", () => {
    expect(SECURETOKEN_JWKS_URL).toBe("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    expect(new FirebaseIdTokenVerifier({ clock: new FakeClock() })).toBeInstanceOf(FirebaseIdTokenVerifier);
  });
});
