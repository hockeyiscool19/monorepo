# Agent contract — eisensoftware platform monorepo

This repository is the controller for `eisensoftware.com`: a tiles portal, an API gateway, the app
registry that drives both, the CI/CD sync from app repos, and the skill plugins that other repos install.
The tool-neutral instructions live here; `CLAUDE.md` only imports this file.

## Read in this order, and stop as soon as you have enough

1. This file.
2. `docs/EXECUTION_PLAN.md` — goals, decisions, phases, and the living Progress / Decision log sections.
3. The `README.md` of the package you are touching (`apps/portal`, `apps/gateway`, `plugins/<name>`).
4. `registry/README.md` if you touch anything that involves an app's URL, path, version or status.

## Layout

| Path | What it is | Owner |
|---|---|---|
| `registry/` | Source of truth: `registry.json` (one object: `platform` + `apps[]`), `schema/registry.schema.json` | coordinator (CI patches each app's `deployment`) |
| `apps/portal/` | SvelteKit static tiles app; reads the registry at build time | portal agent |
| `apps/gateway/` | Cloud Run API gateway (Hono + TypeScript, hexagonal layout) | gateway agent |
| `firebase.json`, `.firebaserc` | Hosting site + rewrites; rewrites are rendered from the registry | coordinator |
| `scripts/` | Repo-level tooling (validate registry, render firebase config, bootstrap CI auth, install-host) | coordinator |
| `.github/workflows/` | CI, deploy, register-deployment, reusable register-app | coordinator |
| `plugins/eisen-design/` | Skills: design-tokens, information-architecture, accessibility-ada, ui-style-* | design agents |
| `plugins/eisen-architecture/` | Skills: hexagonal-architecture, ports-and-adapters, agent-friendly-codebase | architecture agent |
| `plugins/eisen-platform/` | Skills: deploy-versioning, image-tagging, site-plugin | platform agent |
| `docs/` | Plan, runbooks, style mockup gallery | coordinator |

## Rules (every package)

- **`registry/registry.json` is the only place the domain, hosting site, gateway, or an app's URL, path, version or status is written.** Everything else renders from it.
- **Components use design tokens only** (`plugins/eisen-design/skills/design-tokens/tokens.css`). No hardcoded colors,
  sizes, radii or durations in components. A style is a `tokens.css`; swapping styles never touches markup.
- **Source files stay at or under 400 lines.** Split by seam (domain / application / adapters), not by line count.
- **Domain has no I/O.** Ports take one request model and return one result model. The composition root is the only
  place that wires adapters to ports.
- **Never weaken a config, lint rule or test to silence a finding.** Fix the code or record the exception in the plan.
- **No secrets in the repo.** `.env*` files are ignored. Config comes from environment variables with documented names.
- **Each app owns its `package.json` and lockfile.** There is no root workspace, so parallel installs never race.
- **Accessibility is a gate, not a polish step.** Keyboard reachable, visible focus, 4.5:1 text contrast, labels on inputs.

## Verify

```
make check            # registry validation + every package check that exists
make portal-build     # apps/portal → apps/portal/build (+ registry.json)
make render-firebase  # regenerate firebase.json rewrites from the registry (idempotent)
```

Report gate results verbatim (the command and its pass/fail output), not a summary.

## Working agreements for agents

- Agents do not commit, do not run cloud, DNS or `firebase deploy` commands, and do not modify other repositories.
  The coordinator commits at phase boundaries and performs cloud actions only after Jordan's explicit go.
- A worker packet has fixed fields: **Outcome · Read-only · Write-only · Verify · Return · Stop**. Write only inside your
  Write-only paths.
- Commit subjects are imperative sentences stating the outcome. Branch prefixes: `feat/`, `fix/`, `docs/`, `skills/`.
- When something in the plan turns out to be wrong, add a line to **Surprises & discoveries** rather than silently adapting.
