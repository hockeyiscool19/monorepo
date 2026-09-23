# Execution plan — eisensoftware platform

Status: active · Owner: Jordan (hockeyiscool19) · Coordinator: Claude · Started 2026-09-23

This plan follows the ExecPlan convention used in autoresearcher: it is self-contained, and the
four living sections at the bottom (Progress, Surprises & discoveries, Decision log, Outcomes &
retrospective) are updated as work lands. Read this file before touching the repo.

## Purpose

1. **Controller web app.** `eisensoftware.com` (Cloudflare DNS) becomes a portal, hosted on Firebase
   Hosting, showing one tile per application. Tiles route to the apps. Behind it sits an API gateway
   to the apps' APIs, and a CI/CD sync so that when an app (vale first) deploys to `main`, the
   gateway's deployment values update automatically. Supporting standards ship as skills: deployment
   versioning, image tagging, and per-site "plugin" skills.
2. **Generic skill base** that applies styling and architecture to every application:
   information architecture + ADA/WCAG compliance, a repository of 5 UI styles (each with a mockup
   of the same screen), and architecture skills (ports & adapters / hexagonal, agent-friendly
   codebases) distilled from `../autoresearcher`.

## What we found (recon, 2026-09-23)

- **Domain.** `eisensoftware.com` is on Cloudflare (registrar + DNS; NS `ximena`/`will.ns.cloudflare.com`).
  It has **no A/AAAA/CNAME records**, so the apex is free to point at Firebase Hosting.
  healthconnect's docs planned `eisensoftware.com/healthconnect` on Cloud Run but the DNS was never added.
- **Hosting project.** `researcher-455022` (project number `382031913173`, region `us-central1`).
  Cloud Run services: `vale` (live), `jordan-lifts` (healthconnect), `topology`. Firebase Hosting sites:
  `researcher-455022` (empty), `topology-cnc` (`**` → Cloud Run `topology` — the pattern we reuse).
  Artifact Registry repos: `jordan-lifts`, `cloud-run-source-deploy`. Keyless GitHub auth already exists:
  WIF pool `github-pool`, service account `github-actions@researcher-455022.iam.gserviceaccount.com`.
- **Vale.** Checkout `~/vale` (`~/projects/vale` is an empty folder). Remote `hockeyiscool19/healthconnect`
  (mirror `hairbrain-projects/healthconnect`). v2 = Next 16 App Router, live on Cloud Run
  `https://vale-382031913173.us-central1.run.app`; v3 (Next frontend + FastAPI backend) runs locally only.
  Firebase project `holistic-habit-ai` is used for Google sign-in only — its Hosting site has zero releases.
  CI workflows exist locally but were **never committed**; `deploy.yml` never sets `KROGER_REDIRECT_URI`.
  No tags or versions; documented scheme `v3.<minor>.<patch>`; `main` is declared frozen yet is the prod trigger.
- **healthconnect.** `~/projects/healthconnect` → remote `hockeyiscool19/garmin`. Python; honors
  `BASE_PATH=/healthconnect`; CI tags images `:<sha>`, `:latest`, `:v*` and deploys `jordan-lifts`.
- **Conventions to reuse.** `eval-driven-dev` (submodule + `install-host.sh`, AGENTS.md pointer, 400-line cap,
  Pydantic-only Python, parallel tests). autoresearcher (hexagonal `domain/application/adapters` layout enforced by
  `scripts/check_architecture.py`; ports as `Protocol`s taking one Pydantic request and returning one result;
  one composition root; AGENTS.md as source with `CLAUDE.md` = `@AGENTS.md`; generated agent index with a
  staleness test; worker packets with fixed fields).
- **Cloudflare API.** No token on this machine and the connector is unauthorized, so DNS edits are manual
  (or Jordan authorizes the Cloudflare connector).
- **Existing skills** (Anthropic, read-only reference on this machine): `ui-design`, `ui-design-editorial`,
  `ui-design-dense`, `accessibility-ada`, `information-architecture`. Ours are written fresh, not copied.

## Target architecture

```
Cloudflare DNS (DNS-only)   eisensoftware.com ──A/AAAA──▶ Firebase Hosting site "eisensoftware" (researcher-455022)
                                                            │ /                 → apps/portal (static tiles + /registry.json)
                                                            │ /api/**           → Cloud Run gateway (registry-driven proxy,
                                                            │                     /api/registry, /api/health)
                                                            │ /vale/**          → Cloud Run vale          (needs basePath /vale)
                                                            │ /healthconnect/** → Cloud Run jordan-lifts  (BASE_PATH=/healthconnect)
                                                            │ /topology/**      → Cloud Run topology

registry/registry.json ──render──▶ firebase.json rewrites · portal tiles · gateway routes
app repo CI (vale, healthconnect) ──repository_dispatch "app-deployed"──▶ .github/workflows/register-deployment.yml
                                                                          → patch registry → deploy portal → tiles show new version
```

## Repository layout (target)

```
AGENTS.md / CLAUDE.md          agent contract (tool-neutral) and Claude pointer
docs/EXECUTION_PLAN.md         this plan · docs/runbooks/ (dns, ci-auth, onboarding) · docs/mockups/ (style gallery)
registry/registry.json         one object: platform (domain, hosting, gateway) + apps[] · registry/schema/registry.schema.json
apps/portal/                   SvelteKit (adapter-static) tiles app → build/ (+ registry.json)
apps/gateway/                  Cloud Run API gateway (Node 20 + Hono, TypeScript, hexagonal layout, Dockerfile)
firebase.json / .firebaserc    Hosting site + rewrites, rendered from the registry by scripts/render-firebase.mjs
scripts/                       validate-registry.mjs · render-firebase.mjs · bootstrap-ci-auth.sh · install-host.sh
.github/workflows/             ci.yml · deploy.yml · register-deployment.yml · register-app.yml (reusable, workflow_call)
plugins/eisen-design/          skills: design-tokens · information-architecture · accessibility-ada · ui-style-* (×5)
plugins/eisen-architecture/    skills: hexagonal-architecture · ports-and-adapters · agent-friendly-codebase
plugins/eisen-platform/        skills: deploy-versioning · image-tagging · site-plugin (+ generated sites/<app>)
.claude-plugin/marketplace.json  plugin marketplace served from this repo
```

## Phases

Dependencies: 0 → {1, 3, 5, 6} in parallel · 2 after 1 · 4 after 1–3 · 7 after 5–6 · portal restyle after 5.

### Phase 0 — Foundation (coordinator)
Plan, AGENTS.md/CLAUDE.md, `registry/registry.json` (platform + vale, healthconnect, topology) with its schema,
design-token contract with a neutral `tokens.css`, initial `firebase.json`, zero-dependency registry validator, CI that runs it.
**Done when** `make check` passes and every later phase can start from committed contracts.

### Phase 1 — Portal (agent, owns `apps/portal/**`, `scripts/render-firebase.mjs`)
SvelteKit + adapter-static app that reads `registry/registry.json` at build time and renders one tile per app whose
`status` is not `hidden`. A tile links to `path` when `routing.ready`, else to `web.url`, and shows name, description,
icon, status badge and `deployment.version`. Uses only design tokens (neutral set). Emits `build/registry.json`.
`scripts/render-firebase.mjs` regenerates the `rewrites` block of `firebase.json` from the registry.
**Verify** `make portal-build` succeeds; build output lists all live apps; keyboard navigation and visible focus work;
`make render-firebase` is idempotent.

### Phase 2 — Hosting + DNS (coordinator + Jordan)
Create Hosting site `eisensoftware` in `researcher-455022` (fallback id `eisensoftware-com`), deploy the portal once,
add custom domain `eisensoftware.com` (+ `www`), hand Jordan the DNS records for Cloudflare (DNS-only / grey cloud),
verify certificate issuance. **Needs Jordan's go** before any cloud resource is created.
**Verify** `curl -I https://eisensoftware.com/` returns 200 from Firebase.

### Phase 3 — Gateway (agent, owns `apps/gateway/**`)
Hono + TypeScript service in hexagonal layout: domain (registry model, route matching), application ports
(RegistrySource, UpstreamHttp), adapters (file/HTTP registry loader, fetch proxy, Hono inbound), one composition root.
Routes: `/api/registry` (the registry with deployment values), `/api/health` (fan-out to each app's `healthPath`),
`/api/<app>/*` → `api.baseUrl` with the prefix stripped, `X-Gateway-Version` and `X-Upstream-App` headers, CORS from
registry origins. Registry is loaded from `https://eisensoftware.com/registry.json` with a bundled fallback, refreshed
periodically. Dockerfile per the image-tagging standard. Deploy to Cloud Run `gateway` (coordinator, with go) and add the
`/api/**` rewrite.
**Verify** unit tests with fake adapters pass; `docker build` succeeds; local run proxies `/api/vale/grocery/health` → 200.

### Phase 4 — CI/CD sync (agent for monorepo workflows; Jordan approves other-repo PRs)
Monorepo: `ci.yml` (validate registry, build portal, test gateway), `deploy.yml` (main → build portal → build/push
gateway image `:sha-<12>` and `:v*` → `firebase deploy`), `register-deployment.yml` (on `repository_dispatch`
`app-deployed`: validate payload, patch that app's `deployment` block in `registry/registry.json`, commit, redeploy portal),
`register-app.yml` (reusable `workflow_call` that app repos invoke). `scripts/bootstrap-ci-auth.sh` prints the WIF
variables to set. Vale repo PR: `basePath: "/vale"`, commit the workflows, fix `KROGER_REDIRECT_URI`, add the
register step, adopt tags `v*`. healthconnect PR: add the register step.
**Verify** a dispatch from vale's workflow updates the manifest and the tile shows the new version within one deploy.

### Phase 5 — Design skill base (agents, own `plugins/eisen-design/**`, `docs/mockups/**`)
`design-tokens` (the contract, refined), `information-architecture`, `accessibility-ada` (WCAG 2.2 AA checklist +
`scripts/a11y-audit.sh` using axe), and five `ui-style-*` skills — `expressive`, `editorial`, `dense`, `brutalist`,
`organic` — each with `SKILL.md`, `tokens.css` implementing the contract (light + dark) and `mockup.html`: the portal
tiles screen rendered in that style. `docs/mockups/index.html` is the side-by-side gallery. Candidates for expansion:
glass, retro-terminal, swiss, playful. After Jordan picks a style, the portal adopts its `tokens.css`.
**Verify** every mockup passes 4.5:1 contrast on text, uses only contract tokens, and renders at phone width.

### Phase 6 — Architecture skill base (agent, owns `plugins/eisen-architecture/**`)
From `autoresearcher-scafold`: `hexagonal-architecture` (layout, rules, configurable `check_architecture.py` for Python,
`dependency-cruiser` config for TypeScript, synthetic-tree tests), `ports-and-adapters` (Protocol/interface ports with one
request and one result model, adapters named by technology, fakes shipped as real adapters, `build_app(settings=None,
port=None)` composition roots, one error hierarchy mapped at the edge, frozen models with a contract version),
`agent-friendly-codebase` (AGENTS.md as source + `CLAUDE.md` pointer, per-package guides with fixed sections, generated
index with staleness test, one command per gate, never weaken configs, settings allowlist + secret-file denylist,
find-code/land-change routines, plans with the four living sections, worker packets, 400-line cap).
**Verify** the TypeScript checker passes on `apps/gateway` and fails on a synthetic violation; the Python checker's tests pass.

### Phase 7 — Platform skills + distribution (agent, owns `plugins/eisen-platform/**`, `.claude-plugin/**`, `scripts/install-host.sh`)
`deploy-versioning` (semver + `v*` tags, release ≠ deploy ≠ publish with receipts, environments, promote by tag),
`image-tagging` (`:sha-<12>` + `:v<semver>` + branch tag, never deploy `:latest`, OCI labels, Artifact Registry path
convention, retention), `site-plugin` (how an app joins the platform: manifest, base path, health endpoint, register step,
CORS; plus generated per-site skills `sites/<app>/SKILL.md` from the registry so Claude knows each site's URLs, API and
smoke tests). `.claude-plugin/marketplace.json` lists the three plugins. `scripts/install-host.sh` symlinks skills into
a host's `.claude/skills` and `.cursor/skills` and writes the AGENTS.md pointer (mirrors eval-driven-dev).
**Verify** installing into a scratch repo works both ways; `claude plugin` lists the skills.

## Delegation protocol

- The coordinator owns shared contracts (registry schema, token contract, `firebase.json`, workflows, this plan)
  and commits at phase boundaries. Agents **never commit, never run cloud/DNS commands, never touch other repos**.
- Each worker gets a packet with fixed fields: **Outcome · Read-only · Write-only · Verify · Return · Stop**.
  Write-only directories are disjoint, so agents run in parallel without conflicts. Each app keeps its own
  `package.json` and lockfile (no root workspace) so installs never race.
- Every source file stays ≤ 400 lines; components use tokens only; no secrets in the repo; report gate results verbatim.

## Manual steps for Jordan

1. Say "go" for Phase 2 (create Hosting site + custom domain in `researcher-455022`).
2. Add the DNS records Firebase prints at Cloudflare (DNS-only), or authorize the Cloudflare connector so Claude can.
3. Confirm the existing WIF pool/service account may be reused by `hockeyiscool19/monorepo`; set the repo variables the
   bootstrap script prints.
4. Create a fine-grained PAT (repo `monorepo`, Contents: write) and add it as secret `MONOREPO_DISPATCH_TOKEN` in the
   vale and healthconnect repos.
5. Review and merge the vale and healthconnect PRs (Phase 4).
6. Pick the portal style from the five mockups (Phase 5).

## Progress

- [x] 2026-09-23 Recon: domain, Firebase projects/sites, Cloud Run, vale repo, autoresearcher conventions, existing skills.
- [x] 2026-09-23 Decisions 1–4 taken by Jordan (project, routing, framework family, distribution).
- [x] 2026-09-23 Phase 0 — Foundation. Evidence: `node scripts/validate-registry.mjs` → `registry: valid — platform eisensoftware.com, 3 app(s)`; commit `1ab6929`.
- [x] 2026-09-23 Phase 1 — Portal. Evidence: `make portal-build` exit 0, build has `index.html` + `registry.json`, 3 tiles (2 live, 1 beta), `npm run check` → 0 errors 0 warnings, `node scripts/render-firebase.mjs --check` → up to date (3 rewrites); browser check at 360/1280 light+dark, no horizontal scroll.
- [ ] Phase 2 — Hosting + DNS. Done 2026-09-23: site `eisensoftware` created; portal deployed (`curl https://eisensoftware.web.app/` → 200, `/registry.json` served); healthconnect verified routable through the rewrite (`/healthconnect/` 200, assets 200, `/healthconnect/health` 200) and flipped to `routing.ready: true` — first tile routed through the platform. Waiting on Jordan: `./scripts/attach-domain.sh` + Cloudflare records (the attach API call is blocked for Claude by the auto-mode classifier).
- [ ] Phase 3 — Gateway. Code done 2026-09-23: `make gateway-test` → `layers: ok`, `Test Files 16 passed`, `Tests 90 passed`; `docker build` ok; smoke `/api/vale/grocery/health` → 200 with `X-Upstream-App: vale`. Pending Jordan's go: create Artifact Registry repo + Cloud Run service `gateway`, then `platform.gateway.enabled: true` + render + hosting deploy.
- [ ] Phase 4 — CI/CD sync
- [x] 2026-09-23 Phase 5 — Design skill base. design-tokens (contract 1.1: tokens + `components.md`), information-architecture, accessibility-ada (+ axe audit script), gallery (`make gallery` → `/docs/mockups/`), and five styles (expressive, editorial, dense, brutalist, organic). Evidence: `check-contrast.mjs` on all six token files → `RESULT: PASS` ×6 (62 light / 26 dark names each); every `mockup.html` byte-identical to `mockups/reference.html`; no color literals in any `components.css`; each style checked in a browser at 360px (no page overflow) and 1280px, light and dark. Next: Jordan picks the portal style (`PORTAL_STYLE=ui-style-<name>`).
- [ ] Phase 6 — Architecture skill base
- [ ] Phase 7 — Platform skills + distribution

## Surprises & discoveries

- Vale runs on Cloud Run, not Firebase Hosting; Firebase (`holistic-habit-ai`) is sign-in only.
- `eisensoftware.com` has no DNS records at all, despite healthconnect's docs describing an apex mapping.
- Vale's GitHub repo is named `healthconnect`; `~/projects/healthconnect` pushes to `garmin`.
- Vale's CI was never committed; `main` is "frozen" but is the only production trigger; a `v3` branch cannot coexist with `v3/diet`.
- The Firebase Hosting REST API needs `x-goog-user-project` when called with local ADC.
- The existing WIF provider `github-pool/providers/github` is restricted to `assertion.repository=='hockeyiscool19/garmin'`;
  reusing it for `monorepo` and vale means widening that condition (Phase 4, needs Jordan's go).
- Cloud Run services answer on two hostnames: `<service>-7qzmfxv3za-uc.a.run.app` and the deterministic
  `<service>-382031913173.us-central1.run.app`. The registry uses the deterministic form.
- A fourth service, `jordan-lifts-garmin`, exists (garmin scheduled job); it is not an app and is not in the registry.
- healthconnect answers `/healthconnect` (no trailing slash) with a 307 to `http://jordan-lifts-…run.app/healthconnect/` — its own
  host, over http. Tiles therefore link to `<path>/`; the service's `PUBLIC_URL` must become `https://eisensoftware.com/healthconnect`
  in Phase 4 so OAuth and redirects stay on the platform domain.
- SvelteKit's prerender crawler follows same-origin links; app paths served by Hosting rewrites need `rel="external"`.
- The neutral `tokens.css` shipped with `--color-border-strong` at 1.6:1 against `--color-bg`; the contract asks 3:1. Fixed in the 1.1 bump.

## Decision log

| # | Decision | Why | By / when |
|---|---|---|---|
| 1 | Host portal + gateway in `researcher-455022` | Cloud Run services already there; Hosting rewrites cannot cross projects; billing on | Jordan, 2026-09-23 |
| 2 | Path-prefix routing (`eisensoftware.com/<app>`) | One host and certificate; gateway-friendly; apps must honor a base path | Jordan, 2026-09-23 |
| 3 | Portal = SvelteKit + adapter-static, plain CSS tokens (no Tailwind) | Jordan chose Svelte/Vue; static + tiny; tokens keep styling framework-agnostic | Claude, 2026-09-23 |
| 4 | Skills ship as a Claude Code plugin marketplace **and** a submodule install script | Claude-native install plus Cursor compatibility (as eval-driven-dev) | Jordan, 2026-09-23 |
| 5 | Gateway = Cloud Run container (Node 20 + Hono, TypeScript) in hexagonal layout | Fits the image-tagging standard; first consumer of the architecture skills | Claude, 2026-09-23 |
| 6 | `registry/` is the single source of truth; rewrites, tiles and gateway routes are rendered from it; app repos update it via `repository_dispatch` | One place to change, CI-updatable, no server to run for the sync | Claude, 2026-09-23 |
| 7 | Five initial styles: expressive, editorial, dense, brutalist, organic | Covers consumer, content, pro-tool, dev-tool and wellness (vale) products | Claude, 2026-09-23 — Jordan may swap |
| 8 | Agents never commit or touch cloud/DNS/other repos; coordinator commits per phase; those actions need Jordan's explicit go | Safety and reviewability | Claude, 2026-09-23 |
| 9 | One `registry/registry.json` (platform + `apps[]`) instead of one file per app | Generic: a single object to validate, publish, patch and consume | Jordan, 2026-09-23 |

## Outcomes & retrospective

_(filled in as phases complete)_
