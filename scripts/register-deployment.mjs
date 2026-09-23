#!/usr/bin/env node
// Record an app deployment in registry/registry.json. Zero dependencies: CI runs it with plain `node`.
//
//   node scripts/register-deployment.mjs --payload '{"id":"vale","version":"1.2.3","sha":"<7-40 hex>","imageTag":"sha-…","url":"https://…"}'
//   node scripts/register-deployment.mjs --file payload.json
//   options: --dry-run (print what would change, write nothing) · --registry <path> (default registry/registry.json)
//
// The payload is the `client_payload` of the `app-deployed` repository_dispatch event handled by
// .github/workflows/register-deployment.yml. `id` must name an app in the registry; `version` must match the
// deployment.version pattern of the schema; `sha` is 7–40 hex characters; `imageTag` is optional (≤ 128 chars);
// `url` is optional and, when it differs from web.url, replaces it and moves api.baseUrl to the same origin.
// The app's `deployment` becomes {version, sha, imageTag, deployedAt: now, deployedBy: "ci"}.
// Exit code 1 with a one-line reason on any validation failure. Never calls process.exit() (see render-firebase.mjs).
// The version / sha / imageTag rules and the file format live in scripts/lib/registry-io.mjs, shared with the pull
// path (scripts/sync-deployments.mjs), so both paths accept exactly the same receipts.

import { readFileSync, writeFileSync } from "node:fs";
import { DEFAULT_REGISTRY, checkImageTag, checkSha, checkVersion, isObject, isoSeconds, serialize, show } from "./lib/registry-io.mjs";
import { invokedDirectly } from "./lib/entry.mjs";

export { serialize };

/** Anything the caller got wrong. main() turns it into exit code 1 and a one-line message on stderr. */
export class PayloadError extends Error {}

/** The value of a registry-io check, or its reason as a PayloadError. */
function must({ value, error }) {
  if (error) throw new PayloadError(error);
  return value;
}

/** Parse the payload text as a JSON object, or throw PayloadError. */
export function parsePayload(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new PayloadError(`payload is not valid JSON: ${err.message}`);
  }
  if (!isObject(payload)) throw new PayloadError("payload must be a JSON object");
  return payload;
}

/** Check the payload against the registry and return its normalised fields plus the matching app. */
export function validatePayload(payload, registry) {
  if (!isObject(registry) || !Array.isArray(registry.apps)) throw new PayloadError("registry must be an object with an apps array");
  const text = (key) => (typeof payload[key] === "string" ? payload[key].trim() : "");

  const id = text("id");
  const app = registry.apps.find((a) => isObject(a) && a.id === id);
  if (!app) {
    const known = registry.apps.map((a) => a?.id).filter(Boolean).join(", ");
    throw new PayloadError(`unknown app id ${show(payload.id)} (known: ${known})`);
  }
  const version = must(checkVersion(payload.version));
  const sha = must(checkSha(payload.sha));
  const imageTag = must(checkImageTag(payload.imageTag));
  let url = text("url");
  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new PayloadError(`url ${show(url)} is not a valid URL`);
    }
    if (parsed.protocol !== "https:") throw new PayloadError(`url must use https (got ${show(url)})`);
    url = url.replace(/\/+$/, "");
  }
  return { app, id, version, sha, imageTag, url };
}

/** api.baseUrl with its origin swapped for the origin of `url`; the path (e.g. /api) is kept. */
function rebaseApi(baseUrl, url) {
  const base = new URL(baseUrl);
  const path = base.pathname === "/" && !baseUrl.endsWith("/") ? "" : base.pathname;
  return `${new URL(url).origin}${path}${base.search}`;
}

/** Apply validated fields to a deep copy of the registry. Returns {registry, app, changes: ["deployment.version: … → …", …]}. */
export function applyDeployment(registry, fields, now = new Date()) {
  const next = structuredClone(registry);
  const app = next.apps.find((a) => a.id === fields.id);
  const before = { ...app.deployment };
  app.deployment = {
    version: fields.version,
    sha: fields.sha,
    imageTag: fields.imageTag,
    deployedAt: isoSeconds(now),
    deployedBy: "ci",
  };
  const changes = [];
  for (const key of Object.keys(app.deployment))
    if (before[key] !== app.deployment[key]) changes.push(`deployment.${key}: ${show(before[key])} → ${show(app.deployment[key])}`);

  if (fields.url && fields.url !== app.web?.url) {
    changes.push(`web.url: ${show(app.web?.url)} → ${show(fields.url)}`);
    app.web = { ...app.web, url: fields.url };
    if (typeof app.api?.baseUrl === "string") {
      const rebased = rebaseApi(app.api.baseUrl, fields.url);
      if (rebased !== app.api.baseUrl) {
        changes.push(`api.baseUrl: ${show(app.api.baseUrl)} → ${show(rebased)}`);
        app.api.baseUrl = rebased;
      }
    }
  }
  return { registry: next, app, changes };
}

function parseArgs(argv) {
  const opts = { payload: undefined, file: undefined, dryRun: false, registry: DEFAULT_REGISTRY };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new PayloadError(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === "--payload") opts.payload = value();
    else if (arg === "--file") opts.file = value();
    else if (arg === "--registry") opts.registry = value();
    else if (arg === "--dry-run") opts.dryRun = true;
    else throw new PayloadError(`unknown argument ${arg}`);
  }
  if ((opts.payload === undefined) === (opts.file === undefined))
    throw new PayloadError("pass exactly one of --payload '<json>' or --file <path>");
  return opts;
}

/** CLI entry point. Returns the exit code; throws PayloadError (or an I/O error) on failure. */
export function main(argv, now = new Date()) {
  const opts = parseArgs(argv);
  const text = opts.file !== undefined ? readFileSync(opts.file, "utf8") : opts.payload;
  const registry = JSON.parse(readFileSync(opts.registry, "utf8"));
  const fields = validatePayload(parsePayload(text), registry);
  const { registry: next, app, changes } = applyDeployment(registry, fields, now);
  const d = app.deployment;
  const image = d.imageTag ? ` image ${d.imageTag}` : "";
  const mode = opts.dryRun ? " [dry run, nothing written]" : "";
  console.log(`registry: ${app.id} → ${d.version} (${d.sha.slice(0, 7)})${image} at ${d.deployedAt} by ${d.deployedBy}${mode}`);
  for (const line of changes) console.log(`  ${line}`);
  if (!opts.dryRun) writeFileSync(opts.registry, serialize(next));
  return 0;
}

if (invokedDirectly(import.meta.url)) {
  // process.exitCode rather than process.exit(): stdout always flushes, and Node 24 on macOS has been
  // seen to segfault intermittently inside process.exit() after the output was already written.
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`register-deployment: ${err.message}`);
    process.exitCode = 1;
  }
}
