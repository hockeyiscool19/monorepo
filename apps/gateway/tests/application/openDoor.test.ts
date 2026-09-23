import { describe, expect, it } from "vitest";
import { closeDoor } from "../../src/application/closeDoor.js";
import { openDoor } from "../../src/application/openDoor.js";
import { SessionTooLargeError, UpstreamError } from "../../src/domain/errors.js";
import type { HeaderList } from "../../src/domain/headers.js";
import {
  cookieAttributes,
  cookieValue,
  denialOf,
  doorDeps,
  doorRequest,
  envelopeFor,
  MEMBER,
  NOW,
  OWNER,
  seal,
  testSealer,
  TOKENS,
  withCookie,
} from "../fixtures/access.js";
import { makeGuardedRegistry, makeRegistry, PLATFORM, PLATFORM_AUTH } from "../fixtures/registry.js";

const bearer = (token: string): HeaderList => [["authorization", `Bearer ${token}`]];
const post = (headers: HeaderList = []) => doorRequest({ method: "POST", path: "/vale/__door/session", headers });

describe("openDoor", () => {
  it("seals a sessionHours-long platform session for a token that passes the app's policy", async () => {
    const { deps, verifier } = doorDeps();
    const result = await openDoor(deps, post(bearer(TOKENS.owner)));
    expect(result).toMatchObject({ appId: "vale", uid: "uid-owner", groups: ["owner"], expiresAt: NOW + 12 * 3600 });
    expect(cookieAttributes(result.setCookie)).toBe("Path=/vale; Max-Age=43200; HttpOnly; SameSite=Lax; Secure");
    expect(testSealer().open({ appId: "vale", value: cookieValue(result.setCookie) })).toEqual({
      p: { uid: "uid-owner", email: "owner@example.test", name: "Owner", groups: ["owner"], iat: NOW, exp: NOW + 43200 },
      a: null,
      ax: null,
    });
    expect(verifier.calls).toEqual([{ token: TOKENS.owner, projectId: PLATFORM_AUTH.projectId }]);
  });

  it("omits Secure only when the request says so (plain http to a loopback host)", async () => {
    const { deps } = doorDeps();
    const result = await openDoor(deps, { ...post(bearer(TOKENS.member)), secureCookie: false });
    expect(cookieAttributes(result.setCookie)).toBe("Path=/vale; Max-Age=43200; HttpOnly; SameSite=Lax");
  });

  it("needs a bearer token; its absence changes nothing about the browser's session", async () => {
    const { deps, verifier } = doorDeps();
    for (const headers of [[], [["authorization", "Basic dXNlcjpwdw=="]], [["authorization", "Bearer"]]] as HeaderList[]) {
      const denial = await denialOf(openDoor(deps, post(headers)));
      expect([denial.reason, denial.appId, denial.groups, denial.endsSession]).toEqual(["sign_in_required", "vale", ["owner", "vale"], false]);
    }
    expect(verifier.calls).toHaveLength(0);
  });

  it("ends the browser's door session when a presented token is refused or its person is not in the groups", async () => {
    const { deps } = doorDeps();
    const refused = await denialOf(openDoor(deps, post(bearer("forged"))));
    expect([refused.reason, refused.appId, refused.groups, refused.endsSession]).toEqual(["sign_in_required", "vale", ["owner", "vale"], true]);
    const outsider = await denialOf(openDoor(deps, post(bearer(TOKENS.stranger))));
    expect([outsider.reason, outsider.uid, outsider.groups, outsider.endsSession]).toEqual([
      "group_required",
      "uid-stranger",
      ["owner", "vale"],
      true,
    ]);
  });

  it("admits any signed-in person when access.groups is empty", async () => {
    const { deps } = doorDeps();
    const registry = makeGuardedRegistry([{ ...makeGuardedRegistry().apps[0]!, access: { groups: [] } }]);
    const result = await openDoor(deps, doorRequest({ method: "POST", path: "/vale/__door/session", headers: bearer(TOKENS.stranger) }, registry));
    expect(result.uid).toBe("uid-stranger");
  });

  it("stays shut (door_unconfigured) without SESSION_SECRET, or with sign-in missing or disabled, before checking the token", async () => {
    const unconfigured = doorDeps({ sealer: undefined });
    const noSecret = await denialOf(openDoor(unconfigured.deps, post(bearer(TOKENS.owner))));
    expect([noSecret.reason, noSecret.appId, noSecret.groups, noSecret.endsSession]).toEqual(["door_unconfigured", "vale", undefined, false]);
    expect(unconfigured.verifier.calls).toHaveLength(0);

    const { deps } = doorDeps();
    const disabled = makeGuardedRegistry(undefined, { ...PLATFORM_AUTH, enabled: false });
    const withoutAuth = makeRegistry(makeGuardedRegistry().apps, { platform: PLATFORM });
    for (const registry of [disabled, withoutAuth]) {
      const request = doorRequest({ method: "POST", path: "/vale/__door/session", headers: bearer(TOKENS.owner) }, registry);
      expect((await denialOf(openDoor(deps, request))).reason).toBe("door_unconfigured");
    }
  });

  it("keeps the app cookie of the same person, even from an expired session, but never another person's", async () => {
    const { deps } = doorDeps();
    const stale = seal(envelopeFor(OWNER, NOW - 13 * 3600, "vale-login", NOW + 86_400));
    const same = await openDoor(deps, post(withCookie(`__session=${stale}`, bearer(TOKENS.owner))));
    expect(testSealer().open({ appId: "vale", value: cookieValue(same.setCookie) })).toMatchObject({ a: "vale-login", ax: NOW + 86_400 });
    expect(cookieAttributes(same.setCookie)).toContain("Max-Age=86400");

    const other = await openDoor(deps, post(withCookie(`__session=${stale}`, bearer(TOKENS.member))));
    expect(testSealer().open({ appId: "vale", value: cookieValue(other.setCookie) })).toMatchObject({ p: { uid: "uid-member" }, a: null, ax: null });
  });

  it("drops an app cookie that has already expired", async () => {
    const { deps } = doorDeps();
    const old = seal(envelopeFor(OWNER, NOW - 60, "gone", NOW - 1));
    const result = await openDoor(deps, post(withCookie(`__session=${old}`, bearer(TOKENS.owner))));
    expect(testSealer().open({ appId: "vale", value: cookieValue(result.setCookie) })).toMatchObject({ a: null, ax: null });
  });

  it("adopts an unsealed app cookie from before the door (the migration) when no envelope opens", async () => {
    const { deps } = doorDeps();
    const foreign = seal(envelopeFor(MEMBER), "topology");
    const cookie = `theme=dark; __session=${foreign}; __session=d1.tampered.value; __session=legacy-login; __session=second`;
    const result = await openDoor(deps, post(withCookie(cookie, bearer(TOKENS.owner))));
    expect(testSealer().open({ appId: "vale", value: cookieValue(result.setCookie) })).toMatchObject({
      p: { uid: "uid-owner" },
      a: "legacy-login",
      ax: null,
    });
  });

  it("refuses to set a cookie over the size limit (session_too_large)", async () => {
    const { deps } = doorDeps();
    await expect(openDoor(deps, post(withCookie(`__session=${"x".repeat(3000)}`, bearer(TOKENS.owner))))).rejects.toBeInstanceOf(
      SessionTooLargeError,
    );
  });

  it("passes UpstreamError through when the signing keys cannot be fetched, leaving the session alone", async () => {
    const { deps, verifier } = doorDeps();
    verifier.fail(new UpstreamError("https://www.googleapis.com/jwks", "timeout"));
    await expect(openDoor(deps, post(bearer(TOKENS.owner)))).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe("closeDoor", () => {
  it("removes the whole door cookie without a token, names whose session it was, and works unconfigured", () => {
    const { deps } = doorDeps();
    const cookie = `__session=${seal(envelopeFor(OWNER, NOW - 60, "vale-login"))}`;
    const closed = closeDoor(deps, doorRequest({ method: "DELETE", path: "/vale/__door/session", headers: withCookie(cookie) }));
    expect(closed).toEqual({
      appId: "vale",
      uid: "uid-owner",
      setCookie: "__session=; Path=/vale; Max-Age=0; HttpOnly; SameSite=Lax; Secure",
    });

    const unconfigured = closeDoor({ sealer: undefined }, doorRequest({ method: "DELETE", headers: withCookie(cookie), secureCookie: false }));
    expect(unconfigured).toEqual({ appId: "vale", uid: undefined, setCookie: "__session=; Path=/vale; Max-Age=0; HttpOnly; SameSite=Lax" });
  });
});
