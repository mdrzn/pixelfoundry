import { PipelineType } from "@prisma/client";
import type { PipelineDefinition } from "../types";

type TranslateTextParams = {
  text: string;
  targetLanguage: string;
  llmModelId: string;
};

export const translateTextDefinition: PipelineDefinition = {
  type: PipelineType.TRANSLATE_TEXT,

  plan(params, ctx) {
    const p = params as TranslateTextParams;
    return [
      {
        key: "translate",
        name: "Translate text",
        stepType: "llm",
        dependsOn: [],
        input: {
          prompt:
            "Translate the CONTEXT text to " +
            p.targetLanguage +
            '. Return ONLY JSON {"translation":"..."}.',
          context: { text: p.text },
          llmModelId: p.llmModelId,
        },
        providerModelId: p.llmModelId,
        cost: ctx.cost("llm", p.llmModelId),
      },
    ];
  },

  expand() {
    return [];
  },

  estimateUpperBound(params, ctx) {
    const p = params as TranslateTextParams;
    return ctx.cost("llm", p.llmModelId);
  },
};
