import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InvalidRegistryError } from "../../src/domain/errors.js";
import { parseRegistry } from "../../src/domain/parseRegistry.js";
import { guardedRegistryDocument, registryDocument } from "../fixtures/registry.js";

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
    const auth = registry.platform?.auth;
    if (auth !== undefined) {
      expect(auth.provider).toBe("firebase");
      const declared = auth.groups.map((group) => group.id);
      for (const app of registry.apps) for (const group of app.access?.groups ?? []) expect(declared).toContain(group);
    }
  });

  it("accepts platform sign-in and an app's access block, keeping unknown extra fields", () => {
    const document = guardedRegistryDocument();
    const platform = document["platform"] as Record<string, unknown>;
    platform["auth"] = { ...(platform["auth"] as object), futureField: 1 };
    const registry = parseRegistry(document);
    expect(registry.platform?.auth).toMatchObject({ enabled: true, projectId: "demo-eisen", sessionHours: 12, futureField: 1 });
    expect(registry.platform?.auth?.groups.map((group) => group.id)).toEqual(["owner", "vale"]);
    expect(registry.apps[0]?.access).toEqual({ groups: ["owner", "vale"] });
  });

  it("validates every typed field of platform.auth", () => {
    const document = guardedRegistryDocument();
    (document["platform"] as Record<string, unknown>)["auth"] = {
      enabled: "yes",
      provider: "auth0",
      projectId: "Bad_Project",
      sessionHours: 169,
      note: 5,
      groups: [{ id: "owner", name: "Owner", emblem: "O", description: "d" }, { id: "Owner!", name: 1 }, "vale", { id: "owner", name: "x", emblem: "x", description: "x" }],
    };
    expect(problemsOf(document)).toEqual([
      "platform.auth.enabled must be a boolean",
      "platform.auth.provider must be one of firebase",
      "platform.auth.projectId must be a Firebase project id",
      "platform.auth.sessionHours must be an integer from 1 to 168",
      "platform.auth.note must be a string",
      "platform.auth.groups[1].id must be a slug like owner",
      "platform.auth.groups[1].name must be a string",
      "platform.auth.groups[1].emblem is required",
      "platform.auth.groups[1].description is required",
      "platform.auth.groups[2] must be an object",
      'platform.auth.groups: id "owner" is used twice',
    ]);
    for (const sessionHours of [0, 1.5, "12"]) {
      const bad = guardedRegistryDocument();
      ((bad["platform"] as Record<string, unknown>)["auth"] as Record<string, unknown>)["sessionHours"] = sessionHours;
      expect(problemsOf(bad)).toEqual(["platform.auth.sessionHours must be an integer from 1 to 168"]);
    }
  });

  it("validates access blocks and the rules that span platform and apps", () => {
    const document = guardedRegistryDocument();
    const apps = document["apps"] as Array<Record<string, unknown>>;
    apps[1] = { ...apps[1], access: { groups: ["owner", "owner"] } };
    apps[2] = { ...apps[2], access: { groups: "owner", note: 1 } };
    expect(problemsOf(document)).toEqual([
      "apps[1].access.groups must not name a group twice",
      "apps[2].access.groups must be an array of group ids",
      "apps[2].access.note must be a string",
    ]);

    const crossing = guardedRegistryDocument();
    const crossingApps = crossing["apps"] as Array<Record<string, unknown>>;
    crossingApps[0] = { ...crossingApps[0], access: { groups: ["owner", "friends"] } };
    crossingApps[2] = { ...crossingApps[2], access: { groups: [] }, web: { kind: "firebase-hosting", url: "https://t.example.test" } };
    expect(problemsOf(crossing)).toEqual([
      'apps: "vale" access names group "friends", which platform.auth.groups does not declare',
      'apps: "topology" access requires web.kind cloud-run',
    ]);

    const withoutAuth = guardedRegistryDocument();
    delete (withoutAuth["platform"] as Record<string, unknown>)["auth"];
    expect(problemsOf(withoutAuth)).toEqual(['apps: "vale" access requires platform.auth']);
    delete withoutAuth["platform"];
    expect(problemsOf(withoutAuth)).toEqual(['apps: "vale" access requires platform.auth']);
  });

  it("reports an invalid platform.auth once, not again as a missing one", () => {
    const document = guardedRegistryDocument();
    (document["platform"] as Record<string, unknown>)["auth"] = "on";
    expect(problemsOf(document)).toEqual(["platform.auth must be an object"]);
  });

  it("accepts a published document whose apps carry no repo block", () => {
    const document = registryDocument();
    for (const app of document["apps"] as Array<Record<string, unknown>>) delete app["repo"];
    const registry = parseRegistry(document);
    expect(registry.apps.every((app) => app.repo === undefined)).toBe(true);
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
    for (const id of ["registry", "auth"]) {
      const reserved = registryDocument();
      (reserved["apps"] as Array<Record<string, unknown>>)[1] = { ...(reserved["apps"] as Array<Record<string, unknown>>)[1], id };
      expect(problemsOf(reserved)).toEqual([`apps: id "${id}" is reserved for the gateway`]);
    }
  });

  it("reports every missing required field of an app at once", () => {
    const problems = problemsOf({ contractVersion: 1, generatedAt: "2026-09-23T00:00:00Z", apps: [{ id: "x1" }] });
    expect(problems).toEqual(
      expect.arrayContaining([
        "apps[0].name is required",
        "apps[0].routing is required",
        "apps[0].web is required",
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
