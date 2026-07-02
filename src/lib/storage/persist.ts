import type { StorageDriver } from "./types";
import { storageKeyFor } from "./index";
import { extFromContentType } from "./content-types";

export type PersistedAsset = { storageKey: string; url: string; mimeType: string; sizeBytes: number };

export async function persistBytesToStorage(
  store: StorageDriver,
  args: { kind: string; id: string; data: Buffer; contentType: string },
): Promise<PersistedAsset> {
  const ext = extFromContentType(args.contentType);
  const key = storageKeyFor(args.kind, args.id, ext);
  const res = await store.put(key, args.data, args.contentType);
  return { storageKey: res.key, url: res.url, mimeType: args.contentType, sizeBytes: res.sizeBytes };
}

/** Fetch a remote (provider CDN) or data: URL and persist it. Returns null on failure. */
export async function persistUrlToStorage(
  store: StorageDriver,
  args: { kind: string; id: string; url: string },
): Promise<PersistedAsset | null> {
  if (args.url.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(args.url);
    if (!m) return null;
    return persistBytesToStorage(store, { kind: args.kind, id: args.id, data: Buffer.from(m[2], "base64"), contentType: m[1] });
  }
  try {
    const resp = await fetch(args.url);
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") ?? "application/octet-stream";
    const data = Buffer.from(await resp.arrayBuffer());
    return persistBytesToStorage(store, { kind: args.kind, id: args.id, data, contentType });
  } catch {
    return null;
  }
}
