import { Buffer } from "node:buffer";

import { NextRequest, NextResponse } from "next/server";
import { AssetType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { assertSafeUrl } from "@/lib/url-validation";

const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/;

const DEFAULT_EXTENSION: Record<AssetType, string> = {
  [AssetType.IMAGE]: "png",
  [AssetType.VIDEO]: "mp4",
  [AssetType.AUDIO]: "mp3",
};

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-z0-9\-\._]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
    || "asset";
}

function extensionFromMime(mime: string | null, fallback: AssetType) {
  if (!mime) {
    return DEFAULT_EXTENSION[fallback];
  }

  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("webm")) return "webm";

  return DEFAULT_EXTENSION[fallback];
}

async function downloadFromUrl(url: string) {
  assertSafeUrl(url);
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to download asset (status ${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type"),
  };
}

function downloadFromDataUrl(url: string) {
  const match = DATA_URL_PATTERN.exec(url);
  if (!match || match.length < 3) {
    throw new Error("Malformed data URL.");
  }
  const mime = match[1] ?? null;
  const data = match[2] ?? null;
  if (!data) {
    throw new Error("Malformed data URL.");
  }
  return {
    buffer: Buffer.from(data, "base64"),
    contentType: mime ?? null,
  };
}

export async function GET(
  _request: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { params }: any,
) {
  void _request;
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const asset = await prisma.asset.findFirst({
    where: {
      id: params.assetId,
      userId: session.user.id,
    },
    select: {
      id: true,
      title: true,
      type: true,
      url: true,
      metadata: true,
      jobOutput: {
        select: {
          id: true,
        },
        take: 1,
      },
    },
  });

  if (!asset) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }

  let download;
  try {
    if (asset.url.startsWith("data:")) {
      download = downloadFromDataUrl(asset.url);
    } else {
      download = await downloadFromUrl(asset.url);
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to download asset.",
      },
      { status: 502 },
    );
  }

  const baseName =
    (asset.title && sanitizeFileName(asset.title)) ||
    (asset.jobOutput[0]?.id ? `job-${asset.jobOutput[0].id}` : `asset-${asset.id}`);

  const extension = extensionFromMime(download.contentType, asset.type);
  const fileName = `${baseName}.${extension}`;

  return new NextResponse(download.buffer, {
    headers: {
      "Content-Type": download.contentType ?? (asset.type === AssetType.IMAGE ? "image/png" : "video/mp4"),
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
