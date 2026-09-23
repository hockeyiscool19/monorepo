import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SettingsError, settingsFromEnv } from "../../../src/adapters/inbound/settings.js";

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
    });
  });

  it("reads every variable", () => {
    expect(
      settingsFromEnv({
        PORT: "8787",
        REGISTRY_URL: "https://portal.test/registry.json",
        REGISTRY_FILE: "../../registry/registry.json",
        REGISTRY_TTL_SECONDS: "30",
        PORTAL_ORIGIN: "https://a.test, https://b.test,,",
        GATEWAY_VERSION: "1.2.3",
        LOG_LEVEL: "DEBUG",
        GATEWAY_PATH: "/gw",
        UPSTREAM_TIMEOUT_MS: "5000",
      }),
    ).toEqual({
      port: 8787,
      registryUrl: "https://portal.test/registry.json",
      registryFile: "../../registry/registry.json",
      registryTtlSeconds: 30,
      portalOrigins: ["https://a.test", "https://b.test"],
      gatewayVersion: "1.2.3",
      logLevel: "debug",
      apiPrefix: "/gw",
      upstreamTimeoutMs: 5000,
    });
  });

  it("treats blank values as unset", () => {
    const settings = settingsFromEnv({ PORT: " ", REGISTRY_FILE: "", LOG_LEVEL: "", PORTAL_ORIGIN: " , " });
    expect(settings.port).toBe(8080);
    expect(settings.registryFile).toBeUndefined();
    expect(settings.logLevel).toBe("info");
    expect(settings.portalOrigins).toEqual([]);
  });

  it("rejects unparsable values and names the variable", () => {
    expect(() => settingsFromEnv({ PORT: "eighty" })).toThrow(SettingsError);
    expect(() => settingsFromEnv({ PORT: "0" })).toThrow(/^PORT:/);
    expect(() => settingsFromEnv({ REGISTRY_TTL_SECONDS: "1.5" })).toThrow(/^REGISTRY_TTL_SECONDS:/);
    expect(() => settingsFromEnv({ LOG_LEVEL: "loud" })).toThrow(/^LOG_LEVEL:/);
    expect(() => settingsFromEnv({ GATEWAY_PATH: "api" })).toThrow(/^GATEWAY_PATH:/);
    expect(() => settingsFromEnv({ GATEWAY_PATH: "/api/" })).toThrow(/^GATEWAY_PATH:/);
    expect(() => settingsFromEnv({ UPSTREAM_TIMEOUT_MS: "-1" })).toThrow(/^UPSTREAM_TIMEOUT_MS:/);
  });
});
