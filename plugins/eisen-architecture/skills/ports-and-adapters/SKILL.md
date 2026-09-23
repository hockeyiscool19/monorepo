---
name: ports-and-adapters
description: How to design and implement the pieces inside a hexagonal package — ports with one request and one result model, adapters named by technology, fakes shipped as real adapters, a single build_app composition root, one error hierarchy mapped to HTTP at the edge, frozen models with a CONTRACT_VERSION, synchronous by default, and tests through ports with no network — in Python (Pydantic v2, Protocol) or TypeScript (interfaces, readonly types). Load when adding or changing a port, writing an adapter or fake, wiring build_app, mapping errors to HTTP, or testing a use case.
---

# Ports and adapters

`templates/python/` and `templates/typescript/` hold one skeleton per rule, each ≤ 40 lines —
`contract`, `port`, `errors`, `adapter`, `fake`, `bootstrap` — whose header says where it lives in
the package. Together they implement one example end to end, a `RegistrySource` port, and they
type-check, import and pass the architecture checker as written.

## Rule 1 — A port is a Protocol (Python) or interface (TS) with one request in and one result out

- One method per capability. Its only parameter is a `<Verb><Noun>Request` model; its only return is a
  `<Verb><Noun>Result` model. Adding a field never changes a signature.
- The port lives in `application/ports/<port_name>.py`; the models live in `domain/contract.py`.
- Failure behaviour is written on the port, once: which domain errors it raises, and that it never returns
  `None` / `undefined`, a partial result, or a technology exception.

```python
class RegistrySource(Protocol):
    """Raises UpstreamError (unreachable, error status) or ContractError (payload does not
    validate). Never returns None; never lets httpx.HTTPError or OSError escape."""

    def load(self, request: LoadRegistryRequest) -> LoadRegistryResult: ...
```

```ts
export interface RegistrySource {
  /** Rejects with UpstreamError or ContractError; never resolves undefined. */
  load(request: LoadRegistryRequest): Promise<LoadRegistryResult>;
}
```

## Rule 2 — Adapters are named by technology and do nothing but translate

- Class name = technology + port: `HttpRegistrySource`, `LocalRegistrySource` (file), `ProcessRegistrySource`
  (subprocess), `FirestoreCatalog`, `GcsDatasetStorage`. Never `RegistrySourceImpl`, `RealRegistrySource`,
  `RegistryClient`.
- File: `adapters/outbound/<technology>_<port>.py` (TS: `adapters/outbound/<technology>-<port>.ts`).
- An adapter calls its technology, validates the payload into the contract model, and maps the technology's
  exceptions to the domain hierarchy (`except httpx.HTTPError as exc: raise UpstreamError(...) from exc`).
  No business rules, no filtering, no defaults — those belong in the use case.
- An adapter satisfies the port structurally (`Protocol`) or nominally (`implements`); it never extends a
  base adapter class.

## Rule 3 — Fakes are real adapters that ship with the package

- `adapters/outbound/fakes/<port>.py` exports `Fake<Port>` (in-memory, deterministic) or `Fixture<Port>`
  (replays files under `tests/fixtures/`). They are importable in production: a `--registry fake` CLI flag,
  a demo mode, the composition root's own tests.
- A fake records every request in `calls`, returns a canned result, and accepts `failure=<DomainError>` to
  raise it, so tests can exercise the port's documented failure contract.
- Mocks (`unittest.mock`, `vi.fn()`) are for the technology boundary only, inside an adapter's own contract test.

## Rule 4 — One composition root: `build_app(settings=None, <port>=None)`

- `adapters/inbound/bootstrap.py` (TS: `bootstrap.ts`) is the only module that constructs a concrete adapter
  or reads the environment. `grep -rn "Http[A-Z]" src/ --include=*.py | grep -v adapters/` finds nothing.
- Every argument is optional: production calls `build_app()`; tests call
  `build_app(registry=FakeRegistrySource(...))`. Settings are a `pydantic-settings` `BaseSettings` (Python) or
  a readonly `Settings` produced by `settingsFromEnv(process.env)` in `main.ts` (TS).

```python
def build_app(settings: Settings | None = None, registry: RegistrySource | None = None) -> FastAPI:
    service = RegistryService(registry=registry or HttpRegistrySource((settings or Settings()).registry_url))
    app = FastAPI(title="app")
    app.add_exception_handler(AppError, app_error_to_http)   # rule 5: mapped once, here
    ...
```

## Rule 5 — One error hierarchy, mapped to HTTP once at the edge

- `domain/errors.py`: `AppError(message, detail=)` with a stable `code` slug, and one subclass per outcome a
  caller can act on: `InvalidRequestError`, `NotFoundError`, `UpstreamError`, `ContractError`. Add a class
  only when a caller would handle it differently.
- Adapters raise them; use cases raise and catch them; nothing else is caught in `application/`.
- The status mapping is one table in the inbound adapter, used by one handler:
  `HTTP_STATUS = {InvalidRequestError: 400, NotFoundError: 404, UpstreamError: 502, ContractError: 502}`.
  No route mentions a status code for an error; no domain class knows HTTP exists.

## Rule 6 — Frozen models with a CONTRACT_VERSION

- Python: every wire model extends `Frozen(BaseModel)` with `model_config = ConfigDict(frozen=True,
  extra="forbid")`. TypeScript: every field is `readonly`, arrays are `readonly T[]`, and parsed results
  are `Object.freeze`d.
- `domain/contract.py` exports `CONTRACT_VERSION: Final = 1`; results declare
  `contract_version: Literal[1] = CONTRACT_VERSION`, so a mismatched payload fails validation and the
  adapter raises `ContractError`, and the type checker fails if the two numbers disagree.
- Bump on a removed or renamed field or a changed meaning; an added optional field keeps the version. A bump
  is a Decision-log entry, and every consuming package is a listed follow-up.

## Rule 7 — Synchronous by default

- Python ports are sync. Go async only when the inbound adapter is async *and* a use case awaits two or more
  ports concurrently; then the whole port is async. Never both flavours of one port; never `asyncio.run`
  inside a use case.
- TypeScript outbound ports return `Promise` because Node I/O is async; domain functions and pure use-case
  logic stay synchronous.
- Refresh loops, retries and timeouts live in the adapter or the inbound job, not in the port's contract.

## Rule 8 — Test through ports with fakes; no network in the unit suite

- `tests/application/test_<use_case>.py` builds the service with a fake, asserts on the result and on
  `fake.calls`; its failure test constructs the fake with `failure=UpstreamError(...)`.
- `tests/adapters/inbound/test_http.py` calls `build_app(registry=FakeRegistrySource(...))` through
  `TestClient` (TS: the returned `fetch` handler) and asserts the status mapping.
- Each real adapter gets one contract test that never reaches the network: `httpx.MockTransport` (TS: an
  injected `fetchImpl`) returns canned responses for the success, error-status and bad-payload cases.
- The unit suite runs in parallel and finishes without credentials; anything needing a network or a secret
  is marked and excluded from the default command.

```python
def test_upstream_failure_maps_to_502() -> None:
    fake = FakeRegistrySource(failure=UpstreamError("registry down"))
    response = TestClient(build_app(registry=fake)).get("/api/registry")
    assert (response.status_code, response.json()["code"]) == (502, "upstream_error")
    assert fake.calls == [LoadRegistryRequest()]
```

## Audit — score before you call it done

| # | Check | Points |
|---|---|---|
| 1 | Every port method takes one request model and returns one result model | 15 |
| 2 | Every port's docstring lists the domain errors it raises and states it never returns None / undefined | 10 |
| 3 | Every adapter is named `<Technology><Port>` and lives in `adapters/outbound/` or `adapters/inbound/` | 10 |
| 4 | Grep for the technology's exception names (`httpx.`, `OSError`, `fetch`) outside `adapters/` finds nothing | 10 |
| 5 | Every port has a `Fake*` / `Fixture*` under `adapters/outbound/fakes/` that records calls and can fail | 15 |
| 6 | One `build_app` with all-optional arguments; no other module constructs an adapter or reads env | 15 |
| 7 | One error hierarchy; one status table; no status code in any route or domain module | 10 |
| 8 | Wire models are frozen and carry `CONTRACT_VERSION`; the bump rule is written in `contract.py` | 5 |
| 9 | Ports are sync unless the rule-7 exception applies, and no port has both flavours | 5 |
| 10 | The unit suite passes offline, in parallel, with no credentials | 5 |

100 = ship. 85–99 = ship with the missing points listed in the plan's Progress section. Below 85 = not done.
