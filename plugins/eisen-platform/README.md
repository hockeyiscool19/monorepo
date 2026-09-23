# eisen-platform

Deployment standards for every eisensoftware app, packaged as a Claude Code plugin (`.claude-plugin/plugin.json`),
plus one generated skill per registered site so an agent knows where each app lives and how to smoke-test it.

| Skill | Load it when | Ships |
|---|---|---|
| `deploy-versioning` | cutting a release, writing a deploy workflow, choosing a version string, rolling back, touching a `deployment` block | ten rules; `templates/RELEASE.md`, `templates/CHANGELOG.md` |
| `image-tagging` | writing a Dockerfile, a build-and-push step, a Cloud Run deploy command, a Hosting rewrite, a retention policy | ten rules; `templates/Dockerfile.node`, `templates/Dockerfile.python`, `templates/build-push.sh` |
| `site-plugin` | onboarding an app, changing its path, URL, API, health check or status, wiring `register-app`, regenerating site skills | ten rules; `templates/site-SKILL.md`, `scripts/generate-site-skills.mjs` |
| `site-<id>` (generated, one per app) | working on, deploying, debugging, smoke-testing or calling that app | `skills/sites/site-<id>/SKILL.md`: URLs, API + health, auth mode, repo, deployment, `curl` smoke tests |

Every hand-written `SKILL.md` ends with a 100-point audit: ship at 85 or more, with the missing points written into
the plan's Progress section.

## How the pieces fit

1. `deploy-versioning` says what a version is and which four receipts a release leaves — tag, image digest, Cloud Run
   revision, registry commit — and that production promotes an already-built image by tag.
2. `image-tagging` says how that image is named (`us-central1-docker.pkg.dev/<project>/<repo>/<service>:sha-<12>`)
   so the digest receipt exists, is immutable, and is never `:latest`.
3. `site-plugin` says how the app behaves under its path on `eisensoftware.com` and how the registry learns about
   each deploy (`register-app`), which is what makes the tile and the gateway route correct.
4. The `site-<id>` skills are the registry rendered for agents. They are regenerated, never edited.

## Generate the site skills

```bash
node plugins/eisen-platform/skills/site-plugin/scripts/generate-site-skills.mjs            # write skills/sites/site-<id>/SKILL.md
node plugins/eisen-platform/skills/site-plugin/scripts/generate-site-skills.mjs --check    # exit 1 when stale (CI)
```

Zero dependencies. Output is deterministic (no timestamps), so a second run reports `up to date`. Run it after every
change to `registry/registry.json` and commit the result; `--check` in CI keeps the two in step. A directory under
`skills/sites/` whose `SKILL.md` carries the generated marker but whose app left the registry is removed; a hand-written
file without the marker is left alone.

## Install

Two ways, both described in `docs/runbooks/adopt-standards.md`:

```bash
claude plugin marketplace add hockeyiscool19/monorepo     # once per machine; the marketplace is named "eisensoftware"
claude plugin install eisen-platform@eisensoftware
```

or vendor the repository as a submodule and let `scripts/install-host.sh` symlink every skill (generated site skills
included, as `site-<id>`) into the host's `.claude/skills/` and `.cursor/skills/` and write the `AGENTS.md` pointer.

## Verify the plugin itself

```bash
claude plugin validate --strict plugins/eisen-platform
node plugins/eisen-platform/skills/site-plugin/scripts/generate-site-skills.mjs --check
bash -n plugins/eisen-platform/skills/image-tagging/templates/build-push.sh
wc -l plugins/eisen-platform/skills/*/SKILL.md plugins/eisen-platform/skills/sites/*/SKILL.md      # each ≤ 200
```

## Layout

```
.claude-plugin/plugin.json
README.md
skills/deploy-versioning/   SKILL.md · templates/RELEASE.md · templates/CHANGELOG.md
skills/image-tagging/       SKILL.md · templates/Dockerfile.node · templates/Dockerfile.python · templates/build-push.sh
skills/site-plugin/         SKILL.md · templates/site-SKILL.md · scripts/generate-site-skills.mjs
skills/sites/site-<id>/     SKILL.md (generated)
```
