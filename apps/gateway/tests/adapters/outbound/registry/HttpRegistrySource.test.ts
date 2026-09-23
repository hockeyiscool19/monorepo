import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../../src/adapters/outbound/clock/FakeClock.js";
import { HttpRegistrySource, type RegistryFetch } from "../../../../src/adapters/outbound/registry/HttpRegistrySource.js";
import { RegistryUnavailableError } from "../../../../src/domain/errors.js";
import type { Registry } from "../../../../src/domain/registry.js";
import { makeRegistry, registryDocument, VALE } from "../../../fixtures/registry.js";

const URL_ = "https://portal.test/registry.json";
const FALLBACK: Registry = makeRegistry([VALE], { generatedAt: "2020-01-01T00:00:00Z" });

interface Stub {
  readonly fetchFn: RegistryFetch;
  readonly calls: number;
}

/** A fetch stub that answers with `answers[i]` on call i (the last one repeats); a function throws. */
function stub(...answers: Array<Record<string, unknown> | Error | Response>): Stub {
  const state = { calls: 0 };
  const fetchFn: RegistryFetch = async () => {
    const answer = answers[Math.min(state.calls, answers.length - 1)];
    state.calls += 1;
    if (answer instanceof Error) throw answer;
    if (answer instanceof Response) return answer;
    return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
  };
  return {
    fetchFn,
    get calls() {
      return state.calls;
    },
  };
}

function source(fetch: Stub, clock = new FakeClock(), extra: { ttlSeconds?: number; retrySeconds?: number; fetchTimeoutMs?: number } = {}) {
  return new HttpRegistrySource({
    url: URL_,
    ttlSeconds: extra.ttlSeconds ?? 300,
    clock,
    fetchFn: fetch.fetchFn,
    fallback: () => FALLBACK,
    ...extra,
  });
}

describe("HttpRegistrySource", () => {
  it("fetches, validates and caches the registry for the TTL", async () => {
    const fetch = stub(registryDocument());
    const clock = new FakeClock();
    const registry = source(fetch, clock);

    const first = await registry.load();
    expect(first.apps.map((app) => app.id)).toEqual(["vale", "healthconnect", "topology"]);
    expect(registry.origin).toBe("live");
    await registry.load();
    expect(fetch.calls).toBe(1);

    clock.advance(300_000 - 1);
    await registry.load();
    expect(fetch.calls).toBe(1);
    clock.advance(1);
    await registry.load();
    expect(fetch.calls).toBe(2);
  });

  it("fills in generatedAt from the clock when the published copy lacks it", async () => {
    const document = registryDocument();
    delete document["generatedAt"];
    const registry = await source(stub(document), new FakeClock(Date.UTC(2026, 8, 23, 12, 0, 0))).load();
    expect(registry.generatedAt).toBe("2026-09-23T12:00:00.000Z");
  });

  it("serves the bundled snapshot when the fetch fails, then retries after the retry window", async () => {
    const fetch = stub(new Error("ECONNREFUSED"), registryDocument());
    const clock = new FakeClock();
    const registry = source(fetch, clock, { retrySeconds: 30 });

    expect(await registry.load()).toBe(FALLBACK);
    expect(registry.origin).toBe("fallback");
    expect(await registry.load()).toBe(FALLBACK);
    expect(fetch.calls).toBe(1);

    clock.advance(30_000);
    const live = await registry.load();
    expect(live.apps).toHaveLength(3);
    expect(registry.origin).toBe("live");
    expect(fetch.calls).toBe(2);
  });

  it("falls back on non-2xx answers, non-JSON bodies and invalid documents", async () => {
    for (const bad of [new Response("gone", { status: 502 }), new Response("<html>", { status: 200 }), { contractVersion: 2 }]) {
      const registry = source(stub(bad));
      expect(await registry.load()).toBe(FALLBACK);
    }
  });

  it("keeps the last good copy when a refresh fails", async () => {
    const fetch = stub(registryDocument(), new Error("down"));
    const clock = new FakeClock();
    const registry = source(fetch, clock, { ttlSeconds: 60 });
    const live = await registry.load();
    clock.advance(60_000);
    expect(await registry.load()).toBe(live);
    expect(registry.origin).toBe("live");
    expect(fetch.calls).toBe(2);
  });

  it("rejects with RegistryUnavailableError when both the fetch and the fallback fail", async () => {
    const registry = new HttpRegistrySource({
      url: URL_,
      ttlSeconds: 300,
      clock: new FakeClock(),
      fetchFn: stub(new Error("down")).fetchFn,
      fallback: () => {
        throw new Error("no snapshot");
      },
    });
    await expect(registry.load()).rejects.toBeInstanceOf(RegistryUnavailableError);
    await expect(registry.load()).rejects.toThrow(/live fetch failed .* fallback failed/);
  });

  it("shares one in-flight fetch between concurrent loads", async () => {
    const fetch = stub(registryDocument());
    const registry = source(fetch);
    const [a, b] = await Promise.all([registry.load(), registry.load()]);
    expect(a).toBe(b);
    expect(fetch.calls).toBe(1);
  });

  it("aborts a fetch that exceeds fetchTimeoutMs and falls back", async () => {
    const fetchFn: RegistryFetch = (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    const registry = new HttpRegistrySource({ url: URL_, ttlSeconds: 300, clock: new FakeClock(), fetchFn, fallback: () => FALLBACK, fetchTimeoutMs: 10 });
    expect(await registry.load()).toBe(FALLBACK);
  });
});
