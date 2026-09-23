"""Frozen wire models for the registry port. Lives in domain/contract.py.

CONTRACT_VERSION changes on a breaking change only (removed or renamed field, changed meaning);
an added optional field keeps it. Results carry the version so a consumer can refuse a payload it
does not understand; the type checker fails if ``Literal[1]`` and the constant ever disagree.
"""

from typing import Final, Literal

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION: Final = 1


class Frozen(BaseModel):
    """Base for every domain model: immutable, no unknown fields, validated on construction."""

    model_config = ConfigDict(frozen=True, extra="forbid")


class AppEntry(Frozen):
    """One application in the registry."""

    id: str = Field(min_length=1, pattern=r"^[a-z][a-z0-9-]*$")
    path: str = Field(pattern=r"^/[a-z0-9-]*$")
    status: Literal["live", "beta", "hidden"] = "live"
    version: str | None = None


class LoadRegistryRequest(Frozen):
    """The one argument of ``RegistrySource.load``. Add fields here, never parameters there."""

    include_hidden: bool = False


class LoadRegistryResult(Frozen):
    """The one return value of ``RegistrySource.load``; identical from HTTP, file or fake."""

    contract_version: Literal[1] = CONTRACT_VERSION
    apps: tuple[AppEntry, ...] = ()
