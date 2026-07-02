import { describe, expect, it } from "vitest";

import { buildAudioTrimArgs } from "@/lib/pipeline/audio-trim";

describe("buildAudioTrimArgs", () => {
  it("slices from startMs for durationMs, re-encoding to mp3", () => {
    const args = buildAudioTrimArgs("/in.mp3", 1500, 2000, "/out.mp3");
    expect(args).toEqual([
      "-y",
      "-ss",
      "1.500",
      "-t",
      "2.000",
      "-i",
      "/in.mp3",
      "-c:a",
      "libmp3lame",
      "/out.mp3",
    ]);
  });

  it("formats 0ms start as 0.000", () => {
    const args = buildAudioTrimArgs("/in.mp3", 0, 500, "/out.mp3");
    const ssIdx = args.indexOf("-ss");
    expect(args[ssIdx + 1]).toBe("0.000");
    const tIdx = args.indexOf("-t");
    expect(args[tIdx + 1]).toBe("0.500");
  });

  it("places -ss before -i (fast seek) and outFile last", () => {
    const args = buildAudioTrimArgs("/in.mp3", 250, 750, "/out.mp3");
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
    expect(args[args.length - 1]).toBe("/out.mp3");
    expect(args[args.indexOf("-t") + 1]).toBe("0.750");
    expect(args[args.indexOf("-ss") + 1]).toBe("0.250");
  });
});
