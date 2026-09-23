import { describe, expect, it } from "vitest";
import { allowedOrigins, isOriginAllowed, originOf, platformOrigins } from "../../src/domain/cors.js";
import { makeRegistry } from "../fixtures/registry.js";

describe("allowedOrigins", () => {
  it("uses the configured portal origins plus every app's web.url and web.altUrl", () => {
    const allowed = allowedOrigins(makeRegistry(), ["https://portal.test"]);
    expect([...allowed].sort()).toEqual([
      "https://healthconnect.example.test",
      "https://portal.test",
      "https://topology-alt.example.test",
      "https://topology.example.test",
      "https://vale.example.test",
    ]);
  });

  it("derives the portal origins from platform.domain when none are configured", () => {
    const allowed = allowedOrigins(makeRegistry(), []);
    expect(allowed.has("https://example.test")).toBe(true);
    expect(allowed.has("https://www.example.test")).toBe(true);
  });

  it("does not derive from the platform when portal origins are configured", () => {
    expect(allowedOrigins(makeRegistry(), ["https://portal.test"]).has("https://example.test")).toBe(false);
  });

  it("still allows the portal origins when the registry is unavailable", () => {
    expect([...allowedOrigins(undefined, ["https://portal.test"])]).toEqual(["https://portal.test"]);
    expect(allowedOrigins(undefined, []).size).toBe(0);
  });

  it("normalises URLs with paths to origins and drops unparsable ones", () => {
    const allowed = allowedOrigins(makeRegistry([]), ["https://portal.test/some/path?x=1", "not a url"]);
    expect([...allowed]).toEqual(["https://portal.test"]);
  });
});

describe("isOriginAllowed, originOf and platformOrigins", () => {
  it("match exact origins only", () => {
    const allowed = new Set(["https://portal.test"]);
    expect(isOriginAllowed(allowed, "https://portal.test")).toBe(true);
    expect(isOriginAllowed(allowed, "https://portal.test/")).toBe(true);
    expect(isOriginAllowed(allowed, "http://portal.test")).toBe(false);
    expect(isOriginAllowed(allowed, "https://evil.test")).toBe(false);
    expect(isOriginAllowed(allowed, "null")).toBe(false);
    expect(isOriginAllowed(allowed, undefined)).toBe(false);
  });

  it("originOf keeps scheme, host and explicit port", () => {
    expect(originOf("https://a.test:8443/x")).toBe("https://a.test:8443");
    expect(originOf("garbage")).toBeUndefined();
    expect(platformOrigins("eisensoftware.com")).toEqual(["https://eisensoftware.com", "https://www.eisensoftware.com"]);
  });
});
