"""build_app — the composition root. Lives in adapters/inbound/bootstrap.py.

The ONLY module that constructs adapters or reads the environment. All arguments are optional:
production calls ``build_app()``; tests call ``build_app(registry=FakeRegistrySource())``. Domain
errors map to HTTP here, once. ``RegistryService`` (application/registry/service.py) takes the port.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.adapters.outbound.http_registry_source import HttpRegistrySource
from app.application.ports.registry_source import RegistrySource
from app.application.registry.service import RegistryService
from app.domain.contract import LoadRegistryRequest, LoadRegistryResult
from app.domain.errors import AppError, ContractError, InvalidRequestError, NotFoundError, UpstreamError

HTTP_STATUS: dict[type[AppError], int] = {InvalidRequestError: 400, NotFoundError: 404, UpstreamError: 502, ContractError: 502}


class Settings(BaseSettings):
    """Environment variables, read here and nowhere else (``APP_REGISTRY_URL``)."""
    model_config = SettingsConfigDict(env_prefix="APP_")
    registry_url: str = "https://eisensoftware.com"


def build_app(settings: Settings | None = None, registry: RegistrySource | None = None) -> FastAPI:
    """Wire adapters to ports; the optional arguments are how tests substitute fakes."""
    service = RegistryService(registry=registry or HttpRegistrySource((settings or Settings()).registry_url))
    app = FastAPI(title="app")

    @app.exception_handler(AppError)
    def app_error_to_http(_: Request, error: AppError) -> JSONResponse:
        return JSONResponse({"code": error.code, "message": error.message}, status_code=HTTP_STATUS.get(type(error), 500))

    @app.get("/api/registry")
    def get_registry(include_hidden: bool = False) -> LoadRegistryResult:
        return service.load(LoadRegistryRequest(include_hidden=include_hidden))

    return app
