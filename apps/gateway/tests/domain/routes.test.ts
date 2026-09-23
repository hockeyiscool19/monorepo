import { describe, expect, it } from "vitest";
import { UnknownAppError } from "../../src/domain/errors.js";
import { apiAppIds, healthUrl, joinUpstream, resolveRoute, splitApiPath } from "../../src/domain/routes.js";
import { HEALTHCONNECT, makeRegistry, VALE } from "../fixtures/registry.js";

const registry = makeRegistry();

function unknownAppOf(fn: () => unknown): UnknownAppError {
  try {
    fn();
  } catch (error) {
    if (error instanceof UnknownAppError) return error;
    throw error;
  }
  throw new Error("expected UnknownAppError");
}

describe("resolveRoute", () => {
  it("strips the prefix and the app id and keeps the remaining path", () => {
    const route = resolveRoute(registry, "/api/vale/grocery/health", "");
    expect(route.app.id).toBe("vale");
    expect(route.upstreamUrl).toBe("https://vale.example.test/api/grocery/health");
  });

  it("preserves the query string verbatim, encoding included", () => {
    expect(resolveRoute(registry, "/api/vale/items", "?q=a%20b&x=1&x=2").upstreamUrl).toBe(
      "https://vale.example.test/api/items?q=a%20b&x=1&x=2",
    );
  });

  it("maps the bare app path to the base URL, with or without a trailing slash", () => {
    expect(resolveRoute(registry, "/api/vale", "").upstreamUrl).toBe("https://vale.example.test/api");
    expect(resolveRoute(registry, "/api/vale/", "").upstreamUrl).toBe("https://vale.example.test/api/");
    expect(resolveRoute(registry, "/api/vale", "?a=1").upstreamUrl).toBe("https://vale.example.test/api?a=1");
  });

  it("never doubles the slash when baseUrl ends with one", () => {
    expect(resolveRoute(registry, "/api/topology/healthz", "").upstreamUrl).toBe("https://topology.example.test/healthz");
  });

  it("throws UnknownAppError listing the apps with an api for an unknown id", () => {
    const error = unknownAppOf(() => resolveRoute(registry, "/api/nope/x", ""));
    expect(error.appId).toBe("nope");
    expect(error.knownApps).toEqual(["vale", "topology"]);
    expect(error.kind).toBe("unknown_app");
  });

  it("throws UnknownAppError for an app without an api block, whatever its status", () => {
    expect(unknownAppOf(() => resolveRoute(registry, "/api/healthconnect/x", "")).appId).toBe("healthconnect");
    const hidden = makeRegistry([{ ...VALE, status: "hidden" }, HEALTHCONNECT]);
    expect(resolveRoute(hidden, "/api/vale/x", "").upstreamUrl).toBe("https://vale.example.test/api/x");
  });

  it("throws UnknownAppError for paths outside the prefix or with no id", () => {
    expect(unknownAppOf(() => resolveRoute(registry, "/other/vale/x", "")).appId).toBe("");
    expect(unknownAppOf(() => resolveRoute(registry, "/api/", "")).appId).toBe("");
    expect(unknownAppOf(() => resolveRoute(registry, "/api", "")).appId).toBe("");
  });

  it("honours a custom mount prefix", () => {
    expect(resolveRoute(registry, "/gw/vale/x", "", "/gw").upstreamUrl).toBe("https://vale.example.test/api/x");
    expect(unknownAppOf(() => resolveRoute(registry, "/api/vale/x", "", "/gw")).appId).toBe("");
  });
});

describe("splitApiPath", () => {
  it("splits id and rest, keeping the rest's leading slash", () => {
    expect(splitApiPath("/api/vale/a/b")).toEqual({ id: "vale", rest: "/a/b" });
    expect(splitApiPath("/api/vale")).toEqual({ id: "vale", rest: "" });
    expect(splitApiPath("/api/vale/")).toEqual({ id: "vale", rest: "/" });
    expect(splitApiPath("/api/")).toBeUndefined();
    expect(splitApiPath("/apix/vale")).toBeUndefined();
  });
});

describe("joinUpstream", () => {
  it("joins without doubling or dropping slashes", () => {
    expect(joinUpstream("https://h/api", "/x")).toBe("https://h/api/x");
    expect(joinUpstream("https://h/api/", "/x")).toBe("https://h/api/x");
    expect(joinUpstream("https://h/api", "x")).toBe("https://h/api/x");
    expect(joinUpstream("https://h/api", "")).toBe("https://h/api");
  });
});

describe("healthUrl and apiAppIds", () => {
  it("derive from the api block", () => {
    expect(healthUrl(VALE)).toBe("https://vale.example.test/api/grocery/health");
    expect(healthUrl(HEALTHCONNECT)).toBeUndefined();
    expect(apiAppIds(registry)).toEqual(["vale", "topology"]);
  });
});
