import { describe, expect, it } from "vitest";
import { FakeRegistrySource } from "../../src/adapters/outbound/registry/FakeRegistrySource.js";
import type { AccessDeps } from "../../src/application/door.js";
import { whoAmI } from "../../src/application/whoAmI.js";
import { RegistryUnavailableError, UpstreamError } from "../../src/domain/errors.js";
import type { HeaderList } from "../../src/domain/headers.js";
import type { Registry } from "../../src/domain/registry.js";
import { denialOf, fakeAccess, TOKENS } from "../fixtures/access.js";
import { GUARDED_VALE, HEALTHCONNECT, makeApp, makeGuardedRegistry, makeRegistry, PLATFORM_AUTH, TOPOLOGY } from "../fixtures/registry.js";

const bearer = (token: string): { headers: HeaderList } => ({ headers: [["authorization", `Bearer ${token}`]] });

/** Vale (owner, vale), an open-to-anyone "commons" app, and two public apps. */
const registry = makeGuardedRegistry([
  GUARDED_VALE,
  HEALTHCONNECT,
  makeApp({ id: "commons", status: "hidden", access: { groups: [] } }),
  TOPOLOGY,
]);

function deps(access: AccessDeps = fakeAccess(), source: Registry | FakeRegistrySource = registry) {
  return { ...access, registry: source instanceof FakeRegistrySource ? source : new FakeRegistrySource(source) };
}

describe("whoAmI", () => {
  it("returns the person, their groups and the door's verdict for every guarded app (hidden ones too)", async () => {
    const access = fakeAccess();
    expect(await whoAmI(deps(access), bearer(TOKENS.owner))).toEqual({
      user: {
        uid: "uid-owner",
        email: "owner@example.test",
        emailVerified: true,
        name: "Owner",
        picture: "https://example.test/owner.png",
        provider: "google.com",
      },
      groups: ["owner"],
      access: [
        { app: "vale", allowed: true, groups: ["owner", "vale"] },
        { app: "commons", allowed: true, groups: [] },
      ],
    });
    expect(access.verifier.calls).toEqual([{ token: TOKENS.owner, projectId: PLATFORM_AUTH.projectId }]);
  });

  it("reports absent profile fields as null and group_required where the person is in no listed group", async () => {
    const result = await whoAmI(deps(), bearer(TOKENS.stranger));
    expect(result.user).toEqual({ uid: "uid-stranger", email: null, emailVerified: false, name: null, picture: null, provider: "password" });
    expect(result.access).toEqual([
      { app: "vale", allowed: false, reason: "group_required", groups: ["owner", "vale"] },
      { app: "commons", allowed: true, groups: [] },
    ]);
  });

  it("reports door_unconfigured for every gate without SESSION_SECRET, and every gate open under ACCESS_MODE=open", async () => {
    const closed = await whoAmI(deps(fakeAccess({ sealer: undefined })), bearer(TOKENS.owner));
    expect(closed.access.map((gate) => [gate.app, gate.allowed, gate.reason])).toEqual([
      ["vale", false, "door_unconfigured"],
      ["commons", false, "door_unconfigured"],
    ]);
    const open = await whoAmI(deps(fakeAccess({ mode: "open" })), bearer(TOKENS.stranger));
    expect(open.access.every((gate) => gate.allowed)).toBe(true);
  });

  it("needs a token the verifier accepts (sign_in_required, no app attached)", async () => {
    for (const request of [{ headers: [] as HeaderList }, bearer("forged")]) {
      const denial = await denialOf(whoAmI(deps(), request));
      expect([denial.reason, denial.appId, denial.groups]).toEqual(["sign_in_required", undefined, undefined]);
    }
  });

  it("answers door_unconfigured for a token when the registry has no enabled sign-in, but 401 without one", async () => {
    const access = fakeAccess();
    const disabled = makeGuardedRegistry(undefined, { ...PLATFORM_AUTH, enabled: false });
    const withoutAuth = makeRegistry([GUARDED_VALE]);
    for (const registryWithoutSignIn of [disabled, withoutAuth]) {
      expect((await denialOf(whoAmI(deps(access, registryWithoutSignIn), bearer(TOKENS.owner)))).reason).toBe("door_unconfigured");
      expect((await denialOf(whoAmI(deps(access, registryWithoutSignIn), { headers: [] }))).reason).toBe("sign_in_required");
    }
    expect(access.verifier.calls).toHaveLength(0);
  });

  it("refuses a request without a token before reading the registry", async () => {
    const source = FakeRegistrySource.failing();
    expect((await denialOf(whoAmI(deps(fakeAccess(), source), { headers: [] }))).reason).toBe("sign_in_required");
    expect(source.loads).toBe(0);
  });

  it("passes UpstreamError and registry failures through", async () => {
    const access = fakeAccess();
    access.verifier.fail(new UpstreamError("https://www.googleapis.com/jwks", "network"));
    await expect(whoAmI(deps(access), bearer(TOKENS.owner))).rejects.toBeInstanceOf(UpstreamError);
    await expect(whoAmI(deps(fakeAccess(), FakeRegistrySource.failing()), bearer(TOKENS.owner))).rejects.toBeInstanceOf(
      RegistryUnavailableError,
    );
  });
});
