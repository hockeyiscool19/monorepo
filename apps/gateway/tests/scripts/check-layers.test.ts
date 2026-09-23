import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkLayers } from "../../scripts/check-layers.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

let tree = "";

async function file(relativePath: string, content: string): Promise<void> {
  const path = join(tree, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

beforeAll(async () => {
  tree = await mkdtemp(join(tmpdir(), "gateway-layers-"));
});

afterAll(async () => {
  await rm(tree, { recursive: true, force: true });
});

describe("checkLayers", () => {
  it("passes on the gateway's own src/", () => {
    expect(checkLayers(SRC)).toEqual([]);
  });

  it("fails on a synthetic tree that breaks each rule", async () => {
    await file("domain/bad.ts", [
      'import { x } from "../adapters/outbound/x.js";',
      'import { y } from "../application/y.js";',
      'import { readFileSync } from "node:fs";',
      "// a comment mentioning fetch( is fine",
      "export const t = Date.now();",
      "export const env = process.env;",
      "export const z = fetch(x + y + readFileSync);",
    ].join("\n"));
    await file("application/y.ts", 'import { x } from "../adapters/outbound/x.js";\nexport { x };\n');
    await file("application/ok.ts", 'import { t } from "../domain/bad.js";\nexport const u = t;\n');
    await file("adapters/outbound/x.ts", 'import { u } from "../../application/ok.js";\nexport const x = u;\n');
    await file("adapters/misplaced.ts", "export const m = 1;\n");
    await file("stray.ts", "export const s = 1;\n");
    await file("main.ts", 'import { x } from "./adapters/outbound/x.js";\nconsole.log(x);\n');

    const violations = checkLayers(tree);
    expect(violations).toEqual([
      "adapters/misplaced.ts: place modules under domain/, application/ or adapters/{inbound,outbound}/",
      "application/y.ts: application must not import adapters/outbound/x.js",
      "domain/bad.ts: domain must not import adapters/outbound/x.js",
      "domain/bad.ts: domain must not import application/y.js",
      'domain/bad.ts: domain must not import package or runtime module "node:fs"',
      "domain/bad.ts: reads process or the environment (settings belong to bootstrap.ts)",
      "domain/bad.ts: performs network I/O (use the UpstreamHttp or RegistrySource port)",
      "domain/bad.ts: reads the wall clock (inject a Clock)",
      "main.ts: main.ts must only import the composition root, not adapters/outbound/x.js",
      "stray.ts: place modules under domain/, application/ or adapters/{inbound,outbound}/",
    ]);
  });
});
