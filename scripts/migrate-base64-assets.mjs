// One-off: move existing base64 data: URLs in Asset.url onto local disk storage.
// Idempotent: skips assets that already have a storageKey.
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const ROOT = process.env.MEDIA_ROOT ?? "/home/tools/pixelfoundry-media";
const PREFIX = (process.env.MEDIA_URL_PREFIX ?? "/media").replace(/\/+$/, "");

// Must match src/lib/storage/content-types.ts (extension by content-type).
const CT_EXT = {
  "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp",
  "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm",
  "audio/mpeg": "mp3", "audio/wav": "wav",
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const assets = await prisma.asset.findMany({ where: { storageKey: null } });
  let candidates = 0, moved = 0;
  for (const a of assets) {
    if (!a.url?.startsWith("data:")) continue;
    const m = /^data:([^,]*?);base64,([\s\S]*)$/.exec(a.url);
    if (!m) continue;
    const ct = (m[1].split(";")[0].trim()) || "application/octet-stream";
    const payload = m[2];
    if (!payload) continue;
    candidates++;
    if (dryRun) continue;
    const ext = CT_EXT[ct] ?? "bin";
    const key = `asset/${a.id.slice(0, 2)}/${a.id}.${ext}`;
    const abs = path.join(ROOT, key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const buf = Buffer.from(payload, "base64");
    const tmp = `${abs}.tmp`;
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, abs);
    await prisma.asset.update({
      where: { id: a.id },
      data: { url: `${PREFIX}/${key}`, thumbnail: `${PREFIX}/${key}`, storageKey: key, mimeType: ct, sizeBytes: buf.length },
    });
    moved++;
  }
  console.log(dryRun ? `[dry-run] ${candidates} base64 assets would migrate.` : `Migrated ${moved} base64 assets (of ${candidates} candidates).`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
