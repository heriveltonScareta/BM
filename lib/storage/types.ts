export interface StoredFile {
  key: string;
  sizeBytes: number;
  checksum: string;
}

/**
 * Abstracao de armazenamento (Secao 13). A chave e sempre um UUID gerado aqui,
 * nunca o nome original do arquivo. Nenhum arquivo fica em diretorio publico.
 */
export interface StorageProvider {
  readonly name: string;
  put(data: Buffer, options?: { extension?: string }): Promise<StoredFile>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}
