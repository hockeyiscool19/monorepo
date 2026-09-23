# PR: Serve Vale under `/vale` and wire CI/CD to the eisensoftware platform

Target: `hockeyiscool19/healthconnect` (checkout `~/vale`), branch `feat/platform-cicd` off `main`. Copy the three
files in this folder over the repo's: `next.config.ts`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`.
Nothing here was applied to `~/vale`; the workflows there are still the uncommitted local drafts.

## What changes and why

- **`next.config.ts`** — `basePath: "/vale"` (keeps `output: "standalone"`). The platform rewrites
  `eisensoftware.com/vale/**` to Cloud Run `vale` with the path intact, so Next must serve under `/vale`. Next also
  prefixes API routes: the Kroger callback becomes `https://eisensoftware.com/vale/api/grocery/oauth/callback`.
  `env.NEXT_PUBLIC_BASE_PATH` exposes the prefix to client code (see the follow-up below).
- **`.github/workflows/ci.yml`** — the local draft, unchanged: lint → `tsc --noEmit` → build on pull requests and via `workflow_call`.
- **`.github/workflows/deploy.yml`** — rebuilt from the local draft with these fixes:
  - production (Cloud Run `vale`) deploys only on `push` to `main` and tags `v*`, no longer on every branch;
    pull requests from this repo deploy `vale-preview` behind the `preview` Environment (fork PRs skip: no secrets, no OIDC);
  - `KROGER_REDIRECT_URI` and `NEXT_PUBLIC_APP_URL` are set on every deploy from the environment's public URL
    (`https://eisensoftware.com/vale` in production, `https://vale-preview-382031913173.us-central1.run.app/vale` in
    preview; override per Environment with variable `PUBLIC_APP_URL`). The live service still points Kroger at
    `https://vale-7qzmfxv3za-uc.a.run.app/api/grocery/oauth/callback`;
  - WIF settings come from repository **variables** (`vars.GCP_*`, the platform standard) instead of secrets;
  - the Kroger secrets no longer travel through a step output — GitHub drops outputs that contain secrets
    ("Skip output … since it may contain secret"), so the draft would have deployed without them. The deploy is one
    `gcloud run deploy --source .` step (as `scripts/deploy-vale-cloudrun.sh`); `--update-env-vars` keeps the
    service's current values when a secret is absent, so the Kroger keys survive even before they are added to GitHub;
  - a smoke test hits `<run url>/vale/api/grocery/health`, then job `register` calls
    `hockeyiscool19/monorepo/.github/workflows/register-app.yml@main` with `app_id: vale`, `version` (tag without `v`,
    else `0.0.0+sha.<12>`), `sha`, and `url` = the deterministic Cloud Run URL `https://vale-382031913173.us-central1.run.app`.

## Follow-up in the same PR (before the coordinator flips `routing.ready`)

`basePath` does not touch raw `fetch("/api/…")` or `window.location.href = "/api/…"` in client code; through the
platform those requests leave `/vale` and hit the gateway or a 404. Prefix them with
`process.env.NEXT_PUBLIC_BASE_PATH ?? ""`: `app/diet/page.tsx:29`, `components/diet/reimagine-cart.tsx:29`,
`components/diet/composable-list.tsx:43`, `components/diet/active-orders.tsx:41,62,65,78`,
`components/diet/micro-gaps.tsx:86`. `next/link`, `next/image` and `router.push` need nothing.

## Before merging (Jordan)

1. In the monorepo run `./scripts/bootstrap-ci-auth.sh --apply-github`. Today the WIF provider admits only
   `hockeyiscool19/garmin`, so a deploy from this repo fails at `google-github-actions/auth` until it runs; it also sets
   the four `GCP_*` variables here.
2. Source deploys build with Cloud Build: grant `roles/cloudbuild.builds.editor` to
   `github-actions@researcher-455022.iam.gserviceaccount.com` (the bootstrap script does not add it).
3. Secrets: `MONOREPO_DISPATCH_TOKEN` (fine-grained PAT, Contents read+write on `monorepo`); optional `KROGER_CLIENT_ID`,
   `KROGER_CLIENT_SECRET`, `KROGER_ZIP`, `KROGER_LOCATION_ID`.
4. `./scripts/setup-github-environments.sh` — Environments `production` (main only) and `preview` (required reviewer).
5. Register the new redirect URIs on developer.kroger.com: `https://eisensoftware.com/vale/api/grocery/oauth/callback`
   and the preview one the workflow prints.

## After the first production deploy (coordinator, not this PR)

Verify `https://eisensoftware.com/vale/` and `/vale/api/grocery/health` through the Hosting rewrite and that the tile
shows the new version. Then, in `registry/registry.json`, set `apps[vale].routing.ready: true` and change
`api.baseUrl` to `https://vale-382031913173.us-central1.run.app/vale/api` (the gateway probes `baseUrl + /grocery/health`).
This PR does not flip `routing.ready`.
