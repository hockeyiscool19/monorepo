/**
 * The gateway's error hierarchy. Domain and application code throw these; the inbound
 * adapter maps them to HTTP status codes and JSON bodies at the edge, and nowhere else.
 */

/** Stable, machine-readable failure kinds. They double as the `error` field of JSON error bodies. */
export type GatewayErrorKind =
  | "unknown_app"
  | "upstream_unavailable"
  | "registry_unavailable"
  | "invalid_registry";

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

/** The upstream produced no HTTP response: DNS/connect/TLS failure, reset, invalid URL or timeout. */
export class UpstreamError extends GatewayError {
  readonly url: string;
  readonly reason: UpstreamFailureReason;

  constructor(url: string, reason: UpstreamFailureReason, options?: ErrorOptions) {
    super("upstream_unavailable", `upstream ${reason} for ${url}`, options);
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
