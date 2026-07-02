import { PipelineType } from "@prisma/client";
import type { PipelineDefinition } from "../types";

type TranslateImageParams = {
  imageUrl: string;
  imageAssetId: string;
  targetLanguage: string;
  editModelId: string;
};

export const translateImageDefinition: PipelineDefinition = {
  type: PipelineType.TRANSLATE_IMAGE,

  plan(params, ctx) {
    const p = params as TranslateImageParams;
    return [
      {
        key: "translate",
        name: "Translate image text",
        stepType: "image-edit",
        dependsOn: [],
        input: {
          prompt:
            "Translate all visible text in this image to " +
            p.targetLanguage +
            ", preserving layout/style.",
          image_urls: [p.imageUrl],
        },
        providerModelId: p.editModelId,
        cost: ctx.cost("image-edit", p.editModelId),
      },
    ];
  },

  expand() {
    return [];
  },

  estimateUpperBound(params, ctx) {
    const p = params as TranslateImageParams;
    return ctx.cost("image-edit", p.editModelId);
  },
};
