// Shared by the zero-dependency scripts in scripts/: "is this module the program being run?"
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * True only when the module at `moduleUrl` (pass `import.meta.url`) is the entry point.
 * Compared by real path: run through a symlink, process.argv[1] keeps the link while import.meta.url is resolved,
 * so a plain string comparison would silently skip main() and exit 0 — which turns a `--check` gate into a no-op.
 */
export function invokedDirectly(moduleUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
