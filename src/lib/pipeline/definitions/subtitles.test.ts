import { describe, expect, it } from "vitest";
import { PipelineType } from "@prisma/client";
import { subtitlesDefinition } from "./subtitles";
import { getDefinition } from "./index";
import type { PlanContext } from "../types";

const ctx: PlanContext = {
  cost: (t: string) => (({ "auto-subtitle": 4 }) as Record<string, number>)[t] ?? 0,
};

const params = {
  videoUrl: "https://cdn/video.mp4",
  videoAssetId: "asset-1",
  subtitleModelId: "sub-id",
};

describe("subtitlesDefinition.plan", () => {
  it("returns exactly one auto-subtitle step keyed 'subtitle'", () => {
    const steps = subtitlesDefinition.plan(params, ctx);
    expect(steps).toHaveLength(1);
    const [step] = steps;
    expect(step.key).toBe("subtitle");
    expect(step.stepType).toBe("auto-subtitle");
    expect(step.dependsOn).toEqual([]);
    expect(step.providerModelId).toBe("sub-id");
    expect(step.cost).toBe(4);
    expect(step.input).toEqual({ video_url: "https://cdn/video.mp4" });
  });

  it("includes the language when a target language is given", () => {
    const [step] = subtitlesDefinition.plan(
      { ...params, targetLanguage: "es" },
      ctx,
    );
    expect(step.input).toEqual({ video_url: "https://cdn/video.mp4", language: "es" });
  });
});

describe("subtitlesDefinition.expand", () => {
  it("returns [] (single-step pipeline)", () => {
    expect(
      subtitlesDefinition.expand({ key: "subtitle", output: {} }, params, ctx),
    ).toEqual([]);
  });
});

describe("subtitlesDefinition.estimateUpperBound", () => {
  it("equals the auto-subtitle model cost", () => {
    expect(subtitlesDefinition.estimateUpperBound(params, ctx)).toBe(4);
  });
});

describe("getDefinition", () => {
  it("returns the Subtitles definition", () => {
    expect(getDefinition(PipelineType.SUBTITLES)).toBe(subtitlesDefinition);
  });
});
