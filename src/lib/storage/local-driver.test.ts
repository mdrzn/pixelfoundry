import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, symlinkSync, existsSync, readdirSync } from "node:fs";
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

  it("deletes without throwing on missing", async () => {
    const d = new LocalDiskDriver(root, "/media");
    await d.delete("missing.png"); // no throw
  });

  it("stores Uint8Array input correctly", async () => {
    const d = new LocalDiskDriver(root, "/media");
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const res = await d.put("bin/u.png", bytes, "image/png");
    expect(res.sizeBytes).toBe(4);
    const back = await d.read("bin/u.png");
    expect(back?.data.equals(Buffer.from([1, 2, 3, 4]))).toBe(true);
  });

  describe("content-type derived from key extension", () => {
    it("round-trips a known extension regardless of put content-type", async () => {
      const d = new LocalDiskDriver(root, "/media");
      // Deliberately pass a wrong content-type on put; read derives from ext.
      await d.put("img/a.png", Buffer.from("x"), "application/octet-stream");
      const back = await d.read("img/a.png");
      expect(back?.contentType).toBe("image/png");
    });

    it("falls back to octet-stream for unknown extensions", async () => {
      const d = new LocalDiskDriver(root, "/media");
      await d.put("misc/x.dat", Buffer.from("x"), "image/png");
      const back = await d.read("misc/x.dat");
      expect(back?.contentType).toBe("application/octet-stream");
    });
  });

  describe("url() normalizes trailing slash", () => {
    it("does not double the slash when prefix ends with /", () => {
      const d = new LocalDiskDriver(root, "/media/");
      expect(d.url("img/a.png")).toBe("/media/img/a.png");
    });
  });

  describe("key validation (guards put/read/delete/url)", () => {
    const bad: [string, string][] = [
      ["absolute key", "/etc/x"],
      ["parent-escape segment", "../escape.png"],
      ["empty key", ""],
      ["empty segment", "a//b.png"],
      ["dot segment", "a/./b.png"],
      ["dotdot segment", "a/../b.png"],
    ];

    for (const [label, key] of bad) {
      it(`put rejects ${label}`, async () => {
        const d = new LocalDiskDriver(root, "/media");
        await expect(d.put(key, Buffer.from("x"), "image/png")).rejects.toThrow();
      });
      it(`read rejects ${label}`, async () => {
        const d = new LocalDiskDriver(root, "/media");
        await expect(d.read(key)).rejects.toThrow();
      });
      it(`delete rejects ${label}`, async () => {
        const d = new LocalDiskDriver(root, "/media");
        await expect(d.delete(key)).rejects.toThrow();
      });
      it(`url rejects ${label}`, () => {
        const d = new LocalDiskDriver(root, "/media");
        expect(() => d.url(key)).toThrow();
      });
    }

    it("accepts a legit key containing '..' within a segment (my..file.png)", async () => {
      const d = new LocalDiskDriver(root, "/media");
      const res = await d.put("img/my..file.png", Buffer.from("ok"), "image/png");
      expect(res.key).toBe("img/my..file.png");
      expect((await d.read("img/my..file.png"))?.data.toString()).toBe("ok");
    });
  });

  describe("symlink escape is blocked", () => {
    it("throws and writes nothing outside the root", async () => {
      const outside = mkdtempSync(path.join(tmpdir(), "pf-outside-"));
      try {
        // A symlink 'link' inside the root points to a dir outside the root.
        symlinkSync(outside, path.join(root, "link"), "dir");
        const d = new LocalDiskDriver(root, "/media");
        await expect(
          d.put("link/x.png", Buffer.from("leak"), "image/png"),
        ).rejects.toThrow();
        // Nothing should have been written into the outside directory.
        expect(readdirSync(outside)).toEqual([]);
        expect(existsSync(path.join(outside, "x.png"))).toBe(false);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });
});
