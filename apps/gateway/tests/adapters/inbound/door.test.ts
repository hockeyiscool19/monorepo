import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/adapters/inbound/app.js";
import { DEFAULT_SETTINGS, type Settings } from "../../../src/adapters/inbound/settings.js";
import { FakeClock } from "../../../src/adapters/outbound/clock/FakeClock.js";
import type { LogFields, Logger } from "../../../src/adapters/outbound/log/Logger.js";
import { FakeRegistrySource } from "../../../src/adapters/outbound/registry/FakeRegistrySource.js";
import { FakeUpstream } from "../../../src/adapters/outbound/upstream/FakeUpstream.js";
import type { AccessDeps } from "../../../src/application/door.js";
import { UpstreamError } from "../../../src/domain/errors.js";
import {
  cookieAttributes,
  cookieValue,
  envelopeFor,
  fakeAccess,
  MEMBER,
  NOW,
  OWNER,
  seal,
  testSealer,
  TOKENS,
} from "../../fixtures/access.js";
import { GUARDED_VALE, makeGuardedRegistry, PLATFORM_AUTH } from "../../fixtures/registry.js";

/** A logger that keeps every line as JSON text, to prove what never reaches the logs. */
function recordingLogger(): Logger & { readonly lines: string[] } {
  const lines: string[] = [];
  const record = (message: string, fields?: LogFields) => lines.push(JSON.stringify({ message, ...fields }));
  return { lines, debug: record, info: record, warn: record, error: record };
}

/** createApp over fakes, with Vale guarded. `settings.accessMode` sets the mode (AppDeps take it from settings). */
function harness(options: { registry?: FakeRegistrySource; access?: Partial<AccessDeps>; settings?: Partial<Settings> } = {}) {
  const registry = options.registry ?? new FakeRegistrySource(makeGuardedRegistry());
  const upstream = new FakeUpstream();
  const log = recordingLogger();
  const { verifier, sealer, credentials } = fakeAccess(options.access);
  const settings = { ...DEFAULT_SETTINGS, gatewayVersion: "9.9.9", ...options.settings };
  const app = createApp({ registry, upstream, clock: new FakeClock(), settings, log, verifier, sealer, credentials });
  return { app, upstream, registry, log };
}

const SESSION_URL = "https://eisensoftware.test/vale/__door/session";
const PAGE = { accept: "text/html,application/xhtml+xml" };

async function signIn(app: ReturnType<typeof harness>["app"], token: string = TOKENS.owner): Promise<string> {
  const response = await app.request(SESSION_URL, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  expect(response.status).toBe(200);
  return `__session=${cookieValue(response.headers.get("set-cookie") ?? undefined)}`;
}

function expectDoorCaching(response: Response, cacheControl = "private, no-store"): void {
  expect(response.headers.get("cache-control")).toBe(cacheControl);
  expect(response.headers.get("vary")).toMatch(/(^|, )Cookie$/);
  expect(response.headers.get("x-gateway-version")).toBe("9.9.9");
}

describe("the door's session endpoint", () => {
  it("POST signs the browser in: 200 JSON, the sealed cookie, never cacheable", async () => {
    const { app } = harness();
    const response = await app.request(SESSION_URL, { method: "POST", headers: { authorization: `Bearer ${TOKENS.owner}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      app: "vale",
      uid: "uid-owner",
      groups: ["owner"],
      expiresAt: new Date((NOW + 12 * 3600) * 1000).toISOString(),
    });
    const setCookie = response.headers.get("set-cookie") ?? undefined;
    expect(cookieAttributes(setCookie)).toBe("Path=/vale; Max-Age=43200; HttpOnly; SameSite=Lax; Secure");
    expect(testSealer().open({ appId: "vale", value: cookieValue(setCookie) })?.p?.uid).toBe("uid-owner");
    expectDoorCaching(response);
  });

  it("drops Secure only for plain http to a loopback host", async () => {
    const { app } = harness();
    for (const [url, secure] of [
      ["http://localhost:8787/vale/__door/session", false],
      ["http://127.0.0.1:8787/vale/__door/session", false],
      ["http://[::1]:8787/vale/__door/session", false],
      ["http://gateway.test/vale/__door/session", true],
      ["https://localhost/vale/__door/session", true],
    ] as const) {
      const response = await app.request(url, { method: "POST", headers: { authorization: `Bearer ${TOKENS.owner}` } });
      expect(cookieAttributes(response.headers.get("set-cookie") ?? undefined).endsWith("; Secure")).toBe(secure);
    }
  });

  it("answers 401/403 JSON with the app and its groups; a failed sign-in attempt also removes the cookie", async () => {
    const { app } = harness();
    const none = await app.request(SESSION_URL, { method: "POST" });
    expect([none.status, await none.json(), none.headers.get("set-cookie")]).toEqual([
      401,
      { error: "sign_in_required", app: "vale", groups: ["owner", "vale"] },
      null,
    ]);
    const refused = await app.request(SESSION_URL, { method: "POST", headers: { authorization: "Bearer forged", accept: "text/html" } });
    expect([refused.status, await refused.json()]).toEqual([401, { error: "sign_in_required", app: "vale", groups: ["owner", "vale"] }]);
    expect(refused.headers.get("set-cookie")).toBe("__session=; Path=/vale; Max-Age=0; HttpOnly; SameSite=Lax; Secure");
    const outsider = await app.request(SESSION_URL, { method: "POST", headers: { authorization: `Bearer ${TOKENS.stranger}` } });
    expect([outsider.status, await outsider.json()]).toEqual([403, { error: "group_required", app: "vale", groups: ["owner", "vale"] }]);
    expect(outsider.headers.get("set-cookie")).toContain("Max-Age=0");
    expectDoorCaching(outsider);
  });

  it("DELETE signs out with 204 and a removed cookie; other methods get 405 and are never forwarded", async () => {
    const { app, upstream } = harness({ access: { sealer: undefined } });
    const deleted = await app.request(SESSION_URL, { method: "DELETE" });
    expect(deleted.status).toBe(204);
    expect(deleted.headers.get("set-cookie")).toBe("__session=; Path=/vale; Max-Age=0; HttpOnly; SameSite=Lax; Secure");
    expectDoorCaching(deleted);
    for (const method of ["GET", "PUT", "PATCH"]) {
      const response = await app.request(SESSION_URL, { method });
      expect([response.status, response.headers.get("allow")]).toEqual([405, "POST, DELETE"]);
    }
    expect(upstream.requests).toHaveLength(0);
  });
});

describe("passing the door", () => {
  it("forwards a signed-in browser to the app and re-seals the app's cookie", async () => {
    const { app, upstream } = harness();
    upstream.reply("https://vale.example.test/vale/", 200, "<html>vale</html>", [
      ["vary", "Accept-Encoding"],
      ["cache-control", "public, max-age=60"],
      ["set-cookie", "__session=app-state; Path=/vale; HttpOnly"],
    ]);
    const cookie = await signIn(app);
    const response = await app.request("https://eisensoftware.test/vale/?tab=list", { headers: { cookie, ...PAGE } });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<html>vale</html>");
    expect(response.headers.get("x-upstream-app")).toBe("vale");
    expect(response.headers.get("vary")).toBe("Accept-Encoding, Cookie");
    expect(response.headers.get("cache-control")).toBe("private, max-age=60");
    expect(upstream.requests[0]?.url).toBe("https://vale.example.test/vale/?tab=list");
    const resealed = response.headers.getSetCookie();
    expect(resealed).toHaveLength(1);
    expect(testSealer().open({ appId: "vale", value: cookieValue(resealed[0]) })).toMatchObject({ p: { uid: "uid-owner" }, a: "app-state" });
  });

  it("sends a denied page load back to the portal with 303 and the reason", async () => {
    const shortened = new FakeRegistrySource(makeGuardedRegistry(undefined, { ...PLATFORM_AUTH, sessionHours: 1 }));
    const cases: Array<[ReturnType<typeof harness>, Record<string, string>, string]> = [
      [harness(), {}, "sign_in_required"],
      [harness(), { cookie: `__session=${seal(envelopeFor(OWNER, NOW - 12 * 3600))}` }, "session_expired"],
      [harness({ registry: shortened }), { cookie: `__session=${seal(envelopeFor(OWNER, NOW - 7200))}` }, "session_expired"],
      [harness({ access: { sealer: undefined } }), {}, "door_unconfigured"],
    ];
    for (const [{ app, upstream }, headers, reason] of cases) {
      for (const method of ["GET", "HEAD"]) {
        const response = await app.request("https://eisensoftware.test/vale/list", { method, headers: { ...headers, ...PAGE } });
        expect([response.status, response.headers.get("location")]).toEqual([303, `/?gate=vale&reason=${reason}`]);
        expectDoorCaching(response);
      }
      expect(upstream.requests).toHaveLength(0);
    }
  });

  it("re-checks the registry on every request: a group removed from the app closes the door at once", async () => {
    const { app, upstream, registry } = harness();
    upstream.reply("https://vale.example.test/vale/", 200, "ok");
    const cookie = await signIn(app, TOKENS.member);
    expect((await app.request("https://eisensoftware.test/vale/", { headers: { cookie, ...PAGE } })).status).toBe(200);
    registry.set(makeGuardedRegistry([{ ...GUARDED_VALE, access: { groups: ["owner"] } }]));
    const page = await app.request("https://eisensoftware.test/vale/", { headers: { cookie, ...PAGE } });
    expect(page.headers.get("location")).toBe("/?gate=vale&reason=group_required");
    const call = await app.request("https://eisensoftware.test/vale/api/items", { headers: { cookie, accept: "application/json" } });
    expect([call.status, await call.json()]).toEqual([403, { error: "group_required", app: "vale", groups: ["owner"] }]);
    registry.set(makeGuardedRegistry([{ ...GUARDED_VALE, access: undefined }]));
    expect((await app.request("https://eisensoftware.test/vale/", { headers: { cookie } })).status).toBe(404);
    expect(upstream.requests).toHaveLength(1);
  });

  it("answers other denials and failures as JSON, never cacheable", async () => {
    const { app, upstream } = harness();
    const cookie = `__session=${seal(envelopeFor(MEMBER, NOW - 60, "y".repeat(10)))}`;
    const api = await app.request("https://eisensoftware.test/vale/api/items", { method: "POST", headers: { accept: "text/html" } });
    expect([api.status, await api.json()]).toEqual([401, { error: "sign_in_required", app: "vale", groups: ["owner", "vale"] }]);
    expectDoorCaching(api);

    upstream.reply("https://vale.example.test/vale/big", 200, "x", [["set-cookie", `__session=${"z".repeat(3000)}`]]);
    const big = await app.request("https://eisensoftware.test/vale/big", { headers: { cookie } });
    expect([big.status, await big.json()]).toEqual([500, { error: "session_too_large", app: "vale" }]);
    expectDoorCaching(big);

    upstream.failOn("https://vale.example.test/vale/down", "timeout");
    const down = await app.request("https://eisensoftware.test/vale/down?code=secret-oauth-code", { headers: { cookie, ...PAGE } });
    expect([down.status, (await down.json()) as unknown]).toEqual([502, expect.objectContaining({ error: "upstream_unavailable", reason: "timeout" })]);
    expectDoorCaching(down);

    const unavailable = harness({ registry: FakeRegistrySource.failing() });
    const response = await unavailable.app.request("https://eisensoftware.test/vale/", { headers: PAGE });
    expect([response.status, unavailable.upstream.requests.length]).toEqual([503, 0]);
  });

  it("under ACCESS_MODE=open is a plain proxy for the app's path", async () => {
    const { app, upstream } = harness({ access: { sealer: undefined }, settings: { accessMode: "open" } });
    upstream.reply("https://vale.example.test/vale/", 200, "ok");
    const response = await app.request("http://localhost:8787/vale/", { headers: { cookie: "__session=raw", ...PAGE } });
    expect([response.status, response.headers.get("cache-control"), response.headers.get("vary")]).toEqual([200, "private, no-store", "Cookie"]);
    expect(upstream.requests[0]?.headers).toContainEqual(["cookie", "__session=raw"]);
  });
});

describe("GET /api/auth/me and the guarded API", () => {
  it("answers the bearer's identity and decisions, never cached, with CORS for the portal", async () => {
    const { app } = harness();
    const response = await app.request("https://eisensoftware.test/api/auth/me", {
      headers: { authorization: `Bearer ${TOKENS.member}`, origin: "https://example.test" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://example.test");
    expect(await response.json()).toEqual({
      user: { uid: "uid-member", email: null, emailVerified: true, name: null, picture: null, provider: "password" },
      groups: ["vale"],
      access: [{ app: "vale", allowed: true, groups: ["owner", "vale"] }],
    });
    const anonymous = await app.request("https://eisensoftware.test/api/auth/me");
    expect([anonymous.status, await anonymous.json()]).toEqual([401, { error: "sign_in_required" }]);
  });

  it("keeps the guarded app's API behind a token, except its health route", async () => {
    const { app, upstream } = harness();
    upstream.reply("https://vale.example.test/api/", 200, "ok");
    const denied = await app.request("https://eisensoftware.test/api/vale/items", { headers: PAGE });
    expect([denied.status, await denied.json()]).toEqual([401, { error: "sign_in_required", app: "vale", groups: ["owner", "vale"] }]);
    expect((await app.request("https://eisensoftware.test/api/vale/grocery/health")).status).toBe(200);
    expect((await app.request("https://eisensoftware.test/api/vale/grocery/%68ealth")).status).toBe(401);
    const allowed = await app.request("https://eisensoftware.test/api/vale/items", { headers: { authorization: `Bearer ${TOKENS.owner}` } });
    expect([allowed.status, allowed.headers.get("cache-control"), allowed.headers.get("vary")]).toEqual([200, "private, no-store", "Authorization, Origin"]);
    const unavailable = harness({ registry: new FakeRegistrySource(makeGuardedRegistry()), access: { sealer: undefined } });
    const closed = await unavailable.app.request("https://eisensoftware.test/api/vale/items", { headers: { authorization: `Bearer ${TOKENS.owner}` } });
    expect([closed.status, await closed.json()]).toEqual([503, { error: "door_unconfigured", app: "vale" }]);
  });
});

describe("what reaches the logs", () => {
  it("never a token, a cookie value, an envelope or a query string — only app, uid, decision and reason", async () => {
    const { app, upstream, log } = harness();
    upstream.reply("https://vale.example.test/vale/", 200, "ok", [["set-cookie", "__session=app-secret-state; Path=/vale"]]);
    upstream.failOn("https://vale.example.test/vale/callback", "network");
    const cookie = await signIn(app);
    await app.request("https://eisensoftware.test/vale/", { headers: { cookie } });
    await app.request("https://eisensoftware.test/vale/callback?code=oauth-code-123", { headers: { cookie } });
    await app.request(SESSION_URL, { method: "POST", headers: { authorization: "Bearer forged-token-xyz" } });
    await app.request("https://eisensoftware.test/api/vale/items", { headers: { authorization: `Bearer ${TOKENS.stranger}` } });
    await app.request(SESSION_URL, { method: "DELETE", headers: { cookie } });
    const text = log.lines.join("\n");
    for (const secret of [TOKENS.owner, TOKENS.stranger, "forged-token-xyz", cookie.slice("__session=".length), "app-secret-state", "oauth-code-123"]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('"uid":"uid-owner"');
    expect(text).toContain('"reason":"group_required"');
    expect(new UpstreamError("https://a.test/x?code=1", "network").message).toBe("upstream network for https://a.test/x");
  });
});
