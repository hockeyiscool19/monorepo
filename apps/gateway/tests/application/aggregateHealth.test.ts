import { describe, expect, it } from "vitest";
import { aggregateHealth } from "../../src/application/aggregateHealth.js";
import { FakeClock } from "../../src/adapters/outbound/clock/FakeClock.js";
import { FakeRegistrySource } from "../../src/adapters/outbound/registry/FakeRegistrySource.js";
import { FakeUpstream, fakeResponse } from "../../src/adapters/outbound/upstream/FakeUpstream.js";
import { RegistryUnavailableError } from "../../src/domain/errors.js";
import { makeRegistry } from "../fixtures/registry.js";

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
    });
    expect(report.apps.map((app) => [app.id, app.ok, app.httpStatus])).toEqual([
      ["vale", false, 503],
      ["healthconnect", null, null],
      ["topology", true, 204],
    ]);
    expect(upstream.requests[0]?.timeoutMs).toBe(3000);
  });

  it("rejects only when the registry itself is unavailable", async () => {
    await expect(
      aggregateHealth({ registry: FakeRegistrySource.failing(), upstream: new FakeUpstream(), clock: new FakeClock(), gatewayVersion: "dev" }),
    ).rejects.toBeInstanceOf(RegistryUnavailableError);
  });
});
