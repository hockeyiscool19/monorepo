import { describe, expect, it } from "vitest";
import { createApp, REGISTRY_CACHE_CONTROL } from "../../../src/adapters/inbound/app.js";
import { DEFAULT_SETTINGS, type Settings } from "../../../src/adapters/inbound/settings.js";
import { FakeClock } from "../../../src/adapters/outbound/clock/FakeClock.js";
import { silentLogger } from "../../../src/adapters/outbound/log/Logger.js";
import { FakeRegistrySource } from "../../../src/adapters/outbound/registry/FakeRegistrySource.js";
import { FakeUpstream, fakeResponse } from "../../../src/adapters/outbound/upstream/FakeUpstream.js";
import { makeRegistry } from "../../fixtures/registry.js";

const VERSION = "1.2.3";

function harness(settings: Partial<Settings> = {}, registry = new FakeRegistrySource(makeRegistry())) {
  const upstream = new FakeUpstream();
  const app = createApp({
    registry,
    upstream,
    clock: new FakeClock(),
    settings: { ...DEFAULT_SETTINGS, gatewayVersion: VERSION, ...settings },
    log: silentLogger,
  });
  return { app, upstream, registry };
}

describe("GET /api/registry", () => {
  it("returns the registry JSON with cache headers, an ETag and the gateway version", async () => {
    const { app } = harness();
    const response = await app.request("http://gw.test/api/registry");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe(REGISTRY_CACHE_CONTROL);
    expect(response.headers.get("x-gateway-version")).toBe(VERSION);
    const etag = response.headers.get("etag");
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    expect(await response.json()).toEqual(JSON.parse(JSON.stringify(makeRegistry())));

    const cached = await app.request("http://gw.test/api/registry", { headers: { "if-none-match": etag ?? "" } });
    expect(cached.status).toBe(304);
    expect(cached.headers.get("etag")).toBe(etag);
    expect(cached.headers.get("cache-control")).toBe(REGISTRY_CACHE_CONTROL);
  });

  it("answers 503 registry_unavailable when no registry can be loaded", async () => {
    const { app } = harness({}, FakeRegistrySource.failing());
    const response = await app.request("http://gw.test/api/registry");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "registry_unavailable" });
  });
});

describe("GET /api/health", () => {
  it("is 200 with per-app results even when an upstream is down", async () => {
    const { app, upstream } = harness();
    upstream.reply("https://vale.example.test/api/grocery/health", 200, { ok: true }).failOn("https://topology.example.test/healthz");
    const response = await app.request("http://gw.test/api/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { gateway: unknown; apps: Array<{ id: string; ok: boolean | null }> };
    expect(body.gateway).toEqual({ ok: true, version: VERSION });
    expect(body.apps.map((app) => [app.id, app.ok])).toEqual([
      ["vale", true],
      ["healthconnect", null],
      ["topology", false],
    ]);
  });
});

describe("ANY /api/:app/*", () => {
  it("forwards method, path, query, headers and body, and decorates the response", async () => {
    const { app, upstream } = harness();
    upstream.on("https://vale.example.test/api/", () =>
      fakeResponse(201, { created: true }, [
        ["x-request-id", "r1"],
        ["connection", "close"],
        ["set-cookie", "a=1"],
        ["set-cookie", "b=2"],
      ]),
    );
    const response = await app.request("http://gw.test/api/vale/items?x=1&y=two", {
      method: "POST",
      headers: { "content-type": "application/json", "x-trace": "t1", connection: "keep-alive", "proxy-authorization": "no" },
      body: '{"a":1}',
    });

    const sent = upstream.requests[0];
    expect(sent?.method).toBe("POST");
    expect(sent?.url).toBe("https://vale.example.test/api/items?x=1&y=two");
    expect(sent?.headers).toContainEqual(["content-type", "application/json"]);
    expect(sent?.headers).toContainEqual(["x-trace", "t1"]);
    expect(sent?.headers.map(([name]) => name)).not.toContain("connection");
    expect(sent?.headers.map(([name]) => name)).not.toContain("proxy-authorization");
    expect(sent?.headers.map(([name]) => name)).not.toContain("host");
    expect(new TextDecoder().decode(sent?.body ?? new ArrayBuffer(0))).toBe('{"a":1}');
    expect(sent?.timeoutMs).toBe(DEFAULT_SETTINGS.upstreamTimeoutMs);

    expect(response.status).toBe(201);
    expect(response.headers.get("x-upstream-app")).toBe("vale");
    expect(response.headers.get("x-gateway-version")).toBe(VERSION);
    expect(response.headers.get("x-request-id")).toBe("r1");
    expect(response.headers.get("connection")).toBeNull();
    expect(response.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
    expect(await response.json()).toEqual({ created: true });
  });

  it("forwards the bare app path and GET without a body", async () => {
    const { app, upstream } = harness();
    upstream.reply("https://vale.example.test/api", 200, "root");
    const response = await app.request("http://gw.test/api/vale");
    expect(response.status).toBe(200);
    expect(upstream.requests[0]?.url).toBe("https://vale.example.test/api");
    expect(upstream.requests[0]?.body).toBeNull();
    expect(await response.text()).toBe("root");
  });

  it("answers 404 unknown_app listing the apps with an api", async () => {
    const { app, upstream } = harness();
    const response = await app.request("http://gw.test/api/nope/x");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "unknown_app", app: "nope", apps: ["vale", "topology"] });
    expect((await app.request("http://gw.test/api/healthconnect/x")).status).toBe(404);
    expect(upstream.requests).toHaveLength(0);
  });

  it("answers 502 upstream_unavailable when the upstream cannot be reached", async () => {
    const { app, upstream } = harness();
    upstream.failOn("https://vale.example.test/api/", "timeout");
    const response = await app.request("http://gw.test/api/vale/slow");
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: "upstream_unavailable", reason: "timeout" });
    expect(response.headers.get("x-gateway-version")).toBe(VERSION);
  });

  it("answers 503 registry_unavailable when the registry cannot be loaded", async () => {
    const { app, upstream } = harness({}, FakeRegistrySource.failing());
    const response = await app.request("http://gw.test/api/vale/x", { method: "DELETE" });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "registry_unavailable" });
    expect(upstream.requests).toHaveLength(0);
  });

  it("mounts everything under GATEWAY_PATH", async () => {
    const { app, upstream } = harness({ apiPrefix: "/gw" });
    upstream.reply("https://vale.example.test/api/x", 200, "ok");
    expect((await app.request("http://gw.test/gw/registry")).status).toBe(200);
    expect((await app.request("http://gw.test/gw/vale/x")).status).toBe(200);
    expect(upstream.requests[0]?.url).toBe("https://vale.example.test/api/x");
    const outside = await app.request("http://gw.test/api/registry");
    expect(outside.status).toBe(404);
    expect(await outside.json()).toMatchObject({ error: "not_found" });
  });
});

describe("CORS", () => {
  it("allows an app's web origin with credentials and exposes the gateway headers", async () => {
    const { app } = harness();
    const response = await app.request("http://gw.test/api/registry", { headers: { origin: "https://vale.example.test" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://vale.example.test");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-expose-headers")).toBe("ETag, X-Gateway-Version, X-Upstream-App");
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("allows the platform domain by default and PORTAL_ORIGIN when configured", async () => {
    const byDomain = await harness().app.request("http://gw.test/api/registry", { headers: { origin: "https://example.test" } });
    expect(byDomain.headers.get("access-control-allow-origin")).toBe("https://example.test");

    const configured = harness({ portalOrigins: ["https://portal.test"] }).app;
    const portal = await configured.request("http://gw.test/api/registry", { headers: { origin: "https://portal.test" } });
    expect(portal.headers.get("access-control-allow-origin")).toBe("https://portal.test");
    const domain = await configured.request("http://gw.test/api/registry", { headers: { origin: "https://example.test" } });
    expect(domain.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("denies other origins: no Access-Control headers at all, but the request still succeeds", async () => {
    const { app } = harness();
    const response = await app.request("http://gw.test/api/registry", { headers: { origin: "https://evil.test" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("answers preflights itself and never forwards them", async () => {
    const { app, upstream } = harness();
    const allowed = await app.request("http://gw.test/api/vale/items", {
      method: "OPTIONS",
      headers: {
        origin: "https://vale.example.test",
        "access-control-request-method": "PUT",
        "access-control-request-headers": "content-type, x-trace",
      },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://vale.example.test");
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
    expect(allowed.headers.get("access-control-allow-methods")).toContain("PUT");
    expect(allowed.headers.get("access-control-allow-headers")).toBe("content-type, x-trace");
    expect(allowed.headers.get("access-control-max-age")).toBe("600");

    const denied = await app.request("http://gw.test/api/vale/items", {
      method: "OPTIONS",
      headers: { origin: "https://evil.test", "access-control-request-method": "PUT" },
    });
    expect(denied.status).toBe(204);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    expect(denied.headers.get("access-control-allow-credentials")).toBeNull();
    expect(upstream.requests).toHaveLength(0);
  });

  it("keeps allowing the portal origins while the registry is unavailable", async () => {
    const { app } = harness({ portalOrigins: ["https://portal.test"] }, FakeRegistrySource.failing());
    const response = await app.request("http://gw.test/api/registry", { headers: { origin: "https://portal.test" } });
    expect(response.status).toBe(503);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://portal.test");
  });
});
