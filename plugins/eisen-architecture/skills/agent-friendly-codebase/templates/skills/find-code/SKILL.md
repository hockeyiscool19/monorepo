---
name: find-code
description: Locate where something lives in this repository (a class, port, adapter, route, command, plan or concept) using the package guides and the generated index before reading files. Use when asked "where is X", "what implements Y", or before editing unfamiliar code.
allowed-tools: Read, Grep, Glob, Bash(<index search command> *)
---

# Find code

1. Known name? `<symbol lookup command> <Name>` — or `grep -rn "class <Name>\b\|def <name>\b\|export .*<Name>\b"
   <src roots>` — and open the first `path:line`.
2. Concept or behaviour? `<search command> "<words>" -k 10`, restricting to one package with `--under <path>`.
   Refine with the domain's own words (port, adapter, route, manifest, registry) when results are weak.
3. Which adapter implements a port? `docs/agent-index/ports.md`.
4. What can I run? `docs/agent-index/entrypoints.md`.
5. Which modules does a package have, and what does each do? `docs/agent-index/modules/<package>.md`.
6. Plan or status questions: `docs/EXECUTION_PLAN.md` — Progress for what landed, Decision log for why.

Report findings as `path:line` links. If the index looks stale, run `<index build command>` and say so in the
report instead of hand-editing a generated table.
