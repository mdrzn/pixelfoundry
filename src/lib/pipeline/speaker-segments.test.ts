import { describe, expect, it } from "vitest";

import { groupSpeakerSegments } from "@/lib/pipeline/speaker-segments";

describe("groupSpeakerSegments", () => {
  it("returns [] for no words", () => {
    expect(groupSpeakerSegments([])).toEqual([]);
  });

  it("splits alternating speakers into separate segments", () => {
    const segs = groupSpeakerSegments([
      { text: "hi", start: 0, end: 0.5, speaker_id: "0" },
      { text: "there", start: 0.5, end: 1, speaker_id: "1" },
    ]);
    expect(segs).toEqual([
      { speaker: "0", startMs: 0, endMs: 500, text: "hi" },
      { speaker: "1", startMs: 500, endMs: 1000, text: "there" },
    ]);
  });

  it("merges consecutive words from the same speaker", () => {
    const segs = groupSpeakerSegments([
      { text: "hello", start: 0, end: 0.5, speaker_id: "0" },
      { text: "world", start: 0.5, end: 1, speaker_id: "0" },
      { text: "yo", start: 1, end: 1.5, speaker_id: "1" },
      { text: "hey", start: 1.5, end: 2, speaker_id: "1" },
    ]);
    expect(segs).toEqual([
      { speaker: "0", startMs: 0, endMs: 1000, text: "hello world" },
      { speaker: "1", startMs: 1000, endMs: 2000, text: "yo hey" },
    ]);
  });

  it("defaults missing speaker_id to '0' and merges them together", () => {
    const segs = groupSpeakerSegments([
      { text: "a", start: 0, end: 1 },
      { text: "b", start: 1, end: 2 },
    ]);
    expect(segs).toEqual([{ speaker: "0", startMs: 0, endMs: 2000, text: "a b" }]);
  });

  it("uses first word start and last word end for a merged segment", () => {
    const segs = groupSpeakerSegments([
      { text: "one", start: 0.25, end: 0.75, speaker_id: "0" },
      { text: "two", start: 0.75, end: 1.4, speaker_id: "0" },
    ]);
    expect(segs).toEqual([{ speaker: "0", startMs: 250, endMs: 1400, text: "one two" }]);
  });
});
