import { Buffer } from "node:buffer";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { storage } from "@/lib/storage";
import { persistBytesToStorage } from "@/lib/storage/persist";

import { classifyUpload } from "./classify";

export const runtime = "nodejs";

// Magic bytes for supported image formats. Images keep a strict content sniff.
const IMAGE_MAGIC_BYTES: Array<{ bytes: number[] }> = [
  { bytes: [0x89, 0x50, 0x4e, 0x47] }, // PNG
  { bytes: [0xff, 0xd8, 0xff] }, // JPEG
  { bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF
  { bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF header (WEBP)
];

function matches(buffer: Buffer, bytes: number[], offset = 0): boolean {
  return bytes.every((byte, i) => buffer[offset + i] === byte);
}

function isValidImageMagicBytes(buffer: Buffer): boolean {
  return IMAGE_MAGIC_BYTES.some(({ bytes }) => matches(buffer, bytes));
}

/**
 * Best-effort audio content sniff. We can strictly recognise MP3, WAV, WebM
 * (Matroska) and MP4/M4A (ftyp) containers. If the bytes don't match any known
 * audio signature we fall back to trusting the (already allow-listed) MIME
 * type, since not every audio container is cheaply sniffable.
 */
function isPlausibleAudioMagicBytes(buffer: Buffer): boolean {
  // MP3: "ID3" tag or MPEG frame sync (FF FB / FF F3 / FF F2)
  if (matches(buffer, [0x49, 0x44, 0x33])) return true; // "ID3"
  if (
    buffer[0] === 0xff &&
    (buffer[1] === 0xfb || buffer[1] === 0xf3 || buffer[1] === 0xf2)
  ) {
    return true;
  }

  // WAV: "RIFF" .... "WAVE"
  if (matches(buffer, [0x52, 0x49, 0x46, 0x46]) && matches(buffer, [0x57, 0x41, 0x56, 0x45], 8)) {
    return true;
  }

  // WebM / Matroska: EBML header 1A 45 DF A3
  if (matches(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return true;

  // MP4 / M4A: "ftyp" box at offset 4
  if (matches(buffer, [0x66, 0x74, 0x79, 0x70], 4)) return true;

  // Unknown container: trust the allow-listed MIME type.
  return true;
}

/**
 * Best-effort video content sniff. Recognises MP4 ("ftyp" box at offset 4) and
 * WebM / Matroska (EBML header 1A 45 DF A3). Falls back to trusting the
 * (already allow-listed) MIME type for anything not cheaply sniffable.
 */
function isPlausibleVideoMagicBytes(buffer: Buffer): boolean {
  // MP4: "ftyp" box at offset 4
  if (matches(buffer, [0x66, 0x74, 0x79, 0x70], 4)) return true;

  // WebM / Matroska: EBML header 1A 45 DF A3
  if (matches(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return true;

  // Unknown container: trust the allow-listed MIME type.
  return true;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
    return NextResponse.json({ error: "Upload a valid image file." }, { status: 400 });
  }

  const mimeType = file.type || "image/png";
  const classification = classifyUpload(mimeType);
  if (!classification) {
    return NextResponse.json(
      {
        error:
          "Unsupported format. Use an image (PNG, JPEG, WEBP, GIF), audio (MP3, WAV, M4A, WEBM) or video (MP4, WEBM) file.",
      },
      { status: 415 },
    );
  }

  if (file.size > classification.maxBytes) {
    const limitMb = Math.round(classification.maxBytes / (1024 * 1024));
    const noun =
      classification.kind === "audio"
        ? "Audio files"
        : classification.kind === "video"
          ? "Video files"
          : "Reference images";
    return NextResponse.json(
      { error: `${noun} must be smaller than ${limitMb}MB.` },
      { status: 413 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const contentIsValid =
    classification.kind === "image"
      ? isValidImageMagicBytes(buffer)
      : classification.kind === "video"
        ? isPlausibleVideoMagicBytes(buffer)
        : isPlausibleAudioMagicBytes(buffer);

  if (!contentIsValid) {
    return NextResponse.json(
      { error: "File content does not match a supported format." },
      { status: 415 },
    );
  }

  const asset = await prisma.asset.create({
    data: {
      userId: session.user.id,
      type: classification.assetType,
      title: file.name.slice(0, 80),
      url: "",
      metadata: {
        upload: {
          originalName: file.name,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        },
      },
    },
  });

  const persisted = await persistBytesToStorage(storage, {
    kind: "upload",
    id: asset.id,
    data: buffer,
    contentType: mimeType,
  });

  const updated = await prisma.asset.update({
    where: { id: asset.id },
    data: {
      url: persisted.url,
      thumbnail: persisted.url,
      storageKey: persisted.storageKey,
      mimeType: persisted.mimeType,
      sizeBytes: persisted.sizeBytes,
    },
  });

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    url: updated.url,
    thumbnail: updated.thumbnail ?? updated.url,
    createdAt: updated.createdAt.toISOString(),
    mimeType,
  });
}
