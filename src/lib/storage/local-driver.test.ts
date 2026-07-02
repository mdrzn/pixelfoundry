import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalDiskDriver } from "./local-driver";

let root: string;
beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), "pf-store-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("LocalDiskDriver", () => {
  it("puts and reads back bytes with content type", async () => {
    const d = new LocalDiskDriver(root, "/media");
    const res = await d.put("img/a.png", Buffer.from("hello"), "image/png");
    expect(res.key).toBe("img/a.png");
    expect(res.url).toBe("/media/img/a.png");
    expect(res.sizeBytes).toBe(5);
    const back = await d.read("img/a.png");
    expect(back?.data.toString()).toBe("hello");
    expect(back?.contentType).toBe("image/png");
  });

  it("returns null reading a missing key", async () => {
    const d = new LocalDiskDriver(root, "/media");
    expect(await d.read("nope.png")).toBeNull();
  });

  it("rejects path traversal keys", async () => {
    const d = new LocalDiskDriver(root, "/media");
    await expect(d.put("../escape.png", Buffer.from("x"), "image/png")).rejects.toThrow();
  });

  it("deletes without throwing on missing", async () => {
    const d = new LocalDiskDriver(root, "/media");
    await d.delete("missing.png"); // no throw
  });
});
