/**
 * One error hierarchy for the whole package. Lives in domain/errors.ts.
 * Adapters translate technology failures into these; application code throws and catches
 * only these; the inbound adapter maps them to HTTP status codes ONCE (see bootstrap.ts).
 * No other module mentions an HTTP status. `code` is a stable, machine-readable slug.
 */
export abstract class AppError extends Error {
  abstract readonly code: string;

  constructor(message: string, options?: { readonly cause?: unknown; readonly detail?: string }) {
    super(message, { cause: options?.cause });
    this.name = new.target.name;
    this.detail = options?.detail ?? null;
  }

  readonly detail: string | null;
}

/** The caller's input is malformed or violates a domain invariant. */
export class InvalidRequestError extends AppError {
  readonly code = 'invalid_request';
}

/** The requested thing does not exist. */
export class NotFoundError extends AppError {
  readonly code = 'not_found';
}

/** A dependency (HTTP service, database, file) failed or was unreachable. */
export class UpstreamError extends AppError {
  readonly code = 'upstream_error';
}

/** A dependency answered with a payload that does not match the contract version. */
export class ContractError extends AppError {
  readonly code = 'contract_error';
}
