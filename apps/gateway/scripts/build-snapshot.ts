/**
 * Write the registry snapshot bundled into the image: `../../registry/registry.json` plus a
 * `generatedAt` timestamp (the same envelope the portal publishes), validated with the parser
 * the gateway uses at runtime so a broken registry fails the build rather than the fallback.
 *
 * Usage: tsx scripts/build-snapshot.ts [source registry.json] [target snapshot.json]
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRegistry } from "../src/domain/parseRegistry.js";
import { toPublicRegistry } from "../src/domain/registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(process.argv[2] ?? resolve(here, "../../../registry/registry.json"));
const target = resolve(process.argv[3] ?? resolve(here, "../src/adapters/outbound/registry/snapshot.json"));

const document: unknown = JSON.parse(readFileSync(source, "utf8"));
// The snapshot ships inside the image and can be served by /api/registry, so it is the public form.
const registry = toPublicRegistry(parseRegistry(document, { generatedAt: new Date().toISOString() }));
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(registry, null, 2)}\n`);

const ids = registry.apps.map((app) => app.id).join(", ");
console.log(`snapshot: ${registry.apps.length} app(s) (${ids}) from ${source}\n          → ${target}`);
