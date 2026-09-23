import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../../src/adapters/inbound/bootstrap.js";
import { DEFAULT_SETTINGS, SecretBytes } from "../../../src/adapters/inbound/settings.js";
import { FakeClock } from "../../../src/adapters/outbound/clock/FakeClock.js";
import { SystemClock } from "../../../src/adapters/outbound/clock/SystemClock.js";
import { MetadataServerCredentials } from "../../../src/adapters/outbound/credentials/MetadataServerCredentials.js";
import { NoUpstreamCredentials } from "../../../src/adapters/outbound/credentials/NoUpstreamCredentials.js";
import { EmulatorIdTokenVerifier } from "../../../src/adapters/outbound/identity/EmulatorIdTokenVerifier.js";
import { FirebaseIdTokenVerifier } from "../../../src/adapters/outbound/identity/FirebaseIdTokenVerifier.js";
import { JsonLogger } from "../../../src/adapters/outbound/log/JsonLogger.js";
import { silentLogger, type LogFields } from "../../../src/adapters/outbound/log/Logger.js";
import { FakeRegistrySource } from "../../../src/adapters/outbound/registry/FakeRegistrySource.js";
import { FileRegistrySource } from "../../../src/adapters/outbound/registry/FileRegistrySource.js";
import { HttpRegistrySource } from "../../../src/adapters/outbound/registry/HttpRegistrySource.js";
import { AesGcmSessionSealer } from "../../../src/adapters/outbound/session/AesGcmSessionSealer.js";
import { FakeUpstream } from "../../../src/adapters/outbound/upstream/FakeUpstream.js";
import { FetchUpstream } from "../../../src/adapters/outbound/upstream/FetchUpstream.js";
import { cookieValue, envelopeFor, fakeAccess, OLD_SECRET, OWNER, SECRET, TOKENS } from "../../fixtures/access.js";
import { makeGuardedRegistry, makeRegistry } from "../../fixtures/registry.js";

const ENV_KEYS = ["GATEWAY_VERSION", "REGISTRY_FILE", "PORT", "K_SERVICE", "ACCESS_MODE"] as const;
const saved = new Map<string, string | undefined>(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("buildApp", () => {
  it("uses the injected fakes and merges partial settings over the defaults", async () => {
    const registrySource = new FakeRegistrySource(makeRegistry());
    const upstream = new FakeUpstream().reply("https://vale.example.test/api/ping", 200, "pong");
    const clock = new FakeClock();
    const access = fakeAccess();
    const built = buildApp({
      settings: { gatewayVersion: "9.9.9" },
      registrySource,
      upstream,
      clock,
      log: silentLogger,
      identityVerifier: access.verifier,
      sessionSealer: access.sealer,
      upstreamCredentials: access.credentials,
    });

    expect(built.registrySource).toBe(registrySource);
    expect(built.upstream).toBe(upstream);
    expect(built.clock).toBe(clock);
    expect(built.log).toBe(silentLogger);
    expect(built.identityVerifier).toBe(access.verifier);
    expect(built.sessionSealer).toBe(access.sealer);
    expect(built.upstreamCredentials).toBe(access.credentials);
    expect(built.settings).toEqual({ ...DEFAULT_SETTINGS, gatewayVersion: "9.9.9" });

    const response = await built.app.request("http://gw.test/api/vale/ping");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-upstream-app")).toBe("vale");
    expect(response.headers.get("x-gateway-version")).toBe("9.9.9");
    expect(await response.text()).toBe("pong");
    expect(registrySource.loads).toBeGreaterThan(0);
  });

  it("does not read the environment when settings are given", () => {
    process.env["GATEWAY_VERSION"] = "from-env";
    process.env["K_SERVICE"] = "gateway";
    process.env["ACCESS_MODE"] = "open";
    const built = buildApp({ settings: {}, registrySource: new FakeRegistrySource(), upstream: new FakeUpstream(), log: silentLogger });
    expect(built.settings.gatewayVersion).toBe("dev");
    expect(built.settings.accessMode).toBe("enforce");
  });

  it("reads the environment when settings are not given, and refuses what Cloud Run must not run", () => {
    process.env["GATEWAY_VERSION"] = "from-env";
    process.env["PORT"] = "9090";
    delete process.env["REGISTRY_FILE"];
    const built = buildApp({ registrySource: new FakeRegistrySource(), upstream: new FakeUpstream(), log: silentLogger });
    expect(built.settings.gatewayVersion).toBe("from-env");
    expect(built.settings.port).toBe(9090);
    process.env["K_SERVICE"] = "gateway";
    process.env["ACCESS_MODE"] = "open";
    expect(() => buildApp({ registrySource: new FakeRegistrySource(), log: silentLogger })).toThrow(/^ACCESS_MODE:/);
  });

  it("wires the real adapters by default: http registry, fetch upstream, system clock, Firebase tokens, no door, no credentials", () => {
    const built = buildApp({ settings: {}, log: silentLogger });
    expect(built.registrySource).toBeInstanceOf(HttpRegistrySource);
    expect(built.upstream).toBeInstanceOf(FetchUpstream);
    expect(built.clock).toBeInstanceOf(SystemClock);
    expect(built.identityVerifier).toBeInstanceOf(FirebaseIdTokenVerifier);
    expect(built.sessionSealer).toBeUndefined();
    expect(built.upstreamCredentials).toBeInstanceOf(NoUpstreamCredentials);
  });

  it("switches to the file registry source when REGISTRY_FILE is set, and to a JSON logger by default", () => {
    const built = buildApp({ settings: { registryFile: "../../registry/registry.json", logLevel: "error" } });
    expect(built.registrySource).toBeInstanceOf(FileRegistrySource);
    expect(built.log).toBeInstanceOf(JsonLogger);
  });

  it("chooses the emulator verifier, the sealer (with rotation) and metadata credentials from settings", () => {
    const built = buildApp({
      settings: {
        authEmulatorHost: "127.0.0.1:9099",
        sessionSecret: new SecretBytes(SECRET),
        sessionSecretPrevious: new SecretBytes(OLD_SECRET),
        upstreamAuth: "metadata",
      },
      log: silentLogger,
    });
    expect(built.identityVerifier).toBeInstanceOf(EmulatorIdTokenVerifier);
    expect(built.sessionSealer).toBeInstanceOf(AesGcmSessionSealer);
    expect(built.upstreamCredentials).toBeInstanceOf(MetadataServerCredentials);
    const old = new AesGcmSessionSealer({ current: OLD_SECRET }).seal({ appId: "vale", envelope: envelopeFor(OWNER) });
    expect(built.sessionSealer?.open({ appId: "vale", value: old })?.p?.uid).toBe("uid-owner");
    expect(buildApp({ settings: { sessionSecret: new SecretBytes(SECRET) }, sessionSealer: null, log: silentLogger }).sessionSealer).toBeUndefined();
  });

  it("logs the access configuration without the secret", () => {
    const lines: string[] = [];
    const record = (message: string, fields?: LogFields) => lines.push(JSON.stringify({ message, ...fields }));
    buildApp({
      settings: { sessionSecret: new SecretBytes(SECRET) },
      registrySource: new FakeRegistrySource(),
      log: { debug: record, info: record, warn: record, error: record },
    });
    const access = lines.find((line) => line.includes('"message":"access"'));
    expect(access).toContain('"door":"configured"');
    expect(access).toContain('"mode":"enforce"');
    expect(lines.join("\n")).not.toContain(Buffer.from(SECRET).toString("base64"));
  });

  it("serves the door end to end from the composition root", async () => {
    const access = fakeAccess();
    const upstream = new FakeUpstream().reply("https://vale.example.test/vale/", 200, "inside");
    const built = buildApp({
      settings: { sessionSecret: new SecretBytes(SECRET) },
      registrySource: new FakeRegistrySource(makeGuardedRegistry()),
      upstream,
      clock: new FakeClock(),
      log: silentLogger,
      identityVerifier: access.verifier,
      upstreamCredentials: access.credentials,
    });
    const signIn = await built.app.request("https://eisensoftware.test/vale/__door/session", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKENS.owner}` },
    });
    const cookie = `__session=${cookieValue(signIn.headers.get("set-cookie") ?? undefined)}`;
    const page = await built.app.request("https://eisensoftware.test/vale/", { headers: { cookie } });
    expect([page.status, await page.text()]).toEqual([200, "inside"]);
  });
});
