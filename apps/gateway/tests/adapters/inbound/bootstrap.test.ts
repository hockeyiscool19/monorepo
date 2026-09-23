import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../../src/adapters/inbound/bootstrap.js";
import { DEFAULT_SETTINGS } from "../../../src/adapters/inbound/settings.js";
import { FakeClock } from "../../../src/adapters/outbound/clock/FakeClock.js";
import { SystemClock } from "../../../src/adapters/outbound/clock/SystemClock.js";
import { JsonLogger } from "../../../src/adapters/outbound/log/JsonLogger.js";
import { silentLogger } from "../../../src/adapters/outbound/log/Logger.js";
import { FakeRegistrySource } from "../../../src/adapters/outbound/registry/FakeRegistrySource.js";
import { FileRegistrySource } from "../../../src/adapters/outbound/registry/FileRegistrySource.js";
import { HttpRegistrySource } from "../../../src/adapters/outbound/registry/HttpRegistrySource.js";
import { FakeUpstream } from "../../../src/adapters/outbound/upstream/FakeUpstream.js";
import { FetchUpstream } from "../../../src/adapters/outbound/upstream/FetchUpstream.js";
import { makeRegistry } from "../../fixtures/registry.js";

const ENV_KEYS = ["GATEWAY_VERSION", "REGISTRY_FILE", "PORT"] as const;
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
    const built = buildApp({ settings: { gatewayVersion: "9.9.9" }, registrySource, upstream, clock, log: silentLogger });

    expect(built.registrySource).toBe(registrySource);
    expect(built.upstream).toBe(upstream);
    expect(built.clock).toBe(clock);
    expect(built.log).toBe(silentLogger);
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
    const built = buildApp({ settings: {}, registrySource: new FakeRegistrySource(), upstream: new FakeUpstream(), log: silentLogger });
    expect(built.settings.gatewayVersion).toBe("dev");
  });

  it("reads the environment when settings are not given", () => {
    process.env["GATEWAY_VERSION"] = "from-env";
    process.env["PORT"] = "9090";
    delete process.env["REGISTRY_FILE"];
    const built = buildApp({ registrySource: new FakeRegistrySource(), upstream: new FakeUpstream(), log: silentLogger });
    expect(built.settings.gatewayVersion).toBe("from-env");
    expect(built.settings.port).toBe(9090);
  });

  it("wires the real adapters by default: http registry with the bundled fallback, fetch upstream, system clock", () => {
    const built = buildApp({ settings: {}, log: silentLogger });
    expect(built.registrySource).toBeInstanceOf(HttpRegistrySource);
    expect(built.upstream).toBeInstanceOf(FetchUpstream);
    expect(built.clock).toBeInstanceOf(SystemClock);
  });

  it("switches to the file registry source when REGISTRY_FILE is set, and to a JSON logger by default", () => {
    const built = buildApp({ settings: { registryFile: "../../registry/registry.json", logLevel: "error" } });
    expect(built.registrySource).toBeInstanceOf(FileRegistrySource);
    expect(built.log).toBeInstanceOf(JsonLogger);
  });
});
