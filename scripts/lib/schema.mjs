// The registry contract, loaded once for the zero-dependency scripts: registry/schema/registry.schema.json.
// Validation code reads its patterns, enums and limits from here, so the schema stays the one description of the rules.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "registry", "schema", "registry.schema.json");
export const SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
