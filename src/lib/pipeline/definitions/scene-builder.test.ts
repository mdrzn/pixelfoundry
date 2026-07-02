import { describe, expect, it } from "vitest";
import { PipelineType } from "@prisma/client";
import { sceneBuilderDefinition } from "./scene-builder";
import { getDefinition } from "./index";
import type { PlanContext } from "../types";

const COSTS: Record<string, number> = {
  llm: 1,
  image: 6,
  "image-edit": 8,
  video: 30,
  merge: 2,
};

const ctx: PlanContext = { cost: (t: string) => COSTS[t] ?? 0 };

const baseParams = {
  concept: "Two heroes cross a desert to reach a hidden oasis",
  aspectRatio: "16:9",
  scriptModelId: "script",
  imageModelId: "img",
  imageEditModelId: "edit",
  videoModelId: "vid",
};

const sampleOutput = {
  characters: [
    { id: "c1", name: "A", description: "hero A" },
    { id: "c2", name: "B", description: "hero B" },
  ],
  environments: [{ id: "e1", name: "Desert", description: "vast dunes" }],
  scenes: [
    {
      id: "s1",
      image_prompt: "wide shot",
      video_prompt: "they walk",
      characterIds: ["c1", "c2"],
      environmentId: "e1",
    },
  ],
};

describe("sceneBuilderDefinition.plan", () => {
  it("returns exactly one llm step keyed 'analyze'", () => {
    const steps = sceneBuilderDefinition.plan(baseParams, ctx);
    expect(steps).toHaveLength(1);
    const [step] = steps;
    expect(step.key).toBe("analyze");
    expect(step.stepType).toBe("llm");
    expect(step.dependsOn).toEqual([]);
    expect(step.providerModelId).toBe("script");
    expect(step.cost).toBe(1);
  });
});

describe("sceneBuilderDefinition.expand", () => {
  it("returns [] for a non-'analyze' completed step", () => {
    expect(sceneBuilderDefinition.expand({ key: "char:c1:image", output: {} }, baseParams, ctx)).toEqual(
      [],
    );
  });

  it("fans out char/env/keyframe/video/concat for 2 chars, 1 env, 1 scene", () => {
    const steps = sceneBuilderDefinition.expand(
      { key: "analyze", output: sampleOutput },
      baseParams,
      ctx,
    );
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));

    expect(Object.keys(byKey).sort()).toEqual(
      [
        "char:c1:image",
        "char:c2:image",
        "env:e1:image",
        "scene:0:keyframe",
        "scene:0:video",
        "concat",
      ].sort(),
    );

    // step types
    expect(byKey["char:c1:image"].stepType).toBe("image");
    expect(byKey["env:e1:image"].stepType).toBe("image");
    expect(byKey["scene:0:keyframe"].stepType).toBe("image-edit");
    expect(byKey["scene:0:video"].stepType).toBe("video");
    expect(byKey["concat"].stepType).toBe("merge");

    // provider model ids
    expect(byKey["char:c1:image"].providerModelId).toBe("img");
    expect(byKey["env:e1:image"].providerModelId).toBe("img");
    expect(byKey["scene:0:keyframe"].providerModelId).toBe("edit");
    expect(byKey["scene:0:video"].providerModelId).toBe("vid");

    // keyframe reference deps: both chars + env
    expect(byKey["scene:0:keyframe"].dependsOn).toEqual([
      "char:c1:image",
      "char:c2:image",
      "env:e1:image",
    ]);

    // keyframe image_urls has 3 $asset refs (2 chars + 1 env)
    const kfInput = byKey["scene:0:keyframe"].input as {
      image_urls: unknown[];
      aspectRatio?: string;
    };
    expect(kfInput.image_urls).toHaveLength(3);
    expect(kfInput.image_urls).toEqual([
      { $asset: "char:c1:image" },
      { $asset: "char:c2:image" },
      { $asset: "env:e1:image" },
    ]);
    expect(kfInput.aspectRatio).toBe("16:9");

    // video depends on its keyframe
    expect(byKey["scene:0:video"].dependsOn).toEqual(["scene:0:keyframe"]);

    // concat depends on all scene videos
    expect(byKey["concat"].dependsOn).toEqual(["scene:0:video"]);
    const concatInput = byKey["concat"].input as { videos: unknown[] };
    expect(concatInput.videos).toEqual([{ $assetId: "scene:0:video" }]);
  });

  it("concat is the sink terminal (no step depends on it)", () => {
    const steps = sceneBuilderDefinition.expand(
      { key: "analyze", output: sampleOutput },
      baseParams,
      ctx,
    );
    const dependedOn = new Set<string>();
    for (const s of steps) for (const d of s.dependsOn) dependedOn.add(d);
    const sinks = steps.filter((s) => !dependedOn.has(s.key));
    expect(sinks.map((s) => s.key)).toEqual(["concat"]);
  });

  it("caps characters at MAX_CHARS (6), environments at MAX_ENVS (6), scenes at MAX_SCENES (10)", () => {
    const characters = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, description: "x" }));
    const environments = Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, description: "x" }));
    const scenes = Array.from({ length: 25 }, (_, i) => ({
      id: `s${i}`,
      image_prompt: "p",
      video_prompt: "v",
      characterIds: ["c0"],
      environmentId: "e0",
    }));
    const steps = sceneBuilderDefinition.expand(
      { key: "analyze", output: { characters, environments, scenes } },
      baseParams,
      ctx,
    );
    expect(steps.filter((s) => s.key.startsWith("char:"))).toHaveLength(6);
    expect(steps.filter((s) => s.key.startsWith("env:"))).toHaveLength(6);
    expect(steps.filter((s) => s.stepType === "image-edit")).toHaveLength(10);
    expect(steps.filter((s) => s.stepType === "video")).toHaveLength(10);
  });
});

describe("sceneBuilderDefinition.estimateUpperBound", () => {
  it("sums llm + 6*image + 6*image + 10*(image-edit + video) + merge", () => {
    // 1 + 6*6 + 6*6 + 10*(8+30) + 2 = 1 + 36 + 36 + 380 + 2 = 455
    expect(sceneBuilderDefinition.estimateUpperBound(baseParams, ctx)).toBe(455);
  });
});

describe("getDefinition", () => {
  it("returns the Scene Builder definition", () => {
    expect(getDefinition(PipelineType.SCENE_BUILDER)).toBe(sceneBuilderDefinition);
  });
});
