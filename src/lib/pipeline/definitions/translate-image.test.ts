import { describe, expect, it } from "vitest";
import { PipelineType } from "@prisma/client";
import { translateImageDefinition } from "./translate-image";
import { getDefinition } from "./index";
import type { PlanContext } from "../types";

const ctx: PlanContext = {
  cost: (t: string) => (({ "image-edit": 8 }) as Record<string, number>)[t] ?? 0,
};

const params = {
  imageUrl: "https://cdn/image.png",
  imageAssetId: "asset-1",
  targetLanguage: "Spanish",
  editModelId: "edit-id",
};

describe("translateImageDefinition.plan", () => {
  it("returns exactly one image-edit step keyed 'translate'", () => {
    const steps = translateImageDefinition.plan(params, ctx);
    expect(steps).toHaveLength(1);
    const [step] = steps;
    expect(step.key).toBe("translate");
    expect(step.stepType).toBe("image-edit");
    expect(step.dependsOn).toEqual([]);
    expect(step.providerModelId).toBe("edit-id");
    expect(step.cost).toBe(8);
    expect(step.input).toEqual({
      prompt:
        "Translate all visible text in this image to Spanish, preserving layout/style.",
      image_urls: ["https://cdn/image.png"],
    });
  });
});

describe("translateImageDefinition.expand", () => {
  it("returns [] (single-step pipeline)", () => {
    expect(
      translateImageDefinition.expand({ key: "translate", output: {} }, params, ctx),
    ).toEqual([]);
  });
});

describe("translateImageDefinition.estimateUpperBound", () => {
  it("equals the image-edit model cost", () => {
    expect(translateImageDefinition.estimateUpperBound(params, ctx)).toBe(8);
  });
});

describe("getDefinition", () => {
  it("returns the Translate Image definition", () => {
    expect(getDefinition(PipelineType.TRANSLATE_IMAGE)).toBe(translateImageDefinition);
  });
});
