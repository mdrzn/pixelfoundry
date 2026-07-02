import { describe, expect, it } from "vitest";

import { extractVoiceId, getRunner, normalizeStt } from "@/lib/pipeline/runners";

describe("normalizeStt", () => {
  it("passes through a {text, words:[{text,start,end}]} shape", () => {
    const out = normalizeStt({
      text: "hello world",
      words: [
        { text: "hello", start: 0, end: 0.5 },
        { text: "world", start: 0.5, end: 1 },
      ],
    });
    expect(out).toEqual({
      text: "hello world",
      words: [
        { text: "hello", start: 0, end: 0.5, speaker_id: undefined },
        { text: "world", start: 0.5, end: 1, speaker_id: undefined },
      ],
    });
  });

  it("maps a {chunks:[{word,start_time,end_time}]} shape", () => {
    const out = normalizeStt({
      text: "hi there",
      chunks: [
        { word: "hi", start_time: 0, end_time: 0.3 },
        { word: "there", start_time: 0.3, end_time: 0.8 },
      ],
    });
    expect(out.text).toBe("hi there");
    expect(out.words).toEqual([
      { text: "hi", start: 0, end: 0.3, speaker_id: undefined },
      { text: "there", start: 0.3, end: 0.8, speaker_id: undefined },
    ]);
  });

  it("maps a {segments:[...]} shape", () => {
    const out = normalizeStt({
      segments: [{ text: "seg", start: 1, end: 2 }],
    });
    expect(out.text).toBe("");
    expect(out.words).toEqual([{ text: "seg", start: 1, end: 2, speaker_id: undefined }]);
  });

  it("carries speaker ids (speaker_id and speaker)", () => {
    const out = normalizeStt({
      text: "a b",
      words: [
        { text: "a", start: 0, end: 1, speaker_id: "spk_1" },
        { text: "b", start: 1, end: 2, speaker: "spk_2" },
      ],
    });
    expect(out.words[0].speaker_id).toBe("spk_1");
    expect(out.words[1].speaker_id).toBe("spk_2");
  });

  it("coerces string start/end times to numbers", () => {
    const out = normalizeStt({
      chunks: [{ word: "x", start_time: "0.25", end_time: "0.75" }],
    });
    expect(out.words[0].start).toBe(0.25);
    expect(out.words[0].end).toBe(0.75);
  });

  it("returns words:[] when no word array is present", () => {
    expect(normalizeStt({ text: "just text" })).toEqual({ text: "just text", words: [] });
    expect(normalizeStt({})).toEqual({ text: "", words: [] });
  });
});

describe("extractVoiceId", () => {
  it("reads voice_id", () => {
    expect(extractVoiceId({ voice_id: "v1" })).toBe("v1");
  });
  it("reads custom_voice_id", () => {
    expect(extractVoiceId({ custom_voice_id: "v2" })).toBe("v2");
  });
  it("reads id", () => {
    expect(extractVoiceId({ id: "v3" })).toBe("v3");
  });
  it("prefers voice_id over the others", () => {
    expect(extractVoiceId({ voice_id: "v1", custom_voice_id: "v2", id: "v3" })).toBe("v1");
  });
  it("throws when none present", () => {
    expect(() => extractVoiceId({})).toThrow();
  });
});

describe("audio runner dispatch", () => {
  it("returns a function for stt, tts, voice-clone", () => {
    expect(typeof getRunner("stt")).toBe("function");
    expect(typeof getRunner("tts")).toBe("function");
    expect(typeof getRunner("voice-clone")).toBe("function");
  });

  it("still resolves the existing runner types", () => {
    expect(typeof getRunner("llm")).toBe("function");
    expect(typeof getRunner("image")).toBe("function");
    expect(typeof getRunner("video")).toBe("function");
    expect(typeof getRunner("merge")).toBe("function");
  });
});
