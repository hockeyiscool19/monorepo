@AGENTS.md

## Claude-specific notes

- Prefer the `make` targets in AGENTS.md over ad-hoc commands; they are the gates CI runs.
- The skills in `plugins/*/skills/` are the house standards for design, architecture and deployment. When a task
  touches UI, load the relevant `ui-style-*` skill plus `design-tokens` and `accessibility-ada`; when it touches
  service code, load `hexagonal-architecture` and `ports-and-adapters`; when it touches CI or images, load
  `deploy-versioning` and `image-tagging`.
- `docs/EXECUTION_PLAN.md` is the plan of record. Update its Progress section with evidence (command + result) when a
  phase task lands.
