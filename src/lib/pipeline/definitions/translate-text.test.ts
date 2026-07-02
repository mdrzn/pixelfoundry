import { describe, expect, it } from "vitest";
import { PipelineType } from "@prisma/client";
import { translateTextDefinition } from "./translate-text";
import { getDefinition } from "./index";
import type { PlanContext } from "../types";

const ctx: PlanContext = {
  cost: (t: string) => (({ llm: 1 }) as Record<string, number>)[t] ?? 0,
};

const params = {
  text: "Hello world",
  targetLanguage: "Spanish",
  llmModelId: "llm-id",
};

describe("translateTextDefinition.plan", () => {
  it("returns exactly one llm step keyed 'translate'", () => {
    const steps = translateTextDefinition.plan(params, ctx);
    expect(steps).toHaveLength(1);
    const [step] = steps;
    expect(step.key).toBe("translate");
    expect(step.stepType).toBe("llm");
    expect(step.dependsOn).toEqual([]);
    expect(step.providerModelId).toBe("llm-id");
    expect(step.cost).toBe(1);

    const input = step.input as Record<string, unknown>;
    expect(input.prompt).toBe(
      'Translate the CONTEXT text to Spanish. Return ONLY JSON {"translation":"..."}.',
    );
    expect(input.context).toEqual({ text: "Hello world" });
    expect(input.llmModelId).toBe("llm-id");
  });
});

describe("translateTextDefinition.expand", () => {
  it("returns [] (single-step pipeline)", () => {
    expect(
      translateTextDefinition.expand({ key: "translate", output: {} }, params, ctx),
    ).toEqual([]);
  });
});

describe("translateTextDefinition.estimateUpperBound", () => {
  it("equals the llm model cost", () => {
    expect(translateTextDefinition.estimateUpperBound(params, ctx)).toBe(1);
  });
});

describe("getDefinition", () => {
  it("returns the Translate Text definition", () => {
    expect(getDefinition(PipelineType.TRANSLATE_TEXT)).toBe(translateTextDefinition);
  });
});
