#!/usr/bin/env node
// Pull path of the CI/CD sync: record in registry/registry.json what each app is actually running. Zero dependencies.
//
//   node scripts/sync-deployments.mjs [--dry-run] [--registry <path>]
//   --dry-run: print what would change, write nothing · --registry: default registry/registry.json
//
// For every app with an `api` block: GET api.baseUrl + api.healthPath (10 s timeout; one retry after 3 s when the first
// attempt gets no answer, a 5xx or a 429, which is what a cold start looks like). The body is platform contract v1
// (plugins/eisen-platform/skills/site-plugin/SKILL.md):
//   {"status":"ok","app":"<id>","version":"<semver or 0.0.0+sha.<12>>","commit":"<git sha>","deployedAt":"<ISO-8601 UTC or empty>"}
// When `version` matches the schema pattern and `commit` is 7–40 hex (the rules register-deployment.mjs applies, shared
// through scripts/lib/registry-io.mjs) and either differs from deployment.version / deployment.sha, the app's
// `deployment` becomes {version, sha: commit, imageTag: the reported `imageTag` if any, else the existing one,
// deployedAt: the reported one when it is a real ISO-8601 UTC instant (kept to whole seconds), else now, deployedBy: "ci"}.
// A short and a full sha of the same commit count as equal, so the push and pull paths never overwrite each other.
// Anything else (health down or not JSON, version "dev", a missing or invalid field, another app's id) is a skip with a
// one-line reason, never an error: the app may not serve the contract yet. One line per app, then a summary line:
//   vale: 0.1.0 → 0.2.0 (abc1234) · vale: unchanged · vale: skipped — health 503 · topology: skipped — no api block
// The registry is rewritten (2-space JSON, trailing newline) only when something changed and --dry-run is absent.
// Exit 1 only for a bad argument or an unreadable/invalid registry. Sets process.exitCode and never calls
// process.exit(): Node 24 on macOS has been seen to segfault inside it.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_REGISTRY, checkImageTag, checkSha, checkVersion, isObject, isoSeconds, readRegistry, serialize, show } from "./lib/registry-io.mjs";

export const TIMEOUT_MS = 10_000;
export const RETRY_DELAY_MS = 3_000;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The URL the gateway's /api/health fan-out probes as well: api.baseUrl + api.healthPath without a doubled slash. */
export const healthUrl = (api) => `${api.baseUrl.replace(/\/+$/, "")}${api.healthPath}`;

/** One GET: {text} for a 2xx answer, else {error, retry}, where `retry` marks what a cold start looks like. */
async function probe(url, timeoutMs) {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "eisensoftware-sync-deployments" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (res.ok) return { text };
    return { error: `health ${res.status}`, retry: res.status >= 500 || res.status === 429 };
  } catch (err) {
    const why = err?.name === "TimeoutError" ? `timeout after ${timeoutMs / 1000} s` : (err?.cause?.code ?? err?.message ?? String(err));
    return { error: `health unreachable (${why})`, retry: true };
  }
}

/** GET a health URL, retrying once after `retryDelayMs` when the first answer looks like a cold start. */
export async function fetchHealth(url, { timeoutMs = TIMEOUT_MS, retryDelayMs = RETRY_DELAY_MS } = {}) {
  const first = await probe(url, timeoutMs);
  if (!first.retry) return first;
  await sleep(retryDelayMs);
  return probe(url, timeoutMs);
}

/** `raw` as a registry deployedAt (whole seconds, `Z`) when it is a real ISO-8601 UTC instant, else undefined. */
export function parseDeployedAt(raw) {
  if (typeof raw !== "string" || !ISO_UTC.test(raw)) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return undefined;
  const value = isoSeconds(date);
  return value === raw.replace(/\.\d+Z$/, "Z") ? value : undefined; // rejects dates that roll over, such as Feb 30
}

/** What one health body says about `app`: {skip: reason} or {version, sha, deployedAt?, imageTag?}. */
export function readReport(app, text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { skip: "health is not JSON" };
  }
  if (!isObject(body)) return { skip: "health JSON is not an object" };
  if (typeof body.app === "string" && body.app !== app.id) return { skip: `health reports app ${show(body.app)}, not ${show(app.id)}` };
  if (body.version == null) return { skip: "health JSON has no version" };
  if (body.version === "dev") return { skip: 'version "dev" (APP_VERSION not set)' };
  const version = checkVersion(body.version);
  if (version.error) return { skip: version.error };
  if (body.commit == null || body.commit === "") return { skip: "health JSON has no commit (APP_COMMIT not set)" };
  const sha = checkSha(body.commit, "commit");
  if (sha.error) return { skip: sha.error };
  const report = { version: version.value, sha: sha.value, deployedAt: parseDeployedAt(body.deployedAt) };
  if (body.imageTag != null) {
    const imageTag = checkImageTag(body.imageTag);
    if (imageTag.error) return { skip: imageTag.error };
    report.imageTag = imageTag.value;
  }
  return report;
}

/** True when two shas name the same commit: equal, or one a prefix of the other (a short and a full sha). */
const sameCommit = (recorded, reported) =>
  typeof recorded === "string" && recorded.length >= 7 && (recorded.startsWith(reported) || reported.startsWith(recorded));

/** The app's next `deployment` block, or undefined when the report matches what the registry already records. */
export function nextDeployment(current, report, now) {
  if (current.version === report.version && sameCommit(current.sha, report.sha)) return undefined;
  return {
    version: report.version,
    sha: report.sha,
    imageTag: report.imageTag ?? (typeof current.imageTag === "string" ? current.imageTag : ""),
    deployedAt: report.deployedAt ?? isoSeconds(now),
    deployedBy: "ci",
  };
}

/** Probe one app and patch its `deployment` in place. Returns {line, outcome: "changed" | "unchanged" | "skipped"}. */
async function syncApp(app, now, http) {
  const id = isObject(app) && typeof app.id === "string" ? app.id : "(no id)";
  const skip = (reason) => ({ line: `${id}: skipped — ${reason}`, outcome: "skipped" });
  if (!isObject(app?.api)) return skip("no api block");
  if (typeof app.api.baseUrl !== "string" || typeof app.api.healthPath !== "string") return skip("api block without baseUrl or healthPath");
  const answer = await fetchHealth(healthUrl(app.api), http);
  if (answer.error) return skip(answer.error);
  const report = readReport(app, answer.text);
  if (report.skip) return skip(report.skip);
  const current = isObject(app.deployment) ? app.deployment : {};
  const next = nextDeployment(current, report, now);
  if (!next) return { line: `${id}: unchanged`, outcome: "unchanged" };
  app.deployment = next;
  return { line: `${id}: ${current.version || "none"} → ${next.version} (${next.sha.slice(0, 7)})`, outcome: "changed" };
}

/** Sync every app in parallel on a copy of `registry`. Returns {registry, lines (registry order), counts}. */
export async function syncDeployments(registry, { now = new Date(), ...http } = {}) {
  const next = structuredClone(registry);
  const results = await Promise.all(next.apps.map((app) => syncApp(app, now, http)));
  const counts = { changed: 0, unchanged: 0, skipped: 0 };
  for (const result of results) counts[result.outcome]++;
  return { registry: next, lines: results.map((result) => result.line), counts };
}

function parseArgs(argv) {
  const opts = { dryRun: false, registry: DEFAULT_REGISTRY };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") opts.dryRun = true;
    else if (argv[i] === "--registry" && i + 1 < argv.length) opts.registry = argv[++i];
    else throw new Error(argv[i] === "--registry" ? "--registry needs a value" : `unknown argument ${argv[i]}`);
  }
  return opts;
}

/**
 * CLI entry point. Resolves to the exit code (always 0: app problems are skips); rejects on a bad argument, an
 * unreadable or invalid registry, or a failed write. `options`: log, now, timeoutMs, retryDelayMs (tests shorten them).
 */
export async function main(argv, { log = console.log, ...options } = {}) {
  const opts = parseArgs(argv);
  const registry = readRegistry(opts.registry);
  const { registry: next, lines, counts } = await syncDeployments(registry, options);
  for (const line of lines) log(line);
  const write = counts.changed > 0 && !opts.dryRun;
  if (write) writeFileSync(opts.registry, serialize(next));
  const outcome = counts.changed === 0 ? "nothing to write" : write ? "registry written" : "dry run, nothing written";
  log(`sync-deployments: ${counts.changed} changed, ${counts.unchanged} unchanged, ${counts.skipped} skipped — ${outcome}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(`sync-deployments: ${err.message}`);
      process.exitCode = 1;
    },
  );
}
