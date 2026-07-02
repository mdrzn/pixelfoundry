import { PipelineType } from "@prisma/client";
import type { PipelineDefinition } from "../types";

type SubtitlesParams = {
  videoUrl: string;
  videoAssetId: string;
  targetLanguage?: string;
  subtitleModelId: string;
};

export const subtitlesDefinition: PipelineDefinition = {
  type: PipelineType.SUBTITLES,

  plan(params, ctx) {
    const p = params as SubtitlesParams;
    return [
      {
        key: "subtitle",
        name: "Generate subtitles",
        stepType: "auto-subtitle",
        dependsOn: [],
        input: {
          video_url: p.videoUrl,
          ...(p.targetLanguage ? { language: p.targetLanguage } : {}),
        },
        providerModelId: p.subtitleModelId,
        cost: ctx.cost("auto-subtitle", p.subtitleModelId),
      },
    ];
  },

  expand() {
    return [];
  },

  estimateUpperBound(params, ctx) {
    const p = params as SubtitlesParams;
    return ctx.cost("auto-subtitle", p.subtitleModelId);
  },
};
