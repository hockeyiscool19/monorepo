---
name: site-plugin
description: How an application joins eisensoftware.com and stays registered — platform contract v1 (full path forwarded under /<id>, relative redirects, the single __session cookie Firebase Hosting forwards, the health JSON with version and commit, APP_VERSION/APP_COMMIT/APP_DEPLOYED_AT set with --update-env-vars, one base-path helper), the optional access block (sign-in and groups through the gateway door, closing the run.app side door), its registry entry, base-path support per framework (Next.js basePath, FastAPI root_path or BASE_PATH, Vite base, SvelteKit paths.base), CORS and OAuth origins, how deploys reach the registry (scheduled health sync, optional register-app call), what routing.ready means and who flips it, and the generated site-<id> skills rendered from the registry. Load when onboarding an app to the platform, changing an app's path, URL, API block, health check, cookies, redirects or status, wiring its deploy workflow to the registry, or regenerating the site skills.
---

# Site plugin — joining the platform

`eisensoftware.com` is one host. The portal renders a tile per app, Firebase Hosting rewrites `/<path>/**` to the
app's Cloud Run service, and the gateway forwards `/api/<id>/*` to its API. All three read `registry/registry.json`;
an app joins by earning an entry there and by behaving correctly under its path.

## Platform contract v1

What every app on the shared domain guarantees at runtime. The gateway, the portal and the monorepo's
`scripts/sync-deployments.mjs` rely on exactly these six rules.

1. **Serve under `/<id>`, with the full path forwarded.** Hosting passes `/<id>/…` through unchanged (no prefix
   stripping), so every page, asset, API route and the health route lives under `/<id>`. Keep the direct Cloud Run URL
   working: `https://<service>-….run.app/<id>/` serves the same app.
2. **Relative redirects only.** Hosting sends Cloud Run's host as `Host` and the original host as `X-Forwarded-Host`,
   so an absolute redirect built from the request lands on `run.app`. Send `Location: /<id>/…`; where an absolute URL is
   unavoidable (an OAuth `redirect_uri`), take it from configuration (`PUBLIC_URL`), never from `Host`.
3. **Firebase Hosting forwards only the `__session` cookie**; every other cookie is stripped before Cloud Run sees the
   request. Keep all browser state in one `__session` cookie with `Path=/<id>` (`Secure; SameSite=Lax`).
   Never `Path=/`: every app on the shared domain has its own `__session`, and a root-path one collides with theirs.
   A `Path=/` fallback is allowed only on the direct Cloud Run host, which no other app shares.
4. **Health JSON.** `GET api.baseUrl + api.healthPath` (normally `/<id>/health`) answers 200, unauthenticated and
   without downstream calls, with
   `{"status":"ok","app":"<id>","version":"<semver or 0.0.0+sha.<12>>","commit":"<git sha>","deployedAt":"<ISO-8601 UTC or empty>"}`,
   values from env `APP_VERSION` / `APP_COMMIT` / `APP_DEPLOYED_AT` (defaults `"dev"` / `""` / `""`). The gateway's
   `/api/health` probes it; the monorepo's `sync-deployments.yml` records `version` and `commit` in the registry every
   30 minutes and skips an app that answers `"dev"`, an error or anything that is not this JSON.
5. **Deploys set `APP_VERSION`, `APP_COMMIT` and `APP_DEPLOYED_AT` with `--update-env-vars`, never `--set-env-vars`**
   (which replaces every variable on the service, credentials included):
   `gcloud run deploy <service> … --update-env-vars "APP_VERSION=${VERSION},APP_COMMIT=${GITHUB_SHA},APP_DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"`.
6. **Client code builds URLs through one base-path helper** (`withBase("/x")`, SvelteKit `base`, Vite
   `import.meta.env.BASE_URL`, Next.js `basePath` plus one helper for hand-built URLs), never by writing `/<id>` or a
   bare `/` into components, so the app works on both hosts and survives a path change.

### Access (optional)

An app that must not be public adds `"access": {"groups": ["<group id>", …], "note": "…"}` to its registry entry: ids
from `platform.auth.groups` (a person in any one of them passes), `[]` for any signed-in person. It needs
`web.kind: "cloud-run"`. While `platform.auth.enabled` and `platform.gateway.enabled` are true, Hosting rewrites
`/<id>{,/**}` to the gateway, and the **gateway door** is the only way in (`docs/runbooks/platform-auth.md`):

- **Sign-in belongs to the platform.** Identity is Firebase Authentication in `platform.auth.projectId`; a person's groups
  are the custom claim `groups`, set only with the monorepo's `scripts/grant-groups.mjs`. The portal opens the door with
  `POST /<id>/__door/session` (Bearer ID token); the door answers with its own sealed `__session` (`Path=/<id>`,
  HttpOnly, at most `sessionHours`). `/<id>/__door/*` is reserved: the app serves nothing there.
- **Contract v1 still applies, unchanged.** The door forwards the full path to `web.url` with the app's own `__session`
  value restored, and re-seals any `__session` the app sets, so rule 3 holds; keep that value under about 2 KB (the
  envelope must fit in one 4 KB cookie). Relative redirects (rule 2) matter even more: an absolute one to `run.app`
  walks out of the door.
- **Refusals are the door's.** Page loads (`Accept: text/html`) go to `/?gate=<id>&reason=…` (303); other requests get
  JSON 401/403/503. A request that fails the policy never reaches the app, yet the app keeps its own authentication for
  what it does (defence in depth).
- **The API through the gateway** (`/api/<id>/*`) needs a Bearer ID token that passes the same policy, except the health
  route (rule 4), which stays public so `/api/health` keeps working. (The deployment sync reads health from `api.baseUrl`
  directly; once the side door below is closed it sees 403 until it reads through the gateway — runbook, step h.)
- **Close the side door.** The direct `run.app` URL bypasses everything: remove `allUsers` from the service's
  `roles/run.invoker`, grant that role to the gateway's runtime service account, and deploy without
  `--allow-unauthenticated` (runbook, step h). OAuth callbacks then must use the platform URL (rule 5).
- **Locally everything is open**: the portal's realm is `open` on localhost, and the gateway's `ACCESS_MODE=open` is
  refused on Cloud Run.

## Rules

1. **One registry entry, written by hand once.** Copy an existing object in `registry/registry.json` (`registry/README.md`
   documents every field): `id` (slug), `name`, `description` (one sentence), `icon`, `status`, `path` (`/<id>` unless
   there is a reason), `routing` (`mode: path-prefix`, `ready: false`), `web` (`kind: cloud-run`, project, region,
   service, url), `api` (only when there is an API to front), `access` (only for an app behind sign-in; "Access
   (optional)" above), `repo` (`github`, `branch`, `localPath`), `deployment` (empty strings, `deployedBy: manual`),
   `tags`. The ids `registry`, `health` and `auth` are reserved. Then `make check && make render-firebase` and commit
   `registry.json` together with `firebase.json`.
2. **Serve under the path on both hosts.** Hosting passes the full path through, so `https://<service>…run.app/<path>/…`
   and `https://eisensoftware.com/<path>/…` must both work, and nothing may live outside `<path>`. One environment
   variable (`BASE_PATH=/<path>`) drives it wherever the framework allows:

   | Framework | Setting | Links and fetches |
   |---|---|---|
   | Next.js | `next.config.ts`: `basePath: "/vale"` (build-time; keep `output: "standalone"`) | `next/link`, `next/image` and the router prefix automatically; hand-built URLs use `process.env.NEXT_PUBLIC_BASE_PATH` |
   | FastAPI | mount under the prefix (`outer.mount(BASE_PATH, app)`) or `FastAPI(root_path=BASE_PATH)` / `uvicorn --root-path` | redirects, cookies and static mounts go through one helper (`with_base(path)`, as healthconnect's `api/paths.py`) |
   | Vite SPA | `vite.config`: `base: process.env.VITE_BASE ?? "/"` — with a trailing slash, `"/healthconnect/"` | router history base and `fetch` use `import.meta.env.BASE_URL` |
   | SvelteKit | `svelte.config.js`: `kit.paths.base = "/app"` (no trailing slash) | every `href` and `fetch` uses `import { base } from "$app/paths"`; links to other apps carry `rel="external"` |

   A route that ignores the prefix is a 404 on the platform even though it works on the direct host — test both.
3. **`/health` under the path, answering the contract v1 JSON (contract rule 4)** in well under a second (dependency
   checks go in a `checks` object or under `/health/deep`). The registry's `api.healthPath` is that route relative to
   `api.baseUrl`; the gateway's `/api/health` probes it with a 3 s timeout, in parallel, on every call.
4. **An `api` block only when there is an API worth fronting.** `baseUrl` is the upstream root the gateway forwards
   `/api/<id>/*` to (prefix stripped; method, body and headers preserved); `healthPath` as in rule 3; `auth` is one of
   `none`, `cookie`, `firebase-id-token`, `api-key`; `docs` points at the OpenAPI file. The gateway forwards
   `Authorization` and `Cookie` untouched and adds nothing, so the API must accept them from the platform origin.
5. **Origins, cookies and redirects stay on the platform domain.** CORS allows `https://eisensoftware.com`,
   `https://www.eisensoftware.com` and the app's own direct host; browser state lives in the one `__session` cookie
   (contract rule 3) and redirects are relative (contract rule 2); `PUBLIC_URL` and OAuth redirect URIs are
   `https://eisensoftware.com/<path>` once `routing.ready` is true — never the `run.app` host, or the first redirect
   leaves the platform (the healthconnect surprise in the plan).
6. **Every production deploy reaches the registry: the pull path always runs, the push path is optional.** The
   monorepo's `sync-deployments.yml` reads the health JSON every 30 minutes, patches the app's `deployment` block when
   `version` or `commit` changed, commits and redeploys the portal — so contract rules 4–5 are all an app needs, manual
   deploys included. To show a deploy within minutes, the workflow may also call the monorepo's reusable workflow after
   `gcloud run deploy` on `main` or a `v*` tag; it sends `repository_dispatch` `app-deployed` with
   `{id, version, sha, imageTag, url}`. Pass it the same version as `APP_VERSION`, or the two paths overwrite each other.
   Preview deploys never call it.
   ```yaml
   register:
     needs: production
     if: github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')
     uses: hockeyiscool19/monorepo/.github/workflows/register-app.yml@main
     with:
       app_id: healthconnect                                  # the app's `id` in registry/registry.json
       version: ${{ needs.production.outputs.version }}      # deploy-versioning rule 3
       sha: ${{ github.sha }}                                 # optional; this is the default
       image_tag: ${{ needs.production.outputs.image_tag }}  # sha-<12>; empty for source deploys
       url: ${{ needs.production.outputs.url }}              # the Cloud Run URL (becomes web.url)
     secrets:
       dispatch_token: ${{ secrets.MONOREPO_DISPATCH_TOKEN }}
   ```
   The workflow turns those inputs into the `app-deployed` payload `{id, version, sha, imageTag, url}` that
   `registry/README.md` fixes as the contract; `.github/workflows/register-app.yml` documents each input. The token is the
   fine-grained PAT Jordan adds to the app repository as `MONOREPO_DISPATCH_TOKEN` (`docs/runbooks/ci-auth.md`); nothing
   else is needed — no key, no write access to the registry. Without the token, leave the `register` job out.
7. **`routing.ready` is a verified fact, flipped by the coordinator.** It starts `false`; tiles link to `web.url` in the
   meantime, so a tile is never dead. It becomes `true` only after these return 200 through the Hosting rewrite:
   ```bash
   for p in "" "health" "assets/<one real asset>"; do
     curl -sS -o /dev/null -w "%{http_code} /<path>/$p\n" "https://eisensoftware.com/<path>/$p"; done
   ```
   plus a sign-in round trip when the app has one. The flip is a registry commit in the monorepo followed by a portal
   deploy; an app's CI never changes it.
8. **Status is a registry edit, not a deploy.** `planned` (dimmed tile) → `beta` (badge) → `live`; `hidden` keeps the
   rewrite and the gateway route but removes the tile. Change the value, `make check`, commit.
9. **Site skills are generated, never edited.** After any registry change run
   `node plugins/eisen-platform/skills/site-plugin/scripts/generate-site-skills.mjs` (`--check` in CI). It renders
   `templates/site-SKILL.md` into `plugins/eisen-platform/skills/sites/site-<id>/SKILL.md` — one `site-<id>` skill per app
   with its URLs, who may enter (access), API, auth, repo, deployment and `curl` smoke tests — so an agent working on any app knows where it
   lives and how to poke it. Output is deterministic; a stale or missing file fails `--check`.
10. **Onboard in this order**, stopping at the first failing step: registry entry (1) → base path (2) → `/health` (3) →
    origins (5) → Dockerfile per `image-tagging` → deploy workflow per `deploy-versioning` setting the `APP_*` variables
    (contract rule 5), optionally with the register job (6) → `make check && make render-firebase` → coordinator deploys
    Hosting → rule 7 checks → `routing.ready: true` → rule 9.

## Local check before asking for the flip

```bash
BASE_PATH=/<path> <run the app locally>                                  # Next.js: basePath is baked in at build time
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:<port>/<path>/    # 200, HTML
curl -sS http://localhost:<port>/<path>/health                                # 200, {"status":"ok","app":"<id>","version":"dev",…}
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:<port>/            # 404 or a redirect into /<path>/, never a second copy
```

## Audit — score an app's platform integration

| # | Check | Points |
|---|---|---|
| 1 | Registry entry validates (`make check`) and `firebase.json` was re-rendered in the same commit | 10 |
| 2 | Every page, asset and API route answers under `<path>` on the direct host (no route outside the prefix); client URLs come from one base-path helper | 15 |
| 3 | `<path>/health` returns the contract v1 JSON (`status`, `app`, `version`, `commit`, `deployedAt`), unauthenticated, without downstream calls | 10 |
| 4 | `api` block present iff the app has an HTTP API; `auth` mode declared and honoured through the gateway | 10 |
| 5 | Relative redirects; one `__session` cookie with `Path=<path>`; CORS, `PUBLIC_URL` and OAuth redirect URIs use the platform URL | 15 |
| 6 | Production deploys set the `APP_*` variables with `--update-env-vars`; a `register-app` call, if any, runs after production deploys only with all five payload fields | 15 |
| 7 | `routing.ready` was flipped only after the rule 7 checks passed through the Hosting rewrite | 10 |
| 8 | `generate-site-skills.mjs --check` passes on the current registry | 5 |
| 9 | The app's `AGENTS.md` or README names its platform path, health route and the `APP_*` deploy variables | 5 |
| 10 | No hand edit to `deployment` or `routing.ready` in the app repository's history | 5 |

100 = ship. 85–99 = ship with the missing points listed in the plan's Progress section. Below 85 = not done.
