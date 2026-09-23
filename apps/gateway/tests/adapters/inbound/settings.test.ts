import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SecretBytes, SettingsError, settingsFromEnv } from "../../../src/adapters/inbound/settings.js";

const SECRET_B64URL = Buffer.alloc(32, 0xfb).toString("base64url");
const SECRET_B64 = Buffer.alloc(48, 0xfb).toString("base64");

/** The message of the SettingsError `fn` throws. */
function settingsErrorOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof SettingsError) return error.message;
    throw error;
  }
  throw new Error("expected SettingsError");
}

describe("settingsFromEnv", () => {
  it("uses the documented defaults when the environment says nothing", () => {
    expect(settingsFromEnv({})).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      port: 8080,
      registryUrl: "https://eisensoftware.com/registry.json",
      registryFile: undefined,
      registryTtlSeconds: 300,
      portalOrigins: [],
      gatewayVersion: "dev",
      logLevel: "info",
      apiPrefix: "/api",
      upstreamTimeoutMs: 60_000,
      sessionSecret: undefined,
      sessionSecretPrevious: undefined,
      accessMode: "enforce",
      authEmulatorHost: undefined,
      upstreamAuth: "none",
    });
  });

  it("reads every variable", () => {
    const settings = settingsFromEnv({
      PORT: "8787",
      REGISTRY_URL: "https://portal.test/registry.json",
      REGISTRY_FILE: "../../registry/registry.json",
      REGISTRY_TTL_SECONDS: "30",
      PORTAL_ORIGIN: "https://a.test, https://b.test,,",
      GATEWAY_VERSION: "1.2.3",
      LOG_LEVEL: "DEBUG",
      GATEWAY_PATH: "/gw",
      UPSTREAM_TIMEOUT_MS: "5000",
      SESSION_SECRET: SECRET_B64URL,
      SESSION_SECRET_PREVIOUS: SECRET_B64,
      ACCESS_MODE: "Open",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      UPSTREAM_AUTH: "metadata",
    });
    const { sessionSecret, sessionSecretPrevious, ...rest } = settings;
    expect(rest).toEqual({
      port: 8787,
      registryUrl: "https://portal.test/registry.json",
      registryFile: "../../registry/registry.json",
      registryTtlSeconds: 30,
      portalOrigins: ["https://a.test", "https://b.test"],
      gatewayVersion: "1.2.3",
      logLevel: "debug",
      apiPrefix: "/gw",
      upstreamTimeoutMs: 5000,
      accessMode: "open",
      authEmulatorHost: "127.0.0.1:9099",
      upstreamAuth: "metadata",
    });
    expect(Buffer.from(sessionSecret?.reveal() ?? []).equals(Buffer.alloc(32, 0xfb))).toBe(true);
    expect(Buffer.from(sessionSecretPrevious?.reveal() ?? []).equals(Buffer.alloc(48, 0xfb))).toBe(true);
  });

  it("treats blank values as unset", () => {
    const settings = settingsFromEnv({ PORT: " ", REGISTRY_FILE: "", LOG_LEVEL: "", PORTAL_ORIGIN: " , ", SESSION_SECRET: " ", ACCESS_MODE: "" });
    expect(settings.port).toBe(8080);
    expect(settings.registryFile).toBeUndefined();
    expect(settings.logLevel).toBe("info");
    expect(settings.portalOrigins).toEqual([]);
    expect(settings.sessionSecret).toBeUndefined();
    expect(settings.accessMode).toBe("enforce");
  });

  it("rejects unparsable values and names the variable", () => {
    expect(() => settingsFromEnv({ PORT: "eighty" })).toThrow(SettingsError);
    expect(() => settingsFromEnv({ PORT: "0" })).toThrow(/^PORT:/);
    expect(() => settingsFromEnv({ REGISTRY_TTL_SECONDS: "1.5" })).toThrow(/^REGISTRY_TTL_SECONDS:/);
    expect(() => settingsFromEnv({ LOG_LEVEL: "loud" })).toThrow(/^LOG_LEVEL:/);
    expect(() => settingsFromEnv({ GATEWAY_PATH: "api" })).toThrow(/^GATEWAY_PATH:/);
    expect(() => settingsFromEnv({ GATEWAY_PATH: "/api/" })).toThrow(/^GATEWAY_PATH:/);
    expect(() => settingsFromEnv({ UPSTREAM_TIMEOUT_MS: "-1" })).toThrow(/^UPSTREAM_TIMEOUT_MS:/);
    expect(() => settingsFromEnv({ ACCESS_MODE: "permissive" })).toThrow(/^ACCESS_MODE:/);
    expect(() => settingsFromEnv({ UPSTREAM_AUTH: "iam" })).toThrow(/^UPSTREAM_AUTH:/);
    expect(() => settingsFromEnv({ FIREBASE_AUTH_EMULATOR_HOST: "http://localhost:9099" })).toThrow(/^FIREBASE_AUTH_EMULATOR_HOST:/);
    expect(settingsFromEnv({ FIREBASE_AUTH_EMULATOR_HOST: "[::1]:9099" }).authEmulatorHost).toBe("[::1]:9099");
  });
});

describe("session secrets", () => {
  it("need at least 32 bytes of base64 or base64url, and never appear in an error", () => {
    const short = Buffer.alloc(31, 0xfb).toString("base64url");
    for (const [name, value] of [
      ["SESSION_SECRET", short],
      ["SESSION_SECRET", "not base64!"],
      ["SESSION_SECRET", `${SECRET_B64URL}===`],
      ["SESSION_SECRET_PREVIOUS", short],
    ] as const) {
      const env = name === "SESSION_SECRET" ? { SESSION_SECRET: value } : { SESSION_SECRET: SECRET_B64URL, SESSION_SECRET_PREVIOUS: value };
      const message = settingsErrorOf(() => settingsFromEnv(env));
      expect(message.startsWith(`${name}:`)).toBe(true);
      expect(message).not.toContain(value);
      expect(message).toContain("value not shown");
    }
    expect(settingsErrorOf(() => settingsFromEnv({ SESSION_SECRET: short }))).toContain("got 31");
  });

  it("refuse SESSION_SECRET_PREVIOUS without SESSION_SECRET", () => {
    expect(settingsErrorOf(() => settingsFromEnv({ SESSION_SECRET_PREVIOUS: SECRET_B64URL }))).toBe(
      "SESSION_SECRET_PREVIOUS: is set but SESSION_SECRET is not",
    );
  });

  it("never print: String, JSON, util.inspect and settings logged whole all show [redacted]", () => {
    const settings = settingsFromEnv({ SESSION_SECRET: SECRET_B64URL });
    const secret = settings.sessionSecret;
    expect(secret).toBeInstanceOf(SecretBytes);
    expect(secret?.length).toBe(32);
    expect(String(secret)).toBe("[redacted]");
    expect(`${secret}`).toBe("[redacted]");
    expect(JSON.stringify(settings)).toContain('"sessionSecret":"[redacted]"');
    expect(JSON.stringify(settings)).not.toContain(SECRET_B64URL);
    expect(inspect(settings)).not.toContain(SECRET_B64URL);
    expect(inspect(secret)).toBe("SecretBytes([redacted])");
    const copy = secret?.reveal();
    copy?.fill(0);
    expect(secret?.reveal()[0]).toBe(0xfb);
  });
});

describe("Cloud Run guards (K_SERVICE set)", () => {
  it("refuse ACCESS_MODE=open and the Auth emulator, and default UPSTREAM_AUTH to metadata", () => {
    expect(settingsErrorOf(() => settingsFromEnv({ K_SERVICE: "gateway", ACCESS_MODE: "open" }))).toBe(
      "ACCESS_MODE: open is refused on Cloud Run (K_SERVICE is set)",
    );
    expect(settingsErrorOf(() => settingsFromEnv({ K_SERVICE: "gateway", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" }))).toBe(
      "FIREBASE_AUTH_EMULATOR_HOST: the Auth emulator is refused on Cloud Run (K_SERVICE is set)",
    );
    expect(settingsFromEnv({ K_SERVICE: "gateway" }).upstreamAuth).toBe("metadata");
    expect(settingsFromEnv({ K_SERVICE: "gateway", UPSTREAM_AUTH: "none" }).upstreamAuth).toBe("none");
    expect(settingsFromEnv({ K_SERVICE: "gateway", ACCESS_MODE: "enforce" }).accessMode).toBe("enforce");
    expect(settingsFromEnv({ K_SERVICE: " " }).upstreamAuth).toBe("none");
  });
});
