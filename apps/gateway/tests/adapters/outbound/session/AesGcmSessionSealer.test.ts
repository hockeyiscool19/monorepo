import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AesGcmSessionSealer, deriveDoorKey } from "../../../../src/adapters/outbound/session/AesGcmSessionSealer.js";
import type { Envelope } from "../../../../src/domain/session.js";
import { envelopeFor, NOW, OLD_SECRET, OWNER, SECRET, tamper } from "../../../fixtures/access.js";

const ENVELOPE: Envelope = envelopeFor(OWNER, NOW - 60, "app-state", NOW + 3600);
const sealer = new AesGcmSessionSealer({ current: SECRET });

/** Seal arbitrary plaintext with SECRET's key and `door:<appId>`, the way the adapter does. */
function sealRaw(plaintext: string, appId = "vale"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveDoorKey(SECRET), iv);
  cipher.setAAD(Buffer.from(`door:${appId}`));
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `d1.${iv.toString("base64url")}.${data.toString("base64url")}`;
}

describe("AesGcmSessionSealer", () => {
  it("round-trips an envelope in the d1 format with a fresh IV every time", () => {
    const first = sealer.seal({ appId: "vale", envelope: ENVELOPE });
    const second = sealer.seal({ appId: "vale", envelope: ENVELOPE });
    expect(first).toMatch(/^d1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    expect(first).not.toBe(second);
    expect(sealer.open({ appId: "vale", value: first })).toEqual(ENVELOPE);
    expect(new AesGcmSessionSealer({ current: SECRET }).open({ appId: "vale", value: second })).toEqual(ENVELOPE);
    expect(first).not.toContain("app-state");
  });

  it("derives its key with HKDF-SHA256(secret, salt eisensoftware/door, info session v1)", () => {
    const expected = Buffer.from(hkdfSync("sha256", SECRET, "eisensoftware/door", "session v1", 32));
    expect(deriveDoorKey(SECRET).equals(expected)).toBe(true);
    expect(sealer.open({ appId: "vale", value: sealRaw(JSON.stringify(ENVELOPE)) })).toEqual(ENVELOPE);
  });

  it("opens an envelope only for the app it was sealed for (AAD door:<appId>)", () => {
    const value = sealer.seal({ appId: "vale", envelope: ENVELOPE });
    expect(sealer.open({ appId: "topology", value })).toBeUndefined();
    expect(sealer.open({ appId: "vale ", value })).toBeUndefined();
  });

  it("refuses any tampering: IV, ciphertext, tag, truncation, extra parts, other prefixes, padding", () => {
    const value = sealer.seal({ appId: "vale", envelope: ENVELOPE });
    const [prefix, iv, data] = value.split(".") as [string, string, string];
    const variants = [
      tamper(value, 2), // the last character may carry only padding bits; the one before never does
      tamper(value, 10),
      tamper(value, value.length - 4),
      `${prefix}.${tamper(iv, 3)}.${data}`,
      value.slice(0, -1),
      `${value}.extra`,
      `d2.${iv}.${data}`,
      `${prefix}.${iv}`,
      `${prefix}.${iv}.${data}==`,
      `${prefix}.${iv.slice(0, 8)}.${data}`,
      `${prefix}.${iv}.${data.slice(0, 20)}`,
      `${prefix}.${iv}.`,
      "d1..",
      "plain-cookie",
      "",
    ];
    for (const variant of variants) expect(sealer.open({ appId: "vale", value: variant })).toBeUndefined();
  });

  it("seals with the current key and opens with the current or the previous one during a rotation", () => {
    const old = new AesGcmSessionSealer({ current: OLD_SECRET });
    const rotating = new AesGcmSessionSealer({ current: SECRET, previous: OLD_SECRET });
    const fromOld = old.seal({ appId: "vale", envelope: ENVELOPE });
    expect(rotating.open({ appId: "vale", value: fromOld })).toEqual(ENVELOPE);
    const resealed = rotating.seal({ appId: "vale", envelope: ENVELOPE });
    expect(sealer.open({ appId: "vale", value: resealed })).toEqual(ENVELOPE);
    expect(old.open({ appId: "vale", value: resealed })).toBeUndefined();
    expect(sealer.open({ appId: "vale", value: fromOld })).toBeUndefined();
  });

  it("returns undefined for authentic plaintext that is not an envelope", () => {
    for (const plaintext of ["not json", "[]", "{}", '{"p":null,"a":1,"ax":null}', '{"p":{"uid":""},"a":null,"ax":null}']) {
      expect(sealer.open({ appId: "vale", value: sealRaw(plaintext) })).toBeUndefined();
    }
    expect(sealer.open({ appId: "vale", value: sealRaw('{"p":null,"a":"x","ax":null}') })).toEqual({ p: null, a: "x", ax: null });
  });

  it("refuses a secret shorter than 32 bytes without echoing it", () => {
    const short = new Uint8Array(31).fill(65);
    expect(() => new AesGcmSessionSealer({ current: short })).toThrow(RangeError);
    expect(() => new AesGcmSessionSealer({ current: SECRET, previous: short })).toThrow(/at least 32 bytes/);
    expect(() => new AesGcmSessionSealer({ current: short })).not.toThrow(/AAAA/);
  });
});
