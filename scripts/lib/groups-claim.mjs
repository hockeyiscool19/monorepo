// The `groups` custom claim, as pure functions (no I/O) for scripts/grant-groups.mjs. Zero dependencies.
//
// Firebase keeps an account's custom claims as one JSON object string (`customAttributes` in the Identity Toolkit API)
// of at most 1000 bytes. The platform owns exactly one key of it, `groups`: an array of group ids declared in the
// registry's platform.auth.groups. Every other key is left as it is.

export const CLAIMS_MAX_BYTES = 1000;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** An account's custom claims as an object: {} when it has none. Throws when the stored value is not a JSON object. */
export function parseClaims(customAttributes) {
  if (customAttributes === undefined || customAttributes === null || customAttributes === "") return {};
  let claims;
  try {
    claims = JSON.parse(customAttributes);
  } catch (err) {
    throw new Error(`the account's custom claims are not valid JSON (${err.message}); fix them before granting groups`);
  }
  if (!isObject(claims)) throw new Error("the account's custom claims are not a JSON object; fix them before granting groups");
  return claims;
}

/** The `groups` claim: [] when absent. Throws when it is present but not an array of strings (never overwrite blindly). */
export function groupsOf(claims) {
  if (!("groups" in claims)) return [];
  const groups = claims.groups;
  if (!Array.isArray(groups) || !groups.every((g) => typeof g === "string"))
    throw new Error(`the account's groups claim is not an array of strings (${JSON.stringify(groups)}); fix it with --set`);
  return groups;
}

/** "owner,vale" → ["owner", "vale"]: trimmed, blanks dropped, duplicates removed. */
export const splitIds = (text) => [...new Set(String(text).split(",").map((s) => s.trim()).filter(Boolean))];

/** Ids that the registry does not declare. */
export const undeclared = (ids, declared) => ids.filter((id) => !declared.includes(id));

/**
 * The groups after an action. `declared` is the registry order; the result lists declared groups in that order, then
 * any group the account already held that the registry no longer declares (kept as it was unless the action removes it).
 *   set: exactly `ids` · add: current ∪ ids · remove: current − ids
 */
export function nextGroups(current, action, ids, declared) {
  let wanted;
  if (action === "set") wanted = new Set(ids);
  else if (action === "add") wanted = new Set([...current, ...ids]);
  else if (action === "remove") wanted = new Set(current.filter((g) => !ids.includes(g)));
  else throw new Error(`unknown action ${action}`);
  const known = declared.filter((id) => wanted.has(id));
  const stale = [...wanted].filter((id) => !declared.includes(id));
  return [...known, ...stale];
}

/** The claims JSON to store: `claims` with `groups` replaced (removed when empty). Throws above CLAIMS_MAX_BYTES. */
export function claimsWithGroups(claims, groups) {
  const next = { ...claims };
  if (groups.length) next.groups = groups;
  else delete next.groups;
  const text = JSON.stringify(next);
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > CLAIMS_MAX_BYTES) throw new Error(`the custom claims would be ${bytes} bytes; Firebase allows ${CLAIMS_MAX_BYTES}`);
  return text;
}

/** True when `after` holds a group that `before` did not: the change grants something. */
export const grantsSomething = (before, after) => after.some((g) => !before.includes(g));

/** "owner, vale" or "none". */
export const showGroups = (groups) => (groups.length ? groups.join(", ") : "none");
