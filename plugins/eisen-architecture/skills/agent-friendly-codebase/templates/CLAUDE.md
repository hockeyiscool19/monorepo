@AGENTS.md

## Claude-specific notes

- Prefer the gate commands listed in AGENTS.md over ad-hoc commands; they are what CI runs.
- Package guides load on demand: working under a package directory pulls in its `CLAUDE.md`, which imports that
  package's `AGENTS.md`.
- The `find-code` and `land-change` skills in `.claude/skills/` wrap the index and the gates. Use them instead of
  broad greps and instead of improvising a pre-commit checklist.
- `docs/EXECUTION_PLAN.md` is the plan of record. Update its Progress section with evidence (command + result) when
  a task lands; add a line to Surprises & discoveries when the plan was wrong.
