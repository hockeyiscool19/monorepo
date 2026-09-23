"""The RegistrySource port. Lives in application/ports/registry_source.py.

A port is a Protocol with one method per capability. Each method takes ONE request model and
returns ONE result model, both frozen (see contract.py), so adding a field never changes a
signature. Failure behaviour is part of the contract and is written here, once.
"""

from typing import Protocol

from app.domain.contract import LoadRegistryRequest, LoadRegistryResult


class RegistrySource(Protocol):
    """Where the app registry comes from (HTTP, local file, fake).

    Failure contract — every adapter obeys it, and tests assert it against the fake:
    - raises ``UpstreamError`` when the source cannot be reached or answers with an error;
    - raises ``ContractError`` when the payload does not validate as ``LoadRegistryResult``;
    - never returns ``None`` or a partial result; never lets a technology exception
      (``httpx.HTTPError``, ``OSError``, ``json.JSONDecodeError``) escape — the adapter maps it.

    Synchronous: the use case calls it inline. See SKILL.md rule 7 before making it async.
    """

    def load(self, request: LoadRegistryRequest) -> LoadRegistryResult:
        """Return the registry; failures are listed in the class docstring."""
        ...
