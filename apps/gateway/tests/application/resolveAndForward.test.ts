import { describe, expect, it } from "vitest";
import { resolveAndForward } from "../../src/application/resolveAndForward.js";
import { FakeRegistrySource } from "../../src/adapters/outbound/registry/FakeRegistrySource.js";
import { FakeUpstream, fakeResponse } from "../../src/adapters/outbound/upstream/FakeUpstream.js";
import { RegistryUnavailableError, UnknownAppError, UpstreamError } from "../../src/domain/errors.js";
import { bytes, readText } from "../fixtures/http.js";
import { makeRegistry } from "../fixtures/registry.js";

function deps(upstream: FakeUpstream, registry = new FakeRegistrySource(makeRegistry())) {
  return { registry, upstream, apiPrefix: "/api", upstreamTimeoutMs: 1234 };
}

describe("resolveAndForward", () => {
  it("forwards method, remaining path, query and body, stripping hop-by-hop headers both ways", async () => {
    const upstream = new FakeUpstream().on("https://vale.example.test/api/", () =>
      fakeResponse(201, { ok: true }, [
        ["connection", "close"],
        ["transfer-encoding", "chunked"],
        ["X-Upstream-Header", "yes"],
      ]),
    );
    const body = await bytes('{"a":1}');
    const result = await resolveAndForward(deps(upstream), {
      method: "POST",
      path: "/api/vale/items",
      search: "?x=1",
      headers: [
        ["host", "gateway.test"],
        ["connection", "keep-alive"],
        ["Content-Type", "application/json"],
        ["proxy-authorization", "x"],
        ["X-Trace", "t1"],
      ],
      body,
    });

    expect(upstream.requests).toHaveLength(1);
    const sent = upstream.requests[0];
    expect(sent?.method).toBe("POST");
    expect(sent?.url).toBe("https://vale.example.test/api/items?x=1");
    expect(sent?.headers).toEqual([
      ["content-type", "application/json"],
      ["x-trace", "t1"],
    ]);
    expect(sent?.body).toBe(body);
    expect(sent?.timeoutMs).toBe(1234);

    expect(result.appId).toBe("vale");
    expect(result.status).toBe(201);
    expect(result.headers).toEqual([
      ["content-type", "application/json"],
      ["x-upstream-header", "yes"],
    ]);
    expect(await readText(result.body)).toBe('{"ok":true}');
  });

  it("passes upstream error statuses through as responses", async () => {
    const upstream = new FakeUpstream().reply("https://vale.example.test/api/", 404, "nope");
    const result = await resolveAndForward(deps(upstream), { method: "GET", path: "/api/vale/missing", search: "", headers: [], body: null });
    expect(result.status).toBe(404);
    expect(await readText(result.body)).toBe("nope");
  });

  it("rejects with UnknownAppError before touching the upstream", async () => {
    const upstream = new FakeUpstream();
    await expect(
      resolveAndForward(deps(upstream), { method: "GET", path: "/api/nope/x", search: "", headers: [], body: null }),
    ).rejects.toBeInstanceOf(UnknownAppError);
    expect(upstream.requests).toHaveLength(0);
  });

  it("propagates UpstreamError when the upstream cannot be reached", async () => {
    const upstream = new FakeUpstream().failOn("https://vale.example.test/api/", "network");
    await expect(
      resolveAndForward(deps(upstream), { method: "GET", path: "/api/vale/x", search: "", headers: [], body: null }),
    ).rejects.toBeInstanceOf(UpstreamError);
  });

  it("propagates registry failures", async () => {
    const upstream = new FakeUpstream();
    await expect(
      resolveAndForward(deps(upstream, FakeRegistrySource.failing()), { method: "GET", path: "/api/vale/x", search: "", headers: [], body: null }),
    ).rejects.toBeInstanceOf(RegistryUnavailableError);
    expect(upstream.requests).toHaveLength(0);
  });
});
