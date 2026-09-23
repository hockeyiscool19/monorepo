import { describe, expect, it } from "vitest";
import { FAKE_CREDENTIAL } from "../../src/adapters/outbound/credentials/FakeUpstreamCredentials.js";
import { AesGcmSessionSealer } from "../../src/adapters/outbound/session/AesGcmSessionSealer.js";
import { fakeResponse } from "../../src/adapters/outbound/upstream/FakeUpstream.js";
import { bodyOf } from "../../src/application/door.js";
import { passDoor } from "../../src/application/passDoor.js";
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
  OLD_SECRET,
  OWNER,
  seal,
  SECRET,
  STRANGER,
  tamper,
  testSealer,
  withCookie,
} from "../fixtures/access.js";
import { readText } from "../fixtures/http.js";
import { GUARDED_VALE, makeGuardedRegistry, PLATFORM_AUTH } from "../fixtures/registry.js";

const sessionCookie = (value: string): HeaderList => withCookie(`__session=${value}`);
const setCookies = (headers: HeaderList): string[] => headers.filter(([name]) => name === "set-cookie").map(([, value]) => value);
const headerOf = (headers: HeaderList, name: string): string | undefined => headers.find(([key]) => key === name)?.[1];

describe("passDoor — who gets through", () => {
  it("forwards a live session to web.url + path + query with the app's own cookie, never the envelope", async () => {
    const { deps, upstream, credentials } = doorDeps();
    upstream.reply("https://vale.example.test/vale/", 200, "<html>vale</html>");
    const envelope = seal(envelopeFor(OWNER, NOW - 60, "app-state", NOW + 3600));
    const result = await passDoor(
      deps,
      doorRequest({
        method: "POST",
        path: "/vale/list/add",
        search: "?x=1&y=%20",
        headers: [
          ["cookie", `theme=dark; __session=${envelope}; __session=legacy-raw`],
          ["x-serverless-authorization", "Bearer forged"],
          ["connection", "keep-alive"],
          ["content-type", "text/plain"],
        ],
        body: bodyOf(new TextEncoder().encode("milk").buffer),
      }),
    );
    expect(result).toMatchObject({ appId: "vale", uid: "uid-owner", status: 200 });
    expect(await readText(result.body)).toBe("<html>vale</html>");
    const sent = upstream.requests[0];
    expect(sent?.method).toBe("POST");
    expect(sent?.url).toBe("https://vale.example.test/vale/list/add?x=1&y=%20");
    expect(sent?.timeoutMs).toBe(1000);
    expect(new TextDecoder().decode(sent?.body ?? new ArrayBuffer(0))).toBe("milk");
    expect(sent?.headers).toEqual([["content-type", "text/plain"], ["cookie", "theme=dark; __session=app-state"], FAKE_CREDENTIAL]);
    expect(credentials.calls).toEqual([{ url: "https://vale.example.test/vale/list/add?x=1&y=%20" }]);
  });

  it("sends no Cookie header at all when the envelope carries no app cookie and nothing else was sent", async () => {
    const { deps, upstream } = doorDeps();
    upstream.reply("https://vale.example.test/vale", 200, "ok");
    await passDoor(deps, doorRequest({ path: "/vale", headers: sessionCookie(seal(envelopeFor(MEMBER))) }));
    expect(upstream.requests[0]?.url).toBe("https://vale.example.test/vale");
    expect(upstream.requests[0]?.headers.map(([name]) => name)).toEqual(["x-serverless-authorization"]);
  });

  it("does not forward an app cookie past its own expiry", async () => {
    const { deps, upstream } = doorDeps();
    upstream.reply("https://vale.example.test/vale/", 200, "ok");
    await passDoor(deps, doorRequest({ headers: sessionCookie(seal(envelopeFor(OWNER, NOW - 60, "old", NOW))) }));
    expect(upstream.requests[0]?.headers.some(([name]) => name === "cookie")).toBe(false);
  });

  it("asks for sign-in without an envelope for this app: no cookie, a legacy cookie only, another app's, tampered or retired", async () => {
    const { deps, upstream } = doorDeps();
    const tampered = tamper(seal(envelopeFor(OWNER)));
    const retired = new AesGcmSessionSealer({ current: OLD_SECRET }).seal({ appId: "vale", envelope: envelopeFor(OWNER) });
    const cookies = ["", "__session=legacy-raw", `__session=${seal(envelopeFor(OWNER), "topology")}`, `__session=${tampered}`, `__session=${retired}`];
    for (const cookie of cookies) {
      const denial = await denialOf(passDoor(deps, doorRequest({ headers: cookie === "" ? [] : withCookie(cookie) })));
      expect([denial.reason, denial.appId, denial.groups]).toEqual(["sign_in_required", "vale", ["owner", "vale"]]);
    }
    expect(upstream.requests).toHaveLength(0);
  });

  it("never reads the body of a refused request", async () => {
    const { deps } = doorDeps();
    let reads = 0;
    const body = async () => {
      reads += 1;
      return new ArrayBuffer(32 * 1024 * 1024);
    };
    await denialOf(passDoor(deps, doorRequest({ method: "POST", path: "/vale/upload", body })));
    await denialOf(passDoor(deps, doorRequest({ method: "POST", path: "/vale/upload", body, headers: sessionCookie(seal(envelopeFor(STRANGER))) })));
    expect(reads).toBe(0);
  });

  it("opens an envelope sealed with SESSION_SECRET_PREVIOUS during a rotation", async () => {
    const { deps, upstream } = doorDeps({ sealer: new AesGcmSessionSealer({ current: SECRET, previous: OLD_SECRET }) });
    upstream.reply("https://vale.example.test/vale/", 200, "ok");
    const old = new AesGcmSessionSealer({ current: OLD_SECRET }).seal({ appId: "vale", envelope: envelopeFor(MEMBER) });
    expect((await passDoor(deps, doorRequest({ headers: sessionCookie(old) }))).uid).toBe("uid-member");
  });

  it("answers session_expired once the platform session is over, or when the registry shortens sessionHours", async () => {
    const { deps, upstream } = doorDeps();
    const expired = seal(envelopeFor(OWNER, NOW - 12 * 3600));
    const denial = await denialOf(passDoor(deps, doorRequest({ headers: sessionCookie(expired) })));
    expect([denial.reason, denial.uid, denial.groups]).toEqual(["session_expired", "uid-owner", undefined]);

    const shortened = makeGuardedRegistry(undefined, { ...PLATFORM_AUTH, sessionHours: 1 });
    const twoHoursOld = seal(envelopeFor(OWNER, NOW - 2 * 3600));
    expect((await denialOf(passDoor(deps, doorRequest({ headers: sessionCookie(twoHoursOld) }, shortened)))).reason).toBe("session_expired");
    expect(upstream.requests).toHaveLength(0);
  });

  it("re-checks the groups against the current registry on every request", async () => {
    const { deps, upstream } = doorDeps();
    upstream.reply("https://vale.example.test/vale/", 200, "ok");
    const member = sessionCookie(seal(envelopeFor(MEMBER)));
    expect((await passDoor(deps, doorRequest({ headers: member }))).status).toBe(200);

    const ownerOnly = makeGuardedRegistry([{ ...GUARDED_VALE, access: { groups: ["owner"] } }]);
    const denial = await denialOf(passDoor(deps, doorRequest({ headers: member }, ownerOnly)));
    expect([denial.reason, denial.uid, denial.groups]).toEqual(["group_required", "uid-member", ["owner"]]);

    const anyone = makeGuardedRegistry([{ ...GUARDED_VALE, access: { groups: [] } }]);
    expect((await passDoor(deps, doorRequest({ headers: sessionCookie(seal(envelopeFor(STRANGER))) }, anyone))).uid).toBe("uid-stranger");
    expect(upstream.requests).toHaveLength(2);
  });

  it("stays shut (door_unconfigured) without SESSION_SECRET or with sign-in disabled", async () => {
    const cookie = sessionCookie(seal(envelopeFor(OWNER)));
    const unconfigured = doorDeps({ sealer: undefined });
    expect((await denialOf(passDoor(unconfigured.deps, doorRequest({ headers: cookie })))).reason).toBe("door_unconfigured");
    const disabled = makeGuardedRegistry(undefined, { ...PLATFORM_AUTH, enabled: false });
    const { deps, upstream } = doorDeps();
    expect((await denialOf(passDoor(deps, doorRequest({ headers: cookie }, disabled)))).reason).toBe("door_unconfigured");
    expect(upstream.requests).toHaveLength(0);
  });

  it("under ACCESS_MODE=open forwards the request as it came, cookies and Set-Cookies untouched", async () => {
    const { deps, upstream } = doorDeps({ mode: "open", sealer: undefined });
    upstream.reply("https://vale.example.test/vale/", 200, "ok", [["set-cookie", "__session=raw; Path=/vale"]]);
    const result = await passDoor(deps, doorRequest({ headers: [["cookie", "__session=raw-state"], ["x-serverless-authorization", "x"]] }));
    expect(result.uid).toBeUndefined();
    expect(upstream.requests[0]?.headers).toEqual([["cookie", "__session=raw-state"], FAKE_CREDENTIAL]);
    expect(setCookies(result.headers)).toEqual(["__session=raw; Path=/vale"]);
    expect(headerOf(result.headers, "cache-control")).toBe("private, no-store");
  });
});

describe("passDoor — what comes back", () => {
  const live = () => envelopeFor(OWNER, NOW - 60, "app-state", NOW + 3600);

  it("re-seals a __session the app sets, with the unchanged platform part; other Set-Cookies pass through", async () => {
    const { deps, upstream } = doorDeps();
    upstream.reply("https://vale.example.test/vale/", 200, "ok", [
      ["set-cookie", "__session=new-state; Path=/vale; Max-Age=86400; HttpOnly; Secure"],
      ["set-cookie", "other=1; Path=/"],
    ]);
    const result = await passDoor(deps, doorRequest({ headers: sessionCookie(seal(live())) }));
    const cookies = setCookies(result.headers);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toBe("other=1; Path=/");
    expect(cookieAttributes(cookies[1])).toBe("Path=/vale; Max-Age=86400; HttpOnly; SameSite=Lax; Secure");
    expect(testSealer().open({ appId: "vale", value: cookieValue(cookies[1]) })).toEqual({
      p: live().p,
      a: "new-state",
      ax: NOW + 86_400,
    });
  });

  it("keeps a session-only app cookie (no Max-Age or Expires) until the platform session ends, and an Expires as given", async () => {
    const { deps, upstream } = doorDeps();
    const expires = new Date((NOW + 7200) * 1000).toUTCString();
    upstream
      .reply("https://vale.example.test/vale/a", 200, "", [["set-cookie", "__session=s1; Path=/vale"]])
      .reply("https://vale.example.test/vale/b", 200, "", [["set-cookie", `__session=s2; Expires=${expires}`]]);
    const a = await passDoor(deps, doorRequest({ path: "/vale/a", headers: sessionCookie(seal(live())) }));
    expect(testSealer().open({ appId: "vale", value: cookieValue(setCookies(a.headers)[0]) })).toMatchObject({ a: "s1", ax: null });
    expect(cookieAttributes(setCookies(a.headers)[0])).toContain(`Max-Age=${12 * 3600 - 60}`);
    const b = await passDoor(deps, doorRequest({ path: "/vale/b", headers: sessionCookie(seal(live())) }));
    expect(testSealer().open({ appId: "vale", value: cookieValue(setCookies(b.headers)[0]) })).toMatchObject({ a: "s2", ax: NOW + 7200 });
  });

  it("removes the app part when the app deletes its cookie (Max-Age ≤ 0, a past Expires, an empty value)", async () => {
    for (const deletion of ["__session=x; Max-Age=0", "__session=x; Max-Age=-1", "__session=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT", "__session=; Path=/vale"]) {
      const { deps, upstream } = doorDeps();
      upstream.reply("https://vale.example.test/vale/", 200, "", [["set-cookie", deletion]]);
      const result = await passDoor(deps, doorRequest({ headers: sessionCookie(seal(live())) }));
      const resealed = testSealer().open({ appId: "vale", value: cookieValue(setCookies(result.headers)[0]) });
      expect(resealed).toEqual({ p: live().p, a: null, ax: null });
    }
  });

  it("applies several __session Set-Cookies in order: the last one wins", async () => {
    const { deps, upstream } = doorDeps();
    upstream.reply("https://vale.example.test/vale/", 200, "", [
      ["set-cookie", "__session=; Max-Age=0"],
      ["set-cookie", "__session=final; Max-Age=60"],
    ]);
    const result = await passDoor(deps, doorRequest({ headers: sessionCookie(seal(live())) }));
    expect(setCookies(result.headers)).toHaveLength(1);
    expect(testSealer().open({ appId: "vale", value: cookieValue(setCookies(result.headers)[0]) })).toMatchObject({ a: "final", ax: NOW + 60 });
  });

  it("passes redirects through untouched and makes every forwarded answer private", async () => {
    const { deps, upstream } = doorDeps();
    upstream
      .reply("https://vale.example.test/vale/login", 302, undefined, [["location", "/vale/home"], ["cache-control", "public, max-age=600, s-maxage=3600"]])
      .reply("https://vale.example.test/vale/_next/static/a.js", 200, "js", [["cache-control", "public, max-age=31536000, immutable"]])
      .reply("https://vale.example.test/vale/page", 200, "page");
    const cookie = sessionCookie(seal(live()));
    const redirect = await passDoor(deps, doorRequest({ path: "/vale/login", headers: cookie }));
    expect([redirect.status, headerOf(redirect.headers, "location")]).toEqual([302, "/vale/home"]);
    expect(headerOf(redirect.headers, "cache-control")).toBe("private, max-age=600");
    const asset = await passDoor(deps, doorRequest({ path: "/vale/_next/static/a.js", headers: cookie }));
    expect(headerOf(asset.headers, "cache-control")).toBe("private, max-age=31536000, immutable");
    const page = await passDoor(deps, doorRequest({ path: "/vale/page", headers: cookie }));
    expect(headerOf(page.headers, "cache-control")).toBe("private, no-store");
    expect(setCookies(page.headers)).toEqual([]);
  });

  it("strips hop-by-hop headers from the answer", async () => {
    const { deps, upstream } = doorDeps();
    upstream.reply("https://vale.example.test/vale/", 200, "ok", [["connection", "close"], ["keep-alive", "timeout=5"], ["x-app", "1"]]);
    const result = await passDoor(deps, doorRequest({ headers: sessionCookie(seal(live())) }));
    expect(result.headers.map(([name]) => name)).toEqual(["content-type", "x-app", "cache-control"]);
  });

  it("refuses an app cookie too large to seal (session_too_large) and cancels the upstream body", async () => {
    const { deps, upstream } = doorDeps();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("secret page"));
      },
      cancel() {
        cancelled = true;
      },
    });
    upstream.on("https://vale.example.test/vale/", () => ({ status: 200, headers: [["set-cookie", `__session=${"y".repeat(3000)}`]], body }));
    await expect(passDoor(deps, doorRequest({ headers: sessionCookie(seal(live())) }))).rejects.toBeInstanceOf(SessionTooLargeError);
    expect(cancelled).toBe(true);
  });

  it("passes UpstreamError through: the upstream failed, or the gateway's credentials could not be obtained", async () => {
    const failing = doorDeps();
    failing.upstream.failOn("https://vale.example.test/", "timeout");
    await expect(passDoor(failing.deps, doorRequest({ headers: sessionCookie(seal(live())) }))).rejects.toBeInstanceOf(UpstreamError);

    const noCredentials = doorDeps();
    noCredentials.credentials.fail(new UpstreamError("http://metadata.test/identity", "network"));
    noCredentials.upstream.on("https://vale.example.test/", () => fakeResponse(200, "never"));
    await expect(passDoor(noCredentials.deps, doorRequest({ headers: sessionCookie(seal(live())) }))).rejects.toBeInstanceOf(UpstreamError);
    expect(noCredentials.upstream.requests).toHaveLength(0);
  });
});
