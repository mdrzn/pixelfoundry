export type PutResult = { key: string; url: string; sizeBytes: number };

export interface StorageDriver {
  /** Store bytes under a namespaced key; returns the servable URL path. */
  put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<PutResult>;
  /** Public URL path for a stored key (served by our media route). */
  url(key: string): string;
  /** Remove an object. No-op if absent. */
  delete(key: string): Promise<void>;
  /** Read bytes back (used by the media route + migrations). */
  read(key: string): Promise<{ data: Buffer; contentType: string } | null>;
}
