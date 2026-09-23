// Self-tests for scripts/render-firebase.mjs. Run: `node --test scripts/*.test.mjs` (what ci.yml runs).
// Registries come from the frozen fixtures (scripts/fixtures/registry.auth.json: vale behind the door;
// registry.sample.json: no sign-in); the CLI cases write temp copies of a small firebase.json, so neither the real
// registry nor the real firebase.json is read or touched.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { doorApps, main, render, renderRewrites, summarize } from "./render-firebase.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, "render-firebase.mjs");
const AUTH_FIXTURE = join(here, "fixtures", "registry.auth.json");
const SAMPLE_FIXTURE = join(here, "fixtures", "registry.sample.json");
const load = (path) => JSON.parse(readFileSync(path, "utf8"));
const app = (registry, id) => registry.apps.find((a) => a.id === id);
const rewrite = (path, serviceId) => ({ source: `${path}{,/**}`, run: { serviceId, region: "us-central1" } });

const FIREBASE = {
  hosting: { site: "eisensoftware", public: "apps/portal/build", headers: [{ source: "/", headers: [{ key: "Cache-Control", value: "no-cache" }] }], rewrites: [] },
  firestore: { rules: "firestore.rules" },
  emulators: { auth: { host: "127.0.0.1", port: 9099 }, singleProjectMode: true },
};
const text = (config) => `${JSON.stringify(config, null, 2)}\n`;

function tempFiles(registry, config = FIREBASE) {
  const dir = mkdtempSync(join(tmpdir(), "render-firebase-"));
  const files = { registry: join(dir, "registry.json"), firebase: join(dir, "firebase.json") };
  writeFileSync(files.registry, text(registry));
  writeFileSync(files.firebase, typeof config === "string" ? config : text(config));
  return files;
}
function cli(files, ...args) {
  const out = [];
  const err = [];
  const code = main(["--registry", files.registry, "--firebase", files.firebase, ...args], { log: (l) => out.push(l), warn: (l) => err.push(l) });
  return { code, out, err };
}

test("an app with access goes to the gateway service (the door); order unchanged", () => {
  assert.deepEqual(renderRewrites(load(AUTH_FIXTURE)), [
    rewrite("/api", "gateway"),
    rewrite("/healthconnect", "jordan-lifts"),
    rewrite("/topology", "topology"),
    rewrite("/vale", "gateway"),
  ]);
  assert.deepEqual(doorApps(load(AUTH_FIXTURE)).map((a) => a.id), ["vale"]);
});

test("access: [] (any signed-in person) still goes through the door", () => {
  const registry = load(AUTH_FIXTURE);
  app(registry, "vale").access.groups = [];
  assert.deepEqual(renderRewrites(registry).at(-1), rewrite("/vale", "gateway"));
});

test("door off: platform.auth.enabled false or the gateway disabled routes the app to its own service, as before", () => {
  const authOff = load(AUTH_FIXTURE);
  authOff.platform.auth.enabled = false;
  assert.deepEqual(renderRewrites(authOff).map((r) => r.run.serviceId), ["gateway", "jordan-lifts", "topology", "vale"]);
  const gatewayOff = load(AUTH_FIXTURE);
  gatewayOff.platform.gateway.enabled = false;
  assert.deepEqual(renderRewrites(gatewayOff), [rewrite("/healthconnect", "jordan-lifts"), rewrite("/topology", "topology"), rewrite("/vale", "vale")]);
  assert.deepEqual(doorApps(gatewayOff), []);
});

test("a registry without sign-in renders exactly as before Phase 8", () => {
  assert.deepEqual(renderRewrites(load(SAMPLE_FIXTURE)), [
    rewrite("/api", "gateway"),
    rewrite("/healthconnect", "jordan-lifts"),
    rewrite("/topology", "topology"),
    rewrite("/vale", "vale"),
  ]);
});

test("render keeps every other key in place and is idempotent", () => {
  const registry = load(AUTH_FIXTURE);
  const once = render(text(FIREBASE), registry);
  assert.deepEqual(Object.keys(JSON.parse(once)), ["hosting", "firestore", "emulators"]);
  assert.deepEqual(JSON.parse(once).firestore, FIREBASE.firestore);
  assert.deepEqual(JSON.parse(once).emulators, FIREBASE.emulators);
  assert.deepEqual(JSON.parse(once).hosting.headers, FIREBASE.hosting.headers);
  assert.equal(render(once, registry), once, "a second render changes nothing");
});

test("summarize marks door rewrites", () => {
  const registry = load(AUTH_FIXTURE);
  const open = structuredClone(registry);
  open.platform.auth.enabled = false;
  const before = render(text(FIREBASE), open);
  const after = render(before, registry);
  assert.deepEqual(summarize(before, after, registry), ["  ~ /vale{,/**} run vale (us-central1) → run gateway (us-central1) — gateway door"]);
  assert.deepEqual(summarize(after, before, open), ["  ~ /vale{,/**} run gateway (us-central1) — gateway door → run vale (us-central1)"]);
});

test("CLI --check: stale file exits 1 and names the door; the rendered file is up to date", () => {
  const files = tempFiles(load(AUTH_FIXTURE));
  const stale = cli(files, "--check");
  assert.equal(stale.code, 1);
  assert.match(stale.err[0], /firebase\.json: stale — run `node scripts\/render-firebase\.mjs` and commit the result \(4 rewrites; through the gateway door: \/vale\)$/);
  assert.ok(stale.err.includes("  + /vale{,/**} run gateway (us-central1) — gateway door"), stale.err.join("\n"));
  assert.equal(readFileSync(files.firebase, "utf8"), text(FIREBASE), "--check writes nothing");

  const write = cli(files);
  assert.equal(write.code, 0);
  assert.match(write.out[0], /firebase\.json: rewrites rendered \(4 rewrites; through the gateway door: \/vale\)$/);
  const check = cli(files, "--check");
  assert.equal(check.code, 0);
  assert.match(check.out[0], /firebase\.json: up to date \(4 rewrites; through the gateway door: \/vale\)$/);
  assert.deepEqual(check.err, []);
});

test("CLI warns when an app with access is routed around the door", () => {
  const registry = load(AUTH_FIXTURE);
  registry.platform.auth.enabled = false;
  const files = tempFiles(registry);
  const r = cli(files);
  assert.equal(r.code, 0);
  assert.deepEqual(r.err, ["render-firebase: warning — vale declares access but platform.auth.enabled is false: /vale{,/**} goes straight to Cloud Run vale, unguarded"]);
  assert.match(r.out[0], /\(4 rewrites\)$/);
});

test("CLI as a process: bad arguments exit 1 with one line", () => {
  const r = spawnSync(process.execPath, [SCRIPT, "--bogus"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.equal(r.stderr, "render-firebase: unknown argument --bogus\n");
  const missing = spawnSync(process.execPath, [SCRIPT, "--registry"], { encoding: "utf8" });
  assert.equal(missing.stderr, "render-firebase: --registry needs a value\n");
});
