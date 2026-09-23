import { describe, expect, it } from "vitest";
import { bearerToken, connectionTokens, headerValue, headerValues, stripHopByHop, withoutHeaders } from "../../src/domain/headers.js";

describe("bearerToken", () => {
  it("reads the token of the first Authorization: Bearer header, scheme case-insensitive", () => {
    expect(bearerToken([["Authorization", "Bearer abc.def.ghi"]])).toBe("abc.def.ghi");
    expect(bearerToken([["authorization", "bearer  tok "]])).toBe("tok");
    expect(bearerToken([["authorization", "Bearer first"], ["authorization", "Bearer second"]])).toBe("first");
  });

  it("finds nothing without a well-formed bearer credential", () => {
    for (const value of ["", "Bearer", "Bearer ", "Basic dXNlcjpwdw==", "Bearer a b", "Token abc", "Bearerabc"]) {
      expect(bearerToken([["authorization", value]])).toBeUndefined();
    }
    expect(bearerToken([])).toBeUndefined();
  });

  it("headerValues returns every value of a header, in order", () => {
    expect(headerValues([["Cookie", "a=1"], ["x", "y"], ["cookie", "b=2"]], "cookie")).toEqual(["a=1", "b=2"]);
  });
});

describe("stripHopByHop", () => {
  it("drops hop-by-hop, host and proxy-* headers and keeps the rest lower-cased, in order", () => {
    const filtered = stripHopByHop([
      ["Host", "gateway.example.test"],
      ["Connection", "keep-alive"],
      ["Keep-Alive", "timeout=5"],
      ["Transfer-Encoding", "chunked"],
      ["TE", "trailers"],
      ["Trailer", "x"],
      ["Upgrade", "h2c"],
      ["Proxy-Authorization", "Basic x"],
      ["Proxy-Connection", "keep-alive"],
      ["Proxy-Anything", "1"],
      ["Content-Type", "application/json"],
      ["Authorization", "Bearer t"],
      ["Cookie", "a=1"],
      ["X-Trace", "abc"],
    ]);
    expect(filtered).toEqual([
      ["content-type", "application/json"],
      ["authorization", "Bearer t"],
      ["cookie", "a=1"],
      ["x-trace", "abc"],
    ]);
  });

  it("also drops every header named in Connection", () => {
    const filtered = stripHopByHop([
      ["Connection", "close, X-Custom , x-other"],
      ["X-Custom", "1"],
      ["X-Other", "2"],
      ["X-Kept", "3"],
    ]);
    expect(filtered).toEqual([["x-kept", "3"]]);
  });

  it("keeps duplicates such as several set-cookie headers", () => {
    expect(stripHopByHop([["Set-Cookie", "a=1"], ["Set-Cookie", "b=2"]])).toEqual([
      ["set-cookie", "a=1"],
      ["set-cookie", "b=2"],
    ]);
  });
});

describe("connectionTokens, withoutHeaders and headerValue", () => {
  it("parse and look up case-insensitively", () => {
    expect([...connectionTokens([["connection", "Close, X-A"]])]).toEqual(["close", "x-a"]);
    expect(withoutHeaders([["Content-Length", "3"], ["x-a", "1"]], new Set(["content-length"]))).toEqual([["x-a", "1"]]);
    expect(headerValue([["X-A", "first"], ["x-a", "second"]], "x-a")).toBe("first");
    expect(headerValue([], "x-a")).toBeUndefined();
  });
});
