#!/usr/bin/env node
// Jordan's admin tool for platform groups: the Firebase custom claim `groups` (docs/runbooks/platform-auth.md).
// Zero dependencies; Node ≥ 20.
//
//   node scripts/grant-groups.mjs --email <e> | --uid <u>   --set owner,vale | --add vale | --remove vale | --show
//   node scripts/grant-groups.mjs --list
//   options: --dry-run · --emulator [host:port] · --project <id> · --registry <path> · --allow-unverified
//
// Target: production Firebase Authentication of the registry's platform.auth.projectId (override with --project), or the
// local Auth emulator with --emulator (host: the flag's value, else FIREBASE_AUTH_EMULATOR_HOST, else 127.0.0.1:9099).
// Production calls carry an OAuth access token from GOOGLE_OAUTH_ACCESS_TOKEN or `gcloud auth print-access-token` (the
// caller needs Firebase Authentication Admin on the project) and bill the project (x-goog-user-project).
// Tokens are never printed.
//
// Rules:
// - Group ids must be declared in platform.auth.groups; the result lists them in registry order. `--set ''` clears.
// - Only the `groups` key of the account's custom claims changes; every other claim is kept. No groups = no key.
// - Granting (adding a group the account does not hold yet) to an account whose email is not verified is refused
//   unless --allow-unverified: anyone can sign up with an address they do not own. Removing is always allowed.
// - FIREBASE_AUTH_EMULATOR_HOST set without --emulator is refused, so an emulator shell never writes production.
// Prints the account, then `groups: before → after`. A new group applies from the person's next ID token (they sign
// out and back in); a door session sealed before the change keeps its groups until it expires (platform.auth.sessionHours).
// Exit 1 with a one-line reason on any error. Sets process.exitCode, never process.exit() (Node 24 on macOS can segfault in it).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { invokedDirectly } from "./lib/entry.mjs";
import { DEFAULT_REGISTRY } from "./lib/registry-io.mjs";
import { readAuth } from "./lib/auth-rules.mjs";
import { SCHEMA } from "./lib/schema.mjs";
import { DEFAULT_EMULATOR_HOST, IdentityToolkitError, connection, identityToolkit } from "./lib/identity-toolkit.mjs";
import { claimsWithGroups, grantsSomething, groupsOf, nextGroups, parseClaims, showGroups, splitIds, undeclared } from "./lib/groups-claim.mjs";

/** A mistake in the command line or a refusal; main() turns it into exit code 1 and one line. */
export class UsageError extends Error {}

const PROJECT_RE = new RegExp(SCHEMA.properties.platform.properties.auth.properties.projectId.pattern);
const HOST_PORT_RE = /^[A-Za-z0-9.-]+:\d+$|^\[[0-9a-fA-F:]+\]:\d+$/;
const RUNBOOK = "docs/runbooks/platform-auth.md";

/** Parse argv; `env` supplies FIREBASE_AUTH_EMULATOR_HOST. Throws UsageError. */
export function parseArgs(argv, env = {}) {
  const opts = { email: undefined, uid: undefined, action: undefined, ids: undefined, dryRun: false, emulator: undefined, project: undefined, registry: DEFAULT_REGISTRY, allowUnverified: false };
  const setAction = (action, ids) => {
    if (opts.action) throw new UsageError(`pass one action, not both --${opts.action} and --${action}`);
    opts.action = action;
    opts.ids = ids;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new UsageError(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === "--email") opts.email = value().trim();
    else if (arg === "--uid") opts.uid = value().trim();
    else if (arg === "--set" || arg === "--add" || arg === "--remove") setAction(arg.slice(2), splitIds(value()));
    else if (arg === "--show" || arg === "--list") setAction(arg.slice(2), undefined);
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--allow-unverified") opts.allowUnverified = true;
    else if (arg === "--project") opts.project = value();
    else if (arg === "--registry") opts.registry = value();
    else if (arg === "--emulator") opts.emulator = HOST_PORT_RE.test(argv[i + 1] ?? "") ? argv[++i] : env.FIREBASE_AUTH_EMULATOR_HOST || DEFAULT_EMULATOR_HOST;
    else throw new UsageError(`unknown argument ${arg}`);
  }
  const target = opts.email !== undefined || opts.uid !== undefined;
  if (opts.email !== undefined && opts.uid !== undefined) throw new UsageError("pass --email or --uid, not both");
  if (opts.email === "" || opts.uid === "") throw new UsageError("--email / --uid must not be empty");
  if (!opts.action) {
    if (!target) throw new UsageError("pass --email <e> or --uid <u> with --set/--add/--remove/--show, or --list");
    opts.action = "show";
  }
  if (opts.action === "list" && target) throw new UsageError("--list takes no --email / --uid");
  if (opts.action !== "list" && !target) throw new UsageError(`--${opts.action} needs --email <e> or --uid <u>`);
  if ((opts.action === "add" || opts.action === "remove") && opts.ids.length === 0) throw new UsageError(`--${opts.action} needs at least one group id`);
  if (!opts.emulator && env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new UsageError(`FIREBASE_AUTH_EMULATOR_HOST is set (${env.FIREBASE_AUTH_EMULATOR_HOST}) but --emulator was not passed: add --emulator, or unset the variable to change production accounts`);
  return opts;
}

/** An OAuth access token for production: GOOGLE_OAUTH_ACCESS_TOKEN, else `gcloud auth print-access-token`. */
export function accessToken(env, exec) {
  const fromEnv = env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  let out;
  try {
    out = exec("gcloud", ["auth", "print-access-token"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const detail = String(err?.stderr ?? err?.message ?? "").trim().split("\n")[0];
    throw new UsageError(`could not get an access token from gcloud${detail ? ` (${detail})` : ""}: run \`gcloud auth login\`, or set GOOGLE_OAUTH_ACCESS_TOKEN`);
  }
  const token = String(out ?? "").trim();
  if (!token) throw new UsageError("gcloud printed no access token: run `gcloud auth login`, or set GOOGLE_OAUTH_ACCESS_TOKEN");
  return token;
}

/** "a@b.c (uid X, email verified)" — never more than the admin needs to recognise the account. */
function describe(user) {
  const flags = [user.email ? (user.emailVerified === true ? "email verified" : "email NOT verified") : "no email"];
  if (user.disabled) flags.push("disabled");
  return `${user.email ?? "(no email)"} (uid ${user.localId}, ${flags.join(", ")})`;
}

/** " (👑 Jarl’s Court, 🌿 Vale Circle)" for declared groups. */
function profiles(groups, byId) {
  const names = groups.filter((g) => byId.has(g)).map((g) => `${byId.get(g).emblem ? `${byId.get(g).emblem} ` : ""}${byId.get(g).name}`);
  return names.length ? ` (${names.join(", ")})` : "";
}

function staleNote(groups, declared, log) {
  const stale = undeclared(groups, declared);
  if (stale.length)
    log(`  note: ${stale.join(", ")} ${stale.length === 1 ? "is" : "are"} not declared in platform.auth.groups and open${stale.length === 1 ? "s" : ""} nothing; drop with --set <groups to keep>`);
}

async function findAccount(api, opts, projectId) {
  const who = opts.email !== undefined ? `email ${opts.email}` : `uid ${opts.uid}`;
  const users = await api.lookup(opts.email !== undefined ? { email: opts.email } : { uid: opts.uid });
  if (users.length === 0) throw new UsageError(`no account with ${who} in project ${projectId}: they sign up first (${RUNBOOK}, step e)`);
  if (users.length > 1) throw new UsageError(`${users.length} accounts share ${who}; name one with --uid (see --list)`);
  return users[0];
}

async function listAccounts(api, where, declared, log) {
  const users = [];
  const seen = new Set();
  let pageToken;
  do {
    const page = await api.listPage(pageToken);
    users.push(...page.users);
    pageToken = page.nextPageToken;
    if (pageToken && seen.has(pageToken)) throw new Error("accounts:batchGet repeated a page token; stopping");
    if (pageToken) seen.add(pageToken);
  } while (pageToken);
  log(`grant-groups: ${where} — ${users.length} account(s)`);
  for (const user of users) {
    let groups;
    try {
      const held = groupsOf(parseClaims(user.customAttributes));
      const stale = undeclared(held, declared);
      groups = `${showGroups(held)}${stale.length ? ` (not declared: ${stale.join(", ")})` : ""}`;
    } catch {
      groups = "(unreadable custom claims)";
    }
    const flags = `${user.email && user.emailVerified !== true ? " [unverified]" : ""}${user.disabled ? " [disabled]" : ""}`;
    log(`  ${user.localId}  ${user.email ?? "(no email)"}${flags}  groups: ${groups}`);
  }
  return 0;
}

/**
 * CLI entry point. Resolves to the exit code; rejects with UsageError, IdentityToolkitError or an I/O error.
 * `deps` (tests inject them): env, fetch, exec (execFileSync-compatible, used for gcloud), log.
 */
export async function main(argv, deps = {}) {
  const { env = process.env, fetch = globalThis.fetch, exec = execFileSync, log = console.log } = deps;
  const opts = parseArgs(argv, env);
  let registry;
  try {
    registry = JSON.parse(readFileSync(opts.registry, "utf8"));
  } catch (err) {
    throw new UsageError(`cannot read registry ${opts.registry}: ${err.message}`);
  }
  const auth = readAuth(registry);
  const declared = auth.groups.map((g) => g.id);
  const byId = new Map(auth.groups.map((g) => [g.id, g]));
  const projectId = opts.project ?? auth.projectId;
  if (!PROJECT_RE.test(projectId)) throw new UsageError(`--project ${JSON.stringify(projectId)} is not a project id`);
  const unknown = undeclared(opts.ids ?? [], declared);
  if (unknown.length)
    throw new UsageError(`${unknown.join(", ")} ${unknown.length === 1 ? "is" : "are"} not declared in platform.auth.groups (declared: ${declared.join(", ")}); to drop a group the registry no longer declares, --set the groups to keep`);

  const conn = connection({ projectId, emulatorHost: opts.emulator, accessToken: opts.emulator ? undefined : accessToken(env, exec) });
  const api = identityToolkit({ fetch, projectId, conn });
  const where = `project ${projectId} (${conn.label})`;
  if (opts.action === "list") return listAccounts(api, where, declared, log);

  const user = await findAccount(api, opts, projectId);
  const claims = parseClaims(user.customAttributes);
  const before = groupsOf(claims);
  log(`grant-groups: ${where} — ${describe(user)}`);
  if (opts.action === "show") {
    log(`  groups: ${showGroups(before)}${profiles(before, byId)}`);
    staleNote(before, declared, log);
    return 0;
  }

  const after = nextGroups(before, opts.action, opts.ids, declared);
  if (after.join() === before.join()) {
    log(`  groups: ${showGroups(before)} (unchanged; nothing written)`);
    return 0;
  }
  log(`  groups: ${showGroups(before)} → ${showGroups(after)}${profiles(after, byId)}`);
  if (grantsSomething(before, after) && user.emailVerified !== true && !opts.allowUnverified)
    throw new UsageError(
      `refused: ${user.email ? `${user.email} is not verified` : "the account has no email"}, and anyone can sign up with an address they do not own. ` +
        "Ask them to verify it (or to sign in with Google), or pass --allow-unverified once you know the account is theirs",
    );
  const text = claimsWithGroups(claims, after);
  if (opts.dryRun) {
    log("  dry run — nothing written");
    return 0;
  }
  await api.update(user.localId, text);
  log("  written.");
  log("  It applies from their next ID token: they sign out and back in (an open tab picks it up within the hour).");
  log(`  A door session sealed before this change keeps its old groups until it expires: up to ${auth.sessionHours} h (platform.auth.sessionHours).`);
  log(`  Cutting access sooner: ${RUNBOOK}, "Rotation and revocation".`);
  staleNote(after, declared, log);
  return 0;
}

/** One line for the terminal, with a hint for the permission errors a first production run meets. */
export function explain(err, argv = []) {
  let line = `grant-groups: ${err.message}`;
  if (err instanceof IdentityToolkitError && (err.status === 401 || err.status === 403) && !argv.includes("--emulator"))
    line += " — the gcloud account needs Firebase Authentication Admin (roles/firebaseauth.admin) on the project, and the Identity Toolkit API must be enabled there";
  return line;
}

if (invokedDirectly(import.meta.url)) {
  const argv = process.argv.slice(2);
  main(argv).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(explain(err, argv));
      process.exitCode = 1;
    },
  );
}
