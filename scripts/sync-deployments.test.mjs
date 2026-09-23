// Self-tests for scripts/sync-deployments.mjs. Run: `node --test scripts/*.test.mjs` (what ci.yml runs).
// A local http.createServer stands in for the apps' health endpoints. Every case works on a temp copy of
// scripts/fixtures/registry.sample.json (a frozen registry: vale and healthconnect with an api block, topology without)
// whose api.baseUrl values point at that server, so neither the real registry nor the network is touched, and editing
// the real registry never changes these tests.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { main, parseDeployedAt } from "./sync-deployments.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, "sync-deployments.mjs");
const VALIDATOR = join(here, "validate-registry.mjs");
const SOURCE = join(here, "fixtures", "registry.sample.json");
const SHA = "8cc0085a1b2c3d4e5f60718293a4b5c6d7e8f901";
const NOW = new Date("2026-09-23T12:34:56.789Z");
const NOW_SECONDS = "2026-09-23T12:34:56Z";
const PAST = new Date("2020-01-01T00:00:00Z");

// Health answers by request path: a list served in order whose last entry repeats. `hang` never answers.
const routes = new Map();
const hits = new Map();
let server;
let origin;

before(async () => {
  server = createServer((req, res) => {
    hits.set(req.url, (hits.get(req.url) ?? 0) + 1);
    const queue = routes.get(req.url) ?? [{ status: 404, body: "no such route" }];
    const answer = queue.length > 1 ? queue.shift() : queue[0];
    if (answer.hang) return;
    const json = typeof answer.body !== "string";
    res.writeHead(answer.status, { "content-type": json ? "application/json" : "text/html" });
    res.end(json ? JSON.stringify(answer.body) : answer.body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

const source = () => JSON.parse(readFileSync(SOURCE, "utf8"));
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const app = (registry, id) => registry.apps.find((a) => a.id === id);
const ok = (id, fields = {}) => ({ status: 200, body: { status: "ok", app: id, version: "0.2.0", commit: SHA, deployedAt: "", ...fields } });
const untouched = (path) => statSync(path).mtimeMs === PAST.getTime();

let seq = 0;
/**
 * A temp registry: `edit` may change the copy, then every https api.baseUrl is pointed at the local server under a
 * fresh prefix. `answers` maps an app id to its health answer(s). The mtime is set in the past so any rewrite shows.
 */
function fixture(answers, edit = () => {}) {
  const prefix = `/t${++seq}`;
  const registry = source();
  edit(registry);
  for (const a of registry.apps) if (a.api?.baseUrl.startsWith("https://")) a.api.baseUrl = `${origin}${prefix}/${a.id}`;
  const route = (id) => `${prefix}/${id}${app(registry, id).api.healthPath}`;
  for (const [id, list] of Object.entries(answers)) routes.set(route(id), [].concat(list));
  const path = join(mkdtempSync(join(tmpdir(), "sync-deployments-")), "registry.json");
  writeFileSync(path, `${JSON.stringify(registry, null, 2)}\n`);
  utimesSync(path, PAST, PAST);
  return { path, hitsOf: (id) => hits.get(route(id)) ?? 0 };
}

/** main() in-process with a fixed clock and short retry delay / timeout; returns the exit code and printed lines. */
async function sync(path, args = [], options = {}) {
  const lines = [];
  const code = await main(["--registry", path, ...args], { log: (line) => lines.push(line), now: NOW, retryDelayMs: 10, timeoutMs: 1000, ...options });
  return { code, lines };
}

/** The real CLI in a child process (asynchronous, so this process's server can answer it). */
const cli = (...args) =>
  new Promise((resolve) =>
    execFile(process.execPath, [SCRIPT, ...args], { encoding: "utf8" }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })),
  );

test("version change: deployment patched, everything else and the file format kept, validator passes", async () => {
  const { path } = fixture({ vale: ok("vale"), healthconnect: ok("healthconnect", { version: "dev", commit: "" }) });
  const before = read(path);
  const { code, lines } = await sync(path);
  assert.equal(code, 0);
  assert.deepEqual(lines, [
    "vale: 0.1.0 → 0.2.0 (8cc0085)",
    'healthconnect: skipped — version "dev" (APP_VERSION not set)',
    "topology: skipped — no api block",
    "sync-deployments: 1 changed, 0 unchanged, 2 skipped — registry written",
  ]);
  const written = read(path);
  assert.deepEqual(app(written, "vale").deployment, { version: "0.2.0", sha: SHA, imageTag: "", deployedAt: NOW_SECONDS, deployedBy: "ci" });
  assert.deepEqual({ ...app(written, "vale"), deployment: null }, { ...app(before, "vale"), deployment: null });
  assert.deepEqual(written.apps.filter((a) => a.id !== "vale"), before.apps.filter((a) => a.id !== "vale"), "other apps untouched");
  assert.deepEqual({ ...written, apps: [] }, { ...before, apps: [] }, "platform untouched");
  const text = readFileSync(path, "utf8");
  assert.ok(text.endsWith("}\n") && text.includes('\n  "apps": ['), "2-space JSON with a trailing newline");
  // Put the real https api blocks back: the patched deployment block itself must satisfy the validator.
  const restored = { ...written, apps: written.apps.map((a) => (a.api ? { ...a, api: app(source(), a.id).api } : a)) };
  writeFileSync(path, `${JSON.stringify(restored, null, 2)}\n`);
  const v = spawnSync(process.execPath, [VALIDATOR, path], { encoding: "utf8" });
  assert.equal(v.status, 0, v.stderr);
});

test("unchanged: same version and commit (a short sha matches its full sha) → nothing written", async () => {
  const { path } = fixture(
    { vale: ok("vale", { commit: SHA.slice(0, 12) }), healthconnect: ok("healthconnect", { version: "1.4.0", commit: "ABCDEF1234567" }) },
    (r) => {
      app(r, "vale").deployment = { version: "0.2.0", sha: SHA, imageTag: "sha-8cc0085a1b2c", deployedAt: "2026-09-20T08:00:00Z", deployedBy: "ci" };
      app(r, "healthconnect").deployment = { version: "1.4.0", sha: "abcdef1", imageTag: "", deployedAt: "", deployedBy: "manual" };
    },
  );
  const text = readFileSync(path, "utf8");
  const { code, lines } = await sync(path);
  assert.equal(code, 0);
  assert.deepEqual(lines, [
    "vale: unchanged",
    "healthconnect: unchanged",
    "topology: skipped — no api block",
    "sync-deployments: 0 changed, 2 unchanged, 1 skipped — nothing to write",
  ]);
  assert.ok(untouched(path), "registry not rewritten");
  assert.equal(readFileSync(path, "utf8"), text);
});

test('version "dev" (APP_VERSION unset) is skipped, not an error', async () => {
  const { path } = fixture({ vale: ok("vale", { version: "dev", commit: "" }), healthconnect: ok("healthconnect", { version: "dev" }) });
  const { code, lines } = await sync(path);
  assert.equal(code, 0);
  assert.deepEqual(lines.slice(0, 2), [
    'vale: skipped — version "dev" (APP_VERSION not set)',
    'healthconnect: skipped — version "dev" (APP_VERSION not set)',
  ]);
  assert.ok(untouched(path));
});

test("503 is skipped after exactly one retry; a cold start (503, then 200) is patched", async () => {
  const { path, hitsOf } = fixture({
    vale: { status: 503, body: "Service Unavailable" },
    healthconnect: [{ status: 503, body: "starting" }, ok("healthconnect")],
  });
  const { code, lines } = await sync(path);
  assert.equal(code, 0);
  assert.deepEqual(lines.slice(0, 2), ["vale: skipped — health 503", "healthconnect: 0.1.0 → 0.2.0 (8cc0085)"]);
  assert.equal(hitsOf("vale"), 2, "one retry, not more");
  assert.equal(hitsOf("healthconnect"), 2);
  const written = read(path);
  assert.equal(app(written, "vale").deployment.version, "0.1.0");
  assert.equal(app(written, "healthconnect").deployment.version, "0.2.0");
});

test("no answer within the timeout, or nothing listening: skipped after one retry", async () => {
  const closedPort = await new Promise((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
  const { path, hitsOf } = fixture({ vale: { hang: true } }, (r) => {
    app(r, "healthconnect").api.baseUrl = `http://127.0.0.1:${closedPort}/healthconnect`;
  });
  const { code, lines } = await sync(path, [], { timeoutMs: 200 });
  assert.equal(code, 0);
  assert.equal(lines[0], "vale: skipped — health unreachable (timeout after 0.2 s)");
  assert.match(lines[1], /^healthconnect: skipped — health unreachable \(ECONNREFUSED\)$/);
  assert.equal(hitsOf("vale"), 2);
  assert.ok(untouched(path));
});

test("non-JSON, JSON without the contract fields (today's apps) and a 404 are skipped; a 404 is not retried", async () => {
  const { path, hitsOf } = fixture(
    { vale: { status: 200, body: "<!doctype html><title>Sign in</title>" }, healthconnect: { status: 200, body: { ok: true } } },
    (r) => (app(r, "topology").api = { baseUrl: "https://example.invalid", healthPath: "/health" }),
  );
  const { code, lines } = await sync(path);
  assert.equal(code, 0);
  assert.deepEqual(lines, [
    "vale: skipped — health is not JSON",
    "healthconnect: skipped — health JSON has no version",
    "topology: skipped — health 404",
    "sync-deployments: 0 changed, 0 unchanged, 3 skipped — nothing to write",
  ]);
  assert.equal(hitsOf("topology"), 1);
  assert.ok(untouched(path));
});

test("an invalid commit or version, or a body naming another app, is skipped", async () => {
  const { path } = fixture(
    { vale: ok("vale", { commit: "not-a-sha" }), healthconnect: ok("healthconnect", { version: "v1.2" }), topology: ok("vale") },
    (r) => (app(r, "topology").api = { baseUrl: "https://example.invalid", healthPath: "/health" }),
  );
  const { code, lines } = await sync(path);
  assert.equal(code, 0);
  assert.deepEqual(lines.slice(0, 3), [
    'vale: skipped — commit "not-a-sha" must be 7–40 hex characters',
    'healthconnect: skipped — version "v1.2" must match ^[0-9]+\\.[0-9]+\\.[0-9]+([-+][0-9A-Za-z.-]+)?$',
    'topology: skipped — health reports app "vale", not "topology"',
  ]);
  const missing = fixture({ vale: ok("vale", { commit: "" }) });
  assert.equal((await sync(missing.path)).lines[0], "vale: skipped — health JSON has no commit (APP_COMMIT not set)");
  assert.ok(untouched(path) && untouched(missing.path));
});

test("a valid reported deployedAt is recorded; an invalid one is replaced by now", async () => {
  const { path } = fixture({
    vale: ok("vale", { deployedAt: "2026-09-20T08:00:00Z" }),
    healthconnect: ok("healthconnect", { deployedAt: "yesterday" }),
  });
  await sync(path);
  const written = read(path);
  assert.equal(app(written, "vale").deployment.deployedAt, "2026-09-20T08:00:00Z");
  assert.equal(app(written, "healthconnect").deployment.deployedAt, NOW_SECONDS);
  assert.equal(parseDeployedAt("2026-09-20T08:00:00.123Z"), "2026-09-20T08:00:00Z", "fractions are dropped");
  for (const bad of ["", "2026-09-20 08:00:00Z", "2026-09-20T08:00:00+02:00", "2026-02-30T08:00:00Z", "2026-09-20T25:00:00Z", 1758355200])
    assert.equal(parseDeployedAt(bad), undefined, `${JSON.stringify(bad)} is not a valid deployedAt`);
});

test("imageTag: a reported one is recorded, otherwise the existing one is kept", async () => {
  const { path } = fixture(
    { vale: ok("vale"), healthconnect: ok("healthconnect", { imageTag: "sha-8cc0085a1b2c" }) },
    (r) => (app(r, "vale").deployment.imageTag = "sha-0123456789ab"),
  );
  await sync(path);
  const written = read(path);
  assert.equal(app(written, "vale").deployment.imageTag, "sha-0123456789ab");
  assert.equal(app(written, "healthconnect").deployment.imageTag, "sha-8cc0085a1b2c");
});

test("--dry-run prints the change and writes nothing", async () => {
  const { path } = fixture({ vale: ok("vale") });
  const { code, lines } = await sync(path, ["--dry-run"]);
  assert.equal(code, 0);
  assert.equal(lines[0], "vale: 0.1.0 → 0.2.0 (8cc0085)");
  assert.equal(lines.at(-1), "sync-deployments: 1 changed, 0 unchanged, 2 skipped — dry run, nothing written");
  assert.ok(untouched(path), "registry not rewritten");
});

test("CLI: exit 0 with one line per app when every app is skipped; exit 1 only for a bad registry or argument", async () => {
  const { path } = fixture({ vale: { status: 200, body: { credentials: true } }, healthconnect: { status: 200, body: { ok: true } } });
  const r = await cli("--registry", path);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(r.stdout.trimEnd().split("\n"), [
    "vale: skipped — health JSON has no version",
    "healthconnect: skipped — health JSON has no version",
    "topology: skipped — no api block",
    "sync-deployments: 0 changed, 0 unchanged, 3 skipped — nothing to write",
  ]);
  const dir = mkdtempSync(join(tmpdir(), "sync-deployments-"));
  writeFileSync(join(dir, "broken.json"), "{ not json");
  writeFileSync(join(dir, "no-apps.json"), '{"apps": 3}');
  for (const [file, message] of [
    ["missing.json", /cannot read registry .*missing\.json/],
    ["broken.json", /cannot read registry .*broken\.json/],
    ["no-apps.json", /must be an object with an apps array/],
  ]) {
    const bad = await cli("--registry", join(dir, file));
    assert.equal(bad.code, 1, file);
    assert.match(bad.stderr, message);
  }
  const flag = await cli("--bogus");
  assert.equal(flag.code, 1);
  assert.match(flag.stderr, /^sync-deployments: unknown argument --bogus$/m);
});
