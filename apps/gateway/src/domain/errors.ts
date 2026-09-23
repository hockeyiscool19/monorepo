/**
 * The gateway's error hierarchy. Domain and application code throw these; the inbound
 * adapter maps them to HTTP status codes and JSON bodies at the edge, and nowhere else.
 */

/** Stable, machine-readable failure kinds. They double as the `error` field of JSON error bodies. */
export type GatewayErrorKind =
  | "unknown_app"
  | "upstream_unavailable"
  | "registry_unavailable"
  | "invalid_registry"
  | DenialReason
  | "session_too_large";

/** Why the door or the API policy turned a request away. Each is also the `error` code of the answer. */
export type DenialReason = "sign_in_required" | "group_required" | "session_expired" | "door_unconfigured";

/** Why an upstream request produced no HTTP response at all. */
export type UpstreamFailureReason = "timeout" | "network" | "invalid_url";

/** Base class of every failure the gateway raises on purpose. */
export class GatewayError extends Error {
  readonly kind: GatewayErrorKind;

  constructor(kind: GatewayErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.kind = kind;
  }
}

/** `<prefix>/<id>/...` named an app that is not in the registry or has no `api` block. */
export class UnknownAppError extends GatewayError {
  readonly appId: string;
  /** Ids the gateway can front, so the 404 body can list them. */
  readonly knownApps: readonly string[];

  constructor(appId: string, knownApps: readonly string[]) {
    super("unknown_app", `unknown app "${appId}"`);
    this.appId = appId;
    this.knownApps = knownApps;
  }
}

/** A URL without its query string and fragment, which may carry codes or tokens; for messages and logs. */
export function redactUrl(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/** The upstream produced no HTTP response: DNS/connect/TLS failure, reset, invalid URL or timeout. */
export class UpstreamError extends GatewayError {
  /** The full URL that was requested (the message carries it without its query string). */
  readonly url: string;
  readonly reason: UpstreamFailureReason;

  constructor(url: string, reason: UpstreamFailureReason, options?: ErrorOptions) {
    super("upstream_unavailable", `upstream ${reason} for ${redactUrl(url)}`, options);
    this.url = url;
    this.reason = reason;
  }
}

/** No registry could be produced: the live copy failed and neither a cached nor a bundled one exists. */
export class RegistryUnavailableError extends GatewayError {
  constructor(message: string, options?: ErrorOptions) {
    super("registry_unavailable", message, options);
  }
}

/** A registry document does not satisfy contract version 1. `problems` lists every violation found. */
export class InvalidRegistryError extends GatewayError {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super("invalid_registry", `invalid registry: ${problems.join("; ")}`);
    this.problems = problems;
  }
}

/** What a denial knows about the request it refused. It never holds a token, a cookie or an envelope. */
export interface DenialDetails {
  /** The guarded app the request was for, when it named one. */
  readonly appId?: string;
  /** The groups that pass the app's policy (`access.groups`); [] means any signed-in person. */
  readonly groups?: readonly string[];
  /** The platform user a token or session identified; logged, never returned to the caller. */
  readonly uid?: string;
  /** True when this answer must also end the browser's door session (a sign-in attempt that failed). */
  readonly endsSession?: boolean;
}

/**
 * The door or the API policy refused a request: nobody is signed in (`sign_in_required`), the person is
 * in none of the app's groups (`group_required`), the door session is over (`session_expired`), or the
 * door cannot judge at all (`door_unconfigured`: sign-in missing or disabled, or no SESSION_SECRET).
 */
export class AccessDeniedError extends GatewayError {
  readonly reason: DenialReason;
  readonly appId: string | undefined;
  readonly groups: readonly string[] | undefined;
  readonly uid: string | undefined;
  readonly endsSession: boolean;

  constructor(reason: DenialReason, message: string, details: DenialDetails = {}, options?: ErrorOptions) {
    super(reason, message, options);
    this.reason = reason;
    this.appId = details.appId;
    this.groups = details.groups;
    this.uid = details.uid;
    this.endsSession = details.endsSession ?? false;
  }

  /** The same denial, attributed to an app: `details` fill in (or override) what this one knows. */
  withDetails(details: DenialDetails): AccessDeniedError {
    return new AccessDeniedError(
      this.reason,
      this.message,
      {
        appId: details.appId ?? this.appId,
        groups: details.groups ?? this.groups,
        uid: details.uid ?? this.uid,
        endsSession: details.endsSession ?? this.endsSession,
      },
      { cause: this },
    );
  }
}

/** The sealed envelope would not fit in a cookie (the app's own cookie is too large to carry). */
export class SessionTooLargeError extends GatewayError {
  readonly appId: string;
  /** Length of the sealed value that was refused. */
  readonly length: number;

  constructor(appId: string, length: number, limit: number) {
    super("session_too_large", `sealed session for "${appId}" is ${length} bytes, over the ${limit}-byte limit`);
    this.appId = appId;
    this.length = length;
  }
}
