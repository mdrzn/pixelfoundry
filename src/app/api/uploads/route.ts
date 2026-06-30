import { Buffer } from "node:buffer";

import { NextRequest, NextResponse } from "next/server";
import { AssetType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 6 * 1024 * 1024; // 6 MB
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

// Magic bytes for supported image formats
const MAGIC_BYTES: Array<{ mime: string; bytes: number[] }> = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF header
];

function isValidImageMagicBytes(buffer: Buffer): boolean {
  return MAGIC_BYTES.some(({ bytes }) =>
    bytes.every((byte, i) => buffer[i] === byte),
  );
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

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Reference images must be smaller than 6MB." },
      { status: 413 },
    );
  }

  const mimeType = file.type || "image/png";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: "Unsupported image format. Use PNG, JPEG, WEBP, or GIF." },
      { status: 415 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (!isValidImageMagicBytes(buffer)) {
    return NextResponse.json(
      { error: "File content does not match a supported image format." },
      { status: 415 },
    );
  }

  const base64 = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const asset = await prisma.asset.create({
    data: {
      userId: session.user.id,
      type: AssetType.IMAGE,
      title: file.name.slice(0, 80),
      url: dataUrl,
      thumbnail: dataUrl,
      metadata: {
        upload: {
          originalName: file.name,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        },
      },
    },
  });

  return NextResponse.json({
    id: asset.id,
    title: asset.title,
    url: asset.url,
    thumbnail: asset.thumbnail ?? asset.url,
    createdAt: asset.createdAt.toISOString(),
    mimeType,
  });
}
