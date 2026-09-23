---
name: site-plugin
description: How an application joins eisensoftware.com and stays registered — its registry entry, base-path support per framework (Next.js basePath, FastAPI root_path or BASE_PATH, Vite base, SvelteKit paths.base), the /health endpoint, CORS, cookie and OAuth origins, the register-app workflow call after every production deploy, what routing.ready means and who flips it, and the generated site-<id> skills rendered from the registry. Load when onboarding an app to the platform, changing an app's path, URL, API block, health check or status, wiring its deploy workflow to the registry, or regenerating the site skills.
---

# Site plugin — joining the platform

`eisensoftware.com` is one host. The portal renders a tile per app, Firebase Hosting rewrites `/<path>/**` to the
app's Cloud Run service, and the gateway forwards `/api/<id>/*` to its API. All three read `registry/registry.json`;
an app joins by earning an entry there and by behaving correctly under its path.

## Rules

1. **One registry entry, written by hand once.** Copy an existing object in `registry/registry.json` (`registry/README.md`
   documents every field): `id` (slug), `name`, `description` (one sentence), `icon`, `status`, `path` (`/<id>` unless
   there is a reason), `routing` (`mode: path-prefix`, `ready: false`), `web` (`kind: cloud-run`, project, region,
   service, url), `api` (only when there is an API to front), `repo` (`github`, `branch`, `localPath`), `deployment`
   (empty strings, `deployedBy: manual`), `tags`. Then `make check && make render-firebase` and commit `registry.json`
   together with `firebase.json`.
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
3. **`/health` under the path.** `GET <path>/health` returns `200 {"ok":true,"version":"<version>","sha":"<sha>"}` in
   well under a second, without auth and without calling downstream services (dependency checks go in a `checks`
   object or under `/health/deep`). The registry's `api.healthPath` is that route relative to `api.baseUrl`; the
   gateway's `/api/health` probes it with a 3 s timeout, in parallel, on every call.
4. **An `api` block only when there is an API worth fronting.** `baseUrl` is the upstream root the gateway forwards
   `/api/<id>/*` to (prefix stripped; method, body and headers preserved); `healthPath` as in rule 3; `auth` is one of
   `none`, `cookie`, `firebase-id-token`, `api-key`; `docs` points at the OpenAPI file. The gateway forwards
   `Authorization` and `Cookie` untouched and adds nothing, so the API must accept them from the platform origin.
5. **Origins, cookies and redirects stay on the platform domain.** CORS allows `https://eisensoftware.com`,
   `https://www.eisensoftware.com` and the app's own direct host; cookies are `Secure; SameSite=Lax; Path=<path>`;
   `PUBLIC_URL` and OAuth redirect URIs are `https://eisensoftware.com/<path>` once `routing.ready` is true — never the
   `run.app` host, or the first redirect leaves the platform (the healthconnect surprise in the plan).
6. **Register every production deploy.** After `gcloud run deploy` on `main` or a `v*` tag, the workflow calls the
   monorepo's reusable workflow, which sends `repository_dispatch` `app-deployed` with `{id, version, sha, imageTag, url}`;
   the monorepo patches the app's `deployment` block, commits, and redeploys the portal. Preview deploys never call it.
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
   else is needed — no key, no write access to the registry.
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
   with its URLs, API, auth, repo, deployment and `curl` smoke tests — so an agent working on any app knows where it
   lives and how to poke it. Output is deterministic; a stale or missing file fails `--check`.
10. **Onboard in this order**, stopping at the first failing step: registry entry (1) → base path (2) → `/health` (3) →
    origins (5) → Dockerfile per `image-tagging` → deploy workflow per `deploy-versioning` with the register job (6) →
    `make check && make render-firebase` → coordinator deploys Hosting → rule 7 checks → `routing.ready: true` → rule 9.

## Local check before asking for the flip

```bash
BASE_PATH=/<path> <run the app locally>                                  # Next.js: basePath is baked in at build time
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:<port>/<path>/    # 200, HTML
curl -sS http://localhost:<port>/<path>/health                                # 200, {"ok":true,…}
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:<port>/            # 404 or a redirect into /<path>/, never a second copy
```

## Audit — score an app's platform integration

| # | Check | Points |
|---|---|---|
| 1 | Registry entry validates (`make check`) and `firebase.json` was re-rendered in the same commit | 10 |
| 2 | Every page, asset and API route answers under `<path>` on the direct host (no route outside the prefix) | 15 |
| 3 | `<path>/health` returns 200 with `version` and `sha`, unauthenticated, without downstream calls | 10 |
| 4 | `api` block present iff the app has an HTTP API; `auth` mode declared and honoured through the gateway | 10 |
| 5 | CORS, cookie `Path`, `PUBLIC_URL` and OAuth redirect URIs use the platform URL | 15 |
| 6 | The deploy workflow calls `register-app` after production deploys only, with all five payload fields | 15 |
| 7 | `routing.ready` was flipped only after the rule 7 checks passed through the Hosting rewrite | 10 |
| 8 | `generate-site-skills.mjs --check` passes on the current registry | 5 |
| 9 | The app's `AGENTS.md` or README names its platform path, health route and register step | 5 |
| 10 | No hand edit to `deployment` or `routing.ready` in the app repository's history | 5 |

100 = ship. 85–99 = ship with the missing points listed in the plan's Progress section. Below 85 = not done.
