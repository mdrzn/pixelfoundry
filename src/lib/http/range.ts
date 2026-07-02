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
