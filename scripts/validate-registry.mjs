#!/usr/bin/env node
// Validate registry/registry.json against the contract in registry/schema/registry.schema.json.
// Zero dependencies on purpose: CI and every agent can run it with plain `node`.
// The rules live in scripts/lib/registry-rules.mjs (platform, apps, uniqueness) and scripts/lib/auth-rules.mjs
// (platform.auth, apps[].access, reserved ids); both read their patterns and limits from the schema.
//
// Usage: node scripts/validate-registry.mjs [--published] [path]
//   default: the source file registry/registry.json (every app must carry `repo`)
//   --published: a published copy (portal build/registry.json): `generatedAt` required, `repo` must be absent,
//                because it names private repositories and local checkout paths. `auth` and `access` are public.
// Exit 1 with one line per problem. A valid registry whose apps declare `access` while the gateway door is off
// (platform.auth.enabled or platform.gateway.enabled false) passes with a warning: those apps are served unguarded.

import { readFileSync } from "node:fs";
import { DEFAULT_REGISTRY } from "./lib/registry-io.mjs";
import { validateRegistry } from "./lib/registry-rules.mjs";
import { doorOffReason, unguardedApps } from "./lib/auth-rules.mjs";

const args = process.argv.slice(2);
const published = args.includes("--published");
const registryPath = args.find((a) => !a.startsWith("--")) ?? DEFAULT_REGISTRY;

let registry;
const errors = [];
try {
  registry = JSON.parse(readFileSync(registryPath, "utf8"));
} catch (err) {
  errors.push(`registry: cannot read ${registryPath}: ${err.message}`);
}
if (registry !== undefined) errors.push(...validateRegistry(registry, { published }));

// process.exitCode rather than process.exit(): Node 24 on macOS has been seen to segfault inside process.exit().
if (errors.length) {
  console.error(`registry: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exitCode = 1;
} else {
  const ids = registry.apps.map((a) => a.id).join(", ");
  const kind = published ? "published copy valid, no repo blocks" : "valid";
  const gated = registry.apps.filter((a) => "access" in a).map((a) => a.id);
  const door = gated.length ? `; access-controlled: ${gated.join(", ")}` : "";
  console.log(`registry: ${kind} — platform ${registry.platform.domain}, ${registry.apps.length} app(s) (${ids})${door}`);
  for (const app of unguardedApps(registry))
    console.error(`registry: warning — ${app.id} declares access but ${doorOffReason(registry.platform)}, so ${app.path} is served straight from Cloud Run ${app.web.service}, unguarded`);
}
