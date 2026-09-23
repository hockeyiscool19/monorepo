"""HttpRegistrySource — the RegistrySource adapter for an HTTP endpoint.

Lives in adapters/outbound/http_registry_source.py. Named by technology (Http*), not by role
(*Impl, *Client). Its whole job: call the technology, validate the payload into the contract
model, translate technology failures into the domain error hierarchy. No business rules here.
"""

import httpx
from pydantic import ValidationError

from app.domain.contract import LoadRegistryRequest, LoadRegistryResult
from app.domain.errors import ContractError, UpstreamError


class HttpRegistrySource:
    """Loads ``<base_url>/registry.json``. Structurally satisfies ``RegistrySource``."""

    def __init__(self, base_url: str, *, timeout_seconds: float = 5.0) -> None:
        self._client = httpx.Client(base_url=base_url, timeout=timeout_seconds)

    def load(self, request: LoadRegistryRequest) -> LoadRegistryResult:
        """Fetch and validate; raises UpstreamError or ContractError, never an httpx error."""
        params = {"include_hidden": str(request.include_hidden).lower()}
        try:
            response = self._client.get("/registry.json", params=params)
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPError as exc:
            raise UpstreamError(f"registry fetch failed: {exc}", detail=str(request)) from exc
        except ValueError as exc:
            raise ContractError("registry payload is not JSON", detail=str(exc)) from exc
        try:
            return LoadRegistryResult.model_validate(payload)
        except ValidationError as exc:
            raise ContractError("registry payload does not match the contract", detail=str(exc)) from exc
