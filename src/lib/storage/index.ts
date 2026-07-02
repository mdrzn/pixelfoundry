import { LocalDiskDriver } from "./local-driver";
import type { StorageDriver } from "./types";

export * from "./types";

const MEDIA_ROOT = process.env.MEDIA_ROOT ?? "/home/tools/pixelfoundry-media";
const MEDIA_URL_PREFIX = process.env.MEDIA_URL_PREFIX ?? "/media";

export const storage: StorageDriver = new LocalDiskDriver(MEDIA_ROOT, MEDIA_URL_PREFIX);
export function storageKeyFor(kind: string, id: string, ext: string) {
  const shard = id.slice(0, 2);
  return `${kind}/${shard}/${id}.${ext.replace(/^\./, "")}`;
}
