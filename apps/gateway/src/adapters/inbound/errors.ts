import { HTTPException } from "hono/http-exception";
import {
  AccessDeniedError,
  InvalidRegistryError,
  redactUrl,
  RegistryUnavailableError,
  SessionTooLargeError,
  UnknownAppError,
  UpstreamError,
  type DenialReason,
} from "../../domain/errors.js";
import { describeError, type Logger } from "../outbound/log/Logger.js";

/** The request being answered, for log lines. */
export interface ErrorContext {
  readonly method: string;
  readonly path: string;
}

/** Shape of every JSON error body: a stable `error` code plus details. */
export type ErrorBody = { readonly error: string } & Readonly<Record<string, unknown>>;

/** The status of each denial: nobody signed in or the session is over (401), not in a group (403), door closed (503). */
export const DENIAL_STATUS: Readonly<Record<DenialReason, number>> = {
  sign_in_required: 401,
  session_expired: 401,
  group_required: 403,
  door_unconfigured: 503,
};

function json(status: number, body: ErrorBody): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * Map a thrown value to the gateway's JSON error response. This is the only place errors become status codes:
 * 404 unknown_app, 502 upstream_unavailable, 503 registry_unavailable, the denials of DENIAL_STATUS as
 * `{error, app?, groups?}`, 500 session_too_large, Hono's own HTTPException as-is, and 500 internal for anything
 * else. Denials are logged with app, uid, decision and reason only (no path, token or cookie); upstream URLs are
 * logged without their query string.
 */
export function errorResponse(error: unknown, log: Logger, context: ErrorContext): Response {
  if (error instanceof AccessDeniedError) {
    log.info("access denied", { app: error.appId, uid: error.uid, decision: "denied", reason: error.reason });
    return json(DENIAL_STATUS[error.reason], {
      error: error.reason,
      ...(error.appId === undefined ? {} : { app: error.appId }),
      ...(error.groups === undefined ? {} : { groups: error.groups }),
    });
  }
  if (error instanceof SessionTooLargeError) {
    log.error("session too large", { ...context, app: error.appId, length: error.length });
    return json(500, { error: error.kind, app: error.appId });
  }
  if (error instanceof UnknownAppError) {
    return json(404, { error: error.kind, app: error.appId, apps: error.knownApps });
  }
  if (error instanceof UpstreamError) {
    log.warn("upstream unavailable", { ...context, url: redactUrl(error.url), reason: error.reason, error: describeError(error) });
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
