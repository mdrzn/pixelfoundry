import { PipelineType } from "@prisma/client";
import type { PipelineDefinition } from "../types";

type TranscribeParams = {
  audioUrl: string;
  audioAssetId: string;
  sttModelId: string;
};

export const transcribeDefinition: PipelineDefinition = {
  type: PipelineType.TRANSCRIBE,

  plan(params, ctx) {
    const p = params as TranscribeParams;
    return [
      {
        key: "transcribe",
        name: "Transcribe audio",
        stepType: "stt",
        dependsOn: [],
        input: { audio_url: p.audioUrl },
        providerModelId: p.sttModelId,
        cost: ctx.cost("stt", p.sttModelId),
      },
    ];
  },

  expand() {
    return [];
  },

  estimateUpperBound(params, ctx) {
    const p = params as TranscribeParams;
    return ctx.cost("stt", p.sttModelId);
  },
};
