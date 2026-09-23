/**
 * Validation of a registry document (contract version 1). The checks cover what the gateway
 * relies on: the envelope, every field it types, https upstreams, unique and unreserved ids.
 * Cosmetic rules the portal enforces (name length, semver pattern) are deliberately not
 * repeated here so a cosmetic slip in a published registry does not take the gateway down.
 */

import { InvalidRegistryError } from "./errors.js";
import {
  API_AUTHS,
  APP_STATUSES,
  CONTRACT_VERSION,
  DEPLOYED_BY,
  ROUTING_MODES,
  WEB_KINDS,
  type AppManifest,
  type Platform,
  type Registry,
} from "./registry.js";

type Rec = Record<string, unknown>;
type Problems = string[];
type Check = (rec: Rec, where: string, problems: Problems) => void;

const ID_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;
const PATH_PATTERN = /^\/[a-z][a-z0-9-]*$/;
const HTTPS_PATTERN = /^https:\/\/\S+$/;
const LEADING_SLASH = /^\//;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
/** Ids that would shadow the gateway's own routes. */
const RESERVED_IDS: ReadonlySet<string> = new Set(["registry", "health"]);

/** Values the caller supplies when the document lacks them: a local `registry.json` has no `generatedAt`. */
export interface ParseRegistryOptions {
  readonly generatedAt?: string;
}

interface StringRule {
  readonly optional?: boolean;
  readonly pattern?: RegExp;
  readonly hint?: string;
}

function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkString(rec: Rec, key: string, where: string, problems: Problems, rule: StringRule = {}): void {
  const value = rec[key];
  if (value === undefined) {
    if (!rule.optional) problems.push(`${where}.${key} is required`);
    return;
  }
  if (typeof value !== "string") {
    problems.push(`${where}.${key} must be a string`);
    return;
  }
  if (rule.pattern !== undefined && !rule.pattern.test(value)) {
    problems.push(`${where}.${key} must be ${rule.hint ?? `matching ${rule.pattern.source}`}`);
  }
}

function checkEnum(
  rec: Rec,
  key: string,
  where: string,
  problems: Problems,
  allowed: readonly string[],
  optional = false,
): void {
  const value = rec[key];
  if (value === undefined && optional) return;
  if (typeof value !== "string" || !allowed.includes(value)) {
    problems.push(`${where}.${key} must be one of ${allowed.join(", ")}`);
  }
}

function checkBoolean(rec: Rec, key: string, where: string, problems: Problems): void {
  if (typeof rec[key] !== "boolean") problems.push(`${where}.${key} must be a boolean`);
}

function checkOptionalStringArray(rec: Rec, key: string, where: string, problems: Problems): void {
  const value = rec[key];
  if (value === undefined) return;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    problems.push(`${where}.${key} must be an array of strings`);
  }
}

function checkChild(rec: Rec, key: string, where: string, problems: Problems, optional: boolean, check: Check): void {
  const value = rec[key];
  if (value === undefined) {
    if (!optional) problems.push(`${where}.${key} is required`);
    return;
  }
  if (!isRecord(value)) {
    problems.push(`${where}.${key} must be an object`);
    return;
  }
  check(value, `${where}.${key}`, problems);
}

const checkRouting: Check = (rec, where, problems) => {
  checkEnum(rec, "mode", where, problems, ROUTING_MODES);
  checkBoolean(rec, "ready", where, problems);
  checkString(rec, "note", where, problems, { optional: true });
};

const checkWeb: Check = (rec, where, problems) => {
  checkEnum(rec, "kind", where, problems, WEB_KINDS);
  checkString(rec, "url", where, problems, { pattern: HTTPS_PATTERN, hint: "an https URL" });
  checkString(rec, "altUrl", where, problems, { optional: true, pattern: HTTPS_PATTERN, hint: "an https URL" });
  for (const key of ["project", "region", "service"]) checkString(rec, key, where, problems, { optional: true });
};

const checkApi: Check = (rec, where, problems) => {
  checkString(rec, "baseUrl", where, problems, { pattern: HTTPS_PATTERN, hint: "an https URL" });
  checkString(rec, "healthPath", where, problems, { pattern: LEADING_SLASH, hint: "a path starting with /" });
  checkString(rec, "docs", where, problems, { optional: true });
  checkEnum(rec, "auth", where, problems, API_AUTHS, true);
};

const checkRepo: Check = (rec, where, problems) => {
  checkString(rec, "github", where, problems);
  checkString(rec, "branch", where, problems);
  checkString(rec, "localPath", where, problems, { optional: true });
};

const checkDeployment: Check = (rec, where, problems) => {
  for (const key of ["version", "sha", "imageTag", "deployedAt"]) checkString(rec, key, where, problems);
  checkEnum(rec, "deployedBy", where, problems, DEPLOYED_BY);
};

const checkHosting: Check = (rec, where, problems) => {
  checkString(rec, "project", where, problems);
  checkString(rec, "site", where, problems);
};

const checkGateway: Check = (rec, where, problems) => {
  checkBoolean(rec, "enabled", where, problems);
  checkString(rec, "path", where, problems, { pattern: PATH_PATTERN, hint: "a path like /api" });
  checkString(rec, "service", where, problems);
  checkString(rec, "region", where, problems);
  checkString(rec, "note", where, problems, { optional: true });
};

/**
 * Type guard for one app entry. Records every violation under `where` and returns true only when
 * it found none, so the narrowed value is safe to use as an AppManifest.
 */
export function isAppManifest(value: unknown, where: string, problems: Problems): value is AppManifest {
  if (!isRecord(value)) {
    problems.push(`${where} must be an object`);
    return false;
  }
  const before = problems.length;
  checkString(value, "id", where, problems, { pattern: ID_PATTERN, hint: "a slug like vale" });
  checkString(value, "name", where, problems);
  checkString(value, "description", where, problems);
  checkString(value, "icon", where, problems, { optional: true });
  checkEnum(value, "status", where, problems, APP_STATUSES);
  checkString(value, "path", where, problems, { pattern: PATH_PATTERN, hint: "a path like /vale" });
  checkChild(value, "routing", where, problems, false, checkRouting);
  checkChild(value, "web", where, problems, false, checkWeb);
  checkChild(value, "api", where, problems, true, checkApi);
  checkChild(value, "repo", where, problems, false, checkRepo);
  checkChild(value, "deployment", where, problems, false, checkDeployment);
  checkOptionalStringArray(value, "tags", where, problems);
  return problems.length === before;
}

/** Type guard for the `platform` block; unknown extra fields are ignored, typed ones are checked. */
export function isPlatform(value: unknown, where: string, problems: Problems): value is Platform {
  if (!isRecord(value)) {
    problems.push(`${where} must be an object`);
    return false;
  }
  const before = problems.length;
  checkString(value, "domain", where, problems, { pattern: /^[a-z0-9.-]+\.[a-z]{2,}$/, hint: "a bare domain name" });
  checkChild(value, "hosting", where, problems, true, checkHosting);
  checkChild(value, "gateway", where, problems, true, checkGateway);
  return problems.length === before;
}

function checkUniqueness(apps: readonly AppManifest[], problems: Problems): void {
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  for (const app of apps) {
    if (RESERVED_IDS.has(app.id)) problems.push(`apps: id "${app.id}" is reserved for the gateway`);
    if (seenIds.has(app.id)) problems.push(`apps: id "${app.id}" is used twice`);
    if (seenPaths.has(app.path)) problems.push(`apps: path "${app.path}" is used twice`);
    seenIds.add(app.id);
    seenPaths.add(app.path);
  }
}

/**
 * Validate a parsed JSON document as a contract-1 registry and return it typed.
 * Throws InvalidRegistryError listing every problem found. `options.generatedAt` fills in the
 * timestamp when the document has none (the local file); a published copy always carries one.
 */
export function parseRegistry(input: unknown, options: ParseRegistryOptions = {}): Registry {
  if (!isRecord(input)) throw new InvalidRegistryError(["registry must be a JSON object"]);
  const problems: Problems = [];
  if (input["contractVersion"] !== CONTRACT_VERSION) {
    problems.push(`registry.contractVersion must be ${CONTRACT_VERSION}`);
  }
  checkString(input, "generatedAt", "registry", problems, {
    optional: true,
    pattern: ISO_UTC_PATTERN,
    hint: "an ISO-8601 UTC timestamp",
  });
  const generatedAt = typeof input["generatedAt"] === "string" ? input["generatedAt"] : options.generatedAt;

  const rawPlatform = input["platform"];
  const platform = rawPlatform !== undefined && isPlatform(rawPlatform, "platform", problems) ? rawPlatform : undefined;

  const apps: AppManifest[] = [];
  const rawApps = input["apps"];
  if (!Array.isArray(rawApps)) {
    problems.push("registry.apps must be an array");
  } else {
    rawApps.forEach((item: unknown, index) => {
      if (isAppManifest(item, `apps[${index}]`, problems)) apps.push(item);
    });
  }
  checkUniqueness(apps, problems);

  if (generatedAt === undefined) problems.push("registry.generatedAt is required (published copies carry it)");
  if (generatedAt === undefined || problems.length > 0) throw new InvalidRegistryError(problems);
  return platform === undefined
    ? { contractVersion: CONTRACT_VERSION, generatedAt, apps }
    : { contractVersion: CONTRACT_VERSION, generatedAt, platform, apps };
}
