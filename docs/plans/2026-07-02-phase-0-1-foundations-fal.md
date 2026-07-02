# Phase 0 + 1 — Foundations & fal.ai Provider — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Lay the storage + testing foundations, then add fal.ai as a working single-step provider — without touching the still-unbuilt pipeline engine.

**Architecture:** Extend, don't replace. Introduce a swappable `StorageDriver` (local-disk backend) and move assets off base64-in-Postgres; serve media through a Range-capable Next route. Then add a `FAL` provider that plugs into the existing `runImageJob`/`runVideoJob` dispatch, so a fal model works end-to-end through the current Create pages, metered and stored locally.

**Tech Stack:** Next.js 15, TypeScript, Prisma/Postgres, Vitest (new), fal.ai HTTP queue API, ffmpeg (poster frames).

**Scope boundary:** NO `Pipeline`/`PipelineStep` models, NO BullMQ/worker, NO studios. Those are Phase 2+. This plan only makes storage real and fal a first-class single-call provider.

**Reference design:** `docs/plans/2026-06-30-unified-studio-design.md` (Sections 3, 4).

---

## Pre-flight (once, before Task 1)

Work on a branch, not master:

```bash
cd /home/tools/public_html/dashboard-app
git checkout -b phase-0-1-foundations-fal
```

Prisma note: the `Canvas` model was previously applied with `prisma db push` (no migration file), so the first `prisma migrate dev` in this plan will also fold Canvas into migration history — expected, not an error.

---

## Task 0: Set up Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Modify: `package.json` (scripts + devDeps)

**Step 1: Install Vitest**

```bash
npm install -D vitest @vitest/coverage-v8
```

**Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

**Step 3: Create `src/test/setup.ts`** (empty placeholder for future globals)

```ts
// Vitest global setup. Intentionally empty for now.
export {};
```

**Step 4: Add scripts to `package.json`**

```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 5: Write a smoke test** — Create `src/test/smoke.test.ts`

```ts
import { describe, it, expect } from "vitest";
describe("vitest", () => {
  it("runs", () => { expect(1 + 1).toBe(2); });
});
```

**Step 6: Run it**

Run: `npm test`
Expected: 1 passed.

**Step 7: Commit**

```bash
git add vitest.config.ts src/test package.json package-lock.json
git commit -m "chore: set up Vitest test runner"
```

---

## Task 1: Add storage fields to the Asset model

**Files:**
- Modify: `prisma/schema.prisma` (Asset model)

**Step 1: Extend the `Asset` model** — add fields (keep `url` for now; it becomes the served path):

```prisma
model Asset {
  id        String   @id @default(cuid())
  userId    String
  type      AssetType
  title     String?
  url       String
  thumbnail String?
  metadata  Json?
  createdAt DateTime @default(now())

  // storage rework (Phase 0)
  storageKey String?
  mimeType   String?
  sizeBytes  Int?
  durationMs Int?
  posterKey  String?
  width      Int?
  height     Int?

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  jobOutput Job[]    @relation("JobOutputAsset")
  presetReferences ImagePresetReference[]
  jobInputUsages   JobInputAsset[]

  @@index([userId])
  @@index([userId, type, createdAt])
  @@index([type])
}
```

**Step 2: Create the migration**

Run: `npx prisma migrate dev --name asset-storage-fields`
Expected: migration created + applied; Prisma Client regenerated. (May also include the previously-pushed Canvas model — expected.)

**Step 3: Verify client types**

Run: `npx tsc --noEmit`
Expected: no errors.

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add storage fields to Asset"
```

---

## Task 2: StorageDriver interface + LocalDiskDriver

**Files:**
- Create: `src/lib/storage/types.ts`
- Create: `src/lib/storage/local-driver.ts`
- Create: `src/lib/storage/index.ts`
- Test: `src/lib/storage/local-driver.test.ts`

**Step 1: Write the interface** — `src/lib/storage/types.ts`

```ts
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
```

**Step 2: Write the failing test** — `src/lib/storage/local-driver.test.ts`

```ts
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
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/storage/local-driver.test.ts`
Expected: FAIL (module not found).

**Step 4: Implement `src/lib/storage/local-driver.ts`**

```ts
import { promises as fs } from "node:fs";
import path from "node:path";
import type { StorageDriver, PutResult } from "./types";

// Minimal content-type ↔ extension map for reads (extension lost otherwise).
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
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/storage/local-driver.test.ts`
Expected: 4 passed.

**Step 6: Wire the singleton** — `src/lib/storage/index.ts`

```ts
import path from "node:path";
import { LocalDiskDriver } from "./local-driver";
import type { StorageDriver } from "./types";

export * from "./types";

// Media root lives OFF the RAID root, on the big /home drive. Overridable via env.
const MEDIA_ROOT = process.env.MEDIA_ROOT ?? "/home/tools/pixelfoundry-media";
const MEDIA_URL_PREFIX = process.env.MEDIA_URL_PREFIX ?? "/media";

export const storage: StorageDriver = new LocalDiskDriver(MEDIA_ROOT, MEDIA_URL_PREFIX);
export function storageKeyFor(kind: string, id: string, ext: string) {
  // e.g. asset/clx123.mp4 → sharded by first 2 chars to avoid huge dirs
  const shard = id.slice(0, 2);
  return `${kind}/${shard}/${id}.${ext.replace(/^\./, "")}`;
}
```

**Step 7: Add `MEDIA_ROOT` + `MEDIA_URL_PREFIX` to `.env.example`** (document them; no secrets)

```
MEDIA_ROOT="/home/tools/pixelfoundry-media"
MEDIA_URL_PREFIX="/media"
```

**Step 8: Commit**

```bash
git add src/lib/storage .env.example
git commit -m "feat(storage): StorageDriver interface + local-disk backend"
```

---

## Task 3: Range-capable media serving route

**Files:**
- Create: `src/lib/http/range.ts`
- Create: `src/app/media/[...key]/route.ts`
- Test: `src/lib/http/range.test.ts`

Rationale: the design calls for an Apache alias, but Apache config needs root (unavailable to this session). A Next route is self-contained, testable, and needs no root. Swapping to an Apache alias later is a pure ops change (documented as a future optimization).

**Step 1: Write the failing test for the range parser** — `src/lib/http/range.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseRange } from "./range";

describe("parseRange", () => {
  it("returns null when no header", () => {
    expect(parseRange(null, 1000)).toBeNull();
  });
  it("parses bytes=0-499", () => {
    expect(parseRange("bytes=0-499", 1000)).toEqual({ start: 0, end: 499 });
  });
  it("parses open-ended bytes=500-", () => {
    expect(parseRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
  });
  it("parses suffix bytes=-200", () => {
    expect(parseRange("bytes=-200", 1000)).toEqual({ start: 800, end: 999 });
  });
  it("clamps end past EOF", () => {
    expect(parseRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
  });
  it("returns 'invalid' for unsatisfiable start", () => {
    expect(parseRange("bytes=2000-3000", 1000)).toBe("invalid");
  });
});
```

**Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/http/range.test.ts`
Expected: FAIL (module not found).

**Step 3: Implement `src/lib/http/range.ts`**

```ts
export type ByteRange = { start: number; end: number };

/** Parse a single-range HTTP Range header. Returns null (no header),
 * "invalid" (unsatisfiable → 416), or a clamped {start,end} inclusive. */
export function parseRange(header: string | null, size: number): ByteRange | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return "invalid";
  const [, s, e] = m;
  if (s === "" && e === "") return "invalid";
  let start: number, end: number;
  if (s === "") { // suffix
    const n = parseInt(e, 10);
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = parseInt(s, 10);
    end = e === "" ? size - 1 : Math.min(parseInt(e, 10), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}
```

**Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/http/range.test.ts`
Expected: 6 passed.

**Step 5: Implement the route** — `src/app/media/[...key]/route.ts`

```ts
import { NextRequest } from "next/server";
import { storage } from "@/lib/storage";
import { parseRange } from "@/lib/http/range";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  const obj = await storage.read(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const size = obj.data.length;
  const range = parseRange(req.headers.get("range"), size);

  const baseHeaders: Record<string, string> = {
    "Content-Type": obj.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
  };

  if (range === "invalid") {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
    });
  }
  if (range) {
    const chunk = obj.data.subarray(range.start, range.end + 1);
    return new Response(chunk, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Content-Length": String(chunk.length),
      },
    });
  }
  return new Response(obj.data, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
```

**Step 6: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds; `/media/[...key]` route listed.

**Step 7: Commit**

```bash
git add src/lib/http src/app/media
git commit -m "feat(media): Range-capable media serving route"
```

---

## Task 4: Route asset persistence through StorageDriver

**Files:**
- Create: `src/lib/storage/persist.ts`
- Test: `src/lib/storage/persist.test.ts`
- Modify: `src/lib/jobs.ts` (replace `persistExternalUrl` usage in `finalizeProviderJob`, ~lines 171-237)
- Modify: `src/app/api/uploads/route.ts` (store via driver instead of base64 data URL)

**Step 1: Write the failing test** — `src/lib/storage/persist.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { persistBytesToStorage, extFromContentType } from "./persist";

describe("extFromContentType", () => {
  it("maps common types", () => {
    expect(extFromContentType("image/png")).toBe("png");
    expect(extFromContentType("video/mp4")).toBe("mp4");
    expect(extFromContentType("audio/mpeg")).toBe("mp3");
    expect(extFromContentType("application/octet-stream")).toBe("bin");
  });
});

describe("persistBytesToStorage", () => {
  it("stores and returns asset fields", async () => {
    const put = vi.fn(async (key: string, _d: Buffer, _ct: string) => ({
      key, url: "/media/" + key, sizeBytes: 3,
    }));
    const fakeStore = { put } as any;
    const res = await persistBytesToStorage(fakeStore, {
      kind: "asset", id: "clx1", data: Buffer.from("abc"), contentType: "image/png",
    });
    expect(res.storageKey).toBe("asset/cl/clx1.png");
    expect(res.url).toBe("/media/asset/cl/clx1.png");
    expect(res.mimeType).toBe("image/png");
    expect(res.sizeBytes).toBe(3);
    expect(put).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/storage/persist.test.ts`
Expected: FAIL (module not found).

**Step 3: Implement `src/lib/storage/persist.ts`**

```ts
import type { StorageDriver } from "./types";
import { storageKeyFor } from "./index";

const CT_EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/webm": "webm",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
};

export function extFromContentType(ct: string): string {
  return CT_EXT[ct.split(";")[0].trim().toLowerCase()] ?? "bin";
}

export type PersistedAsset = {
  storageKey: string; url: string; mimeType: string; sizeBytes: number;
};

export async function persistBytesToStorage(
  store: StorageDriver,
  args: { kind: string; id: string; data: Buffer; contentType: string },
): Promise<PersistedAsset> {
  const ext = extFromContentType(args.contentType);
  const key = storageKeyFor(args.kind, args.id, ext);
  const res = await store.put(key, args.data, args.contentType);
  return { storageKey: res.key, url: res.url, mimeType: args.contentType, sizeBytes: res.sizeBytes };
}

/** Fetch a remote (provider CDN) URL and persist it. Returns null on failure. */
export async function persistUrlToStorage(
  store: StorageDriver,
  args: { kind: string; id: string; url: string },
): Promise<PersistedAsset | null> {
  if (args.url.startsWith("data:")) {
    // data URL → decode inline
    const m = /^data:([^;]+);base64,(.*)$/.exec(args.url);
    if (!m) return null;
    return persistBytesToStorage(store, {
      kind: args.kind, id: args.id, data: Buffer.from(m[2], "base64"), contentType: m[1],
    });
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
```

**Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/storage/persist.test.ts`
Expected: 3 passed.

**Step 5: Rework `finalizeProviderJob` in `src/lib/jobs.ts`**

Replace the `persistExternalUrl` helper (lines ~171-192) and its use in `finalizeProviderJob` (lines ~194-237). The new flow: create the Asset first (to get its id for the storage key), persist the provider bytes to storage, then update the Asset with storage fields. Full replacement:

```ts
import { storage } from "@/lib/storage";
import { persistUrlToStorage } from "@/lib/storage/persist";

// (delete the old persistExternalUrl function entirely)

async function finalizeProviderJob({
  jobId, userId, result,
}: { jobId: string; userId: string; result: ProviderRunResult }) {
  if (!result.assets.length) throw new Error("Provider returned no outputs.");
  const primary = result.assets[0];

  // 1. Create the asset row (need its id for the storage key).
  const asset = await prisma.asset.create({
    data: {
      userId,
      type: primary.type,
      url: primary.url, // temporary; replaced below once stored
      thumbnail: primary.thumbnail ?? primary.url,
      metadata: primary.metadata ? (primary.metadata as Prisma.InputJsonValue) : undefined,
    },
  });

  // 2. Stream provider output into our storage.
  const persisted = await persistUrlToStorage(storage, {
    kind: "asset", id: asset.id, url: primary.url,
  });

  // 3. Update the asset with the served URL + storage metadata (fallback to
  //    the provider URL if persistence failed, so the job still completes).
  await prisma.asset.update({
    where: { id: asset.id },
    data: persisted
      ? {
          url: persisted.url,
          thumbnail: persisted.url,
          storageKey: persisted.storageKey,
          mimeType: persisted.mimeType,
          sizeBytes: persisted.sizeBytes,
        }
      : {},
  });

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: JobStatus.COMPLETED,
      providerJobId: result.providerJobId ?? null,
      completedAt: new Date(),
      outputAssetId: asset.id,
      result: result.rawResponse ? (result.rawResponse as Prisma.InputJsonValue) : undefined,
    },
  });
}
```

**Step 6: Rework `src/app/api/uploads/route.ts`** — replace the base64 data-URL storage (~lines 62-90) with driver storage. Keep all existing validation (size cap, MIME allowlist, magic bytes). After validation, replace the persistence block:

```ts
import { storage } from "@/lib/storage";
import { persistBytesToStorage } from "@/lib/storage/persist";

// ...after validation, `buffer` and `mimeType` in scope:
const asset = await prisma.asset.create({
  data: {
    userId: session.user.id,
    type: AssetType.IMAGE,
    title: file.name.slice(0, 80),
    url: "", // set below
    metadata: { upload: { originalName: file.name, size: file.size, uploadedAt: new Date().toISOString() } },
  },
});
const persisted = await persistBytesToStorage(storage, {
  kind: "upload", id: asset.id, data: buffer, contentType: mimeType,
});
const updated = await prisma.asset.update({
  where: { id: asset.id },
  data: {
    url: persisted.url, thumbnail: persisted.url,
    storageKey: persisted.storageKey, mimeType: persisted.mimeType, sizeBytes: persisted.sizeBytes,
  },
});
return Response.json({
  id: updated.id, title: updated.title, url: updated.url,
  thumbnail: updated.thumbnail, createdAt: updated.createdAt.toISOString(), mimeType,
});
```

**Step 7: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: success.

**Step 8: Manual smoke** (dev server)

Run: `npm run dev` then upload an image on Create Image. Confirm the returned URL is `/media/upload/...` and the file exists under `$MEDIA_ROOT/upload/...`. Confirm it renders (route serves it).

**Step 9: Commit**

```bash
git add src/lib/storage/persist.ts src/lib/storage/persist.test.ts src/lib/jobs.ts src/app/api/uploads/route.ts
git commit -m "feat(storage): persist assets + uploads via StorageDriver, drop base64"
```

---

## Task 5: Create the media root directory + one-off base64 migration script

**Files:**
- Create: `scripts/migrate-base64-assets.mjs`

**Step 1: Create the media root** (idempotent)

Run: `mkdir -p /home/tools/pixelfoundry-media && ls -ld /home/tools/pixelfoundry-media`
Expected: directory exists, owned by `tools`.

**Step 2: Write the migration script** — `scripts/migrate-base64-assets.mjs`

```js
// One-off: move existing base64 data: URLs in Asset.url onto the StorageDriver.
// Safe to re-run: skips assets that already have a storageKey.
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const ROOT = process.env.MEDIA_ROOT ?? "/home/tools/pixelfoundry-media";
const PREFIX = process.env.MEDIA_URL_PREFIX ?? "/media";
const CT_EXT = { "image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/gif":"gif","video/mp4":"mp4","audio/mpeg":"mp3" };

async function main() {
  const assets = await prisma.asset.findMany({ where: { storageKey: null } });
  let moved = 0;
  for (const a of assets) {
    if (!a.url?.startsWith("data:")) continue;
    const m = /^data:([^;]+);base64,(.*)$/.exec(a.url);
    if (!m) continue;
    const [, ct, b64] = m;
    const ext = CT_EXT[ct] ?? "bin";
    const key = `asset/${a.id.slice(0,2)}/${a.id}.${ext}`;
    const abs = path.join(ROOT, key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const buf = Buffer.from(b64, "base64");
    await fs.writeFile(abs, buf);
    await fs.writeFile(abs + ".content-type", ct, "utf8");
    await prisma.asset.update({
      where: { id: a.id },
      data: { url: `${PREFIX}/${key}`, thumbnail: `${PREFIX}/${key}`, storageKey: key, mimeType: ct, sizeBytes: buf.length },
    });
    moved++;
  }
  console.log(`Migrated ${moved} base64 assets.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

**Step 3: Dry-run awareness + run**

Run: `node scripts/migrate-base64-assets.mjs`
Expected: prints "Migrated N base64 assets." Re-running prints "Migrated 0" (idempotent).

**Step 4: Verify** — pick one migrated asset, confirm its `url` is `/media/...` and the file exists on disk and renders through the route.

**Step 5: Commit**

```bash
git add scripts/migrate-base64-assets.mjs
git commit -m "chore(storage): one-off base64→disk asset migration script"
```

---

## Task 6: Confirm ffmpeg availability (poster frames later)

**Files:** none (environment check).

**Step 1: Check**

Run: `which ffmpeg ffprobe && ffmpeg -hide_banner -version | head -1`
Expected: paths + version. If MISSING: this needs root — stop and ask the user to run `sudo apt-get install -y ffmpeg` (this session lacks sudo). Record the outcome in the plan's execution notes. ffmpeg isn't used until Phase 4/poster frames, so a miss here doesn't block Phase 1 — but confirm now to de-risk.

**Step 2:** No commit (no file change).

---

## Task 7: Add FAL to enums + AssetType AUDIO

**Files:**
- Modify: `prisma/schema.prisma` (Provider, JobProvider, AssetType enums)

**Step 1: Extend enums**

```prisma
enum Provider { REPLICATE  GEMINI  OPENAI  FAL }
enum JobProvider { MOCK  REPLICATE  GEMINI  OPENAI  FAL }
enum AssetType { IMAGE  VIDEO  AUDIO }
```

**Step 2: Migrate**

Run: `npx prisma migrate dev --name add-fal-provider-audio`
Expected: applied; client regenerated.

**Step 3: Map FAL in `src/lib/jobs.ts`** — extend `mapProviderToJobProvider` (~lines 652-663):

```ts
case Provider.FAL: return JobProvider.FAL;
```

**Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (switch now exhaustive).

**Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/jobs.ts
git commit -m "feat(db): add FAL provider + AUDIO asset type"
```

---

## Task 8: fal.ts — the fal step runner

**Files:**
- Create: `src/lib/providers/fal.ts`
- Test: `src/lib/providers/fal.test.ts`

fal's HTTP API: `POST https://queue.fal.run/{endpoint}` with `Authorization: Key {FAL_KEY}` returns a request id; poll `.../requests/{id}/status` then GET `.../requests/{id}` for the result. Response asset URLs vary by endpoint (`images[]`, `video.url`, `video_url`, `videos[]`, `audio.url`). We isolate the two pure, testable pieces: **input mapping** and **asset extraction**.

**Step 1: Write the failing test** — `src/lib/providers/fal.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { extractFalAssets, buildFalInput } from "./fal";
import { AssetType } from "@prisma/client";

describe("extractFalAssets", () => {
  it("extracts images[]", () => {
    const a = extractFalAssets({ images: [{ url: "https://x/i.png" }] }, AssetType.IMAGE);
    expect(a).toEqual([{ type: AssetType.IMAGE, url: "https://x/i.png", thumbnail: "https://x/i.png" }]);
  });
  it("extracts video.url", () => {
    const a = extractFalAssets({ video: { url: "https://x/v.mp4" } }, AssetType.VIDEO);
    expect(a[0]).toMatchObject({ type: AssetType.VIDEO, url: "https://x/v.mp4" });
  });
  it("extracts video_url", () => {
    expect(extractFalAssets({ video_url: "https://x/v.mp4" }, AssetType.VIDEO)[0].url).toBe("https://x/v.mp4");
  });
  it("extracts audio.url", () => {
    expect(extractFalAssets({ audio: { url: "https://x/a.mp3" } }, AssetType.AUDIO)[0].url).toBe("https://x/a.mp3");
  });
  it("returns [] when nothing matches", () => {
    expect(extractFalAssets({ foo: 1 }, AssetType.IMAGE)).toEqual([]);
  });
});

describe("buildFalInput", () => {
  it("maps generic fields via inputMap", () => {
    const out = buildFalInput(
      { prompt: "a cat", aspectRatio: "9:16", negativePrompt: "blur" },
      { prompt: "prompt", aspectRatio: "aspect_ratio", negativePrompt: "negative_prompt" },
      { generate_audio: true },
    );
    expect(out).toEqual({ prompt: "a cat", aspect_ratio: "9:16", negative_prompt: "blur", generate_audio: true });
  });
  it("drops undefined fields", () => {
    const out = buildFalInput({ prompt: "x", seed: undefined }, { prompt: "prompt", seed: "seed" }, {});
    expect(out).toEqual({ prompt: "x" });
  });
});
```

**Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/providers/fal.test.ts`
Expected: FAIL (module not found).

**Step 3: Implement `src/lib/providers/fal.ts`**

```ts
import { AssetType } from "@prisma/client";
import { getProviderCredentialSecret } from "@/lib/admin";
import { Provider } from "@prisma/client";
import {
  ImageJobInput, VideoJobInput, ProviderJobError,
  ProviderJobOptions, ProviderRunAsset, ProviderRunResult,
} from "@/lib/providers/types";

const FAL_QUEUE = "https://queue.fal.run";
const POLL_MS = 2500;
const MAX_WAIT_MS = 8 * 60 * 1000;

type Rec = Record<string, unknown>;

/** Map generic input fields → endpoint field names, drop undefined, merge static inputs. */
export function buildFalInput(
  input: Rec,
  inputMap: Record<string, string>,
  staticInputs: Rec,
): Rec {
  const out: Rec = { ...staticInputs };
  for (const [k, target] of Object.entries(inputMap)) {
    const v = input[k];
    if (v !== undefined && v !== null && v !== "") out[target] = v;
  }
  return out;
}

/** Pull asset URLs out of fal's varied response shapes. */
export function extractFalAssets(data: Rec, type: AssetType): ProviderRunAsset[] {
  const urls: string[] = [];
  const pushObjUrl = (o: unknown) => {
    if (o && typeof o === "object" && "url" in o && typeof (o as Rec).url === "string") urls.push((o as Rec).url as string);
  };
  if (Array.isArray((data as Rec).images)) ((data as Rec).images as unknown[]).forEach(pushObjUrl);
  if (Array.isArray((data as Rec).videos)) ((data as Rec).videos as unknown[]).forEach(pushObjUrl);
  pushObjUrl((data as Rec).video);
  pushObjUrl((data as Rec).audio);
  if (typeof (data as Rec).video_url === "string") urls.push((data as Rec).video_url as string);
  if (typeof (data as Rec).audio_url === "string") urls.push((data as Rec).audio_url as string);
  return urls.map((url) => ({ type, url, thumbnail: type === AssetType.IMAGE ? url : undefined }));
}

async function falKey(): Promise<string> {
  const cred = await getProviderCredentialSecret(Provider.FAL);
  if (!cred?.apiKey) throw new ProviderJobError("fal.ai credential not configured.");
  return cred.apiKey;
}

/** Submit to the fal queue, poll to completion, return the raw result payload. */
export async function runFalStep(endpoint: string, input: Rec): Promise<Rec> {
  const key = await falKey();
  const headers = { Authorization: `Key ${key}`, "Content-Type": "application/json" };

  const submit = await fetch(`${FAL_QUEUE}/${endpoint}`, {
    method: "POST", headers, body: JSON.stringify(input),
  });
  if (!submit.ok) throw new ProviderJobError(`fal submit failed: ${await submit.text()}`);
  const { request_id } = (await submit.json()) as { request_id?: string };
  if (!request_id) throw new ProviderJobError("fal did not return a request_id.");

  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const st = await fetch(`${FAL_QUEUE}/${endpoint}/requests/${request_id}/status`, { headers });
    if (!st.ok) throw new ProviderJobError(`fal status failed: ${await st.text()}`, { providerJobId: request_id });
    const { status } = (await st.json()) as { status?: string };
    if (status === "COMPLETED") {
      const res = await fetch(`${FAL_QUEUE}/${endpoint}/requests/${request_id}`, { headers });
      if (!res.ok) throw new ProviderJobError(`fal result failed: ${await res.text()}`, { providerJobId: request_id });
      return (await res.json()) as Rec;
    }
    if (status === "FAILED") throw new ProviderJobError("fal reported FAILED.", { providerJobId: request_id });
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new ProviderJobError("Timed out waiting for fal.");
}

type FalModelMeta = { falEndpoint: string; inputMap?: Record<string, string>; staticInputs?: Rec };
function falMeta(model: ProviderJobOptions<unknown>["model"]): FalModelMeta {
  const m = (model.metadata ?? {}) as Rec;
  const fal = (m.fal ?? m) as Rec;
  if (typeof fal.falEndpoint !== "string") throw new ProviderJobError(`Model ${model.slug} missing fal.falEndpoint metadata.`);
  return { falEndpoint: fal.falEndpoint, inputMap: fal.inputMap as Record<string,string> | undefined, staticInputs: fal.staticInputs as Rec | undefined };
}

export async function runFalImageJob(options: ProviderJobOptions<ImageJobInput>): Promise<ProviderRunResult> {
  const meta = falMeta(options.model);
  const input = buildFalInput(
    options.input as unknown as Rec,
    meta.inputMap ?? { prompt: "prompt", negativePrompt: "negative_prompt", aspectRatio: "aspect_ratio", width: "width", height: "height", seed: "seed" },
    meta.staticInputs ?? {},
  );
  const data = await runFalStep(meta.falEndpoint, input);
  const assets = extractFalAssets(data, AssetType.IMAGE);
  if (!assets.length) throw new ProviderJobError("fal returned no image outputs.");
  return { assets, rawResponse: data };
}

export async function runFalVideoJob(options: ProviderJobOptions<VideoJobInput>): Promise<ProviderRunResult> {
  const meta = falMeta(options.model);
  const input = buildFalInput(
    options.input as unknown as Rec,
    meta.inputMap ?? { prompt: "prompt", negativePrompt: "negative_prompt", duration: "duration", aspectRatio: "aspect_ratio" },
    meta.staticInputs ?? {},
  );
  const data = await runFalStep(meta.falEndpoint, input);
  const assets = extractFalAssets(data, AssetType.VIDEO);
  if (!assets.length) throw new ProviderJobError("fal returned no video outputs.");
  return { assets, rawResponse: data };
}
```

**Step 4: Run to verify tests pass**

Run: `npx vitest run src/lib/providers/fal.test.ts`
Expected: 7 passed.

**Step 5: Commit**

```bash
git add src/lib/providers/fal.ts src/lib/providers/fal.test.ts
git commit -m "feat(providers): fal.ai step runner + input/asset mapping"
```

---

## Task 9: Wire FAL into provider dispatch

**Files:**
- Modify: `src/lib/providers/index.ts` (runImageJob + runVideoJob switches)
- Modify: `src/lib/jobs.ts` (`assertProviderSupportsJob` — allow FAL for video)

**Step 1: Add FAL cases in `src/lib/providers/index.ts`**

```ts
import { runFalImageJob, runFalVideoJob } from "@/lib/providers/fal";
// in runImageJob switch:
case Provider.FAL: return runFalImageJob(options);
// in runVideoJob switch:
case Provider.FAL: return runFalVideoJob(options);
```

**Step 2: Allow FAL video in `assertProviderSupportsJob`** (`src/lib/jobs.ts` ~lines 665-673) — the current guard only allows Replicate for video. Update:

```ts
if (jobType === JobType.CREATE_VIDEO && provider !== Provider.REPLICATE && provider !== Provider.FAL) {
  throw new Error("Video generation is available through Replicate or fal.ai.");
}
```

**Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: success.

**Step 4: Commit**

```bash
git add src/lib/providers/index.ts src/lib/jobs.ts
git commit -m "feat(providers): dispatch image+video jobs to fal.ai"
```

---

## Task 10: Seed a fal model + register the credential

**Files:**
- Modify: `scripts/seed-provider-models.mjs` (add a fal image model)

**Step 1: Add a fal image model to the seed defaults**

```js
{
  provider: "FAL",
  jobTypes: ["CREATE_IMAGE"],
  slug: "fal-ai/flux/schnell",
  displayName: "FLUX schnell (fal)",
  description: "Fast fal.ai image model — Phase 1 smoke test.",
  creditCost: 6,
  metadata: {
    fal: {
      falEndpoint: "fal-ai/flux/schnell",
      inputMap: { prompt: "prompt", aspectRatio: "image_size" },
      staticInputs: { num_images: 1 },
    },
  },
},
```

(Note: adapt `image_size` mapping to fal's accepted enum during the smoke test; the point of the task is the wiring, tune values against the live endpoint.)

**Step 2: Run the seed**

Run: `npm run seed:models`
Expected: upsert logs; the fal model present.

**Step 3: Register the fal credential** — via the Admin UI (`/dashboard/admin`, provider credentials), paste the fal.ai key. (Server-side only; stored in `ProviderCredential`.) No code.

**Step 4: Commit**

```bash
git add scripts/seed-provider-models.mjs
git commit -m "feat(providers): seed a fal.ai image model"
```

---

## Task 11: End-to-end verification (Phase 1 checkpoint)

**Files:** none (integration verification).

**Step 1:** `npm run dev`. Go to Create Image, pick **FLUX schnell (fal)**, enter a prompt, Generate.

**Step 2: Confirm the full chain:**
- Job created, credits deducted by the model's `creditCost` (check Billing ledger).
- fal generates; job reaches COMPLETED.
- Output Asset `url` is `/media/asset/...` (NOT a fal CDN URL, NOT base64) and the file exists under `$MEDIA_ROOT`.
- Image renders in the Library and on the result view (served by the media route).
- On a forced failure (temporarily bad endpoint), credits are refunded and job is FAILED.

**Step 3: Run the full test suite**

Run: `npm test`
Expected: all green.

**Step 4: Final typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: success.

**Step 5: Push the branch**

```bash
git push -u origin phase-0-1-foundations-fal
```

**Step 6:** Open a PR (or fast-forward merge to master) — decide at execution time.

---

## Definition of done (Phases 0 + 1)

- Vitest running; storage + range + fal-mapping unit tests green.
- Assets (uploads + generated) stored on local disk via `StorageDriver`, served with Range support; no new base64 written; existing base64 migrated.
- `FAL` provider generates an image end-to-end through the existing Create Image page: metered, stored locally, rendered.
- Nothing in the existing Replicate/Gemini/OpenAI paths regressed (`npm run build` + manual create-image on an existing provider still works).
- All work committed on `phase-0-1-foundations-fal` and pushed.

**Explicitly NOT done here (Phase 2+):** `Pipeline`/`PipelineStep` models, BullMQ/worker, studios, translation tools, poster-frame generation, Apache media alias.
