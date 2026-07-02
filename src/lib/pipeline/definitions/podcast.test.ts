import { describe, expect, it } from "vitest";
import { PipelineType } from "@prisma/client";

import { podcastDefinition } from "./podcast";
import { getDefinition } from "./index";
import type { PlanContext } from "../types";

const COSTS: Record<string, number> = {
  llm: 1,
  image: 6,
  tts: 4,
  stt: 3,
  "trim-audio": 0,
  lipsync: 20,
  merge: 2,
  "mux-audio": 2,
};

const ctx: PlanContext = { cost: (t: string) => COSTS[t] ?? 0 };

const baseParams = {
  topic: "The future of home robotics",
  speaker1: "Ada",
  speaker2: "Grace",
  scriptModelId: "script",
  imageModelId: "img",
  ttsModelId: "tts-id",
  sttModelId: "stt-id",
  lipsyncModelId: "lip",
};

// two speakers, alternating -> 2 grouped segments
const transcribeOutput = {
  text: "hi there",
  words: [
    { text: "hi", start: 0, end: 1, speaker_id: "0" },
    { text: "there", start: 1, end: 2, speaker_id: "1" },
  ],
};

describe("podcastDefinition.plan", () => {
  it("returns exactly one llm step keyed 'script'", () => {
    const steps = podcastDefinition.plan(baseParams, ctx);
    expect(steps).toHaveLength(1);
    const [step] = steps;
    expect(step.key).toBe("script");
    expect(step.stepType).toBe("llm");
    expect(step.dependsOn).toEqual([]);
    expect(step.providerModelId).toBe("script");
    expect(step.cost).toBe(1);
  });

  it("formats a provided script instead of generating a topic conversation", () => {
    const withScript = { ...baseParams, script: "Ada: Hello. Grace: Hi." };
    const [step] = podcastDefinition.plan(withScript, ctx);
    const input = step.input as { prompt: string };
    expect(input.prompt).toContain("Ada: Hello. Grace: Hi.");
  });
});

describe("podcastDefinition.expand(script)", () => {
  it("fans out portrait:0, portrait:1, tts", () => {
    const steps = podcastDefinition.expand(
      { key: "script", output: { lines: [], ttsScript: "..." } },
      baseParams,
      ctx,
    );
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(Object.keys(byKey).sort()).toEqual(["portrait:0", "portrait:1", "tts"].sort());

    expect(byKey["portrait:0"].stepType).toBe("image");
    expect(byKey["portrait:1"].stepType).toBe("image");
    expect(byKey["tts"].stepType).toBe("tts");

    expect(byKey["portrait:0"].providerModelId).toBe("img");
    expect(byKey["portrait:1"].providerModelId).toBe("img");
    expect(byKey["tts"].providerModelId).toBe("tts-id");

    // portrait prompts name the right speaker
    expect(String((byKey["portrait:0"].input as { prompt: string }).prompt)).toContain("Ada");
    expect(String((byKey["portrait:1"].input as { prompt: string }).prompt)).toContain("Grace");

    // tts pulls ttsScript from the script data
    expect((byKey["tts"].input as { text: unknown }).text).toEqual({
      $data: "script",
      path: "ttsScript",
    });
    expect(byKey["tts"].dependsOn).toEqual([]);
  });
});

describe("podcastDefinition.expand(tts)", () => {
  it("adds a transcribe step depending on tts", () => {
    const steps = podcastDefinition.expand({ key: "tts", output: null }, baseParams, ctx);
    expect(steps).toHaveLength(1);
    const [step] = steps;
    expect(step.key).toBe("transcribe");
    expect(step.stepType).toBe("stt");
    expect(step.dependsOn).toEqual(["tts"]);
    expect(step.providerModelId).toBe("stt-id");
    expect((step.input as { audio_url: unknown }).audio_url).toEqual({ $asset: "tts" });
  });
});

describe("podcastDefinition.expand(transcribe)", () => {
  const steps = podcastDefinition.expand(
    { key: "transcribe", output: transcribeOutput },
    baseParams,
    ctx,
  );
  const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));

  it("builds per-segment trim-audio + lipsync, plus concat + mux", () => {
    expect(Object.keys(byKey).sort()).toEqual(
      [
        "seg:0:audio",
        "seg:0:lipsync",
        "seg:1:audio",
        "seg:1:lipsync",
        "concat",
        "mux",
      ].sort(),
    );
  });

  it("trim-audio slices the tts asset by segment start/duration", () => {
    const a0 = byKey["seg:0:audio"];
    expect(a0.stepType).toBe("trim-audio");
    expect(a0.dependsOn).toEqual(["tts"]);
    expect(a0.input).toEqual({
      assetId: { $assetId: "tts" },
      startMs: 0,
      durationMs: 1000,
    });
    const a1 = byKey["seg:1:audio"];
    expect(a1.input).toEqual({
      assetId: { $assetId: "tts" },
      startMs: 1000,
      durationMs: 1000,
    });
  });

  it("maps each segment's speaker to the right portrait", () => {
    const l0 = byKey["seg:0:lipsync"];
    expect(l0.stepType).toBe("lipsync");
    expect(l0.providerModelId).toBe("lip");
    // segment 0 is speaker "0" -> portrait:0
    expect(l0.dependsOn.sort()).toEqual(["portrait:0", "seg:0:audio"].sort());
    expect((l0.input as { image_url: unknown }).image_url).toEqual({ $asset: "portrait:0" });
    expect((l0.input as { audio_url: unknown }).audio_url).toEqual({ $asset: "seg:0:audio" });

    const l1 = byKey["seg:1:lipsync"];
    // segment 1 is speaker "1" -> portrait:1
    expect(l1.dependsOn.sort()).toEqual(["portrait:1", "seg:1:audio"].sort());
    expect((l1.input as { image_url: unknown }).image_url).toEqual({ $asset: "portrait:1" });
  });

  it("concats all lipsync clips (keyed 'concat', stepType merge)", () => {
    const c = byKey["concat"];
    expect(c.stepType).toBe("merge");
    expect(c.dependsOn).toEqual(["seg:0:lipsync", "seg:1:lipsync"]);
    expect((c.input as { videos: unknown[] }).videos).toEqual([
      { $assetId: "seg:0:lipsync" },
      { $assetId: "seg:1:lipsync" },
    ]);
  });

  it("mux re-attaches the full tts track and is the sink terminal", () => {
    const m = byKey["mux"];
    expect(m.stepType).toBe("mux-audio");
    expect(m.dependsOn).toEqual(["concat", "tts"]);
    expect((m.input as { video_url: unknown }).video_url).toEqual({ $asset: "concat" });
    expect((m.input as { audio_url: unknown }).audio_url).toEqual({ $asset: "tts" });

    const dependedOn = new Set<string>();
    for (const s of steps) for (const d of s.dependsOn) dependedOn.add(d);
    const sinks = steps.filter((s) => !dependedOn.has(s.key));
    expect(sinks.map((s) => s.key)).toEqual(["mux"]);
  });

  it("caps segments at MAX_SEGMENTS (30)", () => {
    const words = Array.from({ length: 60 }, (_, i) => ({
      text: `w${i}`,
      start: i,
      end: i + 1,
      speaker_id: String(i % 2),
    }));
    const many = podcastDefinition.expand(
      { key: "transcribe", output: { text: "", words } },
      baseParams,
      ctx,
    );
    expect(many.filter((s) => s.stepType === "lipsync")).toHaveLength(30);
    expect(many.filter((s) => s.stepType === "trim-audio")).toHaveLength(30);
  });

  it("returns [] for an unrelated completed step", () => {
    expect(podcastDefinition.expand({ key: "seg:0:audio", output: {} }, baseParams, ctx)).toEqual([]);
  });
});

describe("podcastDefinition.estimateUpperBound", () => {
  it("sums llm + 2*image + tts + stt + 30*(trim-audio + lipsync) + merge + mux", () => {
    // 1 + 2*6 + 4 + 3 + 30*(0+20) + 2 + 2 = 1 + 12 + 4 + 3 + 600 + 2 + 2 = 624
    expect(podcastDefinition.estimateUpperBound(baseParams, ctx)).toBe(624);
  });
});

describe("getDefinition", () => {
  it("returns the Podcast definition", () => {
    expect(getDefinition(PipelineType.PODCAST)).toBe(podcastDefinition);
  });
});
