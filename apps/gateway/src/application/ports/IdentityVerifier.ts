import type { VerifiedIdentity } from "../../domain/session.js";

/** One token to check: a Firebase ID token and the project that must have issued it. */
export interface VerifyTokenRequest {
  readonly token: string;
  /** The token's `aud`; its `iss` must be https://securetoken.google.com/<projectId>. */
  readonly projectId: string;
}

/**
 * Outbound port: who a Firebase ID token says the caller is.
 *
 * `verify()` resolves with the identity only for a token that is well formed, signed for `projectId`, unexpired,
 * and issued to a real (not anonymous) sign-in. It rejects with AccessDeniedError (`sign_in_required`, no app
 * attached) for every token it will not accept, and with UpstreamError when the keys needed to check the token
 * cannot be obtained. It never resolves undefined and never lets a library error escape. The token is never
 * logged or placed in an error message.
 */
export interface IdentityVerifier {
  verify(request: VerifyTokenRequest): Promise<VerifiedIdentity>;
}
