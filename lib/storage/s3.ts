import type { StorageProvider } from "./types";

/**
 * Esqueleto do provedor S3. A interface esta pronta; a implementacao fica fora do MVP
 * (exigiria @aws-sdk/client-s3 e credenciais). Falha explicitamente se selecionado.
 */
export function createS3StorageProvider(): StorageProvider {
  const notImplemented = () =>
    Promise.reject(new Error("STORAGE_PROVIDER=s3 ainda não implementado. Use 'local'."));
  return {
    name: "s3",
    put: notImplemented,
    get: notImplemented,
    exists: notImplemented,
    delete: notImplemented,
  };
}
