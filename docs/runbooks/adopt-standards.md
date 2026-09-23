# Runbook — adopt the platform standards in an app repository

The house standards live in this repository as three Claude Code plugins — `eisen-design`, `eisen-architecture`,
`eisen-platform` — under `plugins/`, and the repository root carries the marketplace manifest
`.claude-plugin/marketplace.json` (marketplace name `eisensoftware`). An app repository consumes them in one of two
ways; both give Claude the same skills, and the second also gives Cursor.

## Way 1 — Claude Code plugin marketplace (per machine or per project)

```bash
claude plugin marketplace add hockeyiscool19/monorepo        # register the marketplace "eisensoftware" (once)
claude plugin install eisen-design@eisensoftware
claude plugin install eisen-architecture@eisensoftware
claude plugin install eisen-platform@eisensoftware
claude plugin list                                           # shows the three plugins and their versions
```

- `marketplace add` takes a GitHub `owner/repo`, a URL, or a local path (`claude plugin marketplace add
  /path/to/monorepo` while developing the skills). `--sparse .claude-plugin plugins` checks out only what the
  marketplace needs. While the repository is private, the machine needs git read access to it (an SSH key or
  `gh auth login`); the local-path form needs nothing.
- Inside Claude the plugin's skills appear as `eisen-platform:<directory>` — `eisen-platform:deploy-versioning`,
  and the generated site skills by their directory name (`eisen-platform:healthconnect`).
- `install --scope project` records the plugin in the repository's `.claude/settings.json` so teammates get it;
  the default scope is `user`.
- After the monorepo changes: `claude plugin marketplace update eisensoftware` then
  `claude plugin update eisen-platform@eisensoftware` (a restart applies it).
- Undo: `claude plugin uninstall eisen-platform@eisensoftware` and `claude plugin marketplace remove eisensoftware`.

## Way 2 — git submodule + `install-host.sh` (Claude Code and Cursor)

```bash
git submodule add git@github.com:hockeyiscool19/monorepo.git platform
./platform/scripts/install-host.sh                           # --dry-run to preview
git add .gitmodules platform .claude/skills .cursor/skills AGENTS.md
git commit -m "Adopt the eisensoftware platform standards"
```

The script symlinks every `plugins/*/skills/<skill>` (and each generated `plugins/eisen-platform/skills/sites/site-<id>`, named
`site-<id>`) into `.claude/skills/` and `.cursor/skills/` with relative links, and writes a block between
`<!-- eisensoftware-platform:start -->` and `<!-- eisensoftware-platform:end -->` in the host's `AGENTS.md` that
points at the standards (tokens-only styling, hexagonal layout, 400-line cap, image tagging, releases, register-app).
It is idempotent; a path that already exists and is not a symlink is left alone with a warning.

- Update: `git submodule update --remote platform && ./platform/scripts/install-host.sh`.
- Remove: `./platform/scripts/install-host.sh --uninstall`, then `git submodule deinit -f platform && git rm -f platform`.
- Fresh clone of the host: `git submodule update --init platform` (the links are committed and resolve once the
  submodule is checked out).

## Then, in the app

1. Load `site-plugin` and follow its onboarding order: registry entry, base path, `/health`, origins, Dockerfile
   (`image-tagging`), deploy workflow with the register job (`deploy-versioning`).
2. Add the repository secret `MONOREPO_DISPATCH_TOKEN` (fine-grained PAT, `docs/runbooks/ci-auth.md`) so the register
   step can report deploys.
3. Ask the coordinator to flip `routing.ready` once the platform path answers 200 through the Hosting rewrite.
