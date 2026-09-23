import { toPublicRegistry, type Registry } from "../domain/registry.js";
import type { RegistrySource } from "./ports/RegistrySource.js";

/** What `getRegistry` needs. */
export interface GetRegistryDeps {
  readonly registry: RegistrySource;
}

/**
 * Use case: the registry as the gateway publishes it — contract 1, every app regardless of
 * status, deployment values included, and no app's `repo` block (private repository names and
 * local paths never leave the platform). Rejects with RegistryUnavailableError or
 * InvalidRegistryError when the source cannot provide one.
 */
export async function getRegistry(deps: GetRegistryDeps): Promise<Registry> {
  return toPublicRegistry(await deps.registry.load());
}
