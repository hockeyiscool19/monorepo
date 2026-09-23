# eisen-architecture

Three Claude Code skills that distil the architecture conventions of `autoresearcher` into
language-aware guidance with runnable checkers. They apply to Python (Pydantic v2) and TypeScript
repositories alike; the monorepo's own `apps/gateway` is the first TypeScript consumer.

| Skill | Load it when | Ships |
|---|---|---|
| `hexagonal-architecture` | creating or restructuring a package, deciding where a module goes, splitting a file near 400 lines, wiring the architecture gate | layout and dependency rules; `scripts/check_architecture.py` (Python, standard library only) with `templates/architecture.toml`; `templates/.dependency-cruiser.cjs` (TypeScript); `tests/` |
| `ports-and-adapters` | adding or changing a port, adapter, fake, composition root, error mapping or contract; testing a use case | eight rules; six skeletons per language (≤ 40 lines each) under `templates/python/` and `templates/typescript/` |
| `agent-friendly-codebase` | bootstrapping a repository for agents, writing `AGENTS.md` / `CLAUDE.md`, planning multi-agent work, delegating a task, landing a change | ten rules; templates for `AGENTS.md`, package guides, `CLAUDE.md`, `settings.json`, the execution plan, the worker packet, and the `find-code` / `land-change` skills |

Every `SKILL.md` ends with a 100-point audit: ship at 85 or more, with the missing points written
into the plan's Progress section.

## Running the checkers

Python (Python ≥ 3.11, no dependencies):

    cd skills/hexagonal-architecture
    python3 -m unittest discover -s tests                      # or: python3 -m pytest tests -q
    python3 scripts/check_architecture.py --config templates/architecture.toml --root <repo>
    python3 scripts/check_architecture.py --package app=src    # no config file: flags only
    python3 scripts/check_architecture.py --list-io            # the effective I/O blocklist

Exit 0 clean · 1 violations (`path:line: rule: detail`, one per line) · 2 bad configuration.

TypeScript (from the repository that adopts it, where `tsconfig.json` lives):

    npm i -D dependency-cruiser
    npx depcruise --config .dependency-cruiser.cjs src         # or packages/*/src

## How a repository adopts the skills

1. Install the plugin — `claude plugin marketplace add <this repository>` then
   `claude plugin install eisen-architecture` once the marketplace file lands (Phase 7) — or symlink
   `skills/*` into `.claude/skills/` and `.cursor/skills/` with `scripts/install-host.sh`.
2. Copy `skills/hexagonal-architecture/scripts/check_architecture.py` and `templates/architecture.toml`
   (Python) or `templates/.dependency-cruiser.cjs` (TypeScript) to the repository root, edit the package
   list, and add one gate command (`make check-architecture` / `npm run check:architecture`) that CI runs.
3. Copy `skills/agent-friendly-codebase/templates/{AGENTS.md,CLAUDE.md,settings.json,EXECPLAN.md}` and the
   two routine skills under `templates/skills/`; replace every `<placeholder>`; add one
   `PACKAGE-AGENTS.md` copy per package.
4. Start each new port from `skills/ports-and-adapters/templates/<language>/` — contract, port, errors,
   adapter, fake, bootstrap — and keep every file at or under 400 lines.

## Layout

    .claude-plugin/plugin.json
    skills/hexagonal-architecture/    SKILL.md · scripts/check_architecture.py · templates/ · tests/
    skills/ports-and-adapters/        SKILL.md · templates/python/ · templates/typescript/
    skills/agent-friendly-codebase/   SKILL.md · templates/ (AGENTS.md, PACKAGE-AGENTS.md, CLAUDE.md,
                                      settings.json, EXECPLAN.md, worker-packet.md, skills/find-code, skills/land-change)
