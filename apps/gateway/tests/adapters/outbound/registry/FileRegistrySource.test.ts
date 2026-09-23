import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FileRegistrySource } from "../../../../src/adapters/outbound/registry/FileRegistrySource.js";
import { InvalidRegistryError, RegistryUnavailableError } from "../../../../src/domain/errors.js";
import { registryDocument } from "../../../fixtures/registry.js";

let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "gateway-registry-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("FileRegistrySource", () => {
  it("reads a registry.json without generatedAt and stamps it with the file's mtime", async () => {
    const document = registryDocument();
    delete document["generatedAt"];
    const file = join(dir, "registry.json");
    await writeFile(file, JSON.stringify(document));
    const registry = await new FileRegistrySource(file).load();
    expect(registry.apps.map((app) => app.id)).toEqual(["vale", "healthconnect", "topology"]);
    expect(registry.generatedAt).toBe((await stat(file)).mtime.toISOString());
  });

  it("accepts a directory and looks for registry.json inside it", async () => {
    const registry = await new FileRegistrySource(dir).load();
    expect(registry.apps).toHaveLength(3);
  });

  it("re-reads the file on every load", async () => {
    const file = join(dir, "changing.json");
    await writeFile(file, JSON.stringify(registryDocument()));
    const source = new FileRegistrySource(file);
    expect((await source.load()).apps).toHaveLength(3);
    await writeFile(file, JSON.stringify({ ...registryDocument(), apps: [] }));
    expect((await source.load()).apps).toHaveLength(0);
  });

  it("rejects with RegistryUnavailableError for a missing path or a non-JSON file", async () => {
    await expect(new FileRegistrySource(join(dir, "missing.json")).load()).rejects.toBeInstanceOf(RegistryUnavailableError);
    const file = join(dir, "broken.json");
    await writeFile(file, "{not json");
    await expect(new FileRegistrySource(file).load()).rejects.toBeInstanceOf(RegistryUnavailableError);
  });

  it("rejects with InvalidRegistryError for a document that fails validation", async () => {
    const file = join(dir, "invalid.json");
    await writeFile(file, JSON.stringify({ contractVersion: 1, apps: [{ id: "x" }] }));
    await expect(new FileRegistrySource(file).load()).rejects.toBeInstanceOf(InvalidRegistryError);
  });
});
