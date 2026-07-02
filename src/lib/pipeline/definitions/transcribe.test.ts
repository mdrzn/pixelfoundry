import { describe, expect, it } from "vitest";
import { PipelineType } from "@prisma/client";
import { transcribeDefinition } from "./transcribe";
import { getDefinition } from "./index";
import type { PlanContext } from "../types";

const ctx: PlanContext = {
  cost: (t: string) => (({ stt: 2 }) as Record<string, number>)[t] ?? 0,
};

const params = {
  audioUrl: "https://cdn/audio.mp3",
  audioAssetId: "asset-1",
  sttModelId: "stt-id",
};

describe("transcribeDefinition.plan", () => {
  it("returns exactly one stt step keyed 'transcribe'", () => {
    const steps = transcribeDefinition.plan(params, ctx);
    expect(steps).toHaveLength(1);
    const [step] = steps;
    expect(step.key).toBe("transcribe");
    expect(step.stepType).toBe("stt");
    expect(step.dependsOn).toEqual([]);
    expect(step.providerModelId).toBe("stt-id");
    expect(step.cost).toBe(2);
    expect(step.input).toEqual({ audio_url: "https://cdn/audio.mp3" });
  });
});

describe("transcribeDefinition.expand", () => {
  it("returns [] (single-step pipeline)", () => {
    expect(
      transcribeDefinition.expand({ key: "transcribe", output: {} }, params, ctx),
    ).toEqual([]);
  });
});

describe("transcribeDefinition.estimateUpperBound", () => {
  it("equals the stt model cost", () => {
    expect(transcribeDefinition.estimateUpperBound(params, ctx)).toBe(2);
  });
});

describe("getDefinition", () => {
  it("returns the Transcribe definition", () => {
    expect(getDefinition(PipelineType.TRANSCRIBE)).toBe(transcribeDefinition);
  });
});
