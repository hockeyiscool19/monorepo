import { readFileSync } from "node:fs";
import { RegistryUnavailableError } from "../../../domain/errors.js";
import { parseRegistry } from "../../../domain/parseRegistry.js";
import type { Registry } from "../../../domain/registry.js";

/**
 * Where `npm run build:snapshot` writes the copy of `registry/registry.json` bundled into the
 * image. Next to this module in `src/` during development and in `dist/` after `npm run build`.
 */
export const BUNDLED_SNAPSHOT_URL: URL = new URL("./snapshot.json", import.meta.url);

/**
 * Read and validate the bundled registry snapshot. Throws RegistryUnavailableError when the
 * file is missing or not JSON (run `npm run build:snapshot`), InvalidRegistryError when its
 * content fails validation.
 */
export function readBundledSnapshot(location: URL | string = BUNDLED_SNAPSHOT_URL): Registry {
  let document: unknown;
  try {
    document = JSON.parse(readFileSync(location, "utf8"));
  } catch (error) {
    throw new RegistryUnavailableError(
      `bundled registry snapshot missing or unreadable at ${String(location)} (run npm run build:snapshot)`,
      { cause: error },
    );
  }
  return parseRegistry(document);
}
