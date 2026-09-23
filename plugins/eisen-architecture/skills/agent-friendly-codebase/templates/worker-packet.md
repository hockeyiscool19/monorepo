# Worker packet — <task id>: <one-line outcome>

You are the **<role>** worker for <repository>. Read `AGENTS.md` and `<plan path>` (<the sections that matter>) first.

## Outcome

<One observable result: what exists where, and what it does when done. A tree of the files to produce, with a
one-line purpose each, is the clearest form. Not a list of steps.>

## Read-only

- `<path>` — <why the worker needs it>
- `<path>` — <why>

Do not modify these.

## Write-only

`<glob>` only. Do not commit. Do not touch other directories or repositories.

## Verify (run these, paste results verbatim)

- `<command>` → <expected result>
- `<command>` → <expected result>
- `wc -l` of every file ≤ 400.

## Return

≤ <N> words: file tree, verify output verbatim, decisions you made that this packet left open, and any Surprises.

## Stop

Stop and report — do not work around — if: <condition, e.g. a required tool is missing>; <condition, e.g. two
sources contradict each other on a rule you need (quote both)>; <condition, e.g. the outcome needs a path outside
Write-only>.
