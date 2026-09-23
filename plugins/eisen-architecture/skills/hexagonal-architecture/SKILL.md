---
name: hexagonal-architecture
description: Layout and dependency rules for a hexagonal (ports and adapters) package in Python or TypeScript — domain / application[/ports] / adapters[/inbound|/outbound] — with a runnable checker per language (scripts/check_architecture.py, templates/.dependency-cruiser.cjs). Load when creating or restructuring a service package, deciding where a new module goes, splitting a file that is nearing the 400-line cap, or wiring the architecture gate into CI.
---

# Hexagonal architecture

One package is one hexagon. Dependencies point inward — adapters → application → domain — and
nothing points out. The rules are numbered; both checkers report violations by rule id.

## Rule 1 — Layout: three layers, two adapter sides, nothing else

    src/<pkg>/__init__.py                 one-line docstring; imports nothing from adapters
    src/<pkg>/domain/                     models, value objects, errors, pure rules — no I/O
    src/<pkg>/application/ports/          Protocols (Python) / interfaces (TS) the use cases need
    src/<pkg>/application/<use_case>/     services that call ports; one use case per directory
    src/<pkg>/adapters/inbound/           CLI, HTTP routes, jobs, and bootstrap (the composition root)
    src/<pkg>/adapters/outbound/          DB, HTTP clients, filesystem, and fakes/ (shipped, in-memory)
    tests/                                mirrors the package; unit tests use fakes only

TypeScript: the same tree under `src/` (one package) or `packages/<name>/src/` (many), plus
`src/main.ts`, a process entry that calls `buildApp()` and starts the server and nothing else.
Python has no root module besides `__init__.py`; console scripts point at `adapters/inbound/bootstrap:main`.
Checker ids: `layout/layer`, `layout/adapter-side` (Python); `modules-live-in-a-layer`, `adapters-under-inbound-or-outbound` (TS).

## Rules 2–6 — Who may import whom

| # | Rule | Python id | TypeScript rule |
|---|---|---|---|
| 2 | `domain/` imports `domain/`, the standard library and pure libraries (pydantic). Never `application/`, `adapters/` or an I/O module. | `imports/domain-no-application`, `imports/no-adapters`, `imports/no-io` | `domain-no-application-or-adapters`, `domain-no-io` |
| 3 | `application/` imports `domain/` and `application/` (its ports, other use cases). Never `adapters/` or an I/O module. | `imports/no-adapters`, `imports/no-io` | `application-no-adapters`, `application-no-io` |
| 4 | `adapters/` may import anything in the package; inbound wires outbound inside the composition root. | — | — |
| 5 | The package root (`__init__.py`, `main.ts`) never imports `adapters/`; only bootstrap does. | `imports/no-adapters` | `modules-live-in-a-layer` |
| 6 | Packages import each other only through an explicit allow rule naming both prefixes, and only another package's `domain` and `application/ports` — never its adapters or use cases. | `imports/cross-package` | `no-cross-package-imports`, `cross-package-<name>` |

"I/O module" means a web framework, HTTP client, database driver, cloud SDK, subprocess or socket.
`python3 scripts/check_architecture.py --list-io` prints the Python list; `NODE_IO` and `IO_PACKAGES` in
`.dependency-cruiser.cjs` hold the TypeScript one. Extend the list (`[io] modules` in `architecture.toml`)
rather than importing around it.

```python
# src/app/domain/routing.py — allowed: domain imports domain only, so it needs no fake to test
from app.domain.contract import AppEntry

def route_for(path: str, apps: tuple[AppEntry, ...]) -> AppEntry | None:
    """Longest-prefix match."""
    candidates = [app for app in apps if path == app.path or path.startswith(f"{app.path}/")]
    return max(candidates, key=lambda app: len(app.path), default=None)
```

```python
# src/app/domain/routing.py:3: imports/no-io: domain must not import I/O module httpx
import httpx  # the fetch belongs in adapters/outbound/http_registry_source.py
```

## What goes where

| You are adding… | Put it in | Example path |
|---|---|---|
| A model, enum, invariant, calculation, the contract version | `domain/` | `domain/contract.py`, `domain/routing.py` |
| The error hierarchy | `domain/errors.py` | one file, one base class |
| A Protocol / interface with one request and one result model | `application/ports/` | `application/ports/registry_source.py` |
| A use case that calls ports | `application/<use_case>/` | `application/registry/service.py` |
| A CLI command, HTTP route, scheduled job | `adapters/inbound/` | `adapters/inbound/http/routes.py` |
| The composition root and settings | `adapters/inbound/bootstrap.py` | `build_app(settings=None, registry=None)` |
| The error → HTTP status table | `adapters/inbound/`, once | inside `bootstrap.py` or `http/errors.py` |
| A DB / HTTP / file client | `adapters/outbound/` | `adapters/outbound/http_registry_source.py` |
| An in-memory fake or fixture adapter | `adapters/outbound/fakes/` | `adapters/outbound/fakes/registry_source.py` |
| Something that "does not fit" (`utils.py`, `helpers.py`, `common.py`) | nowhere — name it by what it is and it fits | |

## How to add a package

1. Create the tree above with a one-line docstring in every `__init__.py` (Python) or the three layer
   directories (TypeScript). No file outside the layers except `main.ts`.
2. Register it: a `[[packages]]` entry in `architecture.toml` (Python) or the `src` path in the
   `depcruise` command (TypeScript). Cross-package imports need an `[[allow]]` / `CROSS_PACKAGE_ALLOW`
   entry naming both prefixes.
3. Write `<package>/AGENTS.md` with the sections Layout / Entry points / Boundaries / Tests
   (agent-friendly-codebase skill, `templates/PACKAGE-AGENTS.md`).
4. Add the first port, its fake, and a use-case test that runs against the fake before any real
   adapter exists (ports-and-adapters skill).
5. Run the checker: zero violations before the first commit.

## Splitting by seam before the 400-line cap

Count with `wc -l`; the cap is 400 including imports and CI enforces it. Plan the split at 320.
Split by seam, never by line number, in this order:

1. `domain/`: one module per concept (`registry.py`, `routing.py`); rules separate from models.
2. `application/`: one use case per directory, one service per module.
3. `adapters/outbound/`: one adapter per technology (`http_registry_source.py`, `local_registry_source.py`).
4. `adapters/inbound/`: one module per resource or command (`http/registry_routes.py`, `cli/serve.py`).

A 380-line `application/registry/service.py` becomes `load.py`, `refresh.py` and `match.py` under the
same directory; the port they share stays in `application/ports/`. A split that produces `utils.py`
was a split by line number.

## Enforcing

Python — copy `scripts/check_architecture.py` and `templates/architecture.toml` to the repository
root. Standard library only; needs Python ≥ 3.11 (`tomllib`).

    python3 scripts/check_architecture.py                                 # reads ./architecture.toml
    python3 scripts/check_architecture.py --config a.toml --root <dir>    # explicit paths
    python3 scripts/check_architecture.py --package app=src --io-module stripe   # no config file

Exit 0 clean · 1 violations, one line each (`path:line: rule: detail`) · 2 bad configuration.
Checker tests: `python3 -m unittest discover -s tests` (or `pytest tests`) in this skill's directory.

TypeScript — copy `templates/.dependency-cruiser.cjs` to the repository root (a `tsconfig.json` must
exist), then:

    npm i -D dependency-cruiser
    "check:architecture": "depcruise --config .dependency-cruiser.cjs src"      # package.json script

Use `packages/*/src` for a multi-package repository. Exit 0 clean, non-zero on any violation; each is
printed as `rule-name: from → to`. `globalThis.fetch` is not an import: add an ESLint
`no-restricted-globals` entry for `fetch` under `src/domain/**` and `src/application/**`.

Both: one gate command CI runs (`make check-architecture` or the npm script), listed under Verify in
`AGENTS.md` and on the agent settings allowlist. Never weaken the config to silence a finding: an
`[[allow]]` entry is a decision, so it goes in the plan's Decision log with the reason.

## Audit — score the package before you call it done

| # | Check | Points |
|---|---|---|
| 1 | Every module is under `domain/`, `application/` or `adapters/{inbound,outbound}/` (0 layout violations) | 10 |
| 2 | `domain/` imports no application, adapter or I/O module | 15 |
| 3 | `application/` imports no adapter or I/O module | 15 |
| 4 | Exactly one composition root (`adapters/inbound/bootstrap.*`) constructs adapters | 10 |
| 5 | Every port has a fake under `adapters/outbound/fakes/` and a use-case test that uses it | 10 |
| 6 | Every cross-package import is covered by an allow rule naming `domain` or `application/ports` only | 10 |
| 7 | The checker runs in CI as one command and is on the agent allowlist | 10 |
| 8 | No file over 400 lines; no `utils.py` / `helpers.py` / `common.py` | 10 |
| 9 | `<package>/AGENTS.md` has Layout / Entry points / Boundaries / Tests | 5 |
| 10 | `architecture.toml` / `.dependency-cruiser.cjs` is committed and every allow rule has a Decision-log entry | 5 |

100 = ship. 85–99 = ship with the missing points listed in the plan's Progress section. Below 85 = not done.
