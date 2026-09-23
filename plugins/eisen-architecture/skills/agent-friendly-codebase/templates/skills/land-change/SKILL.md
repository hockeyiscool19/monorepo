---
name: land-change
description: Verify a change is ready to land — confirm it stayed inside its write-only paths, refresh the generated index, run the targeted tests, then every gate, and report the results verbatim. Use before committing, opening a PR, or returning a worker packet.
allowed-tools: Bash(<gate command 1>), Bash(<gate command 2>), Bash(<index build command>), Bash(<package test command> *), Bash(git status *), Bash(git diff *), Bash(wc -l *)
---

# Land a change

Run from the repository root.

1. `git status --short` and `git diff --stat`: every changed path is inside the packet's Write-only paths.
2. If a module, port, adapter or entry point was added, renamed or removed: `<index build command>`, and include
   the regenerated `docs/agent-index/` in the change.
3. `wc -l` on every changed source file: all at or under 400. If not, split by seam first.
4. Targeted loop on the touched package: `<package test command>`.
5. Gates, one command each, all must pass:

       <gate command 1>
       <gate command 2>

6. Never weaken a lint rule, checker config or test to pass. If a gate fails for a reason unrelated to the change,
   say so and paste the output instead of fixing it silently.
7. If a plan was advanced, update its Progress section with evidence (command + result), and Surprises & discoveries
   if the plan was wrong.

Report gate results verbatim (each command and its output), not a summary.
