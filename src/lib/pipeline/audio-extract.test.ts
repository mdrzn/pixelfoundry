import { describe, expect, it } from "vitest";

import { buildAudioExtractArgs } from "@/lib/pipeline/audio-extract";

describe("buildAudioExtractArgs", () => {
  it("extracts audio to mp3, dropping video", () => {
    const args = buildAudioExtractArgs("/in.mp4", "/out.mp3");
    expect(args).toEqual([
      "-y",
      "-i",
      "/in.mp4",
      "-vn",
      "-acodec",
      "libmp3lame",
      "/out.mp3",
    ]);
  });

  it("places -i before -vn and outFile last", () => {
    const args = buildAudioExtractArgs("/clip.webm", "/audio.mp3");
    expect(args.indexOf("-i")).toBeLessThan(args.indexOf("-vn"));
    expect(args[args.length - 1]).toBe("/audio.mp3");
    expect(args[args.indexOf("-i") + 1]).toBe("/clip.webm");
  });
});
