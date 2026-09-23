import { describe, expect, it } from "vitest";
import { FAKE_CREDENTIAL } from "../../src/adapters/outbound/credentials/FakeUpstreamCredentials.js";
import { FakeRegistrySource } from "../../src/adapters/outbound/registry/FakeRegistrySource.js";
import { FakeUpstream, fakeResponse } from "../../src/adapters/outbound/upstream/FakeUpstream.js";
import { bodyOf, type AccessDeps } from "../../src/application/door.js";
import { resolveAndForward, type InboundRequest } from "../../src/application/resolveAndForward.js";
import { RegistryUnavailableError, UnknownAppError, UpstreamError } from "../../src/domain/errors.js";
import type { HeaderList } from "../../src/domain/headers.js";
import { denialOf, fakeAccess, TOKENS } from "../fixtures/access.js";
import { bytes, readText } from "../fixtures/http.js";
import { makeGuardedRegistry, makeRegistry, PLATFORM_AUTH } from "../fixtures/registry.js";

function deps(upstream: FakeUpstream, registry = new FakeRegistrySource(makeRegistry()), access: AccessDeps = fakeAccess()) {
  return { registry, upstream, apiPrefix: "/api", upstreamTimeoutMs: 1234, access };
}

function get(path: string, headers: HeaderList = [], method = "GET"): InboundRequest {
  return { method, path, search: "", headers, body: bodyOf(null) };
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
      body: bodyOf(body),
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
    expect(result.uid).toBeUndefined();
    expect(await readText(result.body)).toBe('{"ok":true}');
  });

  it("passes upstream error statuses through as responses", async () => {
    const upstream = new FakeUpstream().reply("https://vale.example.test/api/", 404, "nope");
    const result = await resolveAndForward(deps(upstream), get("/api/vale/missing"));
    expect(result.status).toBe(404);
    expect(await readText(result.body)).toBe("nope");
  });

  it("rejects with UnknownAppError before touching the upstream", async () => {
    const upstream = new FakeUpstream();
    await expect(resolveAndForward(deps(upstream), get("/api/nope/x"))).rejects.toBeInstanceOf(UnknownAppError);
    expect(upstream.requests).toHaveLength(0);
  });

  it("propagates UpstreamError when the upstream cannot be reached", async () => {
    const upstream = new FakeUpstream().failOn("https://vale.example.test/api/", "network");
    await expect(resolveAndForward(deps(upstream), get("/api/vale/x"))).rejects.toBeInstanceOf(UpstreamError);
  });

  it("propagates registry failures", async () => {
    const upstream = new FakeUpstream();
    await expect(resolveAndForward(deps(upstream, FakeRegistrySource.failing()), get("/api/vale/x"))).rejects.toBeInstanceOf(
      RegistryUnavailableError,
    );
    expect(upstream.requests).toHaveLength(0);
  });
});

describe("resolveAndForward — the API policy of a guarded app", () => {
  const guarded = () => new FakeRegistrySource(makeGuardedRegistry());

  it("forwards a token that passes, with the gateway's credentials in place of the caller's and private caching", async () => {
    const access = fakeAccess();
    const upstream = new FakeUpstream().reply("https://vale.example.test/api/list", 200, "[]", [
      ["cache-control", "public, s-maxage=300, max-age=60"],
      ["vary", "Accept"],
    ]);
    const result = await resolveAndForward(
      deps(upstream, guarded(), access),
      get("/api/vale/list", [
        ["authorization", `Bearer ${TOKENS.member}`],
        ["x-serverless-authorization", "Bearer forged"],
      ]),
    );
    expect(result.status).toBe(200);
    expect(result.uid).toBe("uid-member");
    const sent = upstream.requests[0]?.headers ?? [];
    expect(sent).toContainEqual(["authorization", `Bearer ${TOKENS.member}`]);
    expect(sent.filter(([name]) => name === "x-serverless-authorization")).toEqual([FAKE_CREDENTIAL]);
    expect(access.verifier.calls).toEqual([{ token: TOKENS.member, projectId: PLATFORM_AUTH.projectId }]);
    expect(access.credentials.calls).toEqual([{ url: "https://vale.example.test/api/list" }]);
    expect(result.headers).toContainEqual(["cache-control", "private, max-age=60"]);
    expect(result.headers).toContainEqual(["vary", "Accept, Authorization"]);
  });

  it("refuses a request without a token (401) and a person outside the groups (403), before any upstream call", async () => {
    const upstream = new FakeUpstream();
    const missing = await denialOf(resolveAndForward(deps(upstream, guarded()), get("/api/vale/list")));
    expect([missing.reason, missing.appId, missing.groups]).toEqual(["sign_in_required", "vale", ["owner", "vale"]]);
    expect(missing.endsSession).toBe(false);

    const bad = await denialOf(
      resolveAndForward(deps(upstream, guarded()), get("/api/vale/list", [["authorization", "Bearer forged"]])),
    );
    expect([bad.reason, bad.appId]).toEqual(["sign_in_required", "vale"]);

    const stranger = await denialOf(
      resolveAndForward(deps(upstream, guarded()), get("/api/vale/list", [["authorization", `Bearer ${TOKENS.stranger}`]])),
    );
    expect([stranger.reason, stranger.uid, stranger.groups]).toEqual(["group_required", "uid-stranger", ["owner", "vale"]]);
    expect(upstream.requests).toHaveLength(0);
  });

  it("never reads the body of a refused request", async () => {
    let reads = 0;
    const request: InboundRequest = {
      ...get("/api/vale/upload", [], "POST"),
      body: async () => {
        reads += 1;
        return new ArrayBuffer(8);
      },
    };
    await denialOf(resolveAndForward(deps(new FakeUpstream(), guarded()), request));
    expect(reads).toBe(0);
  });

  it("exempts exactly GET/HEAD <prefix>/<id><healthPath>, and nothing that merely resembles it", async () => {
    const access = fakeAccess();
    const upstream = new FakeUpstream().reply("https://vale.example.test/api/", 200, "ok");
    for (const method of ["GET", "HEAD"]) {
      const result = await resolveAndForward(deps(upstream, guarded(), access), get("/api/vale/grocery/health", [], method));
      expect(result.status).toBe(200);
    }
    expect(access.verifier.calls).toHaveLength(0);
    expect(access.credentials.calls).toHaveLength(2);
    for (const request of [
      get("/api/vale/grocery/health", [], "POST"),
      get("/api/vale/grocery/health/"),
      get("/api/vale/grocery/%68ealth"),
      get("/api/vale/grocery//health"),
      get("/api/vale/grocery"),
    ]) {
      expect((await denialOf(resolveAndForward(deps(upstream, guarded(), access), request))).reason).toBe("sign_in_required");
    }
  });

  it("is closed while the door is unconfigured: no SESSION_SECRET, or sign-in missing or disabled", async () => {
    const upstream = new FakeUpstream().reply("https://vale.example.test/api/", 200, "ok");
    const token: HeaderList = [["authorization", `Bearer ${TOKENS.owner}`]];
    const noSecret = await denialOf(
      resolveAndForward(deps(upstream, guarded(), fakeAccess({ sealer: undefined })), get("/api/vale/list", token)),
    );
    expect([noSecret.reason, noSecret.appId, noSecret.groups]).toEqual(["door_unconfigured", "vale", undefined]);
    const disabled = new FakeRegistrySource(makeGuardedRegistry(undefined, { ...PLATFORM_AUTH, enabled: false }));
    expect((await denialOf(resolveAndForward(deps(upstream, disabled), get("/api/vale/list", token)))).reason).toBe(
      "door_unconfigured",
    );
    expect(upstream.requests).toHaveLength(0);
    const health = await resolveAndForward(deps(upstream, guarded(), fakeAccess({ sealer: undefined })), get("/api/vale/grocery/health"));
    expect(health.status).toBe(200);
  });

  it("skips the policy under ACCESS_MODE=open but still sends the gateway's credentials", async () => {
    const access = fakeAccess({ mode: "open" });
    const upstream = new FakeUpstream().reply("https://vale.example.test/api/", 200, "ok");
    const result = await resolveAndForward(deps(upstream, guarded(), access), get("/api/vale/list"));
    expect(result.status).toBe(200);
    expect(result.uid).toBeUndefined();
    expect(upstream.requests[0]?.headers).toContainEqual(FAKE_CREDENTIAL);
  });

  it("fails closed when the gateway's credentials cannot be obtained", async () => {
    const access = fakeAccess();
    access.credentials.fail(new UpstreamError("http://metadata.test/identity", "network"));
    const upstream = new FakeUpstream().reply("https://vale.example.test/api/", 200, "ok");
    await expect(
      resolveAndForward(deps(upstream, guarded(), access), get("/api/vale/list", [["authorization", `Bearer ${TOKENS.owner}`]])),
    ).rejects.toBeInstanceOf(UpstreamError);
    expect(upstream.requests).toHaveLength(0);
  });
});
