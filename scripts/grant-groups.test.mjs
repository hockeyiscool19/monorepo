// Self-tests for scripts/grant-groups.mjs. Run: `node --test scripts/*.test.mjs` (what ci.yml runs).
// No network and no gcloud: an in-memory fake answers the three Identity Toolkit calls (accounts:lookup,
// accounts:update, accounts:batchGet) and records every request; `exec` is a stub. The registry is the frozen
// scripts/fixtures/registry.auth.json (groups owner and vale, sessionHours 12), never the real one.
import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UsageError, explain, main, parseArgs } from "./grant-groups.mjs";
import { claimsWithGroups, nextGroups } from "./lib/groups-claim.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REGISTRY = join(here, "fixtures", "registry.auth.json");
const TOKEN = "ya29.a-secret-access-token";
const PROD = "https://identitytoolkit.googleapis.com/v1/projects/researcher-455022/accounts";

const JORDAN = { localId: "uid-jordan", email: "jordan@example.com", emailVerified: true };
const FRIEND = { localId: "uid-friend", email: "friend@example.com", emailVerified: true, customAttributes: '{"tier":"gold","groups":["vale"]}' };
const STRANGER = { localId: "uid-stranger", email: "stranger@example.com", emailVerified: false };
const NO_EMAIL = { localId: "uid-phone" };

/** The fake Identity Toolkit: a user store keyed by localId, pages of `pageSize`, optional `fail(url, init)` override. */
function fakeToolkit(users, { pageSize = 2, fail } = {}) {
  const store = new Map(users.map((u) => [u.localId, structuredClone(u)]));
  const requests = [];
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  async function fetch(url, init = {}) {
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ method: init.method, url, headers: init.headers, body });
    const failure = fail?.(url, init);
    if (failure) return failure;
    const u = new URL(url);
    const verb = u.pathname.match(/\/projects\/[^/]+\/accounts:(lookup|update|batchGet)$/)?.[1];
    if (verb === "lookup") {
      const found = [...store.values()].filter((x) => (body.email ? x.email?.toLowerCase() === body.email[0].toLowerCase() : x.localId === body.localId[0]));
      return json(200, found.length ? { kind: "identitytoolkit#GetAccountInfoResponse", users: structuredClone(found) } : { kind: "identitytoolkit#GetAccountInfoResponse" });
    }
    if (verb === "update") {
      const user = store.get(body.localId);
      if (!user) return json(400, { error: { code: 400, message: "USER_NOT_FOUND" } });
      user.customAttributes = body.customAttributes;
      return json(200, { kind: "identitytoolkit#SetAccountInfoResponse", localId: body.localId });
    }
    if (verb === "batchGet") {
      const all = [...store.values()].sort((a, b) => a.localId.localeCompare(b.localId));
      const start = Number(u.searchParams.get("nextPageToken") ?? 0);
      const next = start + pageSize < all.length ? String(start + pageSize) : undefined;
      return json(200, { kind: "identitytoolkit#DownloadAccountResponse", users: structuredClone(all.slice(start, start + pageSize)), ...(next ? { nextPageToken: next } : {}) });
    }
    return json(404, { error: { code: 404, message: "NOT_FOUND" } });
  }
  return { fetch, store, requests };
}

const noGcloud = () => {
  throw new Error("gcloud must not run in this test");
};
/** main() in-process against the fake; errors become exit 1 plus the CLI's one line, as when run from a shell. */
async function run(argv, users = [JORDAN, FRIEND, STRANGER, NO_EMAIL], { env = { GOOGLE_OAUTH_ACCESS_TOKEN: TOKEN }, exec = noGcloud, ...fake } = {}) {
  const tk = fakeToolkit(users, fake);
  const lines = [];
  let code;
  try {
    code = await main(["--registry", REGISTRY, ...argv], { env, fetch: tk.fetch, exec, log: (line) => lines.push(line) });
  } catch (err) {
    code = 1;
    lines.push(explain(err, argv));
  }
  const claims = (id) => JSON.parse(tk.store.get(id).customAttributes ?? "{}");
  return { code, lines, out: lines.join("\n"), claims, ...tk };
}
const updates = (r) => r.requests.filter((q) => q.url.endsWith("accounts:update"));

test("--add grants a declared group, keeps the other claims, and calls production billed to the project", async () => {
  const r = await run(["--email", "friend@example.com", "--add", "owner"]);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.claims("uid-friend"), { tier: "gold", groups: ["owner", "vale"] });
  assert.equal(r.lines[0], "grant-groups: project researcher-455022 (production) — friend@example.com (uid uid-friend, email verified)");
  assert.equal(r.lines[1], "  groups: vale → owner, vale (👑 Jarl’s Court, 🌿 Vale Circle)");
  assert.equal(r.lines[2], "  written.");
  assert.match(r.out, /sign out and back in/);
  assert.match(r.out, /up to 12 h \(platform\.auth\.sessionHours\)/);
  assert.deepEqual(r.requests.map((q) => `${q.method} ${q.url}`), [`POST ${PROD}:lookup`, `POST ${PROD}:update`]);
  for (const q of r.requests) {
    assert.equal(q.headers.authorization, `Bearer ${TOKEN}`);
    assert.equal(q.headers["x-goog-user-project"], "researcher-455022");
  }
  assert.deepEqual(r.requests[0].body, { email: ["friend@example.com"] });
  assert.equal(r.requests[1].body.localId, "uid-friend");
  assert.ok(!r.out.includes(TOKEN), "the token is never printed");
});

test("--set orders groups as the registry does; --set '' and --remove drop the claim but keep the others", async () => {
  const set = await run(["--uid", "uid-jordan", "--set", "vale,owner"]);
  assert.equal(set.code, 0, set.out);
  assert.deepEqual(set.claims("uid-jordan"), { groups: ["owner", "vale"] });
  assert.deepEqual(set.requests[0].body, { localId: ["uid-jordan"] });
  const cleared = await run(["--email", "friend@example.com", "--set", ""]);
  assert.equal(cleared.code, 0, cleared.out);
  assert.equal(cleared.store.get("uid-friend").customAttributes, '{"tier":"gold"}');
  assert.match(cleared.out, /groups: vale → none/);
  const removed = await run(["--email", "friend@example.com", "--remove", "vale"]);
  assert.equal(removed.store.get("uid-friend").customAttributes, '{"tier":"gold"}');
});

test("group ids the registry does not declare are rejected before any call", async () => {
  const r = await run(["--email", "jordan@example.com", "--add", "vale,court"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /^grant-groups: court is not declared in platform\.auth\.groups \(declared: owner, vale\)/);
  assert.equal(r.requests.length, 0);
});

test("--dry-run prints the change and writes nothing; an unchanged set writes nothing either", async () => {
  const dry = await run(["--email", "jordan@example.com", "--set", "owner,vale", "--dry-run"]);
  assert.equal(dry.code, 0, dry.out);
  assert.deepEqual(dry.lines.slice(1), ["  groups: none → owner, vale (👑 Jarl’s Court, 🌿 Vale Circle)", "  dry run — nothing written"]);
  assert.equal(updates(dry).length, 0);
  const same = await run(["--email", "friend@example.com", "--add", "vale"]);
  assert.equal(same.lines[1], "  groups: vale (unchanged; nothing written)");
  assert.equal(updates(same).length, 0);
});

test("granting to an unverified or email-less account is refused unless --allow-unverified; removing is allowed", async () => {
  const refused = await run(["--email", "stranger@example.com", "--add", "vale"]);
  assert.equal(refused.code, 1);
  assert.match(refused.out, /grant-groups: refused: stranger@example\.com is not verified, and anyone can sign up with an address they do not own/);
  assert.equal(updates(refused).length, 0);
  const allowed = await run(["--email", "stranger@example.com", "--add", "vale", "--allow-unverified"]);
  assert.equal(allowed.code, 0, allowed.out);
  assert.deepEqual(allowed.claims("uid-stranger"), { groups: ["vale"] });
  const holder = { ...STRANGER, customAttributes: '{"groups":["vale"]}' };
  const removal = await run(["--email", "stranger@example.com", "--remove", "vale"], [holder]);
  assert.equal(removal.code, 0, removal.out);
  assert.deepEqual(removal.claims("uid-stranger"), {});
  const phone = await run(["--uid", "uid-phone", "--add", "owner"]);
  assert.match(phone.out, /refused: the account has no email/);
});

test("--show (also the default action) prints groups with their profiles and flags undeclared ones", async () => {
  const stale = { ...JORDAN, customAttributes: '{"groups":["vale","old-guild"]}', disabled: true };
  const r = await run(["--email", "jordan@example.com"], [stale]);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.lines, [
    "grant-groups: project researcher-455022 (production) — jordan@example.com (uid uid-jordan, email verified, disabled)",
    "  groups: vale, old-guild (🌿 Vale Circle)",
    "  note: old-guild is not declared in platform.auth.groups and opens nothing; drop with --set <groups to keep>",
  ]);
  assert.equal(updates(r).length, 0);
});

test("--list pages through accounts:batchGet", async () => {
  const users = [JORDAN, FRIEND, STRANGER, NO_EMAIL, { localId: "uid-z", email: "z@example.com", emailVerified: true, customAttributes: '{"groups":["old"]}' }];
  const r = await run(["--list"], users);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.lines, [
    "grant-groups: project researcher-455022 (production) — 5 account(s)",
    "  uid-friend  friend@example.com  groups: vale",
    "  uid-jordan  jordan@example.com  groups: none",
    "  uid-phone  (no email)  groups: none",
    "  uid-stranger  stranger@example.com [unverified]  groups: none",
    "  uid-z  z@example.com  groups: old (not declared: old)",
  ]);
  assert.deepEqual(r.requests.map((q) => new URL(q.url).search), ["?maxResults=500", "?maxResults=500&nextPageToken=2", "?maxResults=500&nextPageToken=4"]);
});

test("--emulator: emulator base URL and admin bearer, never gcloud; host from the flag, the variable, or the default", async () => {
  const base = (host) => `http://${host}/identitytoolkit.googleapis.com/v1/projects/researcher-455022/accounts:lookup`;
  const plain = await run(["--emulator", "--email", "jordan@example.com", "--set", "owner"], undefined, { env: {} });
  assert.equal(plain.code, 0, plain.out);
  assert.equal(plain.requests[0].url, base("127.0.0.1:9099"));
  assert.equal(plain.requests[0].headers.authorization, "Bearer owner");
  assert.match(plain.lines[0], /\(emulator 127\.0\.0\.1:9099\)/);
  const flag = await run(["--emulator", "localhost:9199", "--email", "jordan@example.com"], undefined, { env: {} });
  assert.equal(flag.requests[0].url, base("localhost:9199"));
  const fromEnv = await run(["--emulator", "--list"], undefined, { env: { FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9299" } });
  assert.match(fromEnv.requests[0].url, /^http:\/\/127\.0\.0\.1:9299\//);
});

test("FIREBASE_AUTH_EMULATOR_HOST without --emulator is refused, so an emulator shell never writes production", async () => {
  const r = await run(["--email", "jordan@example.com", "--add", "owner"], undefined, { env: { FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", GOOGLE_OAUTH_ACCESS_TOKEN: TOKEN } });
  assert.equal(r.code, 1);
  assert.match(r.out, /FIREBASE_AUTH_EMULATOR_HOST is set \(127\.0\.0\.1:9099\) but --emulator was not passed/);
  assert.equal(r.requests.length, 0);
});

test("production token from gcloud when GOOGLE_OAUTH_ACCESS_TOKEN is unset; a gcloud failure explains itself", async () => {
  const calls = [];
  const gcloud = (cmd, args) => {
    calls.push([cmd, ...args]);
    return "tok-from-gcloud\n";
  };
  const r = await run(["--email", "jordan@example.com"], undefined, { env: {}, exec: gcloud });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(calls, [["gcloud", "auth", "print-access-token"]]);
  assert.equal(r.requests[0].headers.authorization, "Bearer tok-from-gcloud");
  assert.ok(!r.out.includes("tok-from-gcloud"));
  const broken = () => {
    throw Object.assign(new Error("Command failed"), { stderr: "ERROR: (gcloud.auth.print-access-token) You do not currently have an active account selected.\n" });
  };
  const failed = await run(["--email", "jordan@example.com"], undefined, { env: {}, exec: broken });
  assert.equal(failed.code, 1);
  assert.match(failed.out, /could not get an access token from gcloud \(ERROR: .*active account selected\.\): run `gcloud auth login`/);
});

test("lookups that find no account, or several, stop with a clear line", async () => {
  const none = await run(["--email", "nobody@example.com", "--add", "vale"]);
  assert.match(none.out, /no account with email nobody@example\.com in project researcher-455022: they sign up first/);
  const twins = [{ ...JORDAN }, { ...JORDAN, localId: "uid-twin" }];
  const two = await run(["--email", "jordan@example.com", "--add", "vale"], twins);
  assert.match(two.out, /2 accounts share email jordan@example\.com; name one with --uid/);
  assert.equal(updates(two).length, 0);
});

test("HTTP errors carry Google's reason and a permission hint in production, never the token", async () => {
  const denied = () => new Response(JSON.stringify({ error: { code: 403, message: "PERMISSION_DENIED: Caller does not have required permission" } }), { status: 403 });
  const r = await run(["--email", "jordan@example.com", "--add", "owner"], undefined, { fail: denied });
  assert.equal(r.code, 1);
  assert.match(r.out, /Identity Toolkit accounts:lookup → 403 PERMISSION_DENIED: Caller does not have required permission — the gcloud account needs Firebase Authentication Admin/);
  assert.ok(!r.out.includes(TOKEN));
  const down = () => {
    throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
  };
  const offline = await run(["--emulator", "--list"], undefined, { env: {}, fail: down });
  assert.match(offline.out, /accounts:batchGet → unreachable \(ECONNREFUSED; is the Auth emulator running\?\)/);
});

test("claims that are not an object, or a groups claim that is not a list, are never overwritten", async () => {
  for (const [customAttributes, reason] of [["not json", /not valid JSON/], ["[1]", /not a JSON object/], ['{"groups":"owner"}', /groups claim is not an array of strings/]]) {
    const r = await run(["--email", "jordan@example.com", "--add", "owner"], [{ ...JORDAN, customAttributes }]);
    assert.equal(r.code, 1);
    assert.match(r.out, reason);
    assert.equal(updates(r).length, 0);
  }
});

test("a custom-claims payload over 1000 bytes is refused", async () => {
  const big = { ...JORDAN, customAttributes: JSON.stringify({ notes: "n".repeat(975) }) };
  const r = await run(["--email", "jordan@example.com", "--add", "owner,vale"], [big]);
  assert.equal(r.code, 1);
  assert.match(r.out, /the custom claims would be 1013 bytes; Firebase allows 1000/);
  assert.equal(updates(r).length, 0);
  assert.throws(() => claimsWithGroups({ notes: "n".repeat(990) }, ["owner"]), /Firebase allows 1000/);
});

test("--project overrides the registry's project id; a malformed one is rejected", async () => {
  const r = await run(["--project", "other-project-1", "--email", "jordan@example.com"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.requests[0].url, /\/projects\/other-project-1\/accounts:lookup$/);
  assert.equal(r.requests[0].headers["x-goog-user-project"], "other-project-1");
  const bad = await run(["--project", "Not_A_Project", "--list"]);
  assert.match(bad.out, /--project "Not_A_Project" is not a project id/);
});

test("argument errors", () => {
  const cases = [
    [[], /pass --email <e> or --uid <u> with --set\/--add\/--remove\/--show, or --list/],
    [["--email", "a@b.c", "--uid", "u"], /not both/],
    [["--list", "--email", "a@b.c"], /--list takes no --email/],
    [["--add", "vale"], /--add needs --email <e> or --uid <u>/],
    [["--email", "a@b.c", "--add", ""], /--add needs at least one group id/],
    [["--email", "a@b.c", "--add", "vale", "--remove", "owner"], /pass one action, not both --add and --remove/],
    [["--email", "a@b.c", "--set"], /--set needs a value/],
    [["--email", "--show"], /--email needs a value/],
    [["--email", "a@b.c", "--grant", "vale"], /unknown argument --grant/],
  ];
  for (const [argv, message] of cases) assert.throws(() => parseArgs(argv, {}), (err) => err instanceof UsageError && message.test(err.message), argv.join(" "));
});

test("nextGroups: registry order first, then groups the registry no longer declares (kept unless removed)", () => {
  const declared = ["owner", "vale"];
  assert.deepEqual(nextGroups(["old", "vale"], "add", ["owner"], declared), ["owner", "vale", "old"]);
  assert.deepEqual(nextGroups(["old", "vale"], "remove", ["vale"], declared), ["old"]);
  assert.deepEqual(nextGroups(["old", "vale"], "set", ["vale"], declared), ["vale"]);
});
