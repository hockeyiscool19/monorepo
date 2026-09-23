import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registryDocument } from "../fixtures/registry.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TSX = join(ROOT, "node_modules", ".bin", "tsx");
const SCRIPT = join(ROOT, "scripts", "build-snapshot.ts");

let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "gateway-build-snapshot-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("scripts/build-snapshot.ts", () => {
  it("writes the source registry plus generatedAt, validated, and reports the apps", async () => {
    const source = join(dir, "registry.json");
    const target = join(dir, "out", "snapshot.json");
    const document = registryDocument();
    delete document["generatedAt"];
    await writeFile(source, JSON.stringify(document));

    const output = execFileSync(TSX, [SCRIPT, source, target], { encoding: "utf8" });
    expect(output).toContain("snapshot: 3 app(s) (vale, healthconnect, topology)");

    const snapshot = JSON.parse(await readFile(target, "utf8")) as Record<string, unknown>;
    expect(Object.keys(snapshot)).toEqual(["contractVersion", "generatedAt", "platform", "apps"]);
    expect(snapshot["generatedAt"]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(snapshot["platform"]).toEqual(document["platform"]);
    expect(snapshot["apps"]).toEqual(document["apps"]);
  });

  it("fails the build on an invalid registry", async () => {
    const source = join(dir, "invalid.json");
    await writeFile(source, JSON.stringify({ contractVersion: 1, apps: [{ id: "x" }] }));
    expect(() => execFileSync(TSX, [SCRIPT, source, join(dir, "never.json")], { encoding: "utf8", stdio: "pipe" })).toThrow(
      /invalid registry/,
    );
  });
});
