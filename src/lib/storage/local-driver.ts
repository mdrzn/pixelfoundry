import { promises as fs } from "node:fs";
import path from "node:path";
import type { StorageDriver, PutResult } from "./types";

const CT_SIDE = ".content-type";

function assertSafeKey(key: string) {
  if (key.includes("..") || key.startsWith("/") || path.isAbsolute(key)) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}

export class LocalDiskDriver implements StorageDriver {
  constructor(private root: string, private urlPrefix: string) {}

  private abs(key: string) {
    assertSafeKey(key);
    return path.join(this.root, key);
  }

  async put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<PutResult> {
    const abs = this.abs(key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const buf = Buffer.from(data);
    await fs.writeFile(abs, buf);
    await fs.writeFile(abs + CT_SIDE, contentType, "utf8");
    return { key, url: this.url(key), sizeBytes: buf.length };
  }

  url(key: string): string {
    assertSafeKey(key);
    return `${this.urlPrefix}/${key}`;
  }

  async read(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    const abs = this.abs(key);
    try {
      const data = await fs.readFile(abs);
      let contentType = "application/octet-stream";
      try { contentType = await fs.readFile(abs + CT_SIDE, "utf8"); } catch {}
      return { data, contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const abs = this.abs(key);
    await fs.rm(abs, { force: true });
    await fs.rm(abs + CT_SIDE, { force: true });
  }
}
