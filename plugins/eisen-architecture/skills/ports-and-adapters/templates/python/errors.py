"""One error hierarchy for the whole package. Lives in domain/errors.py.

Adapters translate technology exceptions into these; application raises and catches only these;
the inbound adapter maps them to HTTP status codes ONCE (bootstrap.py). ``code`` is a stable slug.
"""


class AppError(Exception):
    """Base of every error the package raises."""

    code = "app_error"

    def __init__(self, message: str, *, detail: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail


class InvalidRequestError(AppError):
    """The caller's input is malformed or violates a domain invariant."""

    code = "invalid_request"


class NotFoundError(AppError):
    """The requested thing does not exist."""

    code = "not_found"


class UpstreamError(AppError):
    """A dependency (HTTP service, database, file) failed or was unreachable."""

    code = "upstream_error"


class ContractError(AppError):
    """A dependency answered with a payload that does not match the contract version."""

    code = "contract_error"
