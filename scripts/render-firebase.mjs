#!/usr/bin/env node
// Render the `hosting.rewrites` block of firebase.json from registry/registry.json. Zero dependencies.
//
//   node scripts/render-firebase.mjs          rewrite firebase.json in place (idempotent: a second run changes nothing)
//   node scripts/render-firebase.mjs --check  exit 1 and print what would change if firebase.json is stale
//   options (tests, dry runs): --registry <path> (default registry/registry.json) · --firebase <path> (default firebase.json)
//
// Rewrites emitted, in this order:
//   1. `<platform.gateway.path>{,/**}` → Cloud Run <platform.gateway.service>, only while platform.gateway.enabled is true
//   2. `<app.path>{,/**}`, one per app whose web.kind is "cloud-run", sorted by path. Every status is routed, `hidden`
//      included (hidden apps are not shown, but they are still served). The target is
//        - Cloud Run <platform.gateway.service> — the gateway door — for an app with an `access` block while
//          platform.auth.enabled and platform.gateway.enabled are both true: the door checks sign-in and groups, then
//          forwards to the app (docs/runbooks/platform-auth.md);
//        - Cloud Run <app.web.service> otherwise, as for every public app. An app with `access` routed this way is
//          unguarded, so the CLI prints a warning for it.
// Every other key of firebase.json (headers, firestore, emulators, …) is preserved in place; the file is re-serialized as
// 2-space JSON with a trailing newline. The summary names the paths that go through the door.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { invokedDirectly } from "./lib/entry.mjs";
import { doorActive, doorOffReason, unguardedApps } from "./lib/auth-rules.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIREBASE_PATH = join(root, "firebase.json");
const REGISTRY_PATH = join(root, "registry", "registry.json");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isString = (v) => typeof v === "string" && v.length > 0;
const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const sourceOf = (path) => `${path}{,/**}`;
const runRewrite = (path, serviceId, region) => ({ source: sourceOf(path), run: { serviceId, region } });

/** Cloud Run apps Hosting sends through the gateway door: those with `access`, while sign-in and the gateway are on. */
export function doorApps(registry) {
  if (!isObject(registry) || !Array.isArray(registry.apps) || !doorActive(registry.platform)) return [];
  return registry.apps.filter((app) => isObject(app) && isObject(app.access) && isObject(app.web) && app.web.kind === "cloud-run");
}

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
  const door = new Set(doorApps(registry));
  for (const app of [...routed].sort(byPath))
    rewrites.push(door.has(app) ? runRewrite(app.path, gateway.service, gateway.region) : runRewrite(app.path, app.web.service, app.web.region));
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

/** One rewrite in words. An app path served by the gateway's service is marked as the door. */
function describer(registry) {
  const gateway = isObject(registry.platform?.gateway) ? registry.platform.gateway : {};
  const gatewaySource = isString(gateway.path) ? sourceOf(gateway.path) : undefined;
  return (r) => {
    if (!r.run) return r.destination ? `→ ${r.destination}` : r.function ? `function ${r.function}` : JSON.stringify(r);
    const door = r.run.serviceId === gateway.service && r.source !== gatewaySource ? " — gateway door" : "";
    return `run ${r.run.serviceId} (${r.run.region})${door}`;
  };
}

/** Human-readable lines describing how the rewrites (and formatting) would change. */
export function summarize(beforeText, afterText, registry) {
  const describe = describer(registry);
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

/** "4 rewrites; through the gateway door: /vale" */
export function countLine(count, registry) {
  const door = doorApps(registry).map((app) => app.path).sort();
  return `${count} rewrite${count === 1 ? "" : "s"}${door.length ? `; through the gateway door: ${door.join(", ")}` : ""}`;
}

function parseArgs(argv) {
  const opts = { check: false, registry: REGISTRY_PATH, firebase: FIREBASE_PATH };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") opts.check = true;
    else if ((arg === "--registry" || arg === "--firebase") && i + 1 < argv.length) opts[arg.slice(2)] = argv[++i];
    else throw new Error(arg === "--registry" || arg === "--firebase" ? `${arg} needs a value` : `unknown argument ${arg}`);
  }
  return opts;
}

/** CLI entry point. Returns the exit code; `log` / `warn` receive the output lines (tests capture them). */
export function main(argv, { log = console.log, warn = console.error } = {}) {
  const opts = parseArgs(argv);
  const registry = JSON.parse(readFileSync(opts.registry, "utf8"));
  const before = readFileSync(opts.firebase, "utf8");
  const after = render(before, registry);
  const count = hostingBlock(JSON.parse(after), registry).rewrites.length;
  const file = relative(process.cwd(), opts.firebase) || "firebase.json";
  for (const app of unguardedApps(registry))
    warn(`render-firebase: warning — ${app.id} declares access but ${doorOffReason(registry.platform)}: ${sourceOf(app.path)} goes straight to Cloud Run ${app.web.service}, unguarded`);

  if (before === after) {
    log(`${file}: up to date (${countLine(count, registry)})`);
    return 0;
  }
  const lines = summarize(before, after, registry);
  if (opts.check) {
    warn(`${file}: stale — run \`node scripts/render-firebase.mjs\` and commit the result (${countLine(count, registry)})`);
    for (const line of lines) warn(line);
    return 1;
  }
  writeFileSync(opts.firebase, after);
  log(`${file}: rewrites rendered (${countLine(count, registry)})`);
  for (const line of lines) log(line);
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
