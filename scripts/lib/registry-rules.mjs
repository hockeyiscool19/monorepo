// The registry contract as code: validateRegistry(registry, {published}) → a list of problems. Zero dependencies.
// Used by scripts/validate-registry.mjs (the CLI CI runs) and its tests. It checks the rules that matter for rendering
// and routing (required fields, enums, patterns, uniqueness, sign-in and access); the JSON Schema file remains the full,
// editor-friendly description, and every pattern here is read from it. Sign-in rules live in lib/auth-rules.mjs.
import { SCHEMA as schema } from "./schema.mjs";
import { RESERVED_APP_IDS, checkAccess, checkAuth } from "./auth-rules.mjs";

const appSchema = schema.$defs.app;
const matches = (value, pattern) => new RegExp(pattern).test(value);
const isString = (v) => typeof v === "string";
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Every problem in `registry`, one line each (`<where>: <message>`); [] when it is valid.
 * `published`: check a published copy (portal build/registry.json) instead of the source: `generatedAt` required and
 * `repo` absent, because it names private repositories and local checkout paths. `auth` and `access` are public.
 */
export function validateRegistry(registry, { published = false } = {}) {
  const errors = [];
  const fail = (where, msg) => errors.push(`${where}: ${msg}`);

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
    if ("auth" in platform) checkAuth(platform.auth, fail);
  }

  function validateApp(where, app, platform) {
    const p = appSchema.properties;
    if (!isObject(app)) return fail(where, "must be an object");
    checkRequired(where, "app", app, published ? appSchema.required.filter((k) => k !== "repo") : appSchema.required);
    checkNoExtra(where, "app", app, Object.keys(p));
    if (published && "repo" in app) fail(where, "repo must not be published (private repository names and local paths)");

    if (!isString(app.id) || !matches(app.id, p.id.pattern)) fail(where, `id must match ${p.id.pattern}`);
    else if (RESERVED_APP_IDS.includes(app.id))
      fail(where, `id "${app.id}" is reserved (${RESERVED_APP_IDS.join(", ")} would shadow a gateway route)`);
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

    if ("access" in app) checkAccess(where, app, platform, fail);

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

  if (!isObject(registry)) {
    fail("registry", "top level must be an object");
    return errors;
  }
  checkRequired("registry", "registry", registry, schema.required);
  checkNoExtra("registry", "registry", registry, Object.keys(schema.properties));
  if (registry.contractVersion !== schema.properties.contractVersion.const)
    fail("registry", `contractVersion must be ${schema.properties.contractVersion.const}`);
  if ("generatedAt" in registry && !(isString(registry.generatedAt) && matches(registry.generatedAt, schema.properties.generatedAt.pattern)))
    fail("registry", "generatedAt must be an ISO-8601 UTC timestamp");
  if (published && !("generatedAt" in registry)) fail("registry", "generatedAt is required in a published copy");
  validatePlatform(registry.platform);

  if (!Array.isArray(registry.apps)) fail("registry", "apps must be an array");
  else {
    const seen = { id: new Map(), path: new Map() };
    registry.apps.forEach((app, i) => {
      const where = `apps[${i}]${isObject(app) && isString(app.id) ? ` (${app.id})` : ""}`;
      validateApp(where, app, registry.platform);
      if (!isObject(app)) return;
      for (const key of ["id", "path"]) {
        if (seen[key].has(app[key])) fail(where, `${key} "${app[key]}" is already used by ${seen[key].get(app[key])}`);
        else seen[key].set(app[key], where);
      }
    });
  }
  return errors;
}
