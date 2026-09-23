"""FakeRegistrySource — an in-memory RegistrySource that ships with the package.

Lives in adapters/outbound/fakes/registry_source.py, next to the real adapters, so the
composition root, a ``--registry fake`` CLI flag and every test can use it. It is
deterministic, records each call, and can be told to fail with a domain error — which is how
tests exercise the port's documented failure behaviour without a network.
"""

from app.domain.contract import LoadRegistryRequest, LoadRegistryResult
from app.domain.errors import AppError


class FakeRegistrySource:
    """Satisfies ``RegistrySource`` from a canned result or a canned failure."""

    def __init__(self, result: LoadRegistryResult | None = None, *, failure: AppError | None = None) -> None:
        self.result = result or LoadRegistryResult()
        self.failure = failure
        self.calls: list[LoadRegistryRequest] = []

    def load(self, request: LoadRegistryRequest) -> LoadRegistryResult:
        """Record the request, then return the canned result or raise the canned failure."""
        self.calls.append(request)
        if self.failure is not None:
            raise self.failure
        return self.result
