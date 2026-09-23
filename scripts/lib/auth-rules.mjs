// Rules for the sign-in parts of registry/registry.json: `platform.auth` (the group profiles), `apps[].access` (who may
// enter an app) and the reserved app ids. Zero dependencies. Used by lib/registry-rules.mjs (validate-registry.mjs),
// render-firebase.mjs (doorActive, unguardedApps) and grant-groups.mjs (readAuth). Every pattern and limit is read from
// the schema, so registry/schema/registry.schema.json stays the one description of the contract.
import { SCHEMA } from "./schema.mjs";

const AUTH = SCHEMA.properties.platform.properties.auth;
const GROUP = SCHEMA.$defs.group;
const ACCESS = SCHEMA.$defs.app.properties.access;

/** App ids that would shadow a gateway route: <prefix>/registry, <prefix>/health, <prefix>/auth/*. */
export const RESERVED_APP_IDS = Object.freeze([...SCHEMA.$defs.app.properties.id.not.enum]);
export const GROUP_ID_PATTERN = GROUP.properties.id.pattern;
const GROUP_ID_RE = new RegExp(GROUP_ID_PATTERN);

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isString = (v) => typeof v === "string";
const show = (v) => JSON.stringify(v);

/** String length the way JSON Schema counts it: Unicode code points, so an emoji such as 👑 is one character. */
export const chars = (s) => [...s].length;

/** Required keys present, no key outside `def.properties`. */
function checkShape(where, label, obj, def, fail) {
  for (const key of def.required ?? []) if (!(key in obj)) fail(where, `${label}.${key} is required`);
  for (const key of Object.keys(obj)) if (!(key in def.properties)) fail(where, `${label}.${key} is not in the schema`);
}

/** A string within the schema's maxLength (code points); minLength ≥ 1 also rejects blank text. */
function checkText(where, label, value, def, fail) {
  if (!isString(value)) return fail(where, `${label} must be a string`);
  if (def.minLength >= 1 && !value.trim()) fail(where, `${label} must not be empty`);
  if (def.maxLength !== undefined && chars(value) > def.maxLength)
    fail(where, `${label} must be at most ${def.maxLength} characters (got ${chars(value)})`);
}

function checkGroups(where, groups, fail) {
  const rule = AUTH.properties.groups;
  if (!Array.isArray(groups)) return fail(where, "auth.groups must be an array");
  if (groups.length < rule.minItems || groups.length > rule.maxItems)
    fail(where, `auth.groups must list ${rule.minItems} to ${rule.maxItems} groups (got ${groups.length})`);
  const seen = new Map();
  groups.forEach((group, i) => {
    const label = `auth.groups[${i}]`;
    if (!isObject(group)) return fail(where, `${label} must be an object`);
    checkShape(where, label, group, GROUP, fail);
    if (!isString(group.id) || !GROUP_ID_RE.test(group.id)) fail(where, `${label}.id must match ${GROUP_ID_PATTERN}`);
    else if (seen.has(group.id)) fail(where, `${label}.id "${group.id}" is already used by auth.groups[${seen.get(group.id)}]`);
    else seen.set(group.id, i);
    for (const key of ["name", "emblem", "description"]) if (key in group) checkText(where, `${label}.${key}`, group[key], GROUP.properties[key], fail);
  });
}

/** platform.auth: the sign-in settings and group profiles. `fail(where, message)` records each problem. */
export function checkAuth(auth, fail) {
  const where = "platform";
  const p = AUTH.properties;
  if (!isObject(auth)) return fail(where, "auth must be an object");
  checkShape(where, "auth", auth, AUTH, fail);
  if ("enabled" in auth && typeof auth.enabled !== "boolean") fail(where, "auth.enabled must be a boolean");
  if ("provider" in auth && auth.provider !== p.provider.const) fail(where, `auth.provider must be "${p.provider.const}" (got ${show(auth.provider)})`);
  if ("projectId" in auth && !(isString(auth.projectId) && new RegExp(p.projectId.pattern).test(auth.projectId)))
    fail(where, `auth.projectId must match ${p.projectId.pattern} (got ${show(auth.projectId)})`);
  const { minimum, maximum } = p.sessionHours;
  if ("sessionHours" in auth && !(Number.isInteger(auth.sessionHours) && auth.sessionHours >= minimum && auth.sessionHours <= maximum))
    fail(where, `auth.sessionHours must be an integer from ${minimum} to ${maximum} (got ${show(auth.sessionHours)})`);
  if ("note" in auth) checkText(where, "auth.note", auth.note, p.note, fail);
  if ("groups" in auth) checkGroups(where, auth.groups, fail);
}

/** The group ids platform.auth declares (well-formed ones only); [] when there is no usable auth block. */
export function declaredGroupIds(platform) {
  const groups = isObject(platform) && isObject(platform.auth) && Array.isArray(platform.auth.groups) ? platform.auth.groups : [];
  return groups.filter((g) => isObject(g) && isString(g.id)).map((g) => g.id);
}

/** apps[i].access: shape, group ids declared in platform.auth, and the app it needs (platform.auth, a Cloud Run web). */
export function checkAccess(where, app, platform, fail) {
  const access = app.access;
  if (!isObject(access)) return fail(where, "access must be an object");
  checkShape(where, "access", access, ACCESS, fail);
  if ("note" in access) checkText(where, "access.note", access.note, ACCESS.properties.note, fail);
  const hasAuth = isObject(platform) && isObject(platform.auth);
  if (!hasAuth) fail(where, "access needs platform.auth (the platform sign-in that issues the groups claim)");
  if (!isObject(app.web) || app.web.kind !== "cloud-run") fail(where, 'access needs web.kind "cloud-run" (the gateway door forwards to a Cloud Run service)');
  if (!("groups" in access)) return;
  const groups = access.groups;
  if (!Array.isArray(groups)) return fail(where, "access.groups must be an array of group ids ([] = any signed-in person)");
  const max = ACCESS.properties.groups.maxItems;
  if (groups.length > max) fail(where, `access.groups must list at most ${max} groups (got ${groups.length})`);
  const declared = declaredGroupIds(platform);
  const seen = new Set();
  for (const id of groups) {
    if (!isString(id) || !GROUP_ID_RE.test(id)) {
      fail(where, `access.groups entry ${show(id)} must match ${GROUP_ID_PATTERN}`);
      continue;
    }
    if (seen.has(id)) fail(where, `access.groups lists "${id}" twice`);
    seen.add(id);
    if (hasAuth && !declared.includes(id))
      fail(where, `access.groups "${id}" is not declared in platform.auth.groups (declared: ${declared.join(", ") || "none"})`);
  }
}

/** True when Hosting sends apps with `access` through the gateway: platform.auth.enabled and platform.gateway.enabled. */
export function doorActive(platform) {
  return isObject(platform) && isObject(platform.auth) && platform.auth.enabled === true && isObject(platform.gateway) && platform.gateway.enabled === true;
}

/** Why the door is off, for messages: "platform.auth.enabled is false", … — or "" when it is active. */
export function doorOffReason(platform) {
  if (doorActive(platform)) return "";
  if (!isObject(platform) || !isObject(platform.auth)) return "platform.auth is missing";
  if (platform.auth.enabled !== true) return "platform.auth.enabled is false";
  return "platform.gateway.enabled is false";
}

/** Apps that declare `access` but are routed straight to their own service because the door is off. */
export function unguardedApps(registry) {
  if (!isObject(registry) || !Array.isArray(registry.apps) || doorActive(registry.platform)) return [];
  return registry.apps.filter((app) => isObject(app) && isObject(app.access) && isObject(app.web) && app.web.kind === "cloud-run");
}

/** platform.auth of a registry, checked; throws one Error naming every problem (grant-groups refuses a bad block). */
export function readAuth(registry) {
  const auth = isObject(registry) && isObject(registry.platform) ? registry.platform.auth : undefined;
  if (!isObject(auth)) throw new Error("the registry has no platform.auth block: platform sign-in is not configured (registry/README.md)");
  const problems = [];
  checkAuth(auth, (where, message) => problems.push(`${where}: ${message}`));
  if (problems.length) throw new Error(`platform.auth in the registry is invalid:\n  - ${problems.join("\n  - ")}`);
  return auth;
}
