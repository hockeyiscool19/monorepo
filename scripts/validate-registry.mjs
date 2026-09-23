#!/usr/bin/env node
// Validate registry/registry.json against the contract in registry/schema/registry.schema.json.
// Zero dependencies on purpose: CI and every agent can run it with plain `node`.
// It checks the rules that matter for rendering (required fields, enums, patterns, uniqueness);
// the JSON Schema file remains the full, editor-friendly description.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = process.argv[2] ?? join(root, "registry", "registry.json");
const schema = JSON.parse(readFileSync(join(root, "registry", "schema", "registry.schema.json"), "utf8"));
const appSchema = schema.$defs.app;

const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

const matches = (value, pattern) => new RegExp(pattern).test(value);
const isString = (v) => typeof v === "string";
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function checkEnum(where, label, value, allowed) {
  if (!allowed.includes(value)) fail(where, `${label} must be one of ${allowed.join(", ")} (got ${JSON.stringify(value)})`);
}

function checkRequired(where, label, obj, required) {
  for (const key of required) if (!(key in obj)) fail(where, `${label}.${key} is required`);
}

function checkNoExtra(where, label, obj, allowed) {
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) fail(where, `${label}.${key} is not in the schema`);
}

function checkHttps(where, label, value) {
  if (!isString(value) || !value.startsWith("https://")) fail(where, `${label} must be an https URL`);
}

function validatePlatform(platform) {
  const where = "platform";
  const p = schema.properties.platform;
  if (!isObject(platform)) return fail(where, "must be an object");
  checkRequired(where, "platform", platform, p.required);
  checkNoExtra(where, "platform", platform, Object.keys(p.properties));
  if (!isString(platform.domain) || !matches(platform.domain, p.properties.domain.pattern)) fail(where, "domain must be a bare domain name");
  if (isObject(platform.hosting)) {
    checkRequired(where, "hosting", platform.hosting, p.properties.hosting.required);
    checkNoExtra(where, "hosting", platform.hosting, Object.keys(p.properties.hosting.properties));
  } else fail(where, "hosting must be an object");
  if (isObject(platform.gateway)) {
    const g = p.properties.gateway;
    checkRequired(where, "gateway", platform.gateway, g.required);
    checkNoExtra(where, "gateway", platform.gateway, Object.keys(g.properties));
    if (typeof platform.gateway.enabled !== "boolean") fail(where, "gateway.enabled must be a boolean");
    if (!isString(platform.gateway.path) || !matches(platform.gateway.path, g.properties.path.pattern))
      fail(where, `gateway.path must match ${g.properties.path.pattern}`);
  } else fail(where, "gateway must be an object");
}

function validateApp(where, app) {
  const p = appSchema.properties;
  if (!isObject(app)) return fail(where, "must be an object");
  checkRequired(where, "app", app, appSchema.required);
  checkNoExtra(where, "app", app, Object.keys(p));

  if (!isString(app.id) || !matches(app.id, p.id.pattern)) fail(where, `id must match ${p.id.pattern}`);
  if (!isString(app.name) || !app.name.trim()) fail(where, "name must be a non-empty string");
  if (!isString(app.description) || !app.description.trim() || app.description.length > 160)
    fail(where, "description must be a non-empty string of at most 160 characters");
  checkEnum(where, "status", app.status, p.status.enum);
  if (!isString(app.path) || !matches(app.path, p.path.pattern)) fail(where, `path must match ${p.path.pattern}`);

  if (isObject(app.routing)) {
    checkRequired(where, "routing", app.routing, p.routing.required);
    checkNoExtra(where, "routing", app.routing, Object.keys(p.routing.properties));
    checkEnum(where, "routing.mode", app.routing.mode, p.routing.properties.mode.enum);
    if (typeof app.routing.ready !== "boolean") fail(where, "routing.ready must be a boolean");
  }

  if (isObject(app.web)) {
    checkRequired(where, "web", app.web, p.web.required);
    checkNoExtra(where, "web", app.web, Object.keys(p.web.properties));
    checkEnum(where, "web.kind", app.web.kind, p.web.properties.kind.enum);
    checkHttps(where, "web.url", app.web.url);
    if ("altUrl" in app.web) checkHttps(where, "web.altUrl", app.web.altUrl);
    if (app.web.kind === "cloud-run" && !(isString(app.web.service) && isString(app.web.region)))
      fail(where, "web.service and web.region are required for cloud-run apps");
  }

  if ("api" in app) {
    if (!isObject(app.api)) fail(where, "api must be an object");
    else {
      checkRequired(where, "api", app.api, p.api.required);
      checkNoExtra(where, "api", app.api, Object.keys(p.api.properties));
      checkHttps(where, "api.baseUrl", app.api.baseUrl);
      if (!isString(app.api.healthPath) || !app.api.healthPath.startsWith("/")) fail(where, "api.healthPath must start with /");
      if ("auth" in app.api) checkEnum(where, "api.auth", app.api.auth, p.api.properties.auth.enum);
    }
  }

  if (isObject(app.repo)) {
    checkRequired(where, "repo", app.repo, p.repo.required);
    checkNoExtra(where, "repo", app.repo, Object.keys(p.repo.properties));
    if (!isString(app.repo.github) || !matches(app.repo.github, p.repo.properties.github.pattern))
      fail(where, "repo.github must look like owner/name");
  }

  if (isObject(app.deployment)) {
    const d = p.deployment.properties;
    checkRequired(where, "deployment", app.deployment, p.deployment.required);
    checkNoExtra(where, "deployment", app.deployment, Object.keys(d));
    for (const key of ["version", "sha", "deployedAt"])
      if (isString(app.deployment[key]) && !matches(app.deployment[key], d[key].pattern))
        fail(where, `deployment.${key} must match ${d[key].pattern}`);
    checkEnum(where, "deployment.deployedBy", app.deployment.deployedBy, d.deployedBy.enum);
  }

  if ("tags" in app && (!Array.isArray(app.tags) || app.tags.length > 8 || !app.tags.every(isString)))
    fail(where, "tags must be an array of at most 8 strings");
}

let registry;
try {
  registry = JSON.parse(readFileSync(registryPath, "utf8"));
} catch (err) {
  console.error(`registry: cannot read ${registryPath}: ${err.message}`);
  process.exitCode = 1;
}

if (!isObject(registry)) fail("registry", "top level must be an object");
else {
  checkRequired("registry", "registry", registry, schema.required);
  checkNoExtra("registry", "registry", registry, Object.keys(schema.properties));
  if (registry.contractVersion !== schema.properties.contractVersion.const)
    fail("registry", `contractVersion must be ${schema.properties.contractVersion.const}`);
  if ("generatedAt" in registry && !(isString(registry.generatedAt) && matches(registry.generatedAt, schema.properties.generatedAt.pattern)))
    fail("registry", "generatedAt must be an ISO-8601 UTC timestamp");
  validatePlatform(registry.platform);

  if (!Array.isArray(registry.apps)) fail("registry", "apps must be an array");
  else {
    const seen = { id: new Map(), path: new Map() };
    registry.apps.forEach((app, i) => {
      const where = `apps[${i}]${isObject(app) && isString(app.id) ? ` (${app.id})` : ""}`;
      validateApp(where, app);
      if (!isObject(app)) return;
      for (const key of ["id", "path"]) {
        if (seen[key].has(app[key])) fail(where, `${key} "${app[key]}" is already used by ${seen[key].get(app[key])}`);
        else seen[key].set(app[key], where);
      }
    });
  }
}

if (errors.length) {
  console.error(`registry: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exitCode = 1;
}
const ids = registry.apps.map((a) => a.id).join(", ");
console.log(`registry: valid — platform ${registry.platform.domain}, ${registry.apps.length} app(s) (${ids})`);
