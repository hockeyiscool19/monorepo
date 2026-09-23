# monorepo — eisensoftware platform

The controller for `eisensoftware.com`: a tiles portal that routes to each application, an API gateway in
front of their APIs, the app registry that drives both, the CI/CD sync that keeps deployment values current,
and the skill plugins (design, architecture, deployment standards) that every application repo installs.

Plan of record: [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md). Agent contract: [AGENTS.md](AGENTS.md).

## How it fits together

```
eisensoftware.com (Cloudflare DNS → Firebase Hosting, project researcher-455022)
  /                  portal tiles (apps/portal, static)
  /api/**            gateway (apps/gateway, Cloud Run)
  /<app>/**          each app's Cloud Run service, via Hosting rewrites rendered from registry/
```

`registry/registry.json` (one object: `platform` + `apps[]`) is the only place the domain, hosting, gateway and each app's path, URL, version and status are written.
App repos report deploys with a `repository_dispatch`, CI patches the manifest and redeploys the portal.

## Layout

| Path | Contents |
|---|---|
| `registry/` | `registry.json` + schema ([README](registry/README.md)) |
| `apps/portal/` | SvelteKit static portal |
| `apps/gateway/` | Hono + TypeScript API gateway |
| `plugins/eisen-design/` | design-tokens, information-architecture, accessibility-ada, ui-style-* skills |
| `plugins/eisen-architecture/` | hexagonal-architecture, ports-and-adapters, agent-friendly-codebase skills |
| `plugins/eisen-platform/` | deploy-versioning, image-tagging, site-plugin skills |
| `scripts/` | validate-registry, render-firebase, bootstrap-ci-auth, install-host |
| `docs/` | plan, runbooks, style mockup gallery |

## Quickstart

```bash
make check            # validate the registry and build/test whatever packages exist
make portal-dev       # run the portal locally
make render-firebase  # regenerate firebase.json rewrites after editing the registry
```
