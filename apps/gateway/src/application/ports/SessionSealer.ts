import type { Envelope } from "../../domain/session.js";

/** Seal `envelope` for one app. */
export interface SealSessionRequest {
  readonly appId: string;
  readonly envelope: Envelope;
}

/** Open a cookie value that claims to be one app's envelope. */
export interface OpenSessionRequest {
  readonly appId: string;
  readonly value: string;
}

/**
 * Outbound port: authenticated encryption of the door's envelope, bound to one app.
 *
 * `seal()` returns `d1.<iv>.<ciphertext>` (base64url) sealed with the current key; it does not fail for a valid
 * envelope. `open()` returns the envelope only when `value` was sealed for this `appId` with the current or the
 * previous key and decrypts to the envelope's shape. Anything else — another app's cookie, a tampered, truncated
 * or foreign value, a retired key — is `undefined`, never an exception: an unreadable cookie is simply no session.
 * Both are synchronous (no I/O). Values and envelopes are never logged.
 */
export interface SessionSealer {
  seal(request: SealSessionRequest): string;
  open(request: OpenSessionRequest): Envelope | undefined;
}
