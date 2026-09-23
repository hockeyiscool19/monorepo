# <package>

<One or two sentences: what this package is for and who consumes it.> Root rules are in `/AGENTS.md`;
this file only adds package context. Module table: `docs/agent-index/modules/<package>.md`.

## Layout

    src/<package>/domain/               <models, errors, contract version — no I/O>
    src/<package>/application/ports/    <every port Protocol / interface>
    src/<package>/application/<area>/   <use cases that call ports>
    src/<package>/adapters/inbound/     <CLI, HTTP routes, jobs; bootstrap is the composition root>
    src/<package>/adapters/outbound/    <clients, stores; fakes/ ships the in-memory adapters>
    tests/                              mirrors the package; unit tests use fakes only

## Entry points

    <command that starts or exercises the package>        # <what it does>
    <second entry point, if any>                          # <what it does>

## Boundaries

- Domain and application import no other package. <Name each exception and the allow rule that permits it.>
- <Which packages consume this package's `domain` and `application/ports`; changing those is a cross-package change.>
- <Network and cloud adapters are tested with fakes only; the contract test for the real adapter is `<path>`.>

## Tests

    <one command that runs this package's tests>
