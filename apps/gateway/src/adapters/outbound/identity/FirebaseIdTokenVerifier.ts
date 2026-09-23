import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import type { Clock } from "../../../application/ports/Clock.js";
import type { IdentityVerifier, VerifyTokenRequest } from "../../../application/ports/IdentityVerifier.js";
import { UpstreamError } from "../../../domain/errors.js";
import type { VerifiedIdentity } from "../../../domain/session.js";
import { CLOCK_TOLERANCE_SECONDS, firebaseIssuer, identityFromClaims, refused, REQUIRED_CLAIMS } from "./firebaseClaims.js";

/** Google's public keys for Firebase ID tokens, as a JSON Web Key Set. */
export const SECURETOKEN_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

/** Construction options. */
export interface FirebaseIdTokenVerifierOptions {
  /** Token times are checked against this clock. */
  readonly clock: Clock;
  /** The signing keys: Google's key set by default (fetched and cached by jose); `createLocalJWKSet` in tests. */
  readonly keys?: JWTVerifyGetKey;
  readonly clockToleranceSeconds?: number;
}

/** jose failures that mean the key set could not be obtained, not that the token is bad. */
const KEY_SET_FAILURES: ReadonlySet<string> = new Set(["ERR_JOSE_GENERIC", "ERR_JWKS_INVALID", "ERR_JWKS_TIMEOUT"]);

/**
 * IdentityVerifier for Firebase ID tokens, on jose. Accepts only RS256 signatures by a key of Google's securetoken
 * key set, `iss` https://securetoken.google.com/<projectId>, `aud` <projectId>, and present `exp`, `iat`, `sub`,
 * `auth_time`, with times checked against the injected Clock and a small tolerance; then identityFromClaims.
 * A key set that cannot be fetched or read is UpstreamError; every other failure is sign_in_required.
 */
export class FirebaseIdTokenVerifier implements IdentityVerifier {
  private readonly clock: Clock;
  private readonly keys: JWTVerifyGetKey;
  private readonly tolerance: number;

  constructor(options: FirebaseIdTokenVerifierOptions) {
    this.clock = options.clock;
    this.keys = options.keys ?? createRemoteJWKSet(new URL(SECURETOKEN_JWKS_URL));
    this.tolerance = options.clockToleranceSeconds ?? CLOCK_TOLERANCE_SECONDS;
  }

  async verify(request: VerifyTokenRequest): Promise<VerifiedIdentity> {
    const nowMs = this.clock.now();
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(request.token, this.keys, {
        algorithms: ["RS256"],
        issuer: firebaseIssuer(request.projectId),
        audience: request.projectId,
        currentDate: new Date(nowMs),
        clockTolerance: this.tolerance,
        requiredClaims: [...REQUIRED_CLAIMS],
      }));
    } catch (error) {
      if (!(error instanceof errors.JOSEError) || KEY_SET_FAILURES.has(error.code)) {
        const reason = error instanceof errors.JWKSTimeout ? "timeout" : "network";
        throw new UpstreamError(SECURETOKEN_JWKS_URL, reason, { cause: error });
      }
      throw refused(error.code);
    }
    return identityFromClaims(payload, Math.floor(nowMs / 1000), this.tolerance);
  }
}
