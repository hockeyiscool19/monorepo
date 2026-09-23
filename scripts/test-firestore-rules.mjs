#!/usr/bin/env node
// Prove firestore.rules against the local Firestore emulator. Zero dependencies (Node ≥ 20 fetch); never production.
//
//   firebase emulators:exec --only firestore --project researcher-455022 'node scripts/test-firestore-rules.mjs'
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node scripts/test-firestore-rules.mjs     (an emulator you started yourself)
//   options: --project <id> (default: platform.auth.projectId from the registry) · --rules <path> (default firestore.rules)
//
// It loads the rules file into the emulator (PUT /emulator/v1/projects/<p>:securityRules), clears the database, seeds
// through the emulator's admin bypass (`Authorization: Bearer owner`), then calls the Firestore REST API as different
// people — unsigned emulator ID tokens whose `groups` claim varies — and checks every allow and deny it expects:
// 200 for an allow, 403 PERMISSION_DENIED for a deny. One line per check; exit 1 on any unexpected answer.
// Not named *.test.mjs on purpose: it needs Java and the emulator, which `node --test scripts/*.test.mjs` (CI) does not.
// Refuses a FIRESTORE_EMULATOR_HOST that is not a loopback address.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const registry = JSON.parse(readFileSync(join(ROOT, "registry", "registry.json"), "utf8"));
const PROJECT = arg("--project", registry.platform?.auth?.projectId ?? "researcher-455022");
const RULES = arg("--rules", join(ROOT, "firestore.rules"));
const HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085";
if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(HOST)) throw new Error(`FIRESTORE_EMULATOR_HOST=${HOST} is not a loopback emulator; refusing`);
const DOCS = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

// People, as the emulator sees their ID tokens. ADMIN bypasses the rules (emulator-only), for seeding.
const ADMIN = "owner";
const person = (uid, claims) => ({ uid, claims });
const OWNER = person("owner-uid", { groups: ["owner"] });
const OWNER2 = person("owner-two", { groups: ["vale", "owner"] });
const VALE = person("vale-uid", { groups: ["vale"] });
const PLAIN = person("plain-uid", {});
const STRINGY = person("stringy-uid", { groups: "owner" });
const ANON = null;

function bearer(who) {
  if (who === ANON) return {};
  if (who === ADMIN) return { authorization: "Bearer owner" };
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const claims = {
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, iat: now, exp: now + 3600, auth_time: now,
    sub: who.uid, user_id: who.uid, email: `${who.uid}@example.test`, email_verified: true,
    firebase: { sign_in_provider: "password", identities: {} }, ...who.claims,
  };
  return { authorization: `Bearer ${b64({ alg: "none", kid: "fakekid", typ: "JWT" })}.${b64(claims)}.` };
}

// JS → Firestore REST values. Integers become integerValue; `dbl(n)` forces a double (2.0 is not an int to the rules).
const dbl = (n) => ({ $double: n });
function value(v) {
  if (v === null) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(value) } : {} };
  if (typeof v === "object" && "$double" in v) return { doubleValue: v.$double };
  if (typeof v === "object") return { mapValue: { fields: fields(v) } };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
}
const fields = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, value(v)]));

async function call(method, url, who, body) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json", ...bearer(who) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}
const split = (path) => ({ parent: path.slice(0, path.lastIndexOf("/")), id: path.slice(path.lastIndexOf("/") + 1) });
const create = (who, path, data) => call("POST", `${DOCS}/${split(path).parent}?documentId=${split(path).id}`, who, { fields: fields(data) });
const set = (who, path, data) => call("PATCH", `${DOCS}/${path}`, who, { fields: fields(data) });
const update = (who, path, partial) => {
  const mask = Object.keys(partial).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  return call("PATCH", `${DOCS}/${path}?${mask}&currentDocument.exists=true`, who, { fields: fields(partial) });
};
const get = (who, path) => call("GET", `${DOCS}/${path}`, who);
const list = (who, collection) => call("GET", `${DOCS}/${collection}`, who);
const query = (who) => call("POST", `${DOCS}/boards/getaway:runQuery`, who, { structuredQuery: { from: [{ collectionId: "cards" }] } });
const remove = (who, path) => call("DELETE", `${DOCS}/${path}`, who);

let checks = 0;
const failures = [];
/** Run one operation and compare: allow → 200, deny → 403. */
async function expect(outcome, label, operation) {
  const { status, text } = await operation;
  const want = outcome === "allow" ? 200 : 403;
  checks++;
  const ok = status === want;
  console.log(`${ok ? "✓" : "✗"} ${outcome.padEnd(5)} ${label}${ok ? "" : `  (got ${status}: ${text.slice(0, 200).replace(/\s+/g, " ")})`}`);
  if (!ok) failures.push(label);
}
async function must(label, operation) {
  const { status, text } = await operation;
  if (status !== 200) throw new Error(`${label}: ${status} ${text.slice(0, 300)}`);
}

const T0 = new Date("2026-09-23T12:00:00Z");
const T1 = new Date("2026-09-24T08:30:00Z");
const BOARD = "boards/getaway";
const CARDS = `${BOARD}/cards`;
const card = (over = {}) => ({
  key: "GET-1", number: 1, title: "Drawing board", description: "", type: "idea", priority: "medium", status: "backlog",
  labels: [], createdAt: T0, updatedAt: T0, completedAt: null, createdBy: OWNER.uid, ...over,
});
const without = (obj, key) => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));
let n = 0;
const fresh = () => `${CARDS}/c${++n}`;

async function main() {
  const rules = readFileSync(RULES, "utf8");
  await must("load rules", call("PUT", `http://${HOST}/emulator/v1/projects/${PROJECT}:securityRules`, ANON, { rules: { files: [{ name: "firestore.rules", content: rules }] } }));
  await must("clear data", call("DELETE", `http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, ANON));
  console.log(`firestore.rules → emulator ${HOST}, project ${PROJECT}`);
  await must("seed board", set(ADMIN, BOARD, { nextNumber: 1, updatedAt: T0 }));

  console.log("\n# boards/getaway: owner only, {nextNumber int ≥ 1, updatedAt timestamp}");
  for (const [who, name] of [[ANON, "signed out"], [PLAIN, "signed in, no groups"], [VALE, "group vale only"], [STRINGY, "groups claim is a string"]])
    await expect("deny", `${name} reads the board`, get(who, BOARD));
  await expect("allow", "owner reads the board", get(OWNER, BOARD));
  await expect("allow", "owner advances nextNumber", set(OWNER, BOARD, { nextNumber: 2, updatedAt: T1 }));
  await expect("allow", "owner updates nextNumber alone (merge keeps updatedAt)", update(OWNER, BOARD, { nextNumber: 3 }));
  await expect("deny", "vale member writes the board", set(VALE, BOARD, { nextNumber: 9, updatedAt: T1 }));
  await expect("deny", "signed-out write to the board", set(ANON, BOARD, { nextNumber: 9, updatedAt: T1 }));
  for (const [data, why] of [
    [{ nextNumber: 0, updatedAt: T1 }, "nextNumber 0"], [{ nextNumber: "4", updatedAt: T1 }, "nextNumber as a string"],
    [{ nextNumber: dbl(4), updatedAt: T1 }, "nextNumber as a double 4.0"], [{ nextNumber: 4, updatedAt: "now" }, "updatedAt as a string"],
    [{ nextNumber: 4 }, "no updatedAt"], [{ nextNumber: 4, updatedAt: T1, owner: "me" }, "an extra key"],
  ]) await expect("deny", `owner writes the board with ${why}`, set(OWNER, BOARD, data));
  await expect("allow", "owner deletes the board", remove(OWNER, BOARD));
  await expect("allow", "owner creates the board", create(OWNER, BOARD, { nextNumber: 1, updatedAt: T0 }));
  await expect("deny", "owner creates another board (boards/other)", create(OWNER, "boards/other", { nextNumber: 1, updatedAt: T0 }));
  await expect("deny", "owner lists the boards collection", list(OWNER, "boards"));

  console.log("\n# cards: read and delete owner only; create/update validated");
  await expect("allow", "owner creates a valid card", create(OWNER, `${CARDS}/c0`, card()));
  await expect("allow", "owner reads a card", get(OWNER, `${CARDS}/c0`));
  await expect("allow", "owner lists the cards", list(OWNER, CARDS));
  await expect("allow", "owner queries the cards", query(OWNER));
  for (const [who, name] of [[ANON, "signed out"], [PLAIN, "no groups"], [VALE, "vale only"], [STRINGY, "string groups claim"]]) {
    await expect("deny", `${name}: read a card`, get(who, `${CARDS}/c0`));
    await expect("deny", `${name}: list the cards`, list(who, CARDS));
    await expect("deny", `${name}: create a card`, create(who, fresh(), card({ createdBy: who?.uid ?? "nobody" })));
  }
  await expect("deny", "vale member queries the cards", query(VALE));
  await expect("deny", "owner creates a card in someone else's name", create(OWNER, fresh(), card({ createdBy: OWNER2.uid })));
  await expect("allow", "a second owner creates a card in their own name", create(OWNER2, fresh(), card({ createdBy: OWNER2.uid })));
  for (const key of Object.keys(card())) await expect("deny", `card without ${key}`, create(OWNER, fresh(), without(card(), key)));
  await expect("deny", "card with an extra key (assignee)", create(OWNER, fresh(), card({ assignee: "x" })));
  for (const key of ["GET-", "get-1", "GET-1234567", "XGET-1", "GET-12a", "GET-1 ", 12])
    await expect("deny", `key ${JSON.stringify(key)}`, create(OWNER, fresh(), card({ key })));
  await expect("allow", 'key "GET-123456"', create(OWNER, fresh(), card({ key: "GET-123456", number: 123456 })));
  for (const number of [0, -1, 1.5, dbl(3), "3"]) await expect("deny", `number ${JSON.stringify(number)}`, create(OWNER, fresh(), card({ number })));
  await expect("deny", "empty title", create(OWNER, fresh(), card({ title: "" })));
  await expect("deny", "title of 121 characters", create(OWNER, fresh(), card({ title: "t".repeat(121) })));
  await expect("allow", "title of 120 characters", create(OWNER, fresh(), card({ title: "t".repeat(120) })));
  // What size() counts, so the portal can mirror it: UTF-16 code units, the same as JavaScript's string.length
  // (an emoji outside the BMP counts 2, an "é" counts 1).
  await expect("allow", 'title of 120 "é" (120 UTF-16 units, 240 UTF-8 bytes)', create(OWNER, fresh(), card({ title: "é".repeat(120) })));
  await expect("allow", "title of 60 emoji (120 UTF-16 units)", create(OWNER, fresh(), card({ title: "🏔".repeat(60) })));
  await expect("deny", "title of 61 emoji (122 UTF-16 units)", create(OWNER, fresh(), card({ title: "🏔".repeat(61) })));
  await expect("deny", "description of 2001 characters", create(OWNER, fresh(), card({ description: "d".repeat(2001) })));
  await expect("allow", "description of 2000 characters", create(OWNER, fresh(), card({ description: "d".repeat(2000) })));
  for (const [field, good, bad] of [
    ["type", ["idea", "feature", "fix", "chore"], ["bug", "Idea", 1]],
    ["priority", ["lowest", "low", "medium", "high", "highest"], ["urgent", ""]],
    ["status", ["backlog", "todo", "doing", "done"], ["blocked", "Done"]],
  ]) {
    for (const v of good) await expect("allow", `${field} ${JSON.stringify(v)}`, create(OWNER, fresh(), card({ [field]: v })));
    for (const v of bad) await expect("deny", `${field} ${JSON.stringify(v)}`, create(OWNER, fresh(), card({ [field]: v })));
  }
  await expect("allow", "five string labels", create(OWNER, fresh(), card({ labels: ["a", "b", "c", "d", "e"] })));
  for (const labels of [["a", "b", "c", "d", "e", "f"], [1], ["a", 2], ["a", "b", "c", "d", 5], "a", null])
    await expect("deny", `labels ${JSON.stringify(labels)}`, create(OWNER, fresh(), card({ labels })));
  await expect("allow", "completedAt as a timestamp", create(OWNER, fresh(), card({ status: "done", completedAt: T1 })));
  for (const [field, v] of [["createdAt", "2026-09-23"], ["updatedAt", 0], ["completedAt", "yesterday"], ["completedAt", 0], ["createdBy", 42]])
    await expect("deny", `${field} ${JSON.stringify(v)}`, create(OWNER, fresh(), card({ [field]: v })));

  console.log("\n# card updates: key, number, createdAt, createdBy are immutable");
  const u = fresh();
  await must("seed card", set(ADMIN, u, card()));
  await expect("allow", "owner moves a card to doing (partial update)", update(OWNER, u, { status: "doing", updatedAt: T1 }));
  await expect("allow", "owner completes a card", update(OWNER, u, { status: "done", completedAt: T1, updatedAt: T1 }));
  await expect("allow", "another owner edits the title", update(OWNER2, u, { title: "Cork board", updatedAt: T1 }));
  await expect("allow", "owner rewrites the whole card keeping its identity", set(OWNER, u, card({ title: "Sticky notes", labels: ["colorado"], updatedAt: T1 })));
  for (const [field, v] of [["key", "GET-2"], ["number", 2], ["createdAt", T1], ["createdBy", OWNER2.uid]])
    await expect("deny", `owner changes ${field}`, update(OWNER, u, { [field]: v }));
  await expect("deny", "owner2 re-attributes the card to themselves", update(OWNER2, u, { createdBy: OWNER2.uid }));
  await expect("deny", "owner blanks the title", update(OWNER, u, { title: "" }));
  await expect("deny", "owner adds an extra field", update(OWNER, u, { assignee: "x" }));
  await expect("deny", "owner removes a field (labels)", call("PATCH", `${DOCS}/${u}?updateMask.fieldPaths=labels`, OWNER, { fields: {} }));
  await expect("deny", "vale member updates a card", update(VALE, u, { title: "mine" }));
  await expect("deny", "signed-out update", update(ANON, u, { title: "mine" }));

  console.log("\n# deletes and everything else");
  await expect("deny", "vale member deletes a card", remove(VALE, u));
  await expect("deny", "signed-out delete", remove(ANON, u));
  await expect("allow", "owner deletes a card", remove(OWNER, u));
  await must("seed a user doc", set(ADMIN, "users/x", { name: "x" }));
  await expect("deny", "owner reads users/x", get(OWNER, "users/x"));
  await expect("deny", "owner writes users/y", create(OWNER, "users/y", { name: "y" }));
  await expect("deny", "owner writes boards/getaway/notes/n1", create(OWNER, `${BOARD}/notes/n1`, { text: "x" }));
  await expect("deny", "owner writes a card's subcollection", create(OWNER, `${CARDS}/c0/comments/m1`, { text: "x" }));

  console.log(`\nfirestore.rules: ${checks} checks, ${checks - failures.length} as expected${failures.length ? `, ${failures.length} unexpected` : ""}`);
  if (failures.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`test-firestore-rules: ${err.message}`);
  process.exitCode = 1;
});
