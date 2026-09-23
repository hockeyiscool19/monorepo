import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../../src/adapters/outbound/clock/FakeClock.js";
import { EmulatorIdTokenVerifier } from "../../../../src/adapters/outbound/identity/EmulatorIdTokenVerifier.js";
import { FakeIdentityVerifier } from "../../../../src/adapters/outbound/identity/FakeIdentityVerifier.js";
import { UpstreamError } from "../../../../src/domain/errors.js";
import { denialOf, NOW, OWNER } from "../../../fixtures/access.js";
import { idTokenClaims, signIdToken, signingKey, unsignedToken } from "../../../fixtures/tokens.js";

const PROJECT = "demo-eisen";
const verifier = () => new EmulatorIdTokenVerifier({ clock: new FakeClock() });

describe("EmulatorIdTokenVerifier", () => {
  it("accepts the Auth emulator's unsigned tokens and reads the same identity as the real verifier", async () => {
    const token = unsignedToken(idTokenClaims(PROJECT, NOW, { groups: ["vale"], firebase: { sign_in_provider: "password" } }));
    expect(await verifier().verify({ token, projectId: PROJECT })).toMatchObject({ uid: "uid-1", provider: "password", groups: ["vale"] });
  });

  it("applies the same issuer, audience, time and claim checks", async () => {
    for (const overrides of [
      { aud: "other-project" },
      { iss: "https://securetoken.google.com/other-project" },
      { exp: NOW - 60 },
      { exp: undefined },
      { auth_time: NOW + 60 },
      { sub: "" },
      { firebase: { sign_in_provider: "anonymous" } },
    ]) {
      const token = unsignedToken(idTokenClaims(PROJECT, NOW, overrides));
      expect((await denialOf(verifier().verify({ token, projectId: PROJECT }))).reason).toBe("sign_in_required");
    }
  });

  it("accepts only unsigned tokens: a signed one, a header lying about alg none, or garbage is refused", async () => {
    const signed = await signIdToken(await signingKey("k1"), idTokenClaims(PROJECT, NOW));
    const lying = unsignedToken(idTokenClaims(PROJECT, NOW), { alg: "RS256", typ: "JWT" });
    for (const token of [signed, lying, "garbage", ""]) {
      expect((await denialOf(verifier().verify({ token, projectId: PROJECT }))).reason).toBe("sign_in_required");
    }
  });
});

describe("FakeIdentityVerifier", () => {
  it("accepts only the tokens it knows, records requests, and fails on demand", async () => {
    const fake = new FakeIdentityVerifier().accept("t1", OWNER);
    expect(await fake.verify({ token: "t1", projectId: PROJECT })).toBe(OWNER);
    expect((await denialOf(fake.verify({ token: "t2", projectId: PROJECT }))).reason).toBe("sign_in_required");
    expect(fake.calls.map((call) => call.token)).toEqual(["t1", "t2"]);
    fake.fail(new UpstreamError("https://keys.test", "timeout"));
    await expect(fake.verify({ token: "t1", projectId: PROJECT })).rejects.toBeInstanceOf(UpstreamError);
  });
});
