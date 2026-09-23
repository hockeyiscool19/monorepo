// Shared by scripts/register-deployment.mjs (push path: repository_dispatch from an app repo) and
// scripts/sync-deployments.mjs (pull path: each app's live health endpoint). Zero dependencies.
//
// One copy of the rules a deployment receipt must satisfy (derived from registry/schema/registry.schema.json) and of
// the registry file format (2-space JSON with a trailing newline). Each check returns {value} (normalised) or {error}
// (one line naming `label`), so the push path can throw it and the pull path can print it as a skip reason.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_REGISTRY = join(ROOT, "registry", "registry.json");
const schema = JSON.parse(readFileSync(join(ROOT, "registry", "schema", "registry.schema.json"), "utf8"));
const deployment = schema.$defs.app.properties.deployment.properties;

export const VERSION_PATTERN = deployment.version.pattern;
export const IMAGE_TAG_MAX = deployment.imageTag.maxLength;
const VERSION_RE = new RegExp(VERSION_PATTERN);
const SHA_RE = /^[0-9a-f]{7,40}$/;

export const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export const show = (v) => JSON.stringify(v ?? "");
const trimmed = (v) => (typeof v === "string" ? v.trim() : "");

/** x.y.z with an optional -pre or +build suffix (deployment.version in the schema). */
export function checkVersion(raw, label = "version") {
  const value = trimmed(raw);
  return VERSION_RE.test(value) ? { value } : { error: `${label} ${show(raw)} must match ${VERSION_PATTERN}` };
}

/** A git commit: 7–40 hex characters, stored lower-case. */
export function checkSha(raw, label = "sha") {
  const value = trimmed(raw).toLowerCase();
  return SHA_RE.test(value) ? { value } : { error: `${label} ${show(raw)} must be 7–40 hex characters` };
}

/** Optional image tag: a string of at most IMAGE_TAG_MAX characters; absent means "". */
export function checkImageTag(raw, label = "imageTag") {
  if (raw != null && typeof raw !== "string") return { error: `${label} must be a string` };
  const value = trimmed(raw);
  return value.length > IMAGE_TAG_MAX ? { error: `${label} is longer than ${IMAGE_TAG_MAX} characters` } : { value };
}

/** A Date the way the registry stores deployedAt: ISO-8601 UTC, whole seconds, `Z`. */
export const isoSeconds = (date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

/** 2-space JSON with a trailing newline: the repository's format for registry.json. */
export const serialize = (registry) => `${JSON.stringify(registry, null, 2)}\n`;

/** Read and parse a registry file. Throws a one-line Error when it is unreadable or not an object with `apps: []`. */
export function readRegistry(path) {
  let registry;
  try {
    registry = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`cannot read registry ${path}: ${err.message}`);
  }
  if (!isObject(registry) || !Array.isArray(registry.apps)) throw new Error(`registry ${path} must be an object with an apps array`);
  return registry;
}
