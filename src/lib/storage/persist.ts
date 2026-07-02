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
    const m = /^data:([^,]*?);base64,([\s\S]*)$/.exec(args.url);
    if (!m) return null;
    const mediaType = m[1].split(";")[0].trim() || "application/octet-stream";
    const payload = m[2];
    if (!payload) return null; // reject empty-payload data URLs
    return persistBytesToStorage(store, { kind: args.kind, id: args.id, data: Buffer.from(payload, "base64"), contentType: mediaType });
  }
  try {
    const resp = await fetch(args.url);
    if (!resp.ok) {
      console.warn("[persist] failed for", args.url, "status", resp.status);
      return null;
    }
    const contentType = resp.headers.get("content-type") ?? "application/octet-stream";
    const data = Buffer.from(await resp.arrayBuffer());
    return persistBytesToStorage(store, { kind: args.kind, id: args.id, data, contentType });
  } catch (err) {
    console.warn("[persist] failed for", args.url, err);
    return null;
  }
}
