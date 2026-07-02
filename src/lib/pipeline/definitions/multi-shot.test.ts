import { describe, expect, it } from "vitest";
import { PipelineType } from "@prisma/client";
import { multiShotDefinition } from "./multi-shot";
import { getDefinition } from "./index";
import type { PlanContext } from "../types";

const ctx: PlanContext = {
  cost: (t: string) => (({ llm: 1, image: 6, video: 30, merge: 2 }) as Record<string, number>)[t] ?? 0,
};

const baseParams = {
  story: "A hero's journey.",
  imageModelId: "img",
  videoModelId: "vid",
};

describe("multiShotDefinition.plan", () => {
  it("returns exactly one llm step keyed 'shots'", () => {
    const steps = multiShotDefinition.plan(baseParams, ctx);
    expect(steps).toHaveLength(1);
    const [step] = steps;
    expect(step.key).toBe("shots");
    expect(step.stepType).toBe("llm");
    expect(step.cost).toBe(1);
    expect(step.dependsOn).toEqual([]);
  });
});

describe("multiShotDefinition.estimateUpperBound", () => {
  it("computes bound with maxShots 3", () => {
    expect(multiShotDefinition.estimateUpperBound({ ...baseParams, maxShots: 3 }, ctx)).toBe(111);
  });

  it("computes bound with default shots (4)", () => {
    expect(multiShotDefinition.estimateUpperBound(baseParams, ctx)).toBe(147);
  });

  it("clamps maxShots to MAX_SHOTS (8)", () => {
    expect(multiShotDefinition.estimateUpperBound({ ...baseParams, maxShots: 100 }, ctx)).toBe(291);
  });
});

describe("multiShotDefinition.expand", () => {
  it("returns [] for a non-'shots' completed step", () => {
    expect(multiShotDefinition.expand({ key: "other", output: {} }, baseParams, ctx)).toEqual([]);
  });

  it("fans out per shot plus a merge step", () => {
    const steps = multiShotDefinition.expand(
      { key: "shots", output: { shots: [{}, {}, {}] } },
      baseParams,
      ctx,
    );
    expect(steps).toHaveLength(7);

    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey["shot:1:video"].dependsOn).toEqual(["shot:1:image"]);
    expect(byKey["merge"].dependsOn).toEqual([
      "shot:0:video",
      "shot:1:video",
      "shot:2:video",
    ]);
    expect((byKey["shot:2:image"].input as Record<string, unknown>).prompt).toEqual({
      $data: "shots",
      path: "shots[2].image_prompt",
    });
    expect((byKey["shot:2:video"].input as Record<string, unknown>).image_url).toEqual({
      $asset: "shot:2:image",
    });

    for (const s of steps) {
      if (s.stepType === "image") expect(s.providerModelId).toBe("img");
      if (s.stepType === "video") expect(s.providerModelId).toBe("vid");
    }
  });

  it("caps shots at MAX_SHOTS via default maxShots", () => {
    const shots = Array.from({ length: 10 }, () => ({}));
    const steps = multiShotDefinition.expand({ key: "shots", output: { shots } }, baseParams, ctx);
    // default 4 shots → 4 image + 4 video + 1 merge
    expect(steps).toHaveLength(9);
    expect(steps.filter((s) => s.stepType === "image")).toHaveLength(4);
    expect(steps.filter((s) => s.stepType === "video")).toHaveLength(4);
    expect(steps.filter((s) => s.stepType === "merge")).toHaveLength(1);
  });
});

describe("getDefinition", () => {
  it("returns the Multi-Shot definition", () => {
    expect(getDefinition(PipelineType.MULTI_SHOT)).toBe(multiShotDefinition);
  });

  it("throws for an unregistered type", () => {
    expect(() => getDefinition(PipelineType.DUBBING_LIPSYNC)).toThrow(/No pipeline definition/);
  });
});
