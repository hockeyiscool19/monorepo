# Runbook — keyless CI auth (GitHub Actions → GCP)

No service-account keys anywhere. GitHub's OIDC token is exchanged for short-lived GCP credentials through
Workload Identity Federation, the same mechanism vale's `deploy.yml` already expects.

## What exists in `researcher-455022` (as of 2026-09-23)

| Thing | Value | State |
|---|---|---|
| Pool | `github-pool` | exists |
| Provider | `github-pool/providers/github`, issuer `https://token.actions.githubusercontent.com` | pinned to `assertion.repository=='hockeyiscool19/garmin'` |
| Service account | `github-actions@researcher-455022.iam.gserviceaccount.com` | roles: run.admin, artifactregistry.writer, iam.serviceAccountUser, storage.admin |
| SA impersonation | `roles/iam.workloadIdentityUser` | only for repo `hockeyiscool19/garmin` |

## One-time setup

```bash
./scripts/bootstrap-ci-auth.sh
```

widens the provider to every `hockeyiscool19/*` repo, lets `monorepo`, `healthconnect` (vale) and `garmin`
(healthconnect) impersonate the service account, adds `roles/firebasehosting.admin`, `roles/cloudbuild.builds.editor` (vale deploys with `--source`, which builds in Cloud Build) and
`roles/serviceusage.serviceUsageConsumer`, and prints the four repository **variables**. Add `--apply-github`
to set them through `gh` in one go. Nothing here is a secret.

| Variable | Value |
|---|---|
| `GCP_PROJECT` | `researcher-455022` |
| `GCP_REGION` | `us-central1` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/382031913173/locations/global/workloadIdentityPools/github-pool/providers/github` |
| `GCP_SERVICE_ACCOUNT` | `github-actions@researcher-455022.iam.gserviceaccount.com` |

## In a workflow

```yaml
permissions:
  contents: read
  id-token: write
steps:
  - uses: google-github-actions/auth@v2
    with:
      workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}
      service_account: ${{ vars.GCP_SERVICE_ACCOUNT }}
  - uses: google-github-actions/setup-gcloud@v2
```

After `auth`, `gcloud`, `docker push` to Artifact Registry (after `gcloud auth configure-docker us-central1-docker.pkg.dev`)
and `npx firebase-tools deploy` all work with the federated credentials (firebase-tools reads
`GOOGLE_APPLICATION_CREDENTIALS`, which the auth action exports).

## The one real secret: cross-repo dispatch

App repos tell the monorepo about a deploy with `repository_dispatch`. That call needs a token that can write to
`hockeyiscool19/monorepo`: create a fine-grained PAT (repository access: `monorepo`; permissions: Contents → Read
and write, Metadata → Read) and add it as the secret `MONOREPO_DISPATCH_TOKEN` in each app repo. Jordan does this
in the GitHub UI; nothing in this repo ever sees the value.
