import { describe, it, expect, vi, afterEach } from "vitest";
import { persistBytesToStorage, persistUrlToStorage } from "./persist";
import type { StorageDriver } from "./types";

function fakeStore(): StorageDriver {
  return {
    put: vi.fn(async (key: string, data: Buffer | Uint8Array) => ({
      key, url: "/media/" + key, sizeBytes: Buffer.from(data).length,
    })),
    url: (k: string) => "/media/" + k,
    delete: vi.fn(async () => {}),
    read: vi.fn(async () => null),
  };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("persistBytesToStorage", () => {
  it("stores bytes and returns asset fields with sharded key", async () => {
    const store = fakeStore();
    const res = await persistBytesToStorage(store, { kind: "asset", id: "clx1abc", data: Buffer.from("abc"), contentType: "image/png" });
    expect(res.storageKey).toBe("asset/cl/clx1abc.png");
    expect(res.url).toBe("/media/asset/cl/clx1abc.png");
    expect(res.mimeType).toBe("image/png");
    expect(res.sizeBytes).toBe(3);
    expect(store.put).toHaveBeenCalledOnce();
  });
});

describe("persistUrlToStorage", () => {
  it("decodes and stores a data: URL", async () => {
    const store = fakeStore();
    const dataUrl = "data:image/png;base64," + Buffer.from("hi").toString("base64");
    const res = await persistUrlToStorage(store, { kind: "asset", id: "clx2", url: dataUrl });
    expect(res).not.toBeNull();
    expect(res!.storageKey).toBe("asset/cl/clx2.png");
    expect(res!.sizeBytes).toBe(2);
  });

  it("fetches and stores a remote URL", async () => {
    const store = fakeStore();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("video-bytes"), {
      status: 200, headers: { "content-type": "video/mp4" },
    })));
    const res = await persistUrlToStorage(store, { kind: "asset", id: "clx3", url: "https://cdn/x.mp4" });
    expect(res).not.toBeNull();
    expect(res!.mimeType).toBe("video/mp4");
    expect(res!.storageKey).toBe("asset/cl/clx3.mp4");
  });

  it("returns null when the remote fetch is not ok", async () => {
    const store = fakeStore();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const res = await persistUrlToStorage(store, { kind: "asset", id: "clx4", url: "https://cdn/x.mp4" });
    expect(res).toBeNull();
  });
});
