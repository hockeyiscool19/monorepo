import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { OpenSessionRequest, SealSessionRequest, SessionSealer } from "../../../application/ports/SessionSealer.js";
import { parseEnvelope, SEALED_PREFIX, type Envelope } from "../../../domain/session.js";

/** HKDF parameters of the door key, format d1. Changing any of them invalidates every session. */
const HKDF_SALT = "eisensoftware/door";
const HKDF_INFO = "session v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** The shortest secret accepted, in bytes (SESSION_SECRET is checked against the same bound). */
export const MIN_SECRET_BYTES = 32;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Key material. `current` seals and opens; `previous` (during a rotation) only opens. */
export interface SessionSecrets {
  readonly current: Uint8Array;
  readonly previous?: Uint8Array | undefined;
}

/** The AES-256 key for a secret: HKDF-SHA256(secret, salt "eisensoftware/door", info "session v1", 32 bytes). */
export function deriveDoorKey(secret: Uint8Array): Buffer {
  if (secret.length < MIN_SECRET_BYTES) throw new RangeError(`a session secret needs at least ${MIN_SECRET_BYTES} bytes`);
  return Buffer.from(hkdfSync("sha256", secret, HKDF_SALT, HKDF_INFO, KEY_BYTES));
}

const aad = (appId: string): Buffer => Buffer.from(`door:${appId}`, "utf8");

function decrypt(key: Buffer, iv: Buffer, data: Buffer, appId: string): string | undefined {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aad(appId));
    decipher.setAuthTag(data.subarray(data.length - TAG_BYTES));
    return Buffer.concat([decipher.update(data.subarray(0, data.length - TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    return undefined;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * SessionSealer on node:crypto AES-256-GCM: `d1.<base64url 12-byte IV>.<base64url ciphertext and 16-byte tag>`,
 * a fresh random IV per seal, and `door:<appId>` as additional authenticated data, so an envelope opens only for
 * the app it was sealed for. Seals with the current key; opens with the current key, then the previous one.
 */
export class AesGcmSessionSealer implements SessionSealer {
  private readonly current: Buffer;
  private readonly keys: readonly Buffer[];

  constructor(secrets: SessionSecrets) {
    this.current = deriveDoorKey(secrets.current);
    this.keys = secrets.previous === undefined ? [this.current] : [this.current, deriveDoorKey(secrets.previous)];
  }

  seal(request: SealSessionRequest): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.current, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(aad(request.appId));
    const sealed = Buffer.concat([cipher.update(JSON.stringify(request.envelope), "utf8"), cipher.final(), cipher.getAuthTag()]);
    return `${SEALED_PREFIX}${iv.toString("base64url")}.${sealed.toString("base64url")}`;
  }

  open(request: OpenSessionRequest): Envelope | undefined {
    if (!request.value.startsWith(SEALED_PREFIX)) return undefined;
    const parts = request.value.slice(SEALED_PREFIX.length).split(".");
    const [ivText, dataText] = parts;
    if (parts.length !== 2 || ivText === undefined || dataText === undefined) return undefined;
    if (!BASE64URL.test(ivText) || !BASE64URL.test(dataText)) return undefined;
    const iv = Buffer.from(ivText, "base64url");
    const data = Buffer.from(dataText, "base64url");
    if (iv.length !== IV_BYTES || data.length <= TAG_BYTES) return undefined;
    for (const key of this.keys) {
      const plaintext = decrypt(key, iv, data, request.appId);
      if (plaintext !== undefined) return parseEnvelope(parseJson(plaintext));
    }
    return undefined;
  }
}
