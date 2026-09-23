import type { Registry } from "../../domain/registry.js";

/**
 * Outbound port: where the registry comes from.
 *
 * `load()` resolves the current contract-1 registry. Adapters may cache and may serve a stale
 * or bundled copy, but they never resolve with an invalid document. It rejects with
 * RegistryUnavailableError when no registry (live, cached or bundled) can be produced, or with
 * InvalidRegistryError when the only copy available fails validation.
 */
export interface RegistrySource {
  load(): Promise<Registry>;
}
