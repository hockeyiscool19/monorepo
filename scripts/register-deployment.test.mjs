// Self-tests for scripts/register-deployment.mjs. Run: `node --test scripts/*.test.mjs` (what ci.yml runs).
// Every CLI case works on a temp copy of scripts/fixtures/registry.sample.json (a frozen registry), so the real
// registry is never touched and editing it never changes these tests.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PayloadError, applyDeployment, validatePayload } from "./register-deployment.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, "register-deployment.mjs");
const VALIDATOR = join(here, "validate-registry.mjs");
const SOURCE = join(here, "fixtures", "registry.sample.json");
const SHA = "8cc0085a1b2c3d4e5f60718293a4b5c6d7e8f901";
const ISO_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const source = () => JSON.parse(readFileSync(SOURCE, "utf8"));
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const app = (registry, id) => registry.apps.find((a) => a.id === id);
const others = (registry, id) => registry.apps.filter((a) => a.id !== id);
const payload = (extra = {}) => JSON.stringify({ id: "vale", version: "0.2.0", sha: SHA, imageTag: "sha-8cc0085a1b2c", ...extra });

function tempRegistry() {
  const path = join(mkdtempSync(join(tmpdir(), "register-deployment-")), "registry.json");
  copyFileSync(SOURCE, path);
  return path;
}
const run = (path, ...args) => spawnSync(process.execPath, [SCRIPT, "--registry", path, ...args], { encoding: "utf8" });
const validate = (path) => spawnSync(process.execPath, [VALIDATOR, path], { encoding: "utf8" });

test("happy path: patches deployment, keeps the file format, passes the validator", () => {
  const path = tempRegistry();
  const before = readFileSync(path, "utf8");
  const r = run(path, "--payload", payload());
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^registry: vale → 0\.2\.0 \(8cc0085\) image sha-8cc0085a1b2c at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z by ci\n/);
  assert.match(r.stdout, /deployment\.version: "0\.1\.0" → "0\.2\.0"/);
  const text = readFileSync(path, "utf8");
  assert.notEqual(text, before);
  assert.ok(text.endsWith("}\n") && text.includes('\n  "apps": ['), "2-space JSON with a trailing newline");
  const vale = app(read(path), "vale");
  assert.deepEqual({ ...vale.deployment, deployedAt: "x" }, { version: "0.2.0", sha: SHA, imageTag: "sha-8cc0085a1b2c", deployedAt: "x", deployedBy: "ci" });
  assert.match(vale.deployment.deployedAt, ISO_SECONDS);
  assert.equal(vale.web.url, app(source(), "vale").web.url, "web.url is untouched when no url is sent");
  assert.deepEqual(others(read(path), "vale"), others(source(), "vale"), "other apps are untouched");
  const v = validate(path);
  assert.equal(v.status, 0, v.stderr);
});

test("unknown id: exit 1, clear message, file untouched", () => {
  const path = tempRegistry();
  const before = readFileSync(path, "utf8");
  const r = run(path, "--payload", payload({ id: "nope" }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown app id "nope" \(known: vale, healthconnect, topology\)/);
  assert.equal(readFileSync(path, "utf8"), before);
});

test("bad version: exit 1", () => {
  const path = tempRegistry();
  for (const version of ["1.2", "v1.2.3", "", "1.2.3 beta"]) {
    const r = run(path, "--payload", payload({ version }));
    assert.equal(r.status, 1, `version ${JSON.stringify(version)} should be rejected`);
    assert.match(r.stderr, /version .* must match/);
  }
  assert.deepEqual(read(path), source());
});

test("bad sha: exit 1", () => {
  const path = tempRegistry();
  for (const sha of ["12345", "not-a-sha", `${SHA}ff`, 12345]) {
    const r = run(path, "--payload", payload({ sha }));
    assert.equal(r.status, 1, `sha ${JSON.stringify(sha)} should be rejected`);
    assert.match(r.stderr, /sha .* must be 7–40 hex/);
  }
  assert.deepEqual(read(path), source());
});

test("url change: web.url moves and api.baseUrl keeps its path on the new origin", () => {
  const path = tempRegistry();
  const r = run(path, "--payload", payload({ url: "https://vale-7qzmfxv3za-uc.a.run.app/" }));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /web\.url: "https:\/\/vale-382031913173\.us-central1\.run\.app" → "https:\/\/vale-7qzmfxv3za-uc\.a\.run\.app"/);
  const vale = app(read(path), "vale");
  assert.equal(vale.web.url, "https://vale-7qzmfxv3za-uc.a.run.app");
  assert.equal(vale.api.baseUrl, "https://vale-7qzmfxv3za-uc.a.run.app/api");
  assert.equal(validate(path).status, 0);
  const same = run(path, "--payload", payload({ version: "0.2.1", url: "https://vale-7qzmfxv3za-uc.a.run.app" }));
  assert.equal(same.status, 0, same.stderr);
  assert.doesNotMatch(same.stdout, /web\.url/, "an unchanged url is not reported as a change");
});

test("http url is rejected", () => {
  assert.throws(() => validatePayload(JSON.parse(payload({ url: "http://vale.example" })), source()), PayloadError);
});

test("--dry-run prints the changes and writes nothing; --file reads the payload from disk", () => {
  const path = tempRegistry();
  const before = readFileSync(path, "utf8");
  const file = join(dirname(path), "payload.json");
  writeFileSync(file, payload({ imageTag: "" }));
  const r = run(path, "--dry-run", "--file", file);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^registry: vale → 0\.2\.0 \(8cc0085\) at .* by ci \[dry run, nothing written\]\n/);
  assert.match(r.stdout, /deployment\.sha: "" → "8cc0085a1b2c3d4e5f60718293a4b5c6d7e8f901"/);
  assert.equal(readFileSync(path, "utf8"), before);
});

test("argument errors: neither or both payload sources, unknown flag", () => {
  const path = tempRegistry();
  assert.equal(run(path).status, 1);
  assert.equal(run(path, "--payload", "{}", "--file", "x.json").status, 1);
  assert.equal(run(path, "--payload", payload(), "--bogus").status, 1);
  assert.deepEqual(read(path), source());
});

test("applyDeployment uses the clock it is given and leaves its input untouched", () => {
  const registry = source();
  const fields = validatePayload(JSON.parse(payload()), registry);
  const { registry: next, changes } = applyDeployment(registry, fields, new Date("2026-09-23T12:34:56.789Z"));
  assert.equal(app(next, "vale").deployment.deployedAt, "2026-09-23T12:34:56Z");
  assert.deepEqual(registry, source(), "input registry is not mutated");
  assert.ok(changes.includes('deployment.deployedBy: "manual" → "ci"'));
});
