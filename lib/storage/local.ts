import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageProvider, StoredFile } from "./types";

const KEY_REGEX = /^[0-9a-f-]{36}(\.[a-z0-9]{1,8})?$/i;

export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Armazena arquivos em disco local, fora de /public. */
export function createLocalStorageProvider(rootDir: string): StorageProvider {
  const root = path.resolve(rootDir);

  function resolveKey(key: string): string {
    if (!KEY_REGEX.test(key)) throw new Error("Chave de storage inválida.");
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error("Chave de storage inválida.");
    return full;
  }

  return {
    name: "local",
    async put(data, options): Promise<StoredFile> {
      await mkdir(root, { recursive: true });
      const ext = options?.extension ? `.${options.extension.replace(/^\./, "").toLowerCase()}` : "";
      const key = `${randomUUID()}${ext}`;
      await writeFile(resolveKey(key), data);
      return { key, sizeBytes: data.byteLength, checksum: sha256(data) };
    },
    async get(key) {
      return readFile(resolveKey(key));
    },
    async exists(key) {
      try {
        await access(resolveKey(key));
        return true;
      } catch {
        return false;
      }
    },
    async delete(key) {
      await rm(resolveKey(key), { force: true });
    },
  };
}
