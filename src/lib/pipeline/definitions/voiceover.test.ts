import { describe, expect, it } from "vitest";
import { PipelineType } from "@prisma/client";
import { voiceoverDefinition } from "./voiceover";
import { getDefinition } from "./index";
import type { PlanContext, PlannedStep } from "../types";

const COSTS: Record<string, number> = {
  stt: 2,
  llm: 1,
  "voice-clone": 5,
  tts: 3,
  "audio-merge": 4,
};

const ctx: PlanContext = {
  cost: (t: string) => COSTS[t] ?? 0,
};

const baseParams = {
  audioUrl: "https://example.com/audio.mp3",
  targetLanguage: "Spanish",
  sttModelId: "stt-model",
  ttsModelId: "tts-model",
  cloneModelId: "clone-model",
  llmModelId: "llm-model",
};

function byKey(steps: PlannedStep[]): Record<string, PlannedStep> {
  return Object.fromEntries(steps.map((s) => [s.key, s]));
}

describe("voiceoverDefinition.plan", () => {
  it("returns a single 'transcribe' stt step", () => {
    const steps = voiceoverDefinition.plan(baseParams, ctx);
    expect(steps).toHaveLength(1);
    const [step] = steps;
    expect(step.key).toBe("transcribe");
    expect(step.stepType).toBe("stt");
    expect(step.dependsOn).toEqual([]);
    expect(step.providerModelId).toBe("stt-model");
    expect(step.cost).toBe(2);
    expect(step.input).toEqual({ audio_url: baseParams.audioUrl });
  });
});

describe("voiceoverDefinition.estimateUpperBound", () => {
  it("is stt + llm + clone + 40*tts + merge with fixed costs", () => {
    // 2 + 1 + 5 + 40*3 + 4 = 132
    expect(voiceoverDefinition.estimateUpperBound(baseParams, ctx)).toBe(132);
  });
});

describe("voiceoverDefinition.expand", () => {
  it("returns [] for a key that is neither transcribe nor translate", () => {
    expect(voiceoverDefinition.expand({ key: "clone", output: {} }, baseParams, ctx)).toEqual([]);
    expect(voiceoverDefinition.expand({ key: "other", output: {} }, baseParams, ctx)).toEqual([]);
  });

  it("after transcribe yields translate + clone", () => {
    const steps = voiceoverDefinition.expand({ key: "transcribe", output: {} }, baseParams, ctx);
    expect(steps).toHaveLength(2);
    const map = byKey(steps);

    const translate = map["translate"];
    expect(translate.stepType).toBe("llm");
    expect(translate.dependsOn).toEqual(["transcribe"]);
    expect(translate.providerModelId).toBe("llm-model");
    expect(translate.cost).toBe(1);
    const tInput = translate.input as Record<string, unknown>;
    expect(tInput.context).toEqual({ $data: "transcribe" });
    expect(typeof tInput.prompt).toBe("string");
    expect(tInput.prompt as string).toContain("Spanish");

    const clone = map["clone"];
    expect(clone.stepType).toBe("voice-clone");
    expect(clone.dependsOn).toEqual([]);
    expect(clone.providerModelId).toBe("clone-model");
    expect(clone.cost).toBe(5);
    expect((clone.input as Record<string, unknown>).audio_url).toBe(baseParams.audioUrl);
  });

  it("after translate fans out per-segment tts plus a merge", () => {
    const steps = voiceoverDefinition.expand(
      { key: "translate", output: { totalMs: 5000, segments: [{}, {}, {}] } },
      baseParams,
      ctx,
    );
    expect(steps).toHaveLength(4);
    const map = byKey(steps);

    for (let i = 0; i < 3; i++) {
      const seg = map[`seg:${i}:tts`];
      expect(seg.stepType).toBe("tts");
      expect(seg.dependsOn).toEqual(["clone"]);
      expect(seg.providerModelId).toBe("tts-model");
      expect(seg.cost).toBe(3);
      const input = seg.input as Record<string, unknown>;
      expect(input.text).toEqual({ $data: "translate", path: `segments[${i}].text` });
      expect(input.voice_id).toEqual({ $data: "clone", path: "voice_id" });
      expect(input.language_boost).toBe("Spanish");
    }

    const merge = map["merge"];
    expect(merge.stepType).toBe("audio-merge");
    expect(merge.dependsOn).toEqual(["seg:0:tts", "seg:1:tts", "seg:2:tts"]);
    expect(merge.cost).toBe(4);
    const mInput = merge.input as { segments: unknown[]; totalMs: unknown };
    expect(mInput.totalMs).toEqual({ $data: "translate", path: "totalMs" });
    expect(mInput.segments).toEqual([
      { startMs: { $data: "translate", path: "segments[0].startMs" }, assetId: { $assetId: "seg:0:tts" } },
      { startMs: { $data: "translate", path: "segments[1].startMs" }, assetId: { $assetId: "seg:1:tts" } },
      { startMs: { $data: "translate", path: "segments[2].startMs" }, assetId: { $assetId: "seg:2:tts" } },
    ]);
  });

  it("caps segments at MAX_SEGMENTS (40)", () => {
    const segments = Array.from({ length: 50 }, () => ({}));
    const steps = voiceoverDefinition.expand(
      { key: "translate", output: { totalMs: 1000, segments } },
      baseParams,
      ctx,
    );
    expect(steps.filter((s) => s.stepType === "tts")).toHaveLength(40);
    expect(steps.filter((s) => s.stepType === "audio-merge")).toHaveLength(1);
    expect(steps).toHaveLength(41);
  });
});

describe("getDefinition", () => {
  it("returns the Voice-over definition", () => {
    expect(getDefinition(PipelineType.VOICEOVER)).toBe(voiceoverDefinition);
  });
});
