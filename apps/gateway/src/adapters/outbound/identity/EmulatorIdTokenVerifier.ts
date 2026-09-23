import { errors, UnsecuredJWT, type JWTPayload } from "jose";
import type { Clock } from "../../../application/ports/Clock.js";
import type { IdentityVerifier, VerifyTokenRequest } from "../../../application/ports/IdentityVerifier.js";
import type { VerifiedIdentity } from "../../../domain/session.js";
import { CLOCK_TOLERANCE_SECONDS, firebaseIssuer, identityFromClaims, refused, REQUIRED_CLAIMS } from "./firebaseClaims.js";

/** Construction options. */
export interface EmulatorIdTokenVerifierOptions {
  readonly clock: Clock;
  readonly clockToleranceSeconds?: number;
}

/**
 * IdentityVerifier for the Firebase Auth emulator, whose ID tokens are unsigned (`alg: "none"`, empty signature).
 * Same `iss`, `aud`, `exp` and claim checks as FirebaseIdTokenVerifier, but no signature: anyone can mint these
 * tokens, so this adapter is for local rehearsals only. Settings refuse FIREBASE_AUTH_EMULATOR_HOST on Cloud Run
 * and bootstrap selects this adapter only when that variable is set. Every failure is sign_in_required.
 */
export class EmulatorIdTokenVerifier implements IdentityVerifier {
  private readonly clock: Clock;
  private readonly tolerance: number;

  constructor(options: EmulatorIdTokenVerifierOptions) {
    this.clock = options.clock;
    this.tolerance = options.clockToleranceSeconds ?? CLOCK_TOLERANCE_SECONDS;
  }

  async verify(request: VerifyTokenRequest): Promise<VerifiedIdentity> {
    const nowMs = this.clock.now();
    let payload: JWTPayload;
    try {
      ({ payload } = UnsecuredJWT.decode(request.token, {
        issuer: firebaseIssuer(request.projectId),
        audience: request.projectId,
        currentDate: new Date(nowMs),
        clockTolerance: this.tolerance,
        requiredClaims: [...REQUIRED_CLAIMS],
      }));
    } catch (error) {
      throw refused(error instanceof errors.JOSEError ? error.code : "not an unsigned JWT");
    }
    return identityFromClaims(payload, Math.floor(nowMs / 1000), this.tolerance);
  }
}
