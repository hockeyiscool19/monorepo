# monorepo — eisensoftware platform

The controller for `eisensoftware.com`: Eisenhold, a walkable 3D portal with a gate to each application (and a plain
list view), an API gateway in
front of their APIs, the app registry that drives both, the CI/CD sync that keeps deployment values current,
and the skill plugins (design, architecture, deployment standards) that every application repo installs.

Plan of record: [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md). Agent contract: [AGENTS.md](AGENTS.md).

## How it fits together

```
eisensoftware.com (Cloudflare DNS → Firebase Hosting, project researcher-455022)
  /                  Eisenhold, the 3D realm (apps/portal, static) · /apps the tiles list view
  /api/**            gateway (apps/gateway, Cloud Run)
  /<app>/**          each app's Cloud Run service, via Hosting rewrites rendered from registry/
```

`registry/registry.json` (one object: `platform` + `apps[]`) is the only place the domain, hosting, gateway and each app's path, URL, version and status are written.
App repos report deploys with a `repository_dispatch`, CI patches the manifest and redeploys the portal.

## Layout

| Path | Contents |
|---|---|
| `registry/` | `registry.json` + schema ([README](registry/README.md)) |
| `apps/portal/` | SvelteKit static portal: the 3D realm Eisenhold and the `/apps` list |
| `apps/gateway/` | Hono + TypeScript API gateway |
| `plugins/eisen-design/` | design-tokens, information-architecture, accessibility-ada, ui-style-* skills |
| `plugins/eisen-architecture/` | hexagonal-architecture, ports-and-adapters, agent-friendly-codebase skills |
| `plugins/eisen-platform/` | deploy-versioning, image-tagging, site-plugin skills |
| `scripts/` | validate-registry, render-firebase, bootstrap-ci-auth, install-host |
| `docs/` | plan, runbooks, style mockup gallery |

## Use the standards in an app repo

Two ways; both install the same skills (design, architecture, deployment, and one `site-<id>` skill per app).

**Claude Code plugins.** The repo is a plugin marketplace named `eisensoftware`:

```bash
claude plugin marketplace add hockeyiscool19/monorepo
claude plugin install eisen-design@eisensoftware
claude plugin install eisen-architecture@eisensoftware
claude plugin install eisen-platform@eisensoftware
```

Update later with `claude plugin marketplace update eisensoftware`, then `claude plugin update <plugin>@eisensoftware`.

**Submodule (Claude Code and Cursor).** Mirrors eval-driven-dev:

```bash
git submodule add git@github.com:hockeyiscool19/monorepo.git platform
./platform/scripts/install-host.sh            # --dry-run to preview, --uninstall to remove
```

It symlinks every skill into `.claude/skills/` and `.cursor/skills/` and adds a pointer block to the host's `AGENTS.md`.
Details: [docs/runbooks/adopt-standards.md](docs/runbooks/adopt-standards.md).

## Quickstart

```bash
make check            # validate the registry, check generated skills, build/test whatever packages exist
make portal-dev       # walk Eisenhold locally: every gate and room open, no sign-in (http://localhost:5173)
make realm-rehearsal  # the guarded realm locally: Auth/Firestore emulators + the gateway door (http://localhost:5174)
make render-firebase  # regenerate firebase.json rewrites after editing the registry
make sites            # regenerate the per-app site-<id> skills after editing the registry
make gallery          # serve the repo; style gallery at http://127.0.0.1:4178/docs/mockups/
```

Vale reaches a real account and card, so it is served through the gateway's door: sign-in (Firebase) plus a guild
(`groups` claim) on every request. Turning that on in production is a short list of cloud steps for Jordan:
[docs/runbooks/platform-auth.md](docs/runbooks/platform-auth.md).
