import { describe, expect, it } from "vitest";
import { getRegistry } from "../../src/application/getRegistry.js";
import { FakeRegistrySource } from "../../src/adapters/outbound/registry/FakeRegistrySource.js";
import { RegistryUnavailableError } from "../../src/domain/errors.js";
import { makeRegistry } from "../fixtures/registry.js";

describe("getRegistry", () => {
  it("returns the registry the source provides, every app included", async () => {
    const registry = makeRegistry();
    const source = new FakeRegistrySource(registry);
    expect(await getRegistry({ registry: source })).toBe(registry);
    expect(source.loads).toBe(1);
  });

  it("propagates registry failures unchanged", async () => {
    await expect(getRegistry({ registry: FakeRegistrySource.failing() })).rejects.toBeInstanceOf(RegistryUnavailableError);
  });
});
