# Runbook — CI/CD sync (app deploy → registry → portal)

An app deploy reaches the registry by two paths. Either one patches the app's `deployment` block, commits, and
redeploys the platform, so the tile on `eisensoftware.com` shows the new version. No server runs for the sync: it is
GitHub Actions plus two zero-dependency scripts that share their validation rules (`scripts/lib/registry-io.mjs`).

| Path | Trigger | Needs | Status |
|---|---|---|---|
| **Pull**: `sync-deployments.yml` → `scripts/sync-deployments.mjs` | schedule every 30 minutes, or manual | the app's health route serving platform contract v1 | **always runs** |
| **Push**: app repo → `repository_dispatch` → `register-deployment.yml` → `scripts/register-deployment.mjs` | the app's deploy workflow | `MONOREPO_DISPATCH_TOKEN` in the app repo | optional, faster |

The pull path reads what is actually running, so it also records manual deploys and needs no token. The push path
only makes the update faster (one deploy instead of up to 30 minutes). Both write under the `registry-write`
concurrency group. The pull path counts a short and a full sha of the same commit as equal, so it never undoes a
push-path record of the same deploy. The two paths agree as long as the app's deploy passes the same version to
`register-app` and to `APP_VERSION`.

## Pull path (always runs)

```
monorepo (this repo): cron */30 * * * * (UTC; GitHub may start scheduled runs a few minutes late) or on demand
 1. sync-deployments.yml, job `sync` (concurrency `registry-write`, shared with register-deployment.yml)
      checkout main → node scripts/sync-deployments.mjs
        every app with an `api` block: GET api.baseUrl + api.healthPath (10 s timeout, one retry after 3 s)
        → {"status":"ok","app":"<id>","version":"…","commit":"<sha>","deployedAt":"…"}   (platform contract v1)
        version or commit differs from `deployment` → {version, sha: commit, imageTag (reported, else kept),
        deployedAt (reported when valid ISO-8601 UTC, else now), deployedBy: "ci"}
      → node scripts/validate-registry.mjs → commit as github-actions[bot] "Sync deployments from live health
        endpoints" (body: one line per changed app) → push main (re-syncs and retries if main moved)
 2. job `deploy`, only when the registry changed: uses ./.github/workflows/deploy.yml with ref=<that commit>
 3. as push-path steps 6–7 below.
```

```bash
gh workflow run sync-deployments.yml -R hockeyiscool19/monorepo            # run now instead of waiting
gh run list -R hockeyiscool19/monorepo --workflow "Sync deployments" --limit 3
node scripts/sync-deployments.mjs --dry-run                                # the same probe from a laptop; writes nothing
```

It prints one line per app, then a summary. The run's step summary on GitHub shows the same lines:

```
vale: 0.1.0 → 0.2.0 (8cc0085)          patched, committed, platform redeployed
healthconnect: unchanged                the registry already records what is running
topology: skipped — no api block
sync-deployments: 1 changed, 1 unchanged, 1 skipped — registry written
```

**Skipped** means that app was not synced this round. It is never a failure: the exit code stays 0, and only an
unreadable or invalid registry fails the run. An app that does not serve the contract yet is simply left as it is.

| Skip reason | Meaning | Fix (in the app, unless noted) |
|---|---|---|
| `no api block` | the registry has no `api.baseUrl` / `api.healthPath` for it | add an `api` block (site-plugin rule 4), registry edit |
| `health 503`, `health 404`, `health unreachable (…)` | down, missing, or no answer in 10 s | check the service; timeouts, 5xx and 429 were already retried once |
| `health is not JSON`, `health JSON has no version` | the route exists but does not serve contract v1 yet | serve the contract JSON (site-plugin, contract rule 4) |
| `version "dev" (APP_VERSION not set)`, `health JSON has no commit (APP_COMMIT not set)` | the deploy did not set the variables | `--update-env-vars "APP_VERSION=…,APP_COMMIT=…,APP_DEPLOYED_AT=…"` (contract rule 5) |
| `version "…" must match …`, `commit "…" must be 7–40 hex characters` | a value breaks the registry schema | fix the value the deploy sets |
| `health reports app "x", not "<id>"` | `api.baseUrl` points at another app | fix `api.baseUrl`, registry edit |
| `health 403` (vale) | the service no longer admits `allUsers` (the run.app side door is closed, `platform-auth.md` step h) | read guarded apps' health through the gateway's public `/api/<id>/health`, or give the sync an identity token (`platform-auth.md`, h.5) |

## Push path (optional, faster)

```
app repo (vale = hockeyiscool19/healthconnect · healthconnect = hockeyiscool19/garmin)
 1. deploy.yml: build → deploy Cloud Run → smoke test
 2. job `register`: uses hockeyiscool19/monorepo/.github/workflows/register-app.yml@main
      with app_id, version, sha, image_tag, url · secret dispatch_token = MONOREPO_DISPATCH_TOKEN
 3. register-app.yml: curl POST https://api.github.com/repos/hockeyiscool19/monorepo/dispatches
      {"event_type":"app-deployed","client_payload":{id,version,sha,imageTag,url}}   → HTTP 204
                                        │
monorepo (this repo)                    ▼
 4. register-deployment.yml (on: repository_dispatch, types: [app-deployed]; job concurrency `registry-write`)
      checkout main → node scripts/register-deployment.mjs --payload "$PAYLOAD"
      → node scripts/validate-registry.mjs → commit as github-actions[bot]
        "Record <id> deployment <version> (<sha7>)" → push main (re-applies and retries if main moved)
 5. job `deploy`: uses ./.github/workflows/deploy.yml with ref=<that commit>  (a GITHUB_TOKEN push never
      triggers `push` workflows, so deploy.yml is called directly; concurrency `deploy-platform`)
 6. deploy.yml: plan → [gateway-image → gateway-deploy, only while platform.gateway.enabled]
      → hosting: make portal-build → render-firebase --check → firebase deploy --only hosting
 7. https://eisensoftware.com/ tile shows deployment.version; /registry.json carries the new block.
```

After step 4 the app's `deployment` is `{version, sha, imageTag, deployedAt (UTC, seconds), deployedBy: "ci"}`. When
`url` was sent and differs from `web.url`, `web.url` is replaced and `api.baseUrl` moves to the same origin (path kept).
Nothing else in the registry is touched by CI; `routing.ready`, `status` and `api.baseUrl` paths stay a human decision.

## Secrets and variables per repo

| Repo | Kind | Name | Value / source |
|---|---|---|---|
| monorepo | variable | `GCP_PROJECT`, `GCP_REGION`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT` | `scripts/bootstrap-ci-auth.sh --apply-github` (docs/runbooks/ci-auth.md) |
| monorepo | variable, optional | `FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_APP_ID` | the portal's Firebase web config, passed to the build as `PUBLIC_FIREBASE_*` (`docs/runbooks/platform-auth.md`, step b); unset, the portal reads `/__/firebase/init.json` |
| monorepo | secret | none | `register-deployment.yml` and `sync-deployments.yml` push with `GITHUB_TOKEN` (`permissions: contents: write`; `main` is unprotected) |
| vale (`hockeyiscool19/healthconnect`) | variable | the same four `GCP_*` | bootstrap script |
| vale | variable, optional | `GCP_PROJECT_NUMBER` · `PUBLIC_APP_URL` (per Environment) | defaults `382031913173` · `https://eisensoftware.com/vale` (production), `https://vale-preview-382031913173.us-central1.run.app/vale` (preview) |
| vale | secret, optional (push path) | `MONOREPO_DISPATCH_TOKEN` | fine-grained PAT: repository `monorepo`, Contents read+write, Metadata read |
| vale | secret, optional | `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`, `KROGER_ZIP`, `KROGER_LOCATION_ID` | Kroger developer portal; without them the service keeps its current values |
| healthconnect (`hockeyiscool19/garmin`) | secret, optional (push path) | `MONOREPO_DISPATCH_TOKEN` | the same PAT (or a second one) |
| healthconnect | — | WIF provider and SA are hardcoded in its `deploy.yml` | that repo is the one the provider admits today |

The WIF provider admits only `hockeyiscool19/garmin` until the bootstrap script runs; until then this repo's `deploy.yml`
and vale's stop at `google-github-actions/auth`. The PAT is the only secret in the whole sync, and it is optional:
without it the push path is off and the pull path still records every deploy of an app on contract v1. The gateway jobs also
need the Artifact Registry repository `platform` (`gcloud artifacts repositories create platform
--repository-format=docker --location=us-central1`) before `platform.gateway.enabled` is set to `true`.

## Test a dispatch by hand

```bash
# dry-run locally first (writes nothing)
node scripts/register-deployment.mjs --dry-run --payload \
  '{"id":"vale","version":"0.2.0","sha":"8cc0085a1b2c3d4e5f60718293a4b5c6d7e8f901","imageTag":"sha-8cc0085a1b2c"}'

# send the same payload as an app repo would (prints nothing: HTTP 204)
gh api repos/hockeyiscool19/monorepo/dispatches -f event_type=app-deployed \
  -f 'client_payload[id]=vale' -f 'client_payload[version]=0.2.0' \
  -f 'client_payload[sha]=8cc0085a1b2c3d4e5f60718293a4b5c6d7e8f901' -f 'client_payload[imageTag]=sha-8cc0085a1b2c'

gh run list --repo hockeyiscool19/monorepo --workflow "Register deployment" --limit 3
gh run watch --repo hockeyiscool19/monorepo
git pull && git log --oneline -1            # Record vale deployment 0.2.0 (8cc0085)
curl -s https://eisensoftware.com/registry.json | jq '.apps[] | {id, deployment}'
```

Send a real value afterwards, or `git revert` the test commit: the registry is the source of truth for the tiles.

## When it fails

| Symptom | Look at | Likely cause |
|---|---|---|
| app repo: job `register` red with HTTP 401 / 403 / 404 | its log | `MONOREPO_DISPATCH_TOKEN` missing, expired, or without Contents write on `monorepo` (404 is GitHub hiding a repo the token cannot see) |
| `register` green, nothing happens here | `gh run list --workflow "Register deployment"` | dispatch went to another `platform_repo`, or `register-deployment.yml` is not on `main` of this repo yet |
| `Register deployment` red at the script | log line `register-deployment: …` | unknown `id`, bad `version` or `sha`; the message states the rule — fix the caller, re-run the app deploy |
| `Sync deployments` red at the script | log line `sync-deployments: …` | the registry on `main` is unreadable or invalid (a bad hand edit): `make check`, fix, push. App problems never fail it; they are skip lines |
| an app never leaves `skipped` | the run's summary, or `node scripts/sync-deployments.mjs --dry-run` | the skip-reason table above; the app does not serve contract v1 yet |
| no `Sync deployments` runs at all | Actions → Sync deployments | the workflow is not on `main` yet, or GitHub disabled the schedule (public repositories, after 60 days without activity): re-enable it there |
| red at `git push` | log | `main` protected, or `permissions: contents: write` removed; both writers already retry three times on a race |
| `Deploy platform` red in `plan` | log | a `GCP_*` variable is unset → bootstrap script; or `registry.json` invalid |
| red at `google-github-actions/auth` | log | WIF provider still pinned to `garmin`, or the SA binding is missing → bootstrap script |
| red at `docker push` or `gcloud run deploy` | log | Artifact Registry repo `platform` missing, or the SA lacks `run.admin` / `artifactregistry.writer` (both jobs run only while `platform.gateway.enabled`) |
| red at `firebase deploy` | log | SA lacks `roles/firebasehosting.admin` or `serviceusage.serviceUsageConsumer`; stale `firebase.json` → `make render-firebase`, commit |
| tile still shows the old version | `curl -s https://eisensoftware.com/registry.json` | no push path and the next half-hourly sync has not run (`gh workflow run sync-deployments.yml -R hockeyiscool19/monorepo`); the deploy job was skipped (`changed=false`: same values already recorded); or the 60 s CDN cache on `/registry.json` |
| a run marked cancelled | Actions → that run | `registry-write` keeps at most one pending run across both workflows, so a newer dispatch or sync cancels the pending one. Re-run it from the Actions UI, or let the next sync record what is live |

## Related

`scripts/sync-deployments.mjs` (`--dry-run`, `--registry`) and `scripts/register-deployment.mjs` (`--dry-run`, `--file`,
`--registry`), their shared rules in `scripts/lib/registry-io.mjs`, and their tests (`node --test scripts/*.test.mjs`);
platform contract v1 in `plugins/eisen-platform/skills/site-plugin/SKILL.md`; `registry/README.md` ("Who updates
deployment"), `docs/runbooks/ci-auth.md`, `integrations/vale/` and `integrations/healthconnect/` (the app-repo PRs).
