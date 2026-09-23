import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK, type JWTPayload } from "jose";

/** An RS256 key pair for minting ID tokens in tests, with its public JWK. */
export interface SigningKey {
  readonly kid: string;
  readonly privateKey: CryptoKey;
  readonly jwk: JWK;
}

/** A fresh RS256 signing key whose public JWK carries `kid`. */
export async function signingKey(kid: string): Promise<SigningKey> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  return { kid, privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" } };
}

/** The claims of a Firebase ID token for `projectId` issued just before `now` (Unix seconds); override any. */
export function idTokenClaims(projectId: string, now: number, overrides: JWTPayload = {}): JWTPayload {
  return {
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    sub: "uid-1",
    user_id: "uid-1",
    iat: now - 10,
    exp: now + 3600,
    auth_time: now - 60,
    email: "person@example.test",
    email_verified: true,
    name: "Person",
    picture: "https://example.test/person.png",
    firebase: { sign_in_provider: "google.com", identities: {} },
    groups: ["owner"],
    ...overrides,
  };
}

/** `claims` signed with `key` (RS256 with its kid unless `header` says otherwise). */
export async function signIdToken(key: SigningKey, claims: JWTPayload, header: Record<string, string> = {}): Promise<string> {
  return new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: key.kid, typ: "JWT", ...header }).sign(key.privateKey);
}

/** An unsigned token the way the Firebase Auth emulator writes them: `alg: none`, empty signature. */
export function unsignedToken(claims: JWTPayload, header: Record<string, string> = { alg: "none", typ: "JWT" }): string {
  const part = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part(header)}.${part(claims)}.`;
}
