import { HTTPException } from "hono/http-exception";
import {
  InvalidRegistryError,
  RegistryUnavailableError,
  UnknownAppError,
  UpstreamError,
} from "../../domain/errors.js";
import { describeError, type Logger } from "../outbound/log/Logger.js";

/** The request being answered, for log lines. */
export interface ErrorContext {
  readonly method: string;
  readonly path: string;
}

/** Shape of every JSON error body: a stable `error` code plus details. */
export type ErrorBody = { readonly error: string } & Readonly<Record<string, unknown>>;

function json(status: number, body: ErrorBody): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * Map a thrown value to the gateway's JSON error response. This is the only place errors become
 * status codes: 404 unknown_app, 502 upstream_unavailable, 503 registry_unavailable, Hono's own
 * HTTPException as-is, and 500 internal for anything else (logged with its description).
 */
export function errorResponse(error: unknown, log: Logger, context: ErrorContext): Response {
  if (error instanceof UnknownAppError) {
    return json(404, { error: error.kind, app: error.appId, apps: error.knownApps });
  }
  if (error instanceof UpstreamError) {
    log.warn("upstream unavailable", { ...context, url: error.url, reason: error.reason, error: describeError(error) });
    return json(502, { error: error.kind, reason: error.reason, detail: error.message });
  }
  if (error instanceof RegistryUnavailableError || error instanceof InvalidRegistryError) {
    log.error("registry unavailable", { ...context, error: describeError(error) });
    return json(503, { error: "registry_unavailable", detail: error.message });
  }
  if (error instanceof HTTPException) return error.getResponse();
  log.error("unhandled error", { ...context, error: describeError(error) });
  return json(500, { error: "internal" });
}
