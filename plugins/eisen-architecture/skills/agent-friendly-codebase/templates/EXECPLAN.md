# <Plan title: one line naming the outcome>

Status: active | reference | completed | superseded · Owner: <who> · Coordinator: <who> · Started <date>

This plan is self-contained: a reader with only this file and the working tree can continue the work.
The four sections at the bottom are living — they are updated as work lands, never rewritten from memory.
The format is our adaptation of the ExecPlan idea from OpenAI's Codex guidance
(https://cookbook.openai.com/articles/codex_exec_plans); the wording here is our own.

## Purpose

<What becomes possible when this plan is done, as behaviour a person can observe: "after X, running Y shows Z".>

## What we found

<Facts established before planning: commands run, files read, numbers, existing resources. Not opinions.
Each line should let a reader re-verify it.>

## Target

<The end state: layout, contracts, commands. A tree or diagram is welcome. Name every file the plan will create.>

## Phases

Dependencies: <e.g. 0 → {1, 2} in parallel · 3 after 1–2>.

### Phase 0 — <name> (<owner: coordinator or the worker's write-only path>)
<What ships, in two or three sentences.>
**Done when** <one observable check>. **Verify** `<command>` → <expected output>.

### Phase 1 — <name> (<owner>)
<...>
**Done when** <...>. **Verify** `<command>` → <expected output>.

## Manual steps for the owner

1. <Something only a human can do: approve, pay, click, grant> — needed before Phase <n>.

## Progress

- [x] <date> <task> — evidence: `<command>` → <result>
- [ ] Phase 0 — <name>
- [ ] Phase 1 — <name>

Every checked item carries evidence (the command and its result). A worker's "done" without evidence stays unchecked.

## Surprises & discoveries

- <date> The plan assumed <X>; <Y> is true. Changed: <what>.

## Decision log

| # | Decision | Why | By / when |
|---|---|---|---|
| 1 | <decision> | <reason, including what was rejected> | <person, date> |

## Outcomes & retrospective

<Filled in as phases complete: what shipped (with the commit or tag), what was cut, what to do differently next time.>
