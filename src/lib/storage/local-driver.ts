import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { StorageDriver, PutResult } from "./types";
import { contentTypeFromKey } from "./content-types";

/** Validate a storage key: non-empty, no empty/`.`/`..` segments, relative. */
function assertSafeKey(key: string) {
  if (key.length === 0 || key.startsWith("/") || path.isAbsolute(key)) {
    throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
  }
  const segments = key.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") {
      throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
    }
  }
}

export class LocalDiskDriver implements StorageDriver {
  private readonly urlPrefix: string;

  constructor(private root: string, urlPrefix: string) {
    // Normalize away a trailing slash so url() never yields "//key".
    this.urlPrefix = urlPrefix.replace(/\/+$/, "");
  }

  /** Lexical containment: resolve the key against root and require it stay inside. */
  private abs(key: string) {
    assertSafeKey(key);
    const abs = path.resolve(this.root, key);
    const rootResolved = path.resolve(this.root);
    if (abs !== rootResolved && !abs.startsWith(rootResolved + path.sep)) {
      throw new Error(`Storage key escapes root: ${JSON.stringify(key)}`);
    }
    return abs;
  }

  /**
   * Symlink-aware containment for the parent dir of a write target.
   * After the parent exists, realpath it (following symlinks) and assert it is
   * still within the realpath-resolved root; otherwise a symlink is redirecting
   * the write outside the root.
   */
  private async assertParentContained(abs: string) {
    const parent = path.dirname(abs);
    const realRoot = await fs.realpath(this.root);
    const realParent = await fs.realpath(parent);
    if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) {
      throw new Error(`Storage write escapes root via symlink: ${JSON.stringify(abs)}`);
    }
  }

  async put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<PutResult> {
    void contentType; // signature kept for other drivers; content-type derived from key on read.
    const abs = this.abs(key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await this.assertParentContained(abs);

    const buf = Buffer.from(data);
    // Atomic write: write to a temp file in the SAME directory, then rename.
    const tmp = `${abs}.tmp-${randomBytes(8).toString("hex")}`;
    try {
      await fs.writeFile(tmp, buf);
      await fs.rename(tmp, abs);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
    return { key, url: this.url(key), sizeBytes: buf.length };
  }

  url(key: string): string {
    assertSafeKey(key);
    return `${this.urlPrefix}/${key}`;
  }

  /**
   * NOTE: reads the entire object into memory. Fine for Phase 1 images; large
   * media (video) will need a streaming / HTTP range read added later.
   */
  async read(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    const abs = this.abs(key);
    try {
      const data = await fs.readFile(abs);
      return { data, contentType: contentTypeFromKey(key) };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const abs = this.abs(key);
    await fs.rm(abs, { force: true });
  }
}
