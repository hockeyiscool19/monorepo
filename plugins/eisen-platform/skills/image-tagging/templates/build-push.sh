#!/usr/bin/env bash
# Build one service image and push it with the platform's tags (image-tagging rules 2, 4 and 6).
# Run from the repository root — in CI after `gcloud auth configure-docker us-central1-docker.pkg.dev`, or locally
# with PUSH=false to build only.
#
#   IMAGE=us-central1-docker.pkg.dev/researcher-455022/jordan-lifts/jordan-lifts ./build-push.sh
#   IMAGE=… DOCKERFILE=apps/gateway/Dockerfile TAG_PREFIX=gateway/ ./build-push.sh     # monorepo app tagged gateway/v1.2.3
#
# Tags pushed: sha-<12> (always) · v<semver> (when HEAD carries a release tag) · the default branch name when on it.
# Prints a receipt (tags, digest, version, sha) and, inside GitHub Actions, writes the outputs
# image_tag, image_digest, version and sha12 for the deploy and register jobs.
# Portable bash (3.2+): no associative arrays, no mapfile.
set -euo pipefail

IMAGE="${IMAGE:?set IMAGE=us-central1-docker.pkg.dev/<project>/<repo>/<service>}"
DOCKERFILE="${DOCKERFILE:-Dockerfile}"
CONTEXT="${CONTEXT:-.}"
TAG_PREFIX="${TAG_PREFIX:-}"                 # "gateway/" for monorepo apps whose release tags are gateway/v1.2.3
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"
PUSH="${PUSH:-true}"
SOURCE_URL="${SOURCE_URL:-$(git remote get-url origin 2>/dev/null | sed -E 's#^git@github.com:#https://github.com/#; s#\.git$##')}"

case "$IMAGE" in
  *:latest|*:main) echo "error: IMAGE must be the bare path without a tag: $IMAGE" >&2; exit 2 ;;
esac

sha="$(git rev-parse HEAD)"
sha12="${sha:0:12}"
branch="${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD)}"
release_tag="$(git tag --points-at HEAD --list "${TAG_PREFIX}v[0-9]*" | sort | tail -n 1)"
if [[ -n "$release_tag" ]]; then
  version="${release_tag#"$TAG_PREFIX"}"
  version="${version#v}"
else
  version="0.0.0+sha.${sha12}"               # deploy-versioning rule 3: untagged builds are not releases
fi
created="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

tags="sha-${sha12}"
[[ -n "$release_tag" ]] && tags="$tags v${version}"
[[ "$branch" == "$DEFAULT_BRANCH" ]] && tags="$tags ${DEFAULT_BRANCH}"

tag_args=""
for t in $tags; do tag_args="$tag_args -t ${IMAGE}:${t}"; done

echo "build ${IMAGE} from ${DOCKERFILE} at ${sha12} (version ${version}; tags: ${tags})"
# shellcheck disable=SC2086
docker build -f "$DOCKERFILE" $tag_args \
  --build-arg IMAGE_SOURCE="${SOURCE_URL}" \
  --build-arg IMAGE_REVISION="${sha}" \
  --build-arg IMAGE_VERSION="${version}" \
  --build-arg IMAGE_CREATED="${created}" \
  "$CONTEXT"

digest=""
if [[ "$PUSH" == "true" ]]; then
  for t in $tags; do docker push "${IMAGE}:${t}"; done
  digest="$(docker inspect --format '{{index .RepoDigests 0}}' "${IMAGE}:sha-${sha12}" | sed 's/.*@//')"
fi

echo "receipt: image=${IMAGE} tags=[${tags}] digest=${digest:-not-pushed} version=${version} sha=${sha} created=${created}"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "image_tag=sha-${sha12}"
    echo "image_digest=${digest}"
    echo "version=${version}"
    echo "sha12=${sha12}"
  } >> "$GITHUB_OUTPUT"
fi
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  printf '### Image\n`%s`\n\n- tags: `%s`\n- digest: `%s`\n- version: `%s`\n- commit: `%s`\n' \
    "$IMAGE" "$tags" "${digest:-not-pushed}" "$version" "$sha" >> "$GITHUB_STEP_SUMMARY"
fi
