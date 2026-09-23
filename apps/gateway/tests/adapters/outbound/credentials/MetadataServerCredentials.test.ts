import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../../src/adapters/outbound/clock/FakeClock.js";
import { FakeUpstreamCredentials } from "../../../../src/adapters/outbound/credentials/FakeUpstreamCredentials.js";
import {
  METADATA_IDENTITY_URL,
  MetadataServerCredentials,
  type MetadataFetch,
} from "../../../../src/adapters/outbound/credentials/MetadataServerCredentials.js";
import { NoUpstreamCredentials } from "../../../../src/adapters/outbound/credentials/NoUpstreamCredentials.js";
import { UpstreamError } from "../../../../src/domain/errors.js";
import { unsignedToken } from "../../../fixtures/tokens.js";

interface Call {
  readonly url: string;
  readonly headers: Record<string, string>;
}

/** A metadata server stub minting a token per call that expires `lifetime` seconds after the clock's now. */
function metadataServer(clock: FakeClock, lifetime = 3600) {
  const calls: Call[] = [];
  const fetchFn: MetadataFetch = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const audience = new URL(url).searchParams.get("audience") ?? "";
    const exp = Math.floor(clock.now() / 1000) + lifetime;
    return new Response(`${unsignedToken({ aud: audience, exp, n: calls.length })}\n`, { status: 200 });
  };
  return { calls, fetchFn };
}

async function upstreamErrorOf(promise: Promise<unknown>): Promise<UpstreamError> {
  const error = await promise.catch((thrown: unknown) => thrown);
  if (error instanceof UpstreamError) return error;
  throw new Error(`expected UpstreamError, got ${String(error)}`);
}

describe("MetadataServerCredentials", () => {
  it("asks the metadata server for an ID token whose audience is the upstream's origin", async () => {
    const clock = new FakeClock();
    const server = metadataServer(clock);
    const credentials = new MetadataServerCredentials({ clock, fetchFn: server.fetchFn });
    const headers = await credentials.headersFor({ url: "https://vale-1.run.app/vale/list?x=1" });
    expect(server.calls).toEqual([
      {
        url: `${METADATA_IDENTITY_URL}?audience=${encodeURIComponent("https://vale-1.run.app")}&format=full`,
        headers: { "Metadata-Flavor": "Google" },
      },
    ]);
    expect(headers).toHaveLength(1);
    expect(headers[0]?.[0]).toBe("x-serverless-authorization");
    expect(headers[0]?.[1]).toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.$/);
  });

  it("caches per audience until five minutes before the token's exp, then fetches a new one", async () => {
    const clock = new FakeClock();
    const server = metadataServer(clock);
    const credentials = new MetadataServerCredentials({ clock, fetchFn: server.fetchFn });
    const first = await credentials.headersFor({ url: "https://vale-1.run.app/a" });
    expect(await credentials.headersFor({ url: "https://vale-1.run.app/b" })).toEqual(first);
    await credentials.headersFor({ url: "https://topology-1.run.app/c" });
    expect(server.calls).toHaveLength(2);

    clock.advance((3600 - 300) * 1000 - 1);
    expect(await credentials.headersFor({ url: "https://vale-1.run.app/a" })).toEqual(first);
    expect(server.calls).toHaveLength(2);
    clock.advance(1);
    expect(await credentials.headersFor({ url: "https://vale-1.run.app/a" })).not.toEqual(first);
    expect(server.calls).toHaveLength(3);
  });

  it("shares one fetch between concurrent requests for the same audience", async () => {
    const clock = new FakeClock();
    const server = metadataServer(clock);
    const credentials = new MetadataServerCredentials({ clock, fetchFn: server.fetchFn });
    const [a, b] = await Promise.all([
      credentials.headersFor({ url: "https://vale-1.run.app/a" }),
      credentials.headersFor({ url: "https://vale-1.run.app/b" }),
    ]);
    expect(a).toEqual(b);
    expect(server.calls).toHaveLength(1);
  });

  it("does not cache a token whose exp cannot be read", async () => {
    let calls = 0;
    const fetchFn: MetadataFetch = async () => {
      calls += 1;
      return new Response("opaque-token");
    };
    const credentials = new MetadataServerCredentials({ clock: new FakeClock(), fetchFn });
    expect(await credentials.headersFor({ url: "https://vale-1.run.app/" })).toEqual([["x-serverless-authorization", "Bearer opaque-token"]]);
    await credentials.headersFor({ url: "https://vale-1.run.app/" });
    expect(calls).toBe(2);
  });

  it("fails with UpstreamError for an error status, an empty answer, a network failure, a timeout or a bad URL", async () => {
    const answer = (response: () => Promise<Response>) =>
      new MetadataServerCredentials({ clock: new FakeClock(), fetchFn: response, timeoutMs: 10 });
    const status = await upstreamErrorOf(answer(async () => new Response("no", { status: 404 })).headersFor({ url: "https://a.run.app" }));
    expect(status.reason).toBe("network");
    expect(status.url.startsWith(METADATA_IDENTITY_URL)).toBe(true);
    expect((await upstreamErrorOf(answer(async () => new Response("  ")).headersFor({ url: "https://a.run.app" }))).reason).toBe("network");
    const offline = answer(async () => {
      throw new TypeError("fetch failed");
    });
    expect((await upstreamErrorOf(offline.headersFor({ url: "https://a.run.app" }))).reason).toBe("network");
    const hanging: MetadataFetch = (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    const slow = new MetadataServerCredentials({ clock: new FakeClock(), fetchFn: hanging, timeoutMs: 10 });
    expect((await upstreamErrorOf(slow.headersFor({ url: "https://a.run.app" }))).reason).toBe("timeout");
    expect((await upstreamErrorOf(slow.headersFor({ url: "not a url" }))).reason).toBe("invalid_url");
  });
});

describe("NoUpstreamCredentials and FakeUpstreamCredentials", () => {
  it("add nothing, or fixed headers that can fail on demand", async () => {
    expect(await new NoUpstreamCredentials().headersFor()).toEqual([]);
    const fake = new FakeUpstreamCredentials([["x-serverless-authorization", "Bearer t"]]);
    expect(await fake.headersFor({ url: "https://a.test/x" })).toEqual([["x-serverless-authorization", "Bearer t"]]);
    expect(fake.calls).toEqual([{ url: "https://a.test/x" }]);
    fake.fail(new UpstreamError("http://metadata.test", "network"));
    await expect(fake.headersFor({ url: "https://a.test/x" })).rejects.toBeInstanceOf(UpstreamError);
  });
});
