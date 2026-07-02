import { describe, expect, it } from "vitest";
import { PipelineType } from "@prisma/client";
import { dubbingDefinition } from "./dubbing";
import { getDefinition } from "./index";
import type { PlanContext, PlannedStep } from "../types";

const COSTS: Record<string, number> = {
  "extract-audio": 1,
  stt: 2,
  llm: 1,
  "voice-clone": 5,
  tts: 3,
  "audio-merge": 4,
  "mux-audio": 6,
  lipsync: 20,
};

const ctx: PlanContext = {
  cost: (t: string) => COSTS[t] ?? 0,
};

const baseParams = {
  videoUrl: "https://example.com/clip.mp4",
  videoAssetId: "video-asset-1",
  targetLanguage: "Spanish",
  lipsync: false,
  sttModelId: "stt-model",
  ttsModelId: "tts-model",
  cloneModelId: "clone-model",
  lipsyncModelId: "lipsync-model",
  muxModelId: "mux-model",
  llmModelId: "llm-model",
};

const lipsyncParams = { ...baseParams, lipsync: true };

function byKey(steps: PlannedStep[]): Record<string, PlannedStep> {
  return Object.fromEntries(steps.map((s) => [s.key, s]));
}

describe("dubbingDefinition.plan", () => {
  it("returns a single 'extract' extract-audio step reading the source video asset", () => {
    const steps = dubbingDefinition.plan(baseParams, ctx);
    expect(steps).toHaveLength(1);
    const [step] = steps;
    expect(step.key).toBe("extract");
    expect(step.stepType).toBe("extract-audio");
    expect(step.dependsOn).toEqual([]);
    expect(step.providerModelId).toBeUndefined();
    expect(step.cost).toBe(1);
    expect(step.input).toEqual({ videoAssetId: "video-asset-1" });
  });
});

describe("dubbingDefinition.expand after extract", () => {
  it("yields transcribe (stt) + clone (voice-clone), both from the extracted audio", () => {
    const steps = dubbingDefinition.expand({ key: "extract", output: {} }, baseParams, ctx);
    expect(steps).toHaveLength(2);
    const map = byKey(steps);

    const transcribe = map["transcribe"];
    expect(transcribe.stepType).toBe("stt");
    expect(transcribe.dependsOn).toEqual(["extract"]);
    expect(transcribe.providerModelId).toBe("stt-model");
    expect(transcribe.cost).toBe(2);
    expect(transcribe.input).toEqual({ audio_url: { $asset: "extract" } });

    const clone = map["clone"];
    expect(clone.stepType).toBe("voice-clone");
    expect(clone.dependsOn).toEqual(["extract"]);
    expect(clone.providerModelId).toBe("clone-model");
    expect(clone.cost).toBe(5);
    expect(clone.input).toEqual({ audio_url: { $asset: "extract" } });
  });
});

describe("dubbingDefinition.expand after transcribe", () => {
  it("yields a translate (llm) step referencing the transcript context", () => {
    const steps = dubbingDefinition.expand({ key: "transcribe", output: {} }, baseParams, ctx);
    expect(steps).toHaveLength(1);
    const translate = steps[0];
    expect(translate.key).toBe("translate");
    expect(translate.stepType).toBe("llm");
    expect(translate.dependsOn).toEqual(["transcribe"]);
    expect(translate.providerModelId).toBe("llm-model");
    expect(translate.cost).toBe(1);
    const input = translate.input as Record<string, unknown>;
    expect(input.context).toEqual({ $data: "transcribe" });
    expect(typeof input.prompt).toBe("string");
    expect(input.prompt as string).toContain("Spanish");
    expect(input.llmModelId).toBe("llm-model");
  });
});

describe("dubbingDefinition.expand after translate (lipsync=false)", () => {
  it("fans out per-segment tts + a dub merge + a mux sink", () => {
    const steps = dubbingDefinition.expand(
      { key: "translate", output: { totalMs: 5000, segments: [{}, {}] } },
      baseParams,
      ctx,
    );
    // 2 tts + dub + mux
    expect(steps).toHaveLength(4);
    const map = byKey(steps);

    for (let i = 0; i < 2; i++) {
      const seg = map[`seg:${i}:tts`];
      expect(seg.stepType).toBe("tts");
      expect(seg.dependsOn).toEqual(["clone"]);
      expect(seg.providerModelId).toBe("tts-model");
      const input = seg.input as Record<string, unknown>;
      expect(input.text).toEqual({ $data: "translate", path: `segments[${i}].text` });
      expect(input.voice_id).toEqual({ $data: "clone", path: "voice_id" });
      expect(input.language_boost).toBe("Spanish");
    }

    const dub = map["dub"];
    expect(dub.stepType).toBe("audio-merge");
    expect(dub.dependsOn).toEqual(["seg:0:tts", "seg:1:tts"]);
    const dInput = dub.input as { segments: unknown[]; totalMs: unknown };
    expect(dInput.totalMs).toEqual({ $data: "translate", path: "totalMs" });
    expect(dInput.segments).toEqual([
      { startMs: { $data: "translate", path: "segments[0].startMs" }, assetId: { $assetId: "seg:0:tts" } },
      { startMs: { $data: "translate", path: "segments[1].startMs" }, assetId: { $assetId: "seg:1:tts" } },
    ]);

    // mux is the sink: mux-audio, deps [dub], video_url param + dub audio
    const mux = map["mux"];
    expect(mux.stepType).toBe("mux-audio");
    expect(mux.dependsOn).toEqual(["dub"]);
    expect(mux.providerModelId).toBe("mux-model");
    expect(mux.cost).toBe(6);
    expect(mux.input).toEqual({
      video_url: "https://example.com/clip.mp4",
      audio_url: { $asset: "dub" },
    });
    // no lipsync step in the non-lipsync path
    expect(map["lipsync"]).toBeUndefined();
  });
});

describe("dubbingDefinition.expand after translate (lipsync=true)", () => {
  it("fans out per-segment tts + a dub merge + a lipsync sink", () => {
    const steps = dubbingDefinition.expand(
      { key: "translate", output: { totalMs: 5000, segments: [{}, {}] } },
      lipsyncParams,
      ctx,
    );
    // 2 tts + dub + lipsync
    expect(steps).toHaveLength(4);
    const map = byKey(steps);

    expect(map["dub"].stepType).toBe("audio-merge");

    const lipsync = map["lipsync"];
    expect(lipsync.stepType).toBe("lipsync");
    expect(lipsync.dependsOn).toEqual(["dub"]);
    expect(lipsync.providerModelId).toBe("lipsync-model");
    expect(lipsync.cost).toBe(20);
    expect(lipsync.input).toEqual({
      video_url: "https://example.com/clip.mp4",
      audio_url: { $asset: "dub" },
    });
    // no mux step in the lipsync path
    expect(map["mux"]).toBeUndefined();
  });
});

describe("dubbingDefinition.expand caps segments", () => {
  it("caps per-segment tts at MAX_SEGMENTS (40)", () => {
    const segments = Array.from({ length: 50 }, () => ({}));
    const steps = dubbingDefinition.expand(
      { key: "translate", output: { totalMs: 1000, segments } },
      baseParams,
      ctx,
    );
    expect(steps.filter((s) => s.stepType === "tts")).toHaveLength(40);
    expect(steps.filter((s) => s.stepType === "audio-merge")).toHaveLength(1);
    expect(steps.filter((s) => s.stepType === "mux-audio")).toHaveLength(1);
    expect(steps).toHaveLength(42);
  });
});

describe("dubbingDefinition.expand returns [] for other keys", () => {
  it("returns [] for a key that is not part of the graph", () => {
    expect(dubbingDefinition.expand({ key: "clone", output: {} }, baseParams, ctx)).toEqual([]);
    expect(dubbingDefinition.expand({ key: "dub", output: {} }, baseParams, ctx)).toEqual([]);
    expect(dubbingDefinition.expand({ key: "other", output: {} }, baseParams, ctx)).toEqual([]);
  });
});

describe("dubbingDefinition.estimateUpperBound", () => {
  it("(lipsync=false) = extract + stt + llm + clone + 40*tts + merge + mux", () => {
    // 1 + 2 + 1 + 5 + 40*3 + 4 + 6 = 139
    expect(dubbingDefinition.estimateUpperBound(baseParams, ctx)).toBe(139);
  });

  it("(lipsync=true) = extract + stt + llm + clone + 40*tts + merge + lipsync", () => {
    // 1 + 2 + 1 + 5 + 40*3 + 4 + 20 = 153
    expect(dubbingDefinition.estimateUpperBound(lipsyncParams, ctx)).toBe(153);
  });
});

describe("getDefinition", () => {
  it("returns the Dubbing definition", () => {
    expect(getDefinition(PipelineType.DUBBING)).toBe(dubbingDefinition);
  });
});
