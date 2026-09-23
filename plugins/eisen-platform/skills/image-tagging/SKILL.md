---
name: image-tagging
description: Container image naming, tagging, labelling and retention for eisensoftware services on Artifact Registry — the us-central1-docker.pkg.dev/<project>/<repo>/<service> path, immutable sha-<12> tags that are what gets deployed, v<semver> release tags, a moving main branch tag that is never deployed, no :latest, OCI labels from build args, multi-stage non-root Dockerfiles for Node and Python, pinTag on Firebase Hosting rewrites, and cleanup policies. Load when writing or reviewing a Dockerfile, a build-and-push step, a Cloud Run deploy command, a Hosting rewrite, or an Artifact Registry retention policy.
---

# Image tagging

An image is deployed by an immutable name, described by its labels, and forgotten on a schedule. Start from the
templates: `templates/Dockerfile.node` and `templates/Dockerfile.python` (multi-stage, non-root, labelled) and
`templates/build-push.sh` (computes the tags, builds, pushes, prints the receipt, sets workflow outputs).

## Rules

1. **One path convention.** `us-central1-docker.pkg.dev/<project>/<repo>/<service>` — the region equals the Cloud Run
   region; `<repo>` is the Artifact Registry repository, one per app repository and named after it (`jordan-lifts`,
   `monorepo`); `<service>` is the Cloud Run service id. Create a repository once:
   `gcloud artifacts repositories create <repo> --repository-format=docker --location=us-central1 --project=<project>`.
2. **Three tags, two kinds.** Every build pushes `sha-<12>` (the first 12 hex digits of the commit; immutable — pushed
   once, never overwritten). A release commit also pushes `v<semver>` (immutable; `+` metadata is not legal in a tag, so
   only real releases get one). Pushes to the default branch also move the branch tag `main` — for `docker pull`
   convenience only. `:latest` is never pushed, pulled or deployed.
3. **Deploy by `sha-<12>` or `v<semver>`, and record the digest.**
   `gcloud run deploy <service> --image <path>:sha-<12> --region us-central1 --project <project>` — never `:main`, never
   `:latest`, never an unpinned name. The receipt is the digest:
   `gcloud run revisions describe <revision> --region us-central1 --format 'value(status.imageDigest)'`.
4. **OCI labels from build args.** `org.opencontainers.image.source` (repository URL), `.revision` (full sha), `.version`
   (the `deploy-versioning` version string), `.created` (RFC 3339 UTC) and `.title`, set from the build args
   `IMAGE_SOURCE`, `IMAGE_REVISION`, `IMAGE_VERSION`, `IMAGE_CREATED` that `build-push.sh` passes. `IMAGE_VERSION` and
   `IMAGE_REVISION` also become runtime env (`APP_VERSION`, `APP_REVISION`; the gateway calls it `GATEWAY_VERSION`) so
   `/health` reports what runs. Read them back: `docker inspect --format '{{json .Config.Labels}}' <image>`.
5. **Dockerfile shape.** Multi-stage: a `build` stage with dev dependencies and the compiler, a `runtime` stage with
   only what runs. Pinned base tags (`node:20-alpine`, `python:3.12-slim`); dependency manifests copied before the
   source so the install layer caches; `npm ci --omit=dev --no-audit --no-fund` / `pip install --no-cache-dir`; a
   non-root `USER` (`node`, or a created `app` with uid 10001); `ENV PORT=8080` and `EXPOSE 8080`; exec-form `CMD`; a
   `.dockerignore` listing `node_modules`, `.git`, `dist`/`build`, `.env*`, `*.pem`. No `HEALTHCHECK`: Cloud Run
   ignores it and probes `PORT` itself.
6. **Build once per commit.** The same commit always yields the same `sha-<12>`; preview and production reuse it
   (`deploy-versioning` rule 5). Adding the release tag later is a retag, not a rebuild:
   `docker buildx imagetools create -t <path>:v1.2.0 <path>:sha-<12>`.
7. **Nothing secret in the image.** No `.env`, key file or token is copied or passed as a build arg (build args are
   visible in `docker history`). Configuration arrives as environment variables and Secret Manager references at deploy
   time (`--set-env-vars`, `--update-secrets`).
8. **Firebase Hosting rewrites and `pinTag`.** A `run` rewrite `{ "source": "/<path>{,/**}", "run": { "serviceId",
   "region" } }` follows the service's live revision, so an app repository's deploy shows on `eisensoftware.com`
   immediately. With `"pinTag": true`, each `firebase deploy` pins the rewrite to the revision serving at that moment
   (Firebase creates a Cloud Run traffic tag on it), and a later Cloud Run deploy changes nothing until Hosting is
   deployed again — Hosting and service then roll back as one unit. Platform default: **no `pinTag`** on app rewrites
   (apps deploy on their own cadence); use it only for a service whose deploy is always paired with a Hosting deploy.
   Rewrites are rendered by `scripts/render-firebase.mjs` from the registry, never edited by hand.
9. **Retention is a policy on the repository, not a chore.** Keep `v*` forever, keep the newest 10 versions of every
   package, delete untagged manifests after 30 days and `sha-*` tags after 90 days. Cloud Run pulls by digest when it
   scales from zero, so the image of any serving or rollback-candidate revision must survive — the keep rules cover
   the last 10; check `gcloud run revisions list` before tightening them. Apply as a dry run first:
   ```bash
   gcloud artifacts repositories set-cleanup-policies <repo> --project <project> --location us-central1 \
     --policy cleanup-policy.json --dry-run            # inspect the log, then rerun with --no-dry-run
   ```
   ```json
   [
     { "name": "keep-releases",       "action": { "type": "Keep" },   "condition": { "tagState": "TAGGED", "tagPrefixes": ["v"] } },
     { "name": "keep-newest-10",      "action": { "type": "Keep" },   "mostRecentVersions": { "keepCount": 10 } },
     { "name": "delete-untagged-30d", "action": { "type": "Delete" }, "condition": { "tagState": "UNTAGGED", "olderThan": "30d" } },
     { "name": "delete-sha-90d",      "action": { "type": "Delete" }, "condition": { "tagState": "TAGGED", "tagPrefixes": ["sha-"], "olderThan": "90d" } }
   ]
   ```
10. **Verify before merging a Dockerfile change**: `docker build` from the documented context; `docker run --rm <image>
    id -u` prints a non-zero uid; `docker inspect` shows the five labels with real values; the container answers
    `/health` on 8080; the image size is noted in the PR when it grows by more than 20 %.

## Build-and-push step (GitHub Actions, keyless auth per `docs/runbooks/ci-auth.md`)

```yaml
- uses: google-github-actions/auth@v2
  with: { workload_identity_provider: "${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}", service_account: "${{ vars.GCP_SERVICE_ACCOUNT }}" }
- uses: google-github-actions/setup-gcloud@v2
- run: gcloud auth configure-docker us-central1-docker.pkg.dev --quiet
- id: image
  env: { IMAGE: "us-central1-docker.pkg.dev/${{ vars.GCP_PROJECT }}/<repo>/<service>" }
  run: ./build-push.sh                         # outputs: image_tag, image_digest, version, sha12
- run: gcloud run deploy <service> --image "$IMAGE:${{ steps.image.outputs.image_tag }}" --region us-central1 --port 8080
```

Monorepo apps set `DOCKERFILE=apps/<app>/Dockerfile TAG_PREFIX=<app>/` and build from the repository root (the
gateway's Dockerfile copies `registry/registry.json` for its offline fallback).

## Reading the registry

```bash
gcloud artifacts docker images list <path> --include-tags --sort-by=~CREATE_TIME --limit 10    # what exists
gcloud artifacts docker tags list <path>                                                        # tag → digest
gcloud run services describe <service> --region us-central1 --format 'value(spec.template.spec.containers[0].image)'
```

## Audit — score the service's image pipeline

| # | Check | Points |
|---|---|---|
| 1 | Image path follows `us-central1-docker.pkg.dev/<project>/<repo>/<service>` | 5 |
| 2 | Every build pushes `sha-<12>`; release commits also push `v<semver>`; no `:latest` exists in the repository | 15 |
| 3 | Every deploy command references `sha-<12>` or `v<semver>` (grep the workflows: no `:main`, no `:latest`) | 15 |
| 4 | The five OCI labels are set from build args and `docker inspect` shows real values, not `unknown` | 10 |
| 5 | Dockerfile is multi-stage, pinned base, non-root `USER`, `EXPOSE 8080`, exec-form `CMD`, `.dockerignore` present | 15 |
| 6 | The `v<semver>` tag shares its digest with the commit's `sha-<12>` (retag, not rebuild) | 10 |
| 7 | No secret file or token in the image or its build args | 10 |
| 8 | Hosting rewrites are rendered from the registry; `pinTag` use (or its absence) is deliberate and documented | 5 |
| 9 | A cleanup policy is applied (keep `v*`, keep newest 10, delete untagged after 30 d, `sha-*` after 90 d) | 10 |
| 10 | `/health` reports the version and revision the labels carry | 5 |

100 = ship. 85–99 = ship with the missing points listed in the plan's Progress section. Below 85 = not done.
