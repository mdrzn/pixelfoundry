import { describe, expect, it } from "vitest";

import { buildAudioMergeArgs } from "@/lib/pipeline/audio-merge";

describe("buildAudioMergeArgs", () => {
  it("lays 2 segments (0ms, 1500ms) onto a 3000ms bed", () => {
    const args = buildAudioMergeArgs(
      [
        { startMs: 0, file: "/a.mp3" },
        { startMs: 1500, file: "/b.mp3" },
      ],
      3000,
      "/tmp/m.mp3",
    );

    // three -i: silent bed + 2 segment files
    const inputCount = args.filter((a) => a === "-i").length;
    expect(inputCount).toBe(3);
    expect(args).toContain("anullsrc=r=44100:cl=stereo");
    expect(args).toContain("/a.mp3");
    expect(args).toContain("/b.mp3");

    const fcIdx = args.indexOf("-filter_complex");
    expect(fcIdx).toBeGreaterThan(-1);
    const filter = args[fcIdx + 1];
    expect(filter).toContain("adelay=0|0");
    expect(filter).toContain("adelay=1500|1500");
    expect(filter).toContain("amix=inputs=3");
    expect(filter).toContain("normalize=0");

    // -map [out]
    const mapIdx = args.indexOf("-map");
    expect(mapIdx).toBeGreaterThan(-1);
    expect(args[mapIdx + 1]).toBe("[out]");

    // -t 3.000 present and bounds both bed and output
    expect(args.filter((a) => a === "3.000").length).toBe(2);
    const tIdxs = args.reduce<number[]>((acc, a, i) => (a === "-t" ? [...acc, i] : acc), []);
    expect(tIdxs.length).toBe(2);
    for (const i of tIdxs) expect(args[i + 1]).toBe("3.000");

    // outFile is last
    expect(args[args.length - 1]).toBe("/tmp/m.mp3");
  });

  it("rounds fractional startMs (1500.7 -> 1501)", () => {
    const args = buildAudioMergeArgs([{ startMs: 1500.7, file: "/a.mp3" }], 3000, "/tmp/m.mp3");
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("adelay=1501|1501");
  });

  it("clamps negative startMs to 0", () => {
    const args = buildAudioMergeArgs([{ startMs: -250, file: "/a.mp3" }], 3000, "/tmp/m.mp3");
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("adelay=0|0");
  });

  it("produces silent-bed-only args for empty segments", () => {
    const args = buildAudioMergeArgs([], 2500, "/tmp/m.mp3");
    expect(args).not.toContain("-filter_complex");
    const mapIdx = args.indexOf("-map");
    expect(args[mapIdx + 1]).toBe("0:a");
    // -t bounds bed AND output
    expect(args.filter((a) => a === "2.500").length).toBe(2);
    // only one input (the bed)
    expect(args.filter((a) => a === "-i").length).toBe(1);
    expect(args[args.length - 1]).toBe("/tmp/m.mp3");
  });

  it("uses amix=inputs=2 for a single segment at 0", () => {
    const args = buildAudioMergeArgs([{ startMs: 0, file: "/a.mp3" }], 1000, "/tmp/m.mp3");
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("amix=inputs=2");
    expect(filter).toContain("adelay=0|0");
  });
});
