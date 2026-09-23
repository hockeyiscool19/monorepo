import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InvalidRegistryError } from "../../src/domain/errors.js";
import { parseRegistry } from "../../src/domain/parseRegistry.js";
import { registryDocument } from "../fixtures/registry.js";

function problemsOf(input: unknown, generatedAt?: string): readonly string[] {
  try {
    parseRegistry(input, generatedAt === undefined ? {} : { generatedAt });
  } catch (error) {
    if (error instanceof InvalidRegistryError) return error.problems;
    throw error;
  }
  throw new Error("expected InvalidRegistryError");
}

describe("parseRegistry", () => {
  it("accepts a published document and keeps its fields", () => {
    const registry = parseRegistry(registryDocument());
    expect(registry.contractVersion).toBe(1);
    expect(registry.generatedAt).toBe("2026-09-23T00:00:00Z");
    expect(registry.apps.map((app) => app.id)).toEqual(["vale", "healthconnect", "topology"]);
    expect(registry.apps[0]?.api?.baseUrl).toBe("https://vale.example.test/api");
    expect(registry.platform?.domain).toBe("example.test");
    expect(registry.platform?.gateway?.path).toBe("/api");
  });

  it("accepts the repository's own registry.json (no generatedAt) with the caller's timestamp", () => {
    const source = new URL("../../../../registry/registry.json", import.meta.url);
    const document: unknown = JSON.parse(readFileSync(source, "utf8"));
    const registry = parseRegistry(document, { generatedAt: "2026-09-23T00:00:00Z" });
    expect(registry.generatedAt).toBe("2026-09-23T00:00:00Z");
    expect(registry.apps.length).toBeGreaterThan(0);
    expect(registry.apps.some((app) => app.api !== undefined)).toBe(true);
    expect(registry.platform?.gateway?.path).toBe("/api");
  });

  it("requires generatedAt when neither the document nor the caller provides it", () => {
    const document = registryDocument();
    delete document["generatedAt"];
    expect(problemsOf(document)).toEqual(["registry.generatedAt is required (published copies carry it)"]);
  });

  it("rejects the wrong contract version, a malformed timestamp and a non-array apps", () => {
    const problems = problemsOf({ contractVersion: 2, generatedAt: "yesterday", apps: {} });
    expect(problems).toContain("registry.contractVersion must be 1");
    expect(problems).toContain("registry.generatedAt must be an ISO-8601 UTC timestamp");
    expect(problems).toContain("registry.apps must be an array");
  });

  it("rejects non-https upstreams, bad health paths and unknown enum values", () => {
    const document = registryDocument();
    const apps = document["apps"] as Array<Record<string, unknown>>;
    apps[0] = { ...apps[0], api: { baseUrl: "http://vale.example.test", healthPath: "health" }, status: "gone" };
    const problems = problemsOf(document);
    expect(problems).toContain("apps[0].api.baseUrl must be an https URL");
    expect(problems).toContain("apps[0].api.healthPath must be a path starting with /");
    expect(problems).toContain("apps[0].status must be one of live, beta, planned, hidden");
  });

  it("rejects duplicate ids or paths and ids reserved for the gateway", () => {
    const document = registryDocument();
    const apps = document["apps"] as Array<Record<string, unknown>>;
    apps[1] = { ...apps[1], id: "vale" };
    apps[2] = { ...apps[2], id: "health", path: "/vale" };
    const problems = problemsOf(document);
    expect(problems).toContain('apps: id "vale" is used twice');
    expect(problems).toContain('apps: path "/vale" is used twice');
    expect(problems).toContain('apps: id "health" is reserved for the gateway');
  });

  it("reports every missing required field of an app at once", () => {
    const problems = problemsOf({ contractVersion: 1, generatedAt: "2026-09-23T00:00:00Z", apps: [{ id: "x1" }] });
    expect(problems).toEqual(
      expect.arrayContaining([
        "apps[0].name is required",
        "apps[0].routing is required",
        "apps[0].web is required",
        "apps[0].repo is required",
        "apps[0].deployment is required",
      ]),
    );
    expect(problems.length).toBeGreaterThan(5);
  });

  it("ignores unknown platform fields but validates the typed ones", () => {
    const document = registryDocument();
    document["platform"] = { domain: "example.test", extra: 1, gateway: { enabled: "yes", path: "api" } };
    const problems = problemsOf(document);
    expect(problems).toEqual([
      "platform.gateway.enabled must be a boolean",
      "platform.gateway.path must be a path like /api",
      "platform.gateway.service is required",
      "platform.gateway.region is required",
    ]);
  });

  it("accepts a document without a platform block", () => {
    const document = registryDocument();
    delete document["platform"];
    expect(parseRegistry(document).platform).toBeUndefined();
  });

  it("rejects anything that is not an object", () => {
    expect(() => parseRegistry("nope")).toThrow(InvalidRegistryError);
    expect(() => parseRegistry(null)).toThrow(InvalidRegistryError);
    expect(() => parseRegistry([])).toThrow(InvalidRegistryError);
  });
});
