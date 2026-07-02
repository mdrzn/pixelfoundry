import { AssetType } from "@prisma/client";

const IMAGE_MAX_BYTES = 6 * 1024 * 1024; // 6 MB
const AUDIO_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const VIDEO_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

const AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/webm",
]);

const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
]);

export interface UploadClass {
  kind: "image" | "audio" | "video";
  assetType: AssetType;
  maxBytes: number;
}

/**
 * Classify an upload by MIME type. Returns null for disallowed types.
 * Pure and side-effect free so it can be unit tested in isolation.
 */
export function classifyUpload(mimeType: string): UploadClass | null {
  const mime = mimeType.split(";")[0].trim().toLowerCase();

  if (IMAGE_MIME_TYPES.has(mime)) {
    return { kind: "image", assetType: AssetType.IMAGE, maxBytes: IMAGE_MAX_BYTES };
  }

  if (AUDIO_MIME_TYPES.has(mime)) {
    return { kind: "audio", assetType: AssetType.AUDIO, maxBytes: AUDIO_MAX_BYTES };
  }

  if (VIDEO_MIME_TYPES.has(mime)) {
    return { kind: "video", assetType: AssetType.VIDEO, maxBytes: VIDEO_MAX_BYTES };
  }

  return null;
}
