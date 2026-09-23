# Agent contract — <repository name>

<One paragraph: what this repository is and what it produces.> The tool-neutral instructions live
here; `CLAUDE.md` only imports this file. Cursor and Codex read this file directly.

## Read in this order, and stop as soon as you have enough

1. This file.
2. `docs/EXECUTION_PLAN.md` — goals, decisions, phases, and the living Progress / Decision log sections.
3. The `AGENTS.md` of the package you are touching (`<path>/AGENTS.md`).
4. `docs/agent-index/` — generated lookup tables (regenerate with `<index build command>`).

## Layout

| Path | What it is | Owner |
|---|---|---|
| `<path>/` | <what it is, one line> | <who may write it> |
| `scripts/` | Repo-level tooling: the gate scripts | coordinator |
| `docs/` | Plan, runbooks, generated index | coordinator |

## Rules (every package)

- **Source files stay at or under 400 lines** (`wc -l`). Split by seam (domain / application / adapters), not by line count.
- **Domain has no I/O.** Ports take one request model and return one result model. The composition root is the only
  place that wires adapters to ports.
- **Never weaken a config, lint rule or test to silence a finding.** Fix the code or record the exception in the
  plan's Decision log.
- **No secrets in the repo.** `.env*` files are ignored. Config comes from environment variables with documented names.
- <Repo-specific rule with a number or a path, e.g. "Components use design tokens only (`tokens.css`)".>

## Verify

```
<gate command 1>      # <what it checks, e.g. architecture: layout and import rules>
<gate command 2>      # <e.g. lint + types + unit tests>
<gate command 3>      # <e.g. generated index is fresh>
```

Report gate results verbatim (the command and its pass/fail output), not a summary.

## Working agreements for agents

- Agents do not commit, deploy, run cloud or DNS commands, or modify other repositories unless the packet says so.
- A worker packet has fixed fields: **Outcome · Read-only · Write-only · Verify · Return · Stop**. Write only inside
  your Write-only paths.
- Commit subjects are imperative sentences stating the outcome. Branch prefixes: `feat/`, `fix/`, `docs/`, `skills/`.
- When something in the plan turns out to be wrong, add a line to **Surprises & discoveries** rather than silently
  adapting.
