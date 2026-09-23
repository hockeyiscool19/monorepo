import { describe, expect, it } from "vitest";
import { aggregateHealth } from "../../src/application/aggregateHealth.js";
import { FakeClock } from "../../src/adapters/outbound/clock/FakeClock.js";
import { FAKE_CREDENTIAL, FakeUpstreamCredentials } from "../../src/adapters/outbound/credentials/FakeUpstreamCredentials.js";
import { FakeRegistrySource } from "../../src/adapters/outbound/registry/FakeRegistrySource.js";
import { FakeUpstream, fakeResponse } from "../../src/adapters/outbound/upstream/FakeUpstream.js";
import { RegistryUnavailableError, UpstreamError } from "../../src/domain/errors.js";
import { makeGuardedRegistry, makeRegistry } from "../fixtures/registry.js";

describe("aggregateHealth", () => {
  it("probes every app with an api, reports ok:null for the others, and survives a failing upstream", async () => {
    const clock = new FakeClock();
    const upstream = new FakeUpstream()
      .on("https://vale.example.test/api/grocery/health", () => {
        clock.advance(12);
        return fakeResponse(200, { ok: true });
      })
      .failOn("https://topology.example.test/healthz", "timeout");

    const report = await aggregateHealth({
      registry: new FakeRegistrySource(makeRegistry()),
      upstream,
      clock,
      gatewayVersion: "1.2.3",
      credentials: new FakeUpstreamCredentials(),
      timeoutMs: 3000,
    });

    expect(report.gateway).toEqual({ ok: true, version: "1.2.3" });
    expect(report.apps).toEqual([
      { id: "vale", status: "live", ok: true, httpStatus: 200, latencyMs: 12 },
      { id: "healthconnect", status: "live", ok: null, httpStatus: null, latencyMs: null },
      { id: "topology", status: "beta", ok: false, httpStatus: null, latencyMs: expect.any(Number), error: "timeout" },
    ]);
    expect(upstream.requests.map((request) => [request.method, request.url, request.timeoutMs])).toEqual([
      ["GET", "https://vale.example.test/api/grocery/health", 3000],
      ["GET", "https://topology.example.test/healthz", 3000],
    ]);
    expect(upstream.requests[0]?.headers).toContainEqual(["user-agent", "eisensoftware-gateway/1.2.3"]);
  });

  it("marks non-2xx answers as not ok but keeps the status", async () => {
    const upstream = new FakeUpstream()
      .reply("https://vale.example.test/api/grocery/health", 503, "down")
      .reply("https://topology.example.test/healthz", 204);
    const report = await aggregateHealth({
      registry: new FakeRegistrySource(makeRegistry()),
      upstream,
      clock: new FakeClock(),
      gatewayVersion: "dev",
      credentials: new FakeUpstreamCredentials(),
    });
    expect(report.apps.map((app) => [app.id, app.ok, app.httpStatus])).toEqual([
      ["vale", false, 503],
      ["healthconnect", null, null],
      ["topology", true, 204],
    ]);
    expect(upstream.requests[0]?.timeoutMs).toBe(3000);
  });

  it("sends the gateway's credentials to guarded apps' health only", async () => {
    const credentials = new FakeUpstreamCredentials();
    const upstream = new FakeUpstream()
      .reply("https://vale.example.test/api/grocery/health", 200)
      .reply("https://topology.example.test/healthz", 200);
    await aggregateHealth({
      registry: new FakeRegistrySource(makeGuardedRegistry()),
      upstream,
      clock: new FakeClock(),
      gatewayVersion: "dev",
      credentials,
    });
    const byUrl = new Map(upstream.requests.map((request) => [request.url, request.headers]));
    expect(byUrl.get("https://vale.example.test/api/grocery/health")).toContainEqual(FAKE_CREDENTIAL);
    expect(byUrl.get("https://topology.example.test/healthz")).not.toContainEqual(FAKE_CREDENTIAL);
    expect(credentials.calls).toEqual([{ url: "https://vale.example.test/api/grocery/health" }]);
  });

  it("marks a guarded app down when its credentials cannot be obtained, without probing it", async () => {
    const credentials = new FakeUpstreamCredentials().fail(new UpstreamError("http://metadata.test/identity", "timeout"));
    const upstream = new FakeUpstream().reply("https://topology.example.test/healthz", 200);
    const report = await aggregateHealth({
      registry: new FakeRegistrySource(makeGuardedRegistry()),
      upstream,
      clock: new FakeClock(),
      gatewayVersion: "dev",
      credentials,
    });
    expect(report.apps[0]).toMatchObject({ id: "vale", ok: false, error: "timeout" });
    expect(upstream.requests.map((request) => request.url)).toEqual(["https://topology.example.test/healthz"]);
  });

  it("rejects only when the registry itself is unavailable", async () => {
    await expect(
      aggregateHealth({
        registry: FakeRegistrySource.failing(),
        upstream: new FakeUpstream(),
        clock: new FakeClock(),
        gatewayVersion: "dev",
        credentials: new FakeUpstreamCredentials(),
      }),
    ).rejects.toBeInstanceOf(RegistryUnavailableError);
  });
});
