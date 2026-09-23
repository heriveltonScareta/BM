import { config } from "@/lib/config";
import { createLocalStorageProvider } from "./local";
import { createS3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

export type { StorageProvider, StoredFile } from "./types";
export { sha256 } from "./local";

const globalRef = globalThis as unknown as { __bmStorage?: StorageProvider };

export function getStorage(): StorageProvider {
  if (globalRef.__bmStorage) return globalRef.__bmStorage;
  const provider =
    config.storage.provider === "s3"
      ? createS3StorageProvider()
      : createLocalStorageProvider(config.storage.localDir);
  globalRef.__bmStorage = provider;
  return provider;
}

export function setStorageForTests(provider: StorageProvider | undefined): void {
  globalRef.__bmStorage = provider;
}
