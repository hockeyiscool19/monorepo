import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { RegistrySource } from "../../../application/ports/RegistrySource.js";
import { InvalidRegistryError, RegistryUnavailableError } from "../../../domain/errors.js";
import { parseRegistry } from "../../../domain/parseRegistry.js";
import type { Registry } from "../../../domain/registry.js";

/** File name looked up when REGISTRY_FILE points at a directory (e.g. `../../registry`). */
export const REGISTRY_FILE_NAME = "registry.json";

/**
 * Reads the registry from a local JSON file on every `load()`, so edits show up immediately.
 * Accepts the file itself or a directory containing `registry.json`. A document without
 * `generatedAt` (the source file in this repo) gets the file's modification time.
 */
export class FileRegistrySource implements RegistrySource {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  async load(): Promise<Registry> {
    const file = await this.resolveFile();
    let document: unknown;
    let modifiedAt: Date;
    try {
      const [text, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
      document = JSON.parse(text);
      modifiedAt = info.mtime;
    } catch (error) {
      throw new RegistryUnavailableError(`cannot read registry file ${file}`, { cause: error });
    }
    try {
      return parseRegistry(document, { generatedAt: modifiedAt.toISOString() });
    } catch (error) {
      if (error instanceof InvalidRegistryError) throw error;
      throw new RegistryUnavailableError(`cannot parse registry file ${file}`, { cause: error });
    }
  }

  private async resolveFile(): Promise<string> {
    try {
      const info = await stat(this.path);
      return info.isDirectory() ? join(this.path, REGISTRY_FILE_NAME) : this.path;
    } catch (error) {
      throw new RegistryUnavailableError(`registry path ${this.path} does not exist`, { cause: error });
    }
  }
}
