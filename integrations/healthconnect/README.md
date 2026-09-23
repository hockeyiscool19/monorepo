# PR: Register HealthConnect deploys with the eisensoftware platform

Target: `hockeyiscool19/garmin` (checkout `~/projects/healthconnect`). Replace `.github/workflows/deploy.yml` with the
one in this folder. Nothing was applied to that checkout.

## What changes and why

- **Image tags.** Adds `sha-<12>` (the platform's image-tagging standard) next to the existing `:<sha>`, `:latest` and
  `:v*`, and deploys Cloud Run by `sha-<12>`: immutable, and exactly what the registry will record as `imageTag`.
- **`register` job.** After a successful deploy, calls `hockeyiscool19/monorepo/.github/workflows/register-app.yml@main`
  with `app_id: healthconnect`, `version` (tag without `v`, else `0.0.0+sha.<12>`), `sha`, `image_tag: sha-<12>` and
  `url: https://jordan-lifts-382031913173.us-central1.run.app` (the deterministic URL the registry stores as `web.url`).
  The monorepo records the block, redeploys the portal, and the tile shows the version.
- **`schedule` job.** "Schedule Garmin API jobs" moves into its own job (`needs: deploy`). The last four `Deploy` runs
  on `main` (2026-09-01 ×3, 2026-09-04) failed in that step *after* Cloud Run had been updated; kept in one job, the same
  failure would also block registration. It still runs on every deploy and still fails visibly.
- **`PUBLIC_URL`.** Already `https://eisensoftware.com/healthconnect` in this workflow (`PUBLIC_HOST`) and confirmed on
  the live service (`PUBLIC_URL`, `HEALTHCONNECT_URL`, `BASE_PATH=/healthconnect`). Nothing to change.

Everything else is untouched: the WIF provider and service account stay hardcoded (the provider already admits this repo).

## Not fixed here: `GET /healthconnect` → `307 http://…run.app/healthconnect/`

That redirect is not `PUBLIC_URL`. In `api/main.py`, `redirect_to_prefix` lets `path == prefix` through to
`gateway.mount(prefix, application)`, and Starlette's slash redirect builds an absolute URL from the request scope:
scheme `http` (uvicorn ignores `X-Forwarded-Proto` from Cloud Run's front end unless `FORWARDED_ALLOW_IPS=*`) and the
Cloud Run host. Two options, Jordan's call:

1. one line in `redirect_to_prefix`: `if path == prefix: return RedirectResponse(f"{prefix}/")` (relative, so the
   browser stays on `eisensoftware.com`);
2. and/or `--update-env-vars FORWARDED_ALLOW_IPS=*` in the deploy so `request.url` is `https`.

The portal links tiles to `/healthconnect/` (with the slash), so this only bites when someone types the URL by hand.

## Before merging (Jordan)

- Secret `MONOREPO_DISPATCH_TOKEN` in this repo: fine-grained PAT, repository `monorepo`, Contents read+write
  (monorepo `docs/runbooks/ci-auth.md`, "The one real secret").
- Nothing else: the WIF provider already admits `hockeyiscool19/garmin`, and `sha-<12>` needs no new permissions.
- Separately, look at why `gcp/schedule-garmin.sh` fails in CI (probably Cloud Scheduler IAM for the CI service account).
