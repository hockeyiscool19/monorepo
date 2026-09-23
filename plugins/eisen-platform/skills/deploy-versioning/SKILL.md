---
name: deploy-versioning
description: How eisensoftware apps version, release, deploy and roll back — semver with v<major>.<minor>.<patch> git tags (<app>/v… inside a monorepo), release ≠ deploy ≠ publish each with its own receipt, preview and production environments, promote by tag and never rebuild, rollback by redeploying the previous immutable tag, the 0.0.0+sha.<12> version string for untagged main builds, and the registry deployment block that CI writes through register-app. Load when cutting a release, writing or reviewing a deploy workflow, choosing a version string, rolling back, or touching an app's deployment block.
---

# Deploy versioning

Four different things happen between a merge and a tile on `eisensoftware.com`, and each leaves a receipt
somewhere that outlives the CI log. Mixing them up is how "what is running?" becomes unanswerable.

| Step | Meaning | Receipt | Written by |
|---|---|---|---|
| **Release** | A git tag names a commit as a version | tag `v1.2.0` (+ CHANGELOG entry) | a human, from `main` |
| **Build** | An image is produced from that commit | image digest, tagged `sha-<12>` (+ `v1.2.0`) | CI (`image-tagging`) |
| **Deploy** | A Cloud Run revision serves that image in an environment | revision name + service URL | CI (`gcloud run deploy`) |
| **Publish** | The platform registry records the deploy | commit in `hockeyiscool19/monorepo` patching `apps[].deployment` | CI via `register-app` |

A deploy is not a release: `main` deploys to production on every merge with a build-metadata version (rule 3);
a release is the tag that makes one of those commits nameable, promotable and rollback-able.

## Rules

1. **Semver, tagged.** Versions are `MAJOR.MINOR.PATCH`. The tag is `v<version>` on the app repository's default
   branch. Apps that live in a monorepo tag `<app>/v<version>` (`gateway/v1.2.0`, `portal/v0.3.1`); the image tag
   and the registry version drop the prefix (`v1.2.0`, `1.2.0`). Tags are annotated (`git tag -a`) and immutable:
   never move or delete one — a bad release gets the next patch version.
2. **Bump by what breaks.** MAJOR when a URL, API response, registry contract, cookie or environment-variable name
   changes incompatibly; MINOR for a new route, feature or token; PATCH for fixes. Before `1.0.0`, MINOR may break
   and PATCH may not.
3. **One version string per build, computed from git, never typed.**
   ```bash
   sha12="$(git rev-parse --short=12 HEAD)"
   tag="$(git tag --points-at HEAD --list 'v[0-9]*' | sort -V | tail -n 1)"     # monorepo: --list 'gateway/v[0-9]*'
   base="${tag##*/}"; version="${base#v}"; version="${version:-0.0.0+sha.$sha12}"
   ```
   A tagged commit is `1.2.0`; an untagged one is `0.0.0+sha.<12>` — recognisably "not a release", still valid semver,
   and accepted by the registry pattern `^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$`. `+` is illegal in an image tag, so the
   image carries `sha-<12>` (`image-tagging` rule 2) while the version lives in the OCI label, `/health` and the registry.
4. **Two environments.** `preview` — every pull request / non-default branch; deploys to `<service>-preview` (or a
   no-traffic revision: `--tag pr-<n> --no-traffic`), is torn down when the PR closes, and is **never** published to the
   registry. `production` — pushes to `main` and `v*` tags. Name the GitHub `environment:` the same way so the deploy URL
   appears on the PR and the receipt is one click away.
5. **Promote by tag, never rebuild.** Production deploys the `sha-<12>` image that was already built and tested for that
   commit. A release adds the `v<version>` tag to the *same digest* (`docker buildx imagetools create -t …:v1.2.0 …:sha-<12>`)
   and deploys it; it does not run `docker build` again. Equal digests in preview and production are the proof that what
   was tested is what runs.
6. **Every step writes its receipt where it can be found later**: tag → `git show v1.2.0`; digest → the workflow summary
   and `gcloud artifacts docker images describe`; revision → `gcloud run revisions list --service <service>`; publish →
   the registry commit and `https://eisensoftware.com/registry.json`. `templates/RELEASE.md` lists all four for a release.
7. **Rollback = deploy the previous immutable tag.** `gcloud run deploy <service> --image <path>:v<previous>` (or
   `:sha-<12>` of the last good commit), or `gcloud run services update-traffic <service> --to-revisions <rev>=100`,
   then publish the rolled-back version to the registry so the tile tells the truth. Fix `main` afterwards with a
   forward commit and a new patch release; never rebuild an old commit as the first response.
8. **The registry `deployment` block is CI's, not yours.** `{version, sha, imageTag, deployedAt, deployedBy}` for each app
   is patched by the monorepo's `register-deployment.yml` when the app's workflow calls `register-app` after a successful
   production deploy (`repository_dispatch` `app-deployed`, payload `{id, version, sha, imageTag, url}`). Edit it by hand
   only for a manual deploy, with `deployedBy: manual`. Preview deploys never register.
9. **CHANGELOG in Keep-a-Changelog form** (`templates/CHANGELOG.md`): changes land under `## [Unreleased]` with their PR;
   cutting a release renames that section to `## [1.2.0] — 2026-09-23` and opens a new Unreleased.
10. **Tag from a green `main` only**, one release per commit, after CI passed on that commit. Tags on branches, tags
    on red builds and "release" commits that also change code are refused in review.

## Cutting a release

```bash
git checkout main && git pull --ff-only
$EDITOR CHANGELOG.md                                              # Unreleased → [1.2.0] — <date>
git commit -am "Release 1.2.0" && git push
git tag -a v1.2.0 -m "vale 1.2.0" && git push origin v1.2.0      # monorepo: git tag -a gateway/v1.2.0 -m "gateway 1.2.0"
```

CI on the tag: compute the version (rule 3) → retag the commit's `sha-<12>` image as `v1.2.0` (rule 5) → deploy
production → call `register-app` (rule 8) → attach a filled-in `templates/RELEASE.md` to the GitHub release. Then check
the tile: `curl -s https://eisensoftware.com/registry.json | grep -A6 '"id": "<id>"'` shows the new `version` and `sha`.

## Workflow skeleton (app repository)

```yaml
on: { push: { branches: [main], tags: ['v*'] }, pull_request: {} }
jobs:
  build:      # every event: image sha-<12> (+ v<semver> on tags); outputs version, sha12, image_tag, image_digest
  preview:    # pull_request only: environment preview, deploy <service>-preview, comment the URL on the PR
  production: # main + tags: environment production, gcloud run deploy --image <path>:sha-<12>
  register:   # after production: uses hockeyiscool19/monorepo/.github/workflows/register-app.yml@main
```

`image-tagging/templates/build-push.sh` implements the build job's tagging and outputs; `site-plugin` rule 6 shows
the register job.

## Audit — score the pipeline before you call it done

| # | Check | Points |
|---|---|---|
| 1 | Every production deploy carries a version computed by rule 3 (no hand-typed versions, no `latest`) | 15 |
| 2 | Releases are annotated `v*` (or `<app>/v*`) tags on `main`; none was ever moved or deleted | 10 |
| 3 | The `v<semver>` image tag points at the same digest as the commit's `sha-<12>` (no rebuild on release) | 15 |
| 4 | Preview and production are separate environments; preview never registers | 10 |
| 5 | The last production deploy is published: registry `deployment.sha` equals the deployed commit | 15 |
| 6 | A rollback was rehearsed by redeploying a previous tag and registering it | 10 |
| 7 | `CHANGELOG.md` has an `[Unreleased]` section and one dated section per tag | 5 |
| 8 | Each release has all four receipts (tag, digest, revision, registry commit) | 10 |
| 9 | `/health` reports the running version and sha | 5 |
| 10 | The deploy workflow has no step that edits `registry/registry.json` directly (only `register-app`) | 5 |

100 = ship. 85–99 = ship with the missing points listed in the plan's Progress section. Below 85 = not done.
