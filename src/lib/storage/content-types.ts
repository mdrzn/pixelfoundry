export const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": "png",
  // Both JPEG aliases map to the "jpg" extension. Order matters: "image/jpeg"
  // must come LAST so the auto-derived inverse map (last-write-wins) resolves
  // the "jpg" extension back to the canonical "image/jpeg".
  "image/jpg": "jpg",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  // "audio/webm" and "video/webm" share the "webm" extension. "video/webm"
  // must come LAST so the inverse map (last-write-wins) keeps resolving the
  // "webm" extension back to the canonical "video/webm" (unchanged behavior).
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  // Both WAV aliases map to the "wav" extension. Order matters: "audio/wav"
  // must come LAST so the auto-derived inverse map (last-write-wins) resolves
  // the "wav" extension back to the canonical "audio/wav".
  "audio/x-wav": "wav",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
};

export function extFromContentType(ct: string): string {
  return EXT_BY_CONTENT_TYPE[ct.split(";")[0].trim().toLowerCase()] ?? "bin";
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_BY_CONTENT_TYPE).map(([ct, ext]) => [ext, ct]),
);

export function contentTypeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream";
}
