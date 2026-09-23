import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUNDLED_SNAPSHOT_URL, readBundledSnapshot } from "../../../../src/adapters/outbound/registry/bundledSnapshot.js";
import { InvalidRegistryError, RegistryUnavailableError } from "../../../../src/domain/errors.js";
import { registryDocument } from "../../../fixtures/registry.js";

let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "gateway-snapshot-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("readBundledSnapshot", () => {
  it("points at snapshot.json next to the registry adapters", () => {
    expect(BUNDLED_SNAPSHOT_URL.pathname.endsWith("/adapters/outbound/registry/snapshot.json")).toBe(true);
  });

  it("reads and validates a snapshot file", async () => {
    const file = join(dir, "snapshot.json");
    await writeFile(file, JSON.stringify(registryDocument()));
    const registry = readBundledSnapshot(file);
    expect(registry.apps).toHaveLength(3);
    expect(registry.generatedAt).toBe("2026-09-23T00:00:00Z");
  });

  it("fails with RegistryUnavailableError when the file is missing and InvalidRegistryError when it is wrong", async () => {
    expect(() => readBundledSnapshot(join(dir, "nope.json"))).toThrow(RegistryUnavailableError);
    expect(() => readBundledSnapshot(join(dir, "nope.json"))).toThrow(/npm run build:snapshot/);
    const file = join(dir, "bad.json");
    await writeFile(file, JSON.stringify({ contractVersion: 1, generatedAt: "2026-09-23T00:00:00Z", apps: "no" }));
    expect(() => readBundledSnapshot(file)).toThrow(InvalidRegistryError);
  });
});
