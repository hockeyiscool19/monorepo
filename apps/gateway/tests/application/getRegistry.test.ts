import { describe, expect, it } from "vitest";
import { getRegistry } from "../../src/application/getRegistry.js";
import { FakeRegistrySource } from "../../src/adapters/outbound/registry/FakeRegistrySource.js";
import { RegistryUnavailableError } from "../../src/domain/errors.js";
import { makeRegistry } from "../fixtures/registry.js";

describe("getRegistry", () => {
  it("returns every app the source provides, with its deployment values", async () => {
    const registry = makeRegistry();
    const source = new FakeRegistrySource(registry);
    const published = await getRegistry({ registry: source });
    expect(published.apps.map((app) => app.id)).toEqual(registry.apps.map((app) => app.id));
    expect(published.apps.map((app) => app.deployment)).toEqual(registry.apps.map((app) => app.deployment));
    expect(published.generatedAt).toBe(registry.generatedAt);
    expect(source.loads).toBe(1);
  });

  it("never publishes an app's repo block (private repository names and local paths)", async () => {
    const registry = makeRegistry();
    expect(registry.apps.every((app) => app.repo !== undefined)).toBe(true);
    const published = await getRegistry({ registry: new FakeRegistrySource(registry) });
    expect(published.apps.some((app) => "repo" in app)).toBe(false);
    expect(JSON.stringify(published)).not.toContain('"repo"');
  });

  it("propagates registry failures unchanged", async () => {
    await expect(getRegistry({ registry: FakeRegistrySource.failing() })).rejects.toBeInstanceOf(RegistryUnavailableError);
  });
});
