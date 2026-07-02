import { NextRequest } from "next/server";
import { storage } from "@/lib/storage";
import { parseRange } from "@/lib/http/range";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");

  // storage.read throws on malformed keys — treat those as 404, never 500.
  let obj: { data: Buffer; contentType: string } | null;
  try {
    obj = await storage.read(key);
  } catch {
    return new Response("Not found", { status: 404 });
  }
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
    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Content-Length": String(chunk.length),
      },
    });
  }
  return new Response(new Uint8Array(obj.data), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
