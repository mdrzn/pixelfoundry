import { describe, expect, it } from "vitest";
import { PipelineType } from "@prisma/client";
import { shortsDefinition } from "./shorts";
import { getDefinition } from "./index";
import type { PlanContext } from "../types";

const COSTS: Record<string, number> = {
  llm: 1,
  tts: 3,
  music: 4,
  image: 6,
  video: 30,
  merge: 2,
  "mux-audio": 2,
  "auto-subtitle": 2,
};

const ctx: PlanContext = { cost: (t: string) => COSTS[t] ?? 0 };

const baseParams = {
  topic: "The history of coffee",
  aspectRatio: "9:16",
  scriptModelId: "script",
  imageModelId: "img",
  videoModelId: "vid",
  voiceModelId: "voice",
  musicModelId: "music",
  subtitleModelId: "sub",
  muxModelId: "mux",
};

describe("shortsDefinition.plan", () => {
  it("returns exactly one llm step keyed 'script'", () => {
    const steps = shortsDefinition.plan(baseParams, ctx);
    expect(steps).toHaveLength(1);
    const [step] = steps;
    expect(step.key).toBe("script");
    expect(step.stepType).toBe("llm");
    expect(step.dependsOn).toEqual([]);
    expect(step.providerModelId).toBe("script");
    expect(step.cost).toBe(1);
  });
});

describe("shortsDefinition.expand", () => {
  it("returns [] for a non-'script' completed step", () => {
    expect(shortsDefinition.expand({ key: "voice", output: {} }, baseParams, ctx)).toEqual([]);
  });

  it("fans out the full single-stage graph for 2 scenes", () => {
    const steps = shortsDefinition.expand(
      {
        key: "script",
        output: {
          narration_script: "hello",
          music_prompt: "lofi",
          scenes: [{}, {}],
        },
      },
      baseParams,
      ctx,
    );

    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));

    // voice, music, 2 image, 2 video, concat, narrate, score, subtitle
    expect(Object.keys(byKey).sort()).toEqual(
      [
        "concat",
        "music",
        "narrate",
        "scene:0:image",
        "scene:0:video",
        "scene:1:image",
        "scene:1:video",
        "score",
        "subtitle",
        "voice",
      ].sort(),
    );

    // step types
    expect(byKey["voice"].stepType).toBe("tts");
    expect(byKey["music"].stepType).toBe("music");
    expect(byKey["scene:0:image"].stepType).toBe("image");
    expect(byKey["scene:0:video"].stepType).toBe("video");
    expect(byKey["concat"].stepType).toBe("merge");
    expect(byKey["narrate"].stepType).toBe("mux-audio");
    expect(byKey["score"].stepType).toBe("mux-audio");
    expect(byKey["subtitle"].stepType).toBe("auto-subtitle");

    // deps
    expect(byKey["voice"].dependsOn).toEqual([]);
    expect(byKey["music"].dependsOn).toEqual([]);
    expect(byKey["scene:1:video"].dependsOn).toEqual(["scene:1:image"]);
    expect(byKey["concat"].dependsOn).toEqual(["scene:0:video", "scene:1:video"]);
    expect(byKey["narrate"].dependsOn).toEqual(["concat", "voice"]);
    expect(byKey["score"].dependsOn).toEqual(["narrate", "music"]);
    expect(byKey["subtitle"].dependsOn).toEqual(["score"]);

    // provider model ids
    expect(byKey["scene:0:image"].providerModelId).toBe("img");
    expect(byKey["scene:0:video"].providerModelId).toBe("vid");
    expect(byKey["voice"].providerModelId).toBe("voice");
    expect(byKey["music"].providerModelId).toBe("music");
    expect(byKey["narrate"].providerModelId).toBe("mux");
    expect(byKey["subtitle"].providerModelId).toBe("sub");

    // concat is NOT keyed "merge" (so the executor picks the true sink)
    expect(byKey["merge"]).toBeUndefined();
  });

  it("subtitle is the sink terminal (no step depends on it)", () => {
    const steps = shortsDefinition.expand(
      { key: "script", output: { narration_script: "x", music_prompt: "y", scenes: [{}, {}] } },
      baseParams,
      ctx,
    );
    const dependedOn = new Set<string>();
    for (const s of steps) for (const d of s.dependsOn) dependedOn.add(d);
    const sinks = steps.filter((s) => !dependedOn.has(s.key));
    expect(sinks.map((s) => s.key)).toEqual(["subtitle"]);
  });

  it("caps scenes at MAX_SCENES (10)", () => {
    const scenes = Array.from({ length: 25 }, () => ({}));
    const steps = shortsDefinition.expand(
      { key: "script", output: { narration_script: "x", music_prompt: "y", scenes } },
      baseParams,
      ctx,
    );
    expect(steps.filter((s) => s.stepType === "image")).toHaveLength(10);
    expect(steps.filter((s) => s.stepType === "video")).toHaveLength(10);
  });
});

describe("shortsDefinition.estimateUpperBound", () => {
  it("sums llm + tts + music + 10*(image+video) + merge + 2*mux + subtitle", () => {
    // 1 + 3 + 4 + 10*(6+30) + 2 + 2*2 + 2 = 376
    expect(shortsDefinition.estimateUpperBound(baseParams, ctx)).toBe(376);
  });
});

describe("getDefinition", () => {
  it("returns the Shorts definition", () => {
    expect(getDefinition(PipelineType.SHORTS)).toBe(shortsDefinition);
  });
});
