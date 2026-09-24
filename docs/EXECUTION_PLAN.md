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
plugins/eisen-design/          skills: design-tokens · information-architecture · accessibility-ada · ui-style-* (×6, nordic added in Phase 8)
plugins/eisen-architecture/    skills: hexagonal-architecture · ports-and-adapters · agent-friendly-codebase
plugins/eisen-platform/        skills: deploy-versioning · image-tagging · site-plugin (+ generated sites/site-<app>)
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
CORS; plus generated per-site skills `sites/site-<app>/SKILL.md` from the registry so Claude knows each site's URLs, API and
smoke tests). `.claude-plugin/marketplace.json` lists the three plugins. `scripts/install-host.sh` symlinks skills into
a host's `.claude/skills` and `.cursor/skills` and writes the AGENTS.md pointer (mirrors eval-driven-dev).
**Verify** installing into a scratch repo works both ways; `claude plugin` lists the skills.

### Phase 8 — Eisenhold: the 3D portal, platform sign-in and the Vale door (coordinator + agents)
Jordan's goal (2026-09-23): replace the tiles with a Skyrim-like world where you walk into a gateway per app; Vale
only for registered, grouped users because it reaches a real account and card; every space open when run locally;
a grainy, nostalgic "My Get-a-way" room with a Colorado view, a drawing board that files Jira-lite project ideas as
sticky notes on a cork board, and Pokémon-like animations when a project is completed. Scope: **this repository
only** (no app repo changes) and only the eisensoftware portal becomes 3D.

**Registry (contract v1, additive).** `platform.auth` = `{enabled, provider: "firebase", projectId, sessionHours
(1–168), note?, groups: [{id, name, emblem, description}]}` — the group profiles. `apps[].access` = `{groups: [ids
declared in platform.auth.groups; [] = any signed-in user], note?}`; an app with `access` needs `platform.auth` and
`web.kind: "cloud-run"`. `auth` joins the reserved app ids. Groups are the Firebase custom claim `groups` (array of
ids), written only by `scripts/grant-groups.mjs`.

**Gateway door (`apps/gateway`).** Hosting rewrites an app with `access` to the gateway (when `auth.enabled` and
`gateway.enabled`), and the gateway is the only way in:
- `POST <app.path>/__door/session` (Bearer Firebase ID token) → verify (RS256 against Google's securetoken JWKS,
  `iss https://securetoken.google.com/<projectId>`, `aud <projectId>`) → policy → 200 + `Set-Cookie: __session=<envelope>;
  Path=<app.path>; HttpOnly; SameSite=Lax; Secure` · 401 `sign_in_required` · 403 `group_required`. `DELETE` → 204, platform part removed.
- `ANY <app.path>{,/**}` → open the envelope, re-check its groups against the current registry, forward to `web.url` +
  path + query with the app's own `__session` value substituted in, re-seal any `__session` the app sets. Denied
  navigations → 303 `/?gate=<id>&reason=<sign_in_required|group_required|session_expired|door_unconfigured>`; other
  denials → JSON 401/403/503. Door responses are never shared-cacheable (`private`, `vary: cookie`).
- Envelope: `d1.<iv>.<ciphertext>` (base64url), AES-256-GCM, key HKDF-SHA256(`SESSION_SECRET`), AAD `door:<id>`;
  plaintext `{p: {uid, email?, name?, groups, iat, exp} | null, a: <app cookie> | null, ax: <app cookie expiry> | null}`.
  Firebase Hosting forwards only `__session`, so the envelope carries both the platform session and the app's cookie.
- `GET <prefix>/auth/me` (Bearer) → user, groups, per-app decisions. `ANY <prefix>/<id>/*` for an app with `access`
  needs a Bearer token that passes the policy, except `<prefix>/<id><healthPath>`.
- Settings: `SESSION_SECRET` (+ `SESSION_SECRET_PREVIOUS`; unset → 503 `door_unconfigured`, fail closed),
  `ACCESS_MODE=enforce|open` (open refused on Cloud Run), `FIREBASE_AUTH_EMULATOR_HOST` (unsigned emulator tokens, refused
  on Cloud Run), `UPSTREAM_AUTH=metadata|none` (`X-Serverless-Authorization` ID token so `vale` can later drop `allUsers`).

**Portal (`apps/portal`).** `/` is the world (three.js + Svelte HUD), `/apps` keeps the tiles and deployments as the
accessible list view. Realm mode: `open` on localhost/dev (every gate and space open, no sign-in) unless `?realm=guarded`;
`guarded` everywhere else. Sign-in and the group profile use the Firebase JS SDK (config from `PUBLIC_FIREBASE_*` or
Hosting's `/__/firebase/init.json`; emulator via `PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`). My Get-a-way requires group
`owner` when guarded; its board lives in Firestore `boards/getaway/cards/*` (rules: `owner` only) when guarded and in
`localStorage` when open. Scene colors live in one module (`engine/palette.ts`, the WebGL analog of `tokens.css`); UI
reads tokens only; the portal adopts the new `ui-style-nordic`.

**Verify.** `make check` green (registry, sites, portal build + unit tests, gateway tests); the door's rules proven by
gateway unit tests; a local rehearsal with the Auth emulator shows sign-up → sealed (no group) → `grant-groups` → the
Vale gate opens and `/vale/` renders through the local gateway; browser screenshots of the world, the Get-a-way, the
board and the completion animation; axe on `/apps` and the world's menus. Cloud steps (Auth providers, secret,
Firestore, grants, IAM) are Jordan's go — `docs/runbooks/platform-auth.md`.

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
4. Optional (faster than the 30-minute pull sync): create a fine-grained PAT (repo `monorepo`, Contents: write) and add it as secret `MONOREPO_DISPATCH_TOKEN` in the
   vale and healthconnect repos.
5. Review and merge the vale and healthconnect PRs (Phase 4).
6. Pick the portal style from the mockups (Phase 5) — Phase 8 adopted `ui-style-nordic` for the realm; swap with one line.
7. Phase 8 go-steps, in order, in `docs/runbooks/platform-auth.md` (a–i): enable Firebase Authentication in `researcher-455022`
   (Google + Email/Password, authorized domains), register a web app, create `gateway-session-secret`, create Firestore and deploy
   `firestore.rules`, sign up in the realm and `grant-groups --set owner,vale` yourself, merge, verify, then close the run.app side door.

## Progress

- [x] 2026-09-23 Recon: domain, Firebase projects/sites, Cloud Run, vale repo, autoresearcher conventions, existing skills.
- [x] 2026-09-23 Decisions 1–4 taken by Jordan (project, routing, framework family, distribution).
- [x] 2026-09-23 Phase 0 — Foundation. Evidence: `node scripts/validate-registry.mjs` → `registry: valid — platform eisensoftware.com, 3 app(s)`; commit `1ab6929`.
- [x] 2026-09-23 Phase 1 — Portal. Evidence: `make portal-build` exit 0, build has `index.html` + `registry.json`, 3 tiles (2 live, 1 beta), `npm run check` → 0 errors 0 warnings, `node scripts/render-firebase.mjs --check` → up to date (3 rewrites); browser check at 360/1280 light+dark, no horizontal scroll.
- [ ] Phase 2 — Hosting + DNS. Done 2026-09-23: site `eisensoftware` created; portal deployed (`curl https://eisensoftware.web.app/` → 200, `/registry.json` served); healthconnect verified routable through the rewrite (`/healthconnect/` 200, assets 200, `/healthconnect/health` 200) and flipped to `routing.ready: true` — first tile routed through the platform. Waiting on Jordan: `./scripts/attach-domain.sh` + Cloudflare records (the attach API call is blocked for Claude by the auto-mode classifier).
- [x] 2026-09-23 Phase 3 — Gateway. Code: `make gateway-test` → 92 passed, `layers: ok`. Deployed (Jordan's go): Artifact Registry repo `platform`; Cloud Build image `platform/gateway:sha-bd9eb399e4ad` (+`main`); Cloud Run `gateway` revision `gateway-00001-szh` (256Mi, max 3 instances, public, `REGISTRY_URL=https://eisensoftware.web.app/registry.json`); `platform.gateway.enabled: true` → `/api{,/**}` rewrite. Evidence through Hosting: `/api/health` 200 (vale ok 36 ms, healthconnect ok 14 ms), `/api/registry` 200 without `repo`, `/api/vale/grocery/health` 200 `x-upstream-app: vale`, `/api/healthconnect/health` 200, `/api/nope/x` 404; portal hero shows `Gateway healthy · 2 apps live` in a browser.
- [x] 2026-09-23 Phase 4 — CI/CD sync (monorepo side). `ci.yml`, `deploy.yml` (fails loudly until the WIF variables exist; gateway jobs gated on `platform.gateway.enabled`), `register-deployment.yml` (repository_dispatch `app-deployed` → `scripts/register-deployment.mjs` → bot commit → reusable deploy), reusable `register-app.yml`; `integrations/vale` and `integrations/healthconnect` prepared for Jordan to apply. Evidence: `node --test scripts/*.test.mjs` → 9/9 pass; dry run leaves the registry unchanged; action-validator and a YAML parse pass on all 7 workflow files; commit-and-push retry proven against a throwaway bare remote. CI access applied 2026-09-23 (Jordan's go): Deploy run 35870056588 green end to end — CI-built image `gateway:sha-e1ba2790a34d` is Cloud Run revision `gateway-00002-dh4` (operator `REGISTRY_URL` survived), portal redeployed. Pending Jordan: `MONOREPO_DISPATCH_TOKEN` in the app repos, merge the two app-repo changes.
- [x] 2026-09-23 Phase 5 — Design skill base. design-tokens (contract 1.1: tokens + `components.md`), information-architecture, accessibility-ada (+ axe audit script), gallery (`make gallery` → `/docs/mockups/`), and five styles (expressive, editorial, dense, brutalist, organic). Evidence: `check-contrast.mjs` on all six token files → `RESULT: PASS` ×6 (62 light / 26 dark names each); every `mockup.html` byte-identical to `mockups/reference.html`; no color literals in any `components.css`; each style checked in a browser at 360px (no page overflow) and 1280px, light and dark. Next: Jordan picks the portal style (`PORTAL_STYLE=ui-style-<name>`).
- [ ] Phase 6 — Architecture skill base
- [x] 2026-09-23 Phase 7 — Platform skills + distribution. `plugins/eisen-platform` (deploy-versioning, image-tagging, site-plugin + generated `sites/site-{healthconnect,topology,vale}`), `.claude-plugin/marketplace.json`, `scripts/install-host.sh`, `docs/runbooks/adopt-standards.md`. Evidence: `claude plugin validate --strict` → `Validation passed` (marketplace and plugin); local `marketplace add` + `install eisen-platform@eisensoftware` listed 6 skills, then uninstalled; host test under `/bin/bash` 3.2 → 33 links, AGENTS.md block, idempotent second run, clean `--uninstall`; `make sites-check` → up to date (now part of `make check`). Coordinator renamed generated dirs to `site-<id>` so marketplace and submodule expose the same skill name.
- [x] 2026-09-23 CI/CD pull path — the platform reads what is running. `scripts/sync-deployments.mjs` (rules shared with `register-deployment.mjs` through `scripts/lib/registry-io.mjs`, its behaviour and tests unchanged), `.github/workflows/sync-deployments.yml` (every 30 min + `workflow_dispatch`, group `registry-write`, bot commit, reusable deploy), platform contract v1 in the site-plugin skill (site skills regenerated); `MONOREPO_DISPATCH_TOKEN` is now optional. Evidence: `node --test scripts/*.test.mjs` → 20/20 pass; live `--dry-run` → vale and healthconnect `skipped — health JSON has no version`, topology `skipped — no api block`; action-validator exit 0; commit/push retry proven against a throwaway bare remote; `make check` exit 0. Records deploys once each app serves the contract.

- [x] 2026-09-23 Goal: every app repo supports the platform (contract v1: base path, relative redirects, one `__session` cookie at `Path=/<id>`, health JSON with version/commit, `--update-env-vars` deploys). Each app was deployed as a tagged no-traffic revision, verified on its tag URL, then moved to latest (rollback targets kept). topology: hockeyiscool19/topology#1 merged into `modernize`, `topology-00002-juj`. vale: hockeyiscool19/healthconnect#3 merged into `v2-grocery`, `vale-00003-fax` (root kept on run.app via `proxy.ts`; Kroger sign-in unchanged on the direct host). healthconnect: `jordan-lifts-00032-pem` live from branch `platform/eisensoftware` (pushed); opening its PR to `main` was blocked for Claude — Jordan opens/merges it (merging redeploys via its CI). Evidence: all three tiles link to `/<id>/` and show live versions recorded by `sync-deployments.yml` (0 skipped); `/api/health` reports all three ok; a browser click on the Vale tile renders Vale with every asset from `/vale/_next/`.

- [ ] 2026-09-23 Phase 8 — Eisenhold, platform sign-in and the Vale door. Built and verified locally; production waits on the go-steps in `docs/runbooks/platform-auth.md` (merging before step c leaves the deploy red at the secret guard, with production unchanged). Evidence:
  - `make check` exit 0: `registry: valid … access-controlled: vale`, `sites: up to date (3 skill(s))`, portal build (`index.html`, `apps.html`, `registry.json`), `registry: published copy valid, no repo blocks`, portal `Tests 37 passed | 2 skipped`, gateway `Tests 223 passed (223)`, `layers: ok`; `npm run check` → 0 errors 0 warnings; scripts `node --test` → 57/57; `render-firebase --check` → `up to date (4 rewrites; through the gateway door: /vale)`; `test-firestore-rules.mjs` in the emulator → `126 checks, 126 as expected`.
  - Local realm in a browser: title → world (aurora, three gates from the registry, square, Word Wall with live versions, guard, dragon); fast travel to the Vale gate; E → loading screen → `http://localhost:5173/vale` renders Vale through the dev proxy (every space open locally). My Get-a-way: grainy film grade, Colorado through the window, drafting table, 3D cork board with handwritten stickies; drawing board filed `GET-4` (feature, labels) to the cork board and `localStorage`; moving a card to Done played the evolution ("…evolved into RELEASE!", EXP, "YOU grew to Lv. 4!").
  - Guarded rehearsal (`make realm-rehearsal`: Auth + Firestore emulators, gateway door on :8787, portal on :5174): Vale gate sealed with a crimson ward and prompt `Sealed · Vale Gate`; through the portal's same-origin proxy: door without token 401, signed in without guild 403, after `grant-groups --emulator … --set owner,vale` 200 with `__session=d1.<sealed>; Path=/vale; Max-Age=43200; HttpOnly; SameSite=Lax`, `/api/auth/me` allowed, `/vale` 200 `Vale` via `x-upstream-app: vale` (`private, no-store`), without the cookie 303 `/?gate=vale&reason=sign_in_required`, sign-out 204. The owner's Firestore board passes against the real rules and refuses a Vale-only member (`tests/world/firestoreBoard.emulator.test.ts`, 2/2 with the emulators up).
  - axe-core (WCAG 2.2 AA tags) in the browser: 0 violations on `/apps`, the title, the HUD, map, journal (4 tabs), pause, settings, cork board, drawing board with errors, Word Wall, evolution, guarded notice and sign-in, light and dark.
  - Go-steps done 2026-09-23 on Jordan's go ("deploy it", Vale locked now): (b) not needed — the site's `/__/firebase/init.json` already serves this project's web config; (c) service account `gateway-runtime`, secret `gateway-session-secret` v1 (generated, never printed; accessor → gateway-runtime, viewer → github-actions), gateway revision `gateway-00011-rhc` runs as `gateway-runtime`, `/api/health` ok for all three; (d) `(default)` Firestore already existed (us-central1, HealthConnect's server-side data, no rules ever released) — `test-firestore-rules.mjs` → `126 checks, 126 as expected`, then `firebase deploy --only firestore:rules` → released. Still Jordan's: (a) enable Authentication (Google + Email/Password) and authorize `eisensoftware.web.app`, (e) sign in, then `grant-groups --set owner,vale`, (h) the run.app side door.

- [x] 2026-09-23 Eisenhold: the Jarl's story (Jordan's ask: tidbit signs and easter eggs about the hockey career, Tesla,
  Vermont and Burr and Burton, club soccer for Deportivo Cuenca, Davidson College and NREL; a mythical battery and a message
  about Bush inventing the solar panel at NREL in the middle of the map; tidbits and visuals in the room). The Heartcell
  (a 4680-shaped mythical battery) replaces the soul gem over the dais, with the legend's lectern before it; Memory Lane
  by the road in; six landmarks (pond rink, Supercharger, Vermont covered bridge over a carved brook with a walkable deck,
  Cuenca's domes, Davidson's portico, NREL's turbine and solar field); twelve keepsakes in My Get-a-way; 27 tidbits read
  with E into a dialog, counted in a new journal tab, listed on the map. Words in `domain/tidbits.ts`, placement in
  `domain/landmarks.ts`. Evidence:
  - `make check` exit 0: `registry: valid … access-controlled: vale`, `sites: up to date (3 skill(s) …)`, portal build,
    `registry: published copy valid, no repo blocks`, portal `Tests 52 passed | 2 skipped (54)` (new: `landmarks.test.ts`
    10, `tidbits.test.ts` 5), gateway `Tests 223 passed (223)`, `layers: ok`; `npm run check` → `0 ERRORS 0 WARNINGS`.
  - Browser (local realm): every landmark reached by the map's Travel and screenshotted; the Heartcell and legend
    lectern (prompt `[E] Read · The Legend of the Panel`, dialog `1 of 27 tidbits found`); walking into Green Mountain
    Crossing stays on the deck across the brook; keepsakes in the room with prompts (`[E] Look at · Red Model Car`);
    reduced motion holds the Heartcell still and fully charged; 120 fps at the spawn on this machine.
  - axe-core (WCAG 2.2 AA tags): 0 violations on the tidbit dialog, the journal's Tidbits tab and the map, light and
    dark; no page overflow at 375 px. Engine chunk 690.96 → 746.42 kB (gzip 182.06 → 201.28 kB), loaded after the title
    screen; the >500 kB chunk warning predates this change.
  - Room fix on the way: the Get-a-way postcard sat exactly on its frame's face (z-fighting); it now sits 4 mm proud.
  - Deployed on Jordan's go ("merge it to main", "push to main"): `6cb0db2` pushed (`0f58075..6cb0db2`); Deploy platform
    run 35944104355 green (gateway image, Cloud Run, Hosting) and CI run 35944104328 green. `eisensoftware.web.app` serves
    the same chunks as the local build (`nodes/3.D9saS5an.js` holds the tidbits, `chunks/D7b1Ilh4.js` the Heartcell and
    the legend's plaque); `/api/health` → gateway `0.0.0+sha.6cb0db2fc4bf`, vale, healthconnect and topology ok. In the
    browser, guarded mode, after First Chair became a fourth gate: the map lists every landmark and the Heartcell, and
    Travel to it gives `Read · The Legend of the Panel`. The apex still waits on Phase 2's DNS.
- [x] 2026-09-24 New app `ski` — First Chair, a three.js ski game (Bromley, Loveland, A-Basin), from its own repo
  `hockeyiscool19/first-chair` built on these standards (platform submodule + linked skills, hexagonal apps, `make
  check` gates, contract v1). Jordan's ask: "separate repo with monorepo architecture but deployed on the monorepo".
  Manual first deploy: Cloud Run `ski-00001-fz5`, image `first-chair/ski:sha-c0f7863f8975`. Registry entry (routing.ready
  false), `/ski{,/**}` rewrite, generated `site-ski`. Evidence: `curl …run.app/ski/health` → `{"status":"ok","app":"ski",
  "version":"0.0.0+sha.c0f7863f8975","commit":"c0f7863…"}`; `make check` exit 0 (portal 52 passed, gateway 223 passed);
  `node --test scripts/*.test.mjs` → 57/57. Deploy platform run 35947032956 green; rule 7 through the Hosting rewrite
  (`eisensoftware.web.app`, as for healthconnect — the apex still waits on Phase 2's DNS): `/ski/` 200, `/ski/health`
  200 (`ski-00002-k5c`, 0.0.0+sha.d446edc32736), `/ski/assets/index-CMpiU1DD.js` 200 → `routing.ready: true`. Open for
  Jordan: admit first-chair to the CI identity (`REPOS="hockeyiscool19/first-chair" ./scripts/bootstrap-ci-auth.sh
  --apply-github`); until then its Deploy workflow skips the Cloud Run job and `make deploy` deploys from a laptop.

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
- The first published `/registry.json` exposed each app's `repo` block (private repository names, local checkout paths).
  Fixed 2026-09-23: portal and gateway publish without `repo`; `validate-registry.mjs --published` runs in `make portal-build`.
- `jordan-lifts` and `vale` keep credentials as plain Cloud Run env vars (passwords, API keys, session secret); see
  `docs/runbooks/secrets.md` for the Secret Manager migration and rotation.
- vale's `--source` deploys need `roles/cloudbuild.builds.editor` on the CI service account (added to bootstrap-ci-auth.sh).
- Untagged builds use `0.0.0+sha.<12>` everywhere (deploy-versioning skill, monorepo deploy, both app integrations).
- Firebase Hosting serves HTML with `max-age=3600` by default, so browsers showed stale tiles for up to an hour after a
  deploy. `firebase.json` now sends `no-cache` for `/` and `*.html` and `immutable` only for `/_app/immutable/**`.
- The portal's status probe is `cache: 'no-store'`: a browser that fetched `/api/health` before the gateway existed kept
  replaying that cached 404. The probe budget is 6 s because the gateway allows 3 s per cold upstream.
- Links to rewrite-served paths (`/api/*`, app paths) need `rel="external"` or the prerender crawler fails the build on them.
- Cold upstreams (scale-to-zero) can miss the gateway's 3 s health probe on the first call; warm probes answer in 15–50 ms.
- Firebase Hosting forwards only the `__session` cookie to Cloud Run: healthconnect's Starlette `session` cookie and vale's
  Kroger cookies could never reach the apps through the platform. Contract v1 makes `__session` scoped to `Path=/<id>` mandatory.
- The Firebase CDN caches 404s from Cloud Run rewrites for 10 minutes (`max-age=600`, `x-cache: HIT`); a Hosting release purges them.
- healthconnect has no Google login configured (`GOOGLE_CLIENT_ID`/`SECRET` unset), so its pages (body weight, brief) are public.
- Firebase Hosting forwards only `__session`, and Vale already owns `__session` at `/vale`: the door therefore seals the
  platform session and Vale's own cookie into one envelope (AES-256-GCM, bound to the app) and hands Vale its cookie back.
- The live Vale (v2) has no user sign-in of its own, and its run.app URL is public: the door protects `eisensoftware.com/vale`
  only once Hosting routes it through the gateway, and the side door closes only when `vale` drops `allUsers` (runbook h).
  Vale's own deploy passes `--allow-unauthenticated`, which re-opens it on every Vale deploy — a Vale repo change for Jordan.
- An ID token issued before a group was removed can still open a fresh door session within its hour; sessions last up to
  `sessionHours` (12). Rotating `SESSION_SECRET` ends every session at once (runbook i).
- firebase-tools 15 refuses Java below 21 (the Firestore emulator); Homebrew `openjdk` (23) works, `openjdk@17` does not.
- `npm ci` in the portal can SIGSEGV in `@firebase/util`'s postinstall under Node 24 on macOS; a retry passes (CI uses Node 20).
- `npm install vitest@4` hit an npm arborist bug (`Cannot read properties of null (reading 'edgesOut')`); installing it on
  its own with `--legacy-peer-deps` worked and a clean `npm ci` from the lockfile passes.
- three.js 0.186 removed `PCFSoftShadowMap` (falls back to `PCFShadowMap`).
- Canvas-painted text on faces the moon does not light is unreadable at night: the legend's plaque needed an emissive
  mask of its letters (as the gate runes have) before it could be read from the square.
- Fast travel to a tall landmark frames nothing but its base at the default gaze: a landmark can now set `gaze`, and the
  spawn carries it as the arrival pitch (NREL looks up at its turbine).

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
| 10 | The portal becomes Eisenhold, a three.js realm at `/`; the tiles stay at `/apps` as the accessible list view | Jordan asked for a walkable, Skyrim-like portal; the list keeps every app one click away | Jordan (goal), Claude (shape), 2026-09-23 |
| 11 | Platform identity is Firebase Authentication in `researcher-455022` (the Hosting project); groups are the custom claim `groups`, granted only by `scripts/grant-groups.mjs` | Same-origin auth handler and `/__/firebase/init.json` on the site's own domains; one project for Hosting, gateway and identity | Claude, 2026-09-23 — Jordan may swap `platform.auth.projectId` |
| 12 | Warded apps are served through the gateway door (`apps[].access`), not guarded by the client | A 3D gate is only a picture; the door checks identity and group on every request, fails closed, and needs no change in Vale | Claude, 2026-09-23 |
| 13 | Realm mode is `open` on localhost and under `vite dev` (every gate and room, board in `localStorage`), `guarded` elsewhere; `?realm=guarded` rehearses production | Jordan: "All spaces should be available when deploying locally"; the server-side door is unaffected by the client's mode | Jordan, 2026-09-23 |
| 14 | My Get-a-way belongs to group `owner`; its board is Firestore `boards/getaway/cards/*` under `firestore.rules` | Personal plans stay private; rules enforce the card schema and immutable keys | Claude, 2026-09-23 |
| 15 | The portal adopts `ui-style-nordic`; scene colours live in `engine/palette.ts` only | The realm needs one look across HUD and scene; tokens for UI, one palette module for WebGL | Claude, 2026-09-23 — Jordan may swap |
| 16 | The owner's story lives in the world as landmarks and tidbits: words in `domain/tidbits.ts`, places in `domain/landmarks.ts`, found tidbits remembered per browser; the legend of the panel is told as a legend, with the scribes' dates | One place to edit the story; tests keep landmarks clear of any gate layout; a playful claim stays visibly playful | Jordan (goal), Claude (shape), 2026-09-23 |

## Outcomes & retrospective

_(filled in as phases complete)_
