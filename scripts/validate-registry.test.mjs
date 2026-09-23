// Self-tests for scripts/validate-registry.mjs and its rules (scripts/lib/registry-rules.mjs, scripts/lib/auth-rules.mjs).
// Run: `node --test scripts/*.test.mjs` (what ci.yml runs). Every case works on frozen fixtures — scripts/fixtures/
// registry.auth.json (platform.auth with two groups, vale behind the door) and registry.sample.json (no sign-in) — or
// on in-memory copies of them, so editing the real registry never changes these tests.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRegistry } from "./lib/registry-rules.mjs";
import { RESERVED_APP_IDS, chars, doorActive, unguardedApps } from "./lib/auth-rules.mjs";
import { SCHEMA } from "./lib/schema.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const VALIDATOR = join(here, "validate-registry.mjs");
const AUTH_FIXTURE = join(here, "fixtures", "registry.auth.json");
const SAMPLE_FIXTURE = join(here, "fixtures", "registry.sample.json");

const load = (path) => JSON.parse(readFileSync(path, "utf8"));
const app = (registry, id) => registry.apps.find((a) => a.id === id);
const run = (...args) => spawnSync(process.execPath, [VALIDATOR, ...args], { encoding: "utf8" });
function temp(registry) {
  const path = join(mkdtempSync(join(tmpdir(), "validate-registry-")), "registry.json");
  writeFileSync(path, `${JSON.stringify(registry, null, 2)}\n`);
  return path;
}
/** Problems of the auth fixture after `edit` changed a copy of it. */
function problems(edit, options) {
  const registry = load(AUTH_FIXTURE);
  edit(registry);
  return validateRegistry(registry, options);
}
function published(registry) {
  const copy = structuredClone(registry);
  copy.generatedAt = "2026-09-23T12:00:00Z";
  for (const a of copy.apps) delete a.repo;
  return copy;
}

test("CLI: the frozen fixtures are valid, with and without platform sign-in", () => {
  const withAuth = run(AUTH_FIXTURE);
  assert.equal(withAuth.status, 0, withAuth.stderr);
  assert.equal(withAuth.stdout, "registry: valid — platform eisensoftware.com, 3 app(s) (vale, healthconnect, topology); access-controlled: vale\n");
  assert.equal(withAuth.stderr, "", "no warning while the door is active");
  const without = run(SAMPLE_FIXTURE);
  assert.equal(without.status, 0, without.stderr);
  assert.equal(without.stdout, "registry: valid — platform eisensoftware.com, 3 app(s) (vale, healthconnect, topology)\n");
});

test("CLI: one line per problem and exit 1", () => {
  const registry = load(AUTH_FIXTURE);
  app(registry, "vale").access.groups = ["owner", "court"];
  registry.platform.auth.sessionHours = 0;
  const r = run(temp(registry));
  assert.equal(r.status, 1);
  assert.equal(
    r.stderr,
    "registry: 2 problem(s)\n" +
      "  - platform: auth.sessionHours must be an integer from 1 to 168 (got 0)\n" +
      '  - apps[0] (vale): access.groups "court" is not declared in platform.auth.groups (declared: owner, vale)\n',
  );
});

test("CLI --published: auth and access stay public; repo and generatedAt rules unchanged", () => {
  const copy = published(load(AUTH_FIXTURE));
  const ok = run("--published", temp(copy));
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /^registry: published copy valid, no repo blocks — .*; access-controlled: vale\n$/);
  const leaked = structuredClone(copy);
  leaked.apps[0].repo = { github: "hockeyiscool19/healthconnect", branch: "main" };
  const bad = run("--published", temp(leaked));
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /apps\[0\] \(vale\): repo must not be published/);
  const undated = structuredClone(copy);
  delete undated.generatedAt;
  assert.match(run("--published", temp(undated)).stderr, /generatedAt is required in a published copy/);
});

test("CLI: access with the door off is valid but warns that the app is unguarded", () => {
  for (const [edit, reason] of [
    [(r) => (r.platform.auth.enabled = false), "platform.auth.enabled is false"],
    [(r) => (r.platform.gateway.enabled = false), "platform.gateway.enabled is false"],
  ]) {
    const registry = load(AUTH_FIXTURE);
    edit(registry);
    const r = run(temp(registry));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, `registry: warning — vale declares access but ${reason}, so /vale is served straight from Cloud Run vale, unguarded\n`);
  }
});

test("reserved app ids are rejected: registry, health, auth", () => {
  assert.deepEqual(RESERVED_APP_IDS, ["registry", "health", "auth"]);
  for (const id of RESERVED_APP_IDS) {
    const found = problems((r) => (app(r, "topology").id = id));
    assert.ok(found.some((p) => p === `apps[2] (${id}): id "${id}" is reserved (registry, health, auth would shadow a gateway route)`), found.join("\n"));
  }
});

test("access: every group must be declared, unique and well-formed; [] means any signed-in person", () => {
  const vale = (edit) => problems((r) => edit(app(r, "vale").access));
  assert.deepEqual(vale((a) => (a.groups = [])), [], "[] is valid");
  assert.deepEqual(vale((a) => (a.groups = ["vale"])), []);
  assert.deepEqual(vale((a) => delete a.note), [], "note is optional");
  const cases = [
    [(a) => (a.groups = ["owner", "court"]), 'access.groups "court" is not declared in platform.auth.groups (declared: owner, vale)'],
    [(a) => (a.groups = ["vale", "vale"]), 'access.groups lists "vale" twice'],
    [(a) => (a.groups = [42]), "access.groups entry 42 must match ^[a-z][a-z0-9-]{1,30}$"],
    [(a) => (a.groups = ["Owner"]), 'access.groups entry "Owner" must match ^[a-z][a-z0-9-]{1,30}$'],
    [(a) => (a.groups = "owner"), "access.groups must be an array of group ids ([] = any signed-in person)"],
    [(a) => delete a.groups, "access.groups is required"],
    [(a) => (a.who = "me"), "access.who is not in the schema"],
    [(a) => (a.note = "x".repeat(201)), "access.note must be at most 200 characters (got 201)"],
  ];
  for (const [edit, expected] of cases) assert.deepEqual(vale(edit), [`apps[0] (vale): ${expected}`]);
  assert.deepEqual(problems((r) => (app(r, "vale").access = ["owner"])), ["apps[0] (vale): access must be an object"]);
});

test("access needs platform.auth and a Cloud Run app", () => {
  assert.deepEqual(problems((r) => delete r.platform.auth), ["apps[0] (vale): access needs platform.auth (the platform sign-in that issues the groups claim)"]);
  for (const kind of ["external", "firebase-hosting"])
    assert.deepEqual(problems((r) => (app(r, "vale").web.kind = kind)), ['apps[0] (vale): access needs web.kind "cloud-run" (the gateway door forwards to a Cloud Run service)']);
  const onTopology = problems((r) => (app(r, "topology").access = { groups: ["owner"] }));
  assert.deepEqual(onTopology, [], "any Cloud Run app may declare access");
});

test("platform.auth: fields, types and limits", () => {
  const auth = (edit) => problems((r) => edit(r.platform.auth));
  for (const hours of [1, 168]) assert.deepEqual(auth((a) => (a.sessionHours = hours)), []);
  assert.deepEqual(auth((a) => delete a.note), [], "note is optional");
  const cases = [
    [(a) => (a.enabled = "yes"), "auth.enabled must be a boolean"],
    [(a) => (a.provider = "google"), 'auth.provider must be "firebase" (got "google")'],
    [(a) => (a.projectId = "Researcher-455022"), 'auth.projectId must match ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ (got "Researcher-455022")'],
    [(a) => (a.projectId = "abcde"), 'auth.projectId must match ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ (got "abcde")'],
    [(a) => (a.projectId = "researcher-"), 'auth.projectId must match ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ (got "researcher-")'],
    [(a) => (a.projectId = `p${"a".repeat(30)}`), `auth.projectId must match ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ (got "p${"a".repeat(30)}")`],
    [(a) => (a.sessionHours = 0), "auth.sessionHours must be an integer from 1 to 168 (got 0)"],
    [(a) => (a.sessionHours = 169), "auth.sessionHours must be an integer from 1 to 168 (got 169)"],
    [(a) => (a.sessionHours = 1.5), "auth.sessionHours must be an integer from 1 to 168 (got 1.5)"],
    [(a) => (a.sessionHours = "12"), 'auth.sessionHours must be an integer from 1 to 168 (got "12")'],
    [(a) => (a.note = "x".repeat(201)), "auth.note must be at most 200 characters (got 201)"],
    [(a) => (a.mode = "strict"), "auth.mode is not in the schema"],
    [(a) => delete a.projectId, "auth.projectId is required"],
    [(a) => delete a.enabled, "auth.enabled is required"],
  ];
  for (const [edit, expected] of cases) assert.deepEqual(auth(edit), [`platform: ${expected}`]);
  assert.deepEqual(problems((r) => (r.platform.auth = "on")), ["platform: auth must be an object", 'apps[0] (vale): access needs platform.auth (the platform sign-in that issues the groups claim)']);
});

test("platform.auth.groups: 1 to 16 profiles, unique ids, text limits counted in code points", () => {
  const group = (i, edit) => problems((r) => edit(r.platform.auth.groups[i]));
  assert.equal(chars("👑"), 1, "an emoji is one character, as JSON Schema counts");
  assert.deepEqual(group(0, (g) => (g.emblem = "👑".repeat(8))), [], "8 emoji fit (16 UTF-16 units)");
  assert.deepEqual(group(0, (g) => (g.emblem = "")), [], "an empty emblem is allowed");
  const cases = [
    [(g) => (g.emblem = "👑".repeat(9)), "auth.groups[0].emblem must be at most 8 characters (got 9)"],
    [(g) => (g.name = "n".repeat(41)), "auth.groups[0].name must be at most 40 characters (got 41)"],
    [(g) => (g.name = "  "), "auth.groups[0].name must not be empty"],
    [(g) => (g.description = "d".repeat(161)), "auth.groups[0].description must be at most 160 characters (got 161)"],
    [(g) => (g.color = "gold"), "auth.groups[0].color is not in the schema"],
    [(g) => delete g.emblem, "auth.groups[0].emblem is required"],
  ];
  for (const [edit, expected] of cases) assert.deepEqual(group(0, edit), [`platform: ${expected}`]);
  const renamed = problems((r) => (r.platform.auth.groups[0].id = "Owner"));
  assert.deepEqual(renamed, [
    "platform: auth.groups[0].id must match ^[a-z][a-z0-9-]{1,30}$",
    'apps[0] (vale): access.groups "owner" is not declared in platform.auth.groups (declared: Owner, vale)',
  ]);
  const twice = problems((r) => (r.platform.auth.groups[1].id = "owner"));
  assert.equal(twice[0], 'platform: auth.groups[1].id "owner" is already used by auth.groups[0]');
  const none = problems((r) => {
    r.platform.auth.groups = [];
    app(r, "vale").access.groups = [];
  });
  assert.deepEqual(none, ["platform: auth.groups must list 1 to 16 groups (got 0)"]);
  const many = problems((r) => {
    r.platform.auth.groups = Array.from({ length: 17 }, (_, i) => ({ id: `g${i}x`, name: `G${i}`, emblem: "", description: "d" }));
    app(r, "vale").access.groups = ["g0x"];
  });
  assert.deepEqual(many, ["platform: auth.groups must list 1 to 16 groups (got 17)"]);
});

test("the door is active only while platform.auth.enabled and platform.gateway.enabled are both true", () => {
  const registry = load(AUTH_FIXTURE);
  assert.equal(doorActive(registry.platform), true);
  assert.deepEqual(unguardedApps(registry), []);
  registry.platform.auth.enabled = false;
  assert.equal(doorActive(registry.platform), false);
  assert.deepEqual(unguardedApps(registry).map((a) => a.id), ["vale"]);
  assert.equal(doorActive(load(SAMPLE_FIXTURE).platform), false, "no auth block, no door");
});

test("the rules read their limits from the schema", () => {
  const auth = SCHEMA.properties.platform.properties.auth;
  assert.equal(auth.properties.provider.const, "firebase");
  assert.deepEqual([auth.properties.sessionHours.minimum, auth.properties.sessionHours.maximum], [1, 168]);
  assert.deepEqual([auth.properties.groups.minItems, auth.properties.groups.maxItems], [1, 16]);
  const access = SCHEMA.$defs.app.properties.access;
  assert.equal(access.properties.groups.items.pattern, SCHEMA.$defs.group.properties.id.pattern, "access names groups by the group id grammar");
  assert.equal(access.properties.groups.uniqueItems, true);
  assert.deepEqual(SCHEMA.$defs.app.then.properties.web.properties.kind, { const: "cloud-run" });
  assert.deepEqual(SCHEMA.then.properties.platform.required, ["auth"]);
});
