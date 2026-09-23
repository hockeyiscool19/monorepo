---
name: agent-friendly-codebase
description: Conventions that make a repository navigable and safe for coding agents (Claude Code, Cursor, Codex) — AGENTS.md as the tool-neutral contract with CLAUDE.md importing it, per-package guides with fixed sections, a generated index kept honest by a staleness test, one command per gate, permission allow/deny lists, find-code and land-change routines, living execution plans, worker packets, the 400-line cap, commit and branch conventions. Load when bootstrapping a repository for agents, writing or reviewing AGENTS.md or CLAUDE.md, planning multi-agent work, delegating a task, or landing a change.
---

# Agent-friendly codebase

An agent reads the contract, finds the code, changes it inside a boundary, proves it with a gate and
reports verbatim. Each rule below removes one place where that loop goes wrong. `templates/` holds a
starting file for every artifact; copy it, then replace every `<placeholder>`.

## Rule 1 — `AGENTS.md` is the source; `CLAUDE.md` is `@AGENTS.md`

- The root `AGENTS.md` (`templates/AGENTS.md`) is tool-neutral, ≤ 120 lines, with these sections in this
  order: what the repository is · **Read in this order, and stop as soon as you have enough** · Layout table
  (path, what, owner) · Rules · Verify (the gate commands) · Working agreements.
- `CLAUDE.md` (`templates/CLAUDE.md`) is `@AGENTS.md` plus ≤ 10 lines of Claude-specific notes (which skills
  to load, which make targets to prefer). Cursor and Codex read `AGENTS.md` directly; never restate a rule
  in a `.mdc` file or a second document.
- A rule carries a number or a path ("≤ 400 lines", "`registry/` is the only place a URL is written"),
  never an adjective ("keep files small", "be careful with secrets").

## Rule 2 — Per-package guides with four fixed sections

`<package>/AGENTS.md` (`templates/PACKAGE-AGENTS.md`) is ≤ 60 lines with exactly the sections
**Layout · Entry points · Boundaries · Tests**, plus a sibling `CLAUDE.md` containing `@AGENTS.md` so it
loads whenever an agent works under that directory. Layout is an indented tree with one comment per line;
Entry points and Tests are commands; Boundaries names the allowed cross-package imports and who consumes
this package's contracts.

## Rule 3 — A generated index kept honest by a test

- `docs/agent-index/` holds tables an agent reads before opening files: `packages.md` (module counts per
  layer), `modules/<package>.md` (every module with its docstring line), `ports.md` (each port and the
  adapters that satisfy it), `entrypoints.md` (commands, HTTP apps, runnable modules). Every module
  therefore starts with a one-line docstring: it is that module's row.
- One script renders the tables (`<index build command>`); one test renders them again in memory and fails
  when the committed files differ, printing the build command. Stale tables fail CI and cannot be hand-edited
  into agreement.
- Ranked search over the same corpus (symbol lookup, text search) is optional; the tables are not.

## Rule 4 — One command per gate; report verbatim

- A gate is one command with no flags to remember (`make check`, `python3 scripts/check_architecture.py`,
  `npm run check:architecture`), listed under **Verify** in `AGENTS.md`; CI runs those exact commands.
- Results are reported as the command plus its output (pass counts, the violation lines), never "tests pass".

## Rule 5 — Never weaken a config to silence a finding

A lint rule, checker allowlist, type-check setting, test timeout or coverage threshold changes only with a
Decision-log entry that names the finding and says why the code should not change instead. A worker that
cannot pass a gate reports it; it does not edit the gate.

## Rule 6 — Settings: allow the gates, deny the secrets

`.claude/settings.json` (`templates/settings.json`) allows exactly the gate, test, `git status`, `git diff`
and `wc -l` commands, and denies reading `.env`, `*_credentials.json`, `service-account*.json` and `*.pem`.
Anything not allowed prompts; anything denied is unreadable even when an agent is asked to read it.

## Rule 7 — Two routines: `find-code` and `land-change`

Ship both as skills (`templates/skills/find-code/SKILL.md`, `templates/skills/land-change/SKILL.md`) with
`allowed-tools` limited to the commands they need. `find-code`: known name → symbol lookup; concept → search;
port → `ports.md`; command → `entrypoints.md`; report `path:line`. `land-change`: `git status` inside the
Write-only paths → rebuild the index if modules changed → `wc -l` ≤ 400 → targeted tests → every gate →
update the plan → report verbatim.

## Rule 8 — Plans are living documents with four fixed sections at the bottom

`docs/EXECUTION_PLAN.md` (`templates/EXECPLAN.md`, our own adaptation of the ExecPlan idea, linked from
the template) has Purpose · What we found · Target · Phases (each with **Done when** and **Verify**) ·
Manual steps, then the living sections:

- **Progress** — checkboxes; a checked item carries evidence (`command` → result).
- **Surprises & discoveries** — what the plan assumed versus what is true, added the moment it is found.
- **Decision log** — a table: decision, why, by whom, when; includes every weakened gate and allow rule.
- **Outcomes & retrospective** — filled in as phases complete.

A repository with several plans keeps an index with one status word per plan (active · reference ·
completed · superseded) and archives completed plans with a redirect stub at the old path.

## Rule 9 — Worker packets with six fixed fields

Every delegated task is a packet (`templates/worker-packet.md`) with **Outcome · Read-only · Write-only ·
Verify · Return · Stop**. Concurrent workers have disjoint Write-only paths, so they never conflict; shared
files (lockfiles, plans, root configs, composition roots) are coordinator-owned. A worker that needs a path
outside Write-only stops and reports. Workers do not commit; the coordinator commits at phase boundaries.

```
Outcome     plugins/eisen-architecture/** — three skills with runnable checkers (tree follows)
Read-only   ../autoresearcher/AGENTS.md, ../autoresearcher/scripts/check_architecture.py
Write-only  plugins/eisen-architecture/** only. Do not commit.
Verify      python3 -m unittest discover -s tests → all pass; wc -l of every file ≤ 400
Return      ≤ 500 words: file tree, verify output verbatim, Surprises
Stop        if tomllib is unavailable; if two sources contradict a rule you need (quote both)
```

## Rule 10 — 400 lines, imperative commits, prefixed branches

- Source files are ≤ 400 lines by `wc -l`, imports included; lockfiles, vendored and generated files are
  exempt. Split by seam (domain / application / adapters; one use case, one adapter, one resource per file)
  at 320, not at 401.
- Commit subjects are imperative sentences stating the outcome, ≤ 72 characters: `Add registry validation
  gate`, `Render firebase rewrites from the registry` — not `registry stuff`, `WIP`, `fixes`.
- Branch prefixes: `feat/`, `fix/`, `docs/`, `skills/`; the plan names the branch each phase lands on.

## Audit — score the repository before you call it agent-friendly

| # | Check | Points |
|---|---|---|
| 1 | Root `AGENTS.md` ≤ 120 lines with the six sections; `CLAUDE.md` is `@AGENTS.md` + ≤ 10 lines | 15 |
| 2 | Every package has `AGENTS.md` with Layout / Entry points / Boundaries / Tests and a `CLAUDE.md` pointer | 10 |
| 3 | `docs/agent-index/` is generated by one command and a test fails when it is stale | 10 |
| 4 | Every gate is one command listed under Verify, and CI runs those exact commands | 15 |
| 5 | No gate config was weakened without a Decision-log entry (diff the configs against the log) | 10 |
| 6 | `.claude/settings.json` allows the gates and denies the secret files | 5 |
| 7 | `find-code` and `land-change` skills exist with `allowed-tools` set | 5 |
| 8 | The plan has the four living sections and every checked Progress item carries evidence | 15 |
| 9 | Every delegated task is a six-field packet with disjoint Write-only paths | 10 |
| 10 | No source file over 400 lines; the last 20 commit subjects are imperative outcome sentences | 5 |

100 = ship. 85–99 = ship with the missing points listed in the plan's Progress section. Below 85 = not done.
