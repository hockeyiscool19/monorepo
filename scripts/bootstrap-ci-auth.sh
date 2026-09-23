#!/usr/bin/env bash
# Let GitHub Actions in this org deploy to researcher-455022 without keys (Workload Identity Federation).
#
# Reuses the existing pool `github-pool`, provider `github` and service account `github-actions@…`,
# which today are pinned to the repo hockeyiscool19/garmin. This script:
#   1. widens the provider to every repo owned by $OWNER (attribute condition on repository_owner),
#   2. lets the listed repos impersonate the service account,
#   3. grants the service account the Firebase Hosting + Service Usage roles the monorepo deploy needs
#      (run.admin, artifactregistry.writer, iam.serviceAccountUser are already granted),
#   4. prints the GitHub Actions variables each repo needs, and sets them with `gh` when --apply-github is passed.
#
# Idempotent. Needs gcloud (logged in, project owner) and gh (logged in). Review before running.
#
# Usage:  ./scripts/bootstrap-ci-auth.sh [--apply-github]
set -euo pipefail

PROJECT="${PROJECT:-researcher-455022}"
PROJECT_NUMBER="${PROJECT_NUMBER:-382031913173}"
REGION="${REGION:-us-central1}"
OWNER="${OWNER:-hockeyiscool19}"
POOL="${POOL:-github-pool}"
PROVIDER="${PROVIDER:-github}"
SA="${SA:-github-actions@${PROJECT}.iam.gserviceaccount.com}"
# Repos that deploy through this service account: the platform, vale (repo named healthconnect), healthconnect (repo named garmin).
REPOS_DEFAULT="${OWNER}/monorepo ${OWNER}/healthconnect ${OWNER}/garmin"
read -r -a REPOS <<< "${REPOS:-$REPOS_DEFAULT}"
APPLY_GITHUB=false
[[ "${1:-}" == "--apply-github" ]] && APPLY_GITHUB=true

PROVIDER_NAME="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
POOL_NAME="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}"

echo "== 1. Provider ${PROVIDER}: allow every repo owned by ${OWNER}"
gcloud iam workload-identity-pools providers update-oidc "${PROVIDER}" \
  --project="${PROJECT}" --location=global --workload-identity-pool="${POOL}" \
  --attribute-condition="assertion.repository_owner=='${OWNER}'" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --quiet

echo "== 2. Service account ${SA}: repos that may impersonate it"
for repo in "${REPOS[@]}"; do
  gcloud iam service-accounts add-iam-policy-binding "${SA}" --project="${PROJECT}" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository/${repo}" \
    --condition=None --quiet >/dev/null
  echo "   ${repo}"
done

echo "== 3. Project roles for ${SA}"
for role in roles/firebasehosting.admin roles/serviceusage.serviceUsageConsumer roles/cloudbuild.builds.editor roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "${PROJECT}" --member="serviceAccount:${SA}" --role="${role}" \
    --condition=None --quiet >/dev/null
  echo "   ${role}"
done

echo "== 4. GitHub Actions variables (not secrets — none of these values is sensitive)"
# KEY=VALUE lines; plain strings so this runs on macOS's bash 3.2 (no associative arrays).
VARS="GCP_PROJECT=${PROJECT}
GCP_REGION=${REGION}
GCP_WORKLOAD_IDENTITY_PROVIDER=${PROVIDER_NAME}
GCP_SERVICE_ACCOUNT=${SA}"
for repo in "${REPOS[@]}"; do
  echo "   ${repo}:"
  while IFS='=' read -r key value; do
    if $APPLY_GITHUB; then
      gh variable set "${key}" --repo "${repo}" --body "${value}" >/dev/null && echo "     set ${key}"
    else
      echo "     gh variable set ${key} --repo ${repo} --body '${value}'"
    fi
  done <<< "${VARS}"
done
$APPLY_GITHUB || echo "   (re-run with --apply-github to set them, or paste the commands above)"

echo
echo "Done. Workflows authenticate with google-github-actions/auth@v2 using those four variables; see docs/runbooks/ci-auth.md."
