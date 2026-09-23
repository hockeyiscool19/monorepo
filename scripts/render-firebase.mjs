#!/usr/bin/env node
// Render the `hosting.rewrites` block of firebase.json from registry/registry.json. Zero dependencies.
//
//   node scripts/render-firebase.mjs          rewrite firebase.json in place (idempotent: a second run changes nothing)
//   node scripts/render-firebase.mjs --check  exit 1 and print what would change if firebase.json is stale
//
// Rewrites emitted, in this order:
//   1. `<platform.gateway.path>{,/**}` → Cloud Run <platform.gateway.service>, only while platform.gateway.enabled is true
//   2. `<app.path>{,/**}` → Cloud Run <app.web.service>, one per app whose web.kind is "cloud-run", sorted by path.
//      Every status is routed, `hidden` included (hidden apps are not shown, but they are still served).
// Every other key of firebase.json is preserved in place; the file is re-serialized as 2-space JSON with a trailing newline.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { invokedDirectly } from "./lib/entry.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIREBASE_PATH = join(root, "firebase.json");
const REGISTRY_PATH = join(root, "registry", "registry.json");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isString = (v) => typeof v === "string" && v.length > 0;
const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const runRewrite = (path, serviceId, region) => ({ source: `${path}{,/**}`, run: { serviceId, region } });

/** The rewrites the registry implies, in their final order. Throws on a manifest that cannot be routed. */
export function renderRewrites(registry) {
  if (!isObject(registry) || !isObject(registry.platform) || !Array.isArray(registry.apps))
    throw new Error("registry.json must be an object with `platform` and `apps`");
  const rewrites = [];

  const gateway = registry.platform.gateway;
  if (isObject(gateway) && gateway.enabled === true) {
    for (const key of ["path", "service", "region"])
      if (!isString(gateway[key])) throw new Error(`platform.gateway.${key} is required while gateway.enabled is true`);
    rewrites.push(runRewrite(gateway.path, gateway.service, gateway.region));
  }

  const routed = registry.apps.filter((app) => isObject(app) && isObject(app.web) && app.web.kind === "cloud-run");
  for (const app of routed) {
    if (!isString(app.path)) throw new Error(`app ${JSON.stringify(app.id)}: path is required`);
    for (const key of ["service", "region"])
      if (!isString(app.web[key])) throw new Error(`app ${JSON.stringify(app.id)}: web.${key} is required for cloud-run apps`);
  }
  for (const app of [...routed].sort(byPath)) rewrites.push(runRewrite(app.path, app.web.service, app.web.region));
  return rewrites;
}

/** The hosting block to update: the object, or the entry of a multi-site array matching platform.hosting.site. */
export function hostingBlock(config, registry) {
  const hosting = config.hosting;
  if (isObject(hosting)) return hosting;
  if (Array.isArray(hosting)) {
    const site = registry.platform?.hosting?.site;
    const entry = hosting.find((h) => isObject(h) && (h.site === site || h.target === site)) ?? (hosting.length === 1 ? hosting[0] : undefined);
    if (!entry) throw new Error(`firebase.json: no hosting entry for site ${JSON.stringify(site)}`);
    return entry;
  }
  throw new Error("firebase.json: missing `hosting` block");
}

/** Returns the new file text; the parsed config is mutated in place so every other key keeps its position. */
export function render(firebaseText, registry) {
  const config = JSON.parse(firebaseText);
  hostingBlock(config, registry).rewrites = renderRewrites(registry);
  return `${JSON.stringify(config, null, 2)}\n`;
}

const describe = (r) =>
  r.run ? `run ${r.run.serviceId} (${r.run.region})` : r.destination ? `→ ${r.destination}` : r.function ? `function ${r.function}` : JSON.stringify(r);

/** Human-readable lines describing how the rewrites (and formatting) would change. */
export function summarize(beforeText, afterText, registry) {
  const before = JSON.parse(beforeText);
  const oldRewrites = hostingBlock(before, registry).rewrites ?? [];
  const newRewrites = hostingBlock(JSON.parse(afterText), registry).rewrites;
  const key = (r) => JSON.stringify(r.source);
  const oldBy = new Map(oldRewrites.map((r) => [key(r), r]));
  const newBy = new Map(newRewrites.map((r) => [key(r), r]));
  const lines = [];
  for (const [k, r] of newBy) if (!oldBy.has(k)) lines.push(`  + ${r.source} ${describe(r)}`);
  for (const [k, r] of oldBy) if (!newBy.has(k)) lines.push(`  - ${r.source} ${describe(r)}`);
  for (const [k, r] of newBy) {
    const old = oldBy.get(k);
    if (old && JSON.stringify(old) !== JSON.stringify(r)) lines.push(`  ~ ${r.source} ${describe(old)} → ${describe(r)}`);
  }
  const sameSet = lines.length === 0;
  if (sameSet && oldRewrites.map(key).join() !== newRewrites.map(key).join()) lines.push("  ~ rewrites reordered (sorted by path)");
  if (lines.length === 0 && beforeText !== afterText) lines.push("  ~ formatting only (re-serialized as 2-space JSON with a trailing newline)");
  return lines;
}

function main(argv) {
  const check = argv.includes("--check");
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  const before = readFileSync(FIREBASE_PATH, "utf8");
  const after = render(before, registry);
  const count = hostingBlock(JSON.parse(after), registry).rewrites.length;
  const file = relative(process.cwd(), FIREBASE_PATH) || "firebase.json";

  if (before === after) {
    console.log(`${file}: up to date (${count} rewrite${count === 1 ? "" : "s"})`);
    return 0;
  }
  const lines = summarize(before, after, registry);
  if (check) {
    console.error(`${file}: stale — run \`node scripts/render-firebase.mjs\` and commit the result`);
    for (const line of lines) console.error(line);
    return 1;
  }
  writeFileSync(FIREBASE_PATH, after);
  console.log(`${file}: rewrites rendered (${count} rewrite${count === 1 ? "" : "s"})`);
  for (const line of lines) console.log(line);
  return 0;
}

if (invokedDirectly(import.meta.url)) {
  // process.exitCode rather than process.exit(): stdout always flushes, and Node 24 on macOS has been
  // seen to segfault intermittently inside process.exit() after the output was already written.
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`render-firebase: ${err.message}`);
    process.exitCode = 1;
  }
}
