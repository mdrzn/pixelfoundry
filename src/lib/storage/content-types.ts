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
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
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
