import type { IdentityVerifier, VerifyTokenRequest } from "../../../application/ports/IdentityVerifier.js";
import { AccessDeniedError } from "../../../domain/errors.js";
import type { VerifiedIdentity } from "../../../domain/session.js";

/**
 * An IdentityVerifier for tests and demos: accepts exactly the tokens it was given (for any project), refuses
 * every other token with sign_in_required as the real adapters do, records every request, and can be told to
 * fail with any error (UpstreamError to play an unreachable key set).
 */
export class FakeIdentityVerifier implements IdentityVerifier {
  /** Every request, in order. */
  readonly calls: VerifyTokenRequest[] = [];
  private readonly identities = new Map<string, VerifiedIdentity>();
  private failure: Error | undefined;

  constructor(identities: Readonly<Record<string, VerifiedIdentity>> = {}) {
    for (const [token, identity] of Object.entries(identities)) this.identities.set(token, identity);
  }

  /** Accept `token` as `identity` from now on. */
  accept(token: string, identity: VerifiedIdentity): this {
    this.identities.set(token, identity);
    return this;
  }

  /** Reject every request with `error` from now on. */
  fail(error: Error): this {
    this.failure = error;
    return this;
  }

  async verify(request: VerifyTokenRequest): Promise<VerifiedIdentity> {
    this.calls.push(request);
    if (this.failure !== undefined) throw this.failure;
    const identity = this.identities.get(request.token);
    if (identity === undefined) throw new AccessDeniedError("sign_in_required", "ID token refused: unknown to the fake verifier");
    return identity;
  }
}
