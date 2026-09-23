import type { AppManifest, Registry } from "../../src/domain/registry.js";

/** An app entry with sensible defaults; override any field. */
export function makeApp(overrides: Partial<AppManifest> & { readonly id: string }): AppManifest {
  const { id } = overrides;
  return {
    name: id,
    description: `${id} app`,
    status: "live",
    path: `/${id}`,
    routing: { mode: "path-prefix", ready: false },
    web: { kind: "cloud-run", url: `https://${id}.example.test`, service: id, region: "us-central1" },
    repo: { github: `example/${id}`, branch: "main" },
    deployment: { version: "0.1.0", sha: "", imageTag: "", deployedAt: "", deployedBy: "manual" },
    ...overrides,
  };
}

/** An app with an API whose baseUrl carries a path (`/api`), like the real vale. */
export const VALE: AppManifest = makeApp({
  id: "vale",
  api: { baseUrl: "https://vale.example.test/api", healthPath: "/grocery/health", auth: "cookie" },
});

/** An app without an API block. */
export const HEALTHCONNECT: AppManifest = makeApp({ id: "healthconnect" });

/** A beta app with an alternate web URL and a baseUrl that ends with a slash. */
export const TOPOLOGY: AppManifest = makeApp({
  id: "topology",
  status: "beta",
  web: {
    kind: "cloud-run",
    url: "https://topology.example.test",
    altUrl: "https://topology-alt.example.test",
    service: "topology",
    region: "us-central1",
  },
  api: { baseUrl: "https://topology.example.test/", healthPath: "/healthz" },
});

/** A registry with the three fixture apps and a platform block for `example.test`. */
export function makeRegistry(
  apps: readonly AppManifest[] = [VALE, HEALTHCONNECT, TOPOLOGY],
  overrides: Partial<Registry> = {},
): Registry {
  return {
    contractVersion: 1,
    generatedAt: "2026-09-23T00:00:00Z",
    platform: {
      domain: "example.test",
      hosting: { project: "proj", site: "site" },
      gateway: { enabled: true, path: "/api", service: "gateway", region: "us-central1" },
    },
    apps,
    ...overrides,
  };
}

/** `makeRegistry()` as plain JSON, the way a published registry.json parses. */
export function registryDocument(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(makeRegistry())) as Record<string, unknown>;
}
