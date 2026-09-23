# Runbook — CI/CD sync (app deploy → registry → portal)

When an app repo deploys to `main`, its workflow tells this repo, the registry is patched and the platform is
redeployed, so the tile on `eisensoftware.com` shows the new version within one deploy. No server runs for the
sync: it is GitHub Actions in both repos plus `scripts/register-deployment.mjs`.

## Sequence

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
| monorepo | secret | none | `register-deployment.yml` pushes with `GITHUB_TOKEN` (`permissions: contents: write`; `main` is unprotected) |
| vale (`hockeyiscool19/healthconnect`) | variable | the same four `GCP_*` | bootstrap script |
| vale | variable, optional | `GCP_PROJECT_NUMBER` · `PUBLIC_APP_URL` (per Environment) | defaults `382031913173` · `https://eisensoftware.com/vale` (production), `https://vale-preview-382031913173.us-central1.run.app/vale` (preview) |
| vale | secret | `MONOREPO_DISPATCH_TOKEN` | fine-grained PAT: repository `monorepo`, Contents read+write, Metadata read |
| vale | secret, optional | `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`, `KROGER_ZIP`, `KROGER_LOCATION_ID` | Kroger developer portal; without them the service keeps its current values |
| healthconnect (`hockeyiscool19/garmin`) | secret | `MONOREPO_DISPATCH_TOKEN` | the same PAT (or a second one) |
| healthconnect | — | WIF provider and SA are hardcoded in its `deploy.yml` | that repo is the one the provider admits today |

The WIF provider admits only `hockeyiscool19/garmin` until the bootstrap script runs; until then this repo's `deploy.yml`
and vale's stop at `google-github-actions/auth`. The PAT is the only secret in the whole sync. The gateway jobs also
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
| red at `git push` | log | `main` protected, or `permissions: contents: write` removed; the step already retries three times on a race |
| `Deploy platform` red in `plan` | log | a `GCP_*` variable is unset → bootstrap script; or `registry.json` invalid |
| red at `google-github-actions/auth` | log | WIF provider still pinned to `garmin`, or the SA binding is missing → bootstrap script |
| red at `docker push` or `gcloud run deploy` | log | Artifact Registry repo `platform` missing, or the SA lacks `run.admin` / `artifactregistry.writer` (both jobs run only while `platform.gateway.enabled`) |
| red at `firebase deploy` | log | SA lacks `roles/firebasehosting.admin` or `serviceusage.serviceUsageConsumer`; stale `firebase.json` → `make render-firebase`, commit |
| tile still shows the old version | `curl -s https://eisensoftware.com/registry.json` | the deploy job was skipped (`changed=false`: same values already recorded) or the 60 s CDN cache on `/registry.json` |
| two dispatches within seconds | Actions → the run marked cancelled | `registry-write` keeps at most one pending run; a third dispatch cancels the middle one — re-run it from the Actions UI |

## Related

`scripts/register-deployment.mjs` (`--dry-run`, `--file`, `--registry`) and its tests (`node --test scripts/*.test.mjs`),
`registry/README.md` ("Who updates deployment"), `docs/runbooks/ci-auth.md`, `integrations/vale/` and
`integrations/healthconnect/` (the app-repo PRs).
