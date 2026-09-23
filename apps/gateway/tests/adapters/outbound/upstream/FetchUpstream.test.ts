import { describe, expect, it } from "vitest";
import { FetchUpstream, type FetchInit, type UpstreamFetch } from "../../../../src/adapters/outbound/upstream/FetchUpstream.js";
import { UpstreamError } from "../../../../src/domain/errors.js";
import { bytes, readText } from "../../../fixtures/http.js";

interface Call {
  readonly url: URL;
  readonly init: FetchInit;
}

function recording(respond: () => Response | Promise<Response>): { calls: Call[]; fetchFn: UpstreamFetch } {
  const calls: Call[] = [];
  const fetchFn: UpstreamFetch = async (url, init) => {
    calls.push({ url, init });
    return respond();
  };
  return { calls, fetchFn };
}

function upstreamErrorOf(promise: Promise<unknown>): Promise<UpstreamError> {
  return promise.then(
    () => {
      throw new Error("expected UpstreamError");
    },
    (error: unknown) => {
      if (error instanceof UpstreamError) return error;
      throw error;
    },
  );
}

describe("FetchUpstream", () => {
  it("sends method, URL, body and end-to-end headers without following redirects", async () => {
    const { calls, fetchFn } = recording(
      () =>
        new Response("hello", {
          status: 202,
          headers: [
            ["x-a", "1"],
            ["set-cookie", "a=1; Path=/"],
            ["set-cookie", "b=2"],
          ],
        }),
    );
    const body = await bytes("payload");
    const response = await new FetchUpstream(fetchFn).forward({
      method: "POST",
      url: "https://up.test/api/x?y=1",
      headers: [
        ["content-type", "text/plain"],
        ["content-length", "7"],
        ["host", "gateway.test"],
        ["accept-encoding", "zstd"],
        ["x-trace", "t"],
      ],
      body,
      timeoutMs: 1000,
    });

    const call = calls[0];
    expect(call?.url.href).toBe("https://up.test/api/x?y=1");
    expect(call?.init.method).toBe("POST");
    expect(call?.init.redirect).toBe("manual");
    expect(call?.init.body).toBe(body);
    expect([...(call?.init.headers ?? new Headers())]).toEqual([
      ["content-type", "text/plain"],
      ["x-trace", "t"],
    ]);
    expect(call?.init.signal.aborted).toBe(false);

    expect(response.status).toBe(202);
    expect(response.headers).toEqual([
      ["content-type", "text/plain;charset=UTF-8"],
      ["x-a", "1"],
      ["set-cookie", "a=1; Path=/"],
      ["set-cookie", "b=2"],
    ]);
    expect(await readText(response.body)).toBe("hello");
  });

  it("never sends a body with GET and drops the framing headers of a decoded body", async () => {
    const { calls, fetchFn } = recording(
      () => new Response("plain", { headers: { "content-encoding": "gzip", "content-length": "5", "x-b": "2" } }),
    );
    const response = await new FetchUpstream(fetchFn).forward({
      method: "GET",
      url: "https://up.test/",
      headers: [],
      body: await bytes("ignored"),
      timeoutMs: 1000,
    });
    expect(calls[0]?.init.body).toBeUndefined();
    expect(response.headers).toEqual([
      ["content-type", "text/plain;charset=UTF-8"],
      ["x-b", "2"],
    ]);
  });

  it("maps a thrown fetch error to UpstreamError(network) with the cause attached", async () => {
    const boom = new TypeError("fetch failed");
    const error = await upstreamErrorOf(
      new FetchUpstream(async () => {
        throw boom;
      }).forward({ method: "GET", url: "https://up.test/", headers: [], body: null, timeoutMs: 1000 }),
    );
    expect(error.reason).toBe("network");
    expect(error.url).toBe("https://up.test/");
    expect(error.cause).toBe(boom);
  });

  it("aborts after timeoutMs and reports reason timeout", async () => {
    const fetchFn: UpstreamFetch = (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    const error = await upstreamErrorOf(
      new FetchUpstream(fetchFn).forward({ method: "GET", url: "https://up.test/slow", headers: [], body: null, timeoutMs: 10 }),
    );
    expect(error.reason).toBe("timeout");
  });

  it("rejects an invalid URL without calling fetch", async () => {
    const { calls, fetchFn } = recording(() => new Response("x"));
    const error = await upstreamErrorOf(
      new FetchUpstream(fetchFn).forward({ method: "GET", url: "not a url", headers: [], body: null, timeoutMs: 10 }),
    );
    expect(error.reason).toBe("invalid_url");
    expect(calls).toHaveLength(0);
  });
});
