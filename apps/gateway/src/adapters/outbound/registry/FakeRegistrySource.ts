import type { RegistrySource } from "../../../application/ports/RegistrySource.js";
import { RegistryUnavailableError } from "../../../domain/errors.js";
import type { Registry } from "../../../domain/registry.js";

/** An in-memory RegistrySource for tests: serves a fixed registry or a scripted failure. */
export class FakeRegistrySource implements RegistrySource {
  /** How many times `load()` was called. */
  loads = 0;
  private registry: Registry | undefined;
  private failure: Error | undefined;

  constructor(registry?: Registry) {
    this.registry = registry;
  }

  /** A source whose every `load()` rejects with `error` (RegistryUnavailableError by default). */
  static failing(error?: Error): FakeRegistrySource {
    const source = new FakeRegistrySource();
    source.fail(error);
    return source;
  }

  /** Serve `registry` from now on. */
  set(registry: Registry): void {
    this.registry = registry;
    this.failure = undefined;
  }

  /** Reject every `load()` from now on. */
  fail(error?: Error): void {
    this.failure = error ?? new RegistryUnavailableError("fake registry source is failing");
  }

  async load(): Promise<Registry> {
    this.loads += 1;
    if (this.failure !== undefined) throw this.failure;
    if (this.registry === undefined) throw new RegistryUnavailableError("fake registry source has no registry");
    return this.registry;
  }
}
