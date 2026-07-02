import { PipelineType } from "@prisma/client";
import type { PipelineDefinition, PlannedStep } from "../types";

const MAX_CHARS = 6;
const MAX_ENVS = 6;
const MAX_SCENES = 10;

type SceneBuilderParams = {
  concept: string;
  aspectRatio?: string;
  scriptModelId?: string;
  imageModelId: string;
  imageEditModelId: string;
  videoModelId: string;
};

type Character = { id: string; name?: string; description?: string };
type Environment = { id: string; name?: string; description?: string };
type Scene = {
  id: string;
  image_prompt?: string;
  video_prompt?: string;
  characterIds?: string[];
  environmentId?: string;
};

function analyzePrompt(concept: string): string {
  return [
    `Break the following CONCEPT into a reusable cast, set of environments, and an ordered list of scenes for a short film.`,
    `Return ONLY JSON with this shape and no prose:`,
    `{"characters":[{"id":"short-stable-id","name":"...","description":"..."}],`,
    `"environments":[{"id":"short-stable-id","name":"...","description":"..."}],`,
    `"scenes":[{"id":"short-stable-id","image_prompt":"...","video_prompt":"...","characterIds":["character id"],"environmentId":"environment id"}]}`,
    `ids are short, stable strings (e.g. "c1", "e1", "s1"). Reuse the same character/environment ids across scenes so the cast and sets stay consistent.`,
    `description describes the character's or environment's appearance for image generation.`,
    `image_prompt describes a still keyframe of the scene; video_prompt describes the motion in that scene.`,
    `At most ${MAX_CHARS} characters, ${MAX_ENVS} environments, and ${MAX_SCENES} scenes.`,
    `CONCEPT: ${concept}`,
  ].join("\n");
}

export const sceneBuilderDefinition: PipelineDefinition = {
  type: PipelineType.SCENE_BUILDER,

  plan(params, ctx) {
    const p = params as SceneBuilderParams;
    return [
      {
        key: "analyze",
        name: "Analyze concept into cast, sets, and scenes",
        stepType: "llm",
        dependsOn: [],
        input: { prompt: analyzePrompt(p.concept), llmModelId: p.scriptModelId },
        providerModelId: p.scriptModelId,
        cost: ctx.cost("llm", p.scriptModelId),
      },
    ];
  },

  expand(completed, params, ctx) {
    if (completed.key !== "analyze") return [];
    const p = params as SceneBuilderParams;
    const data = completed.output as
      | { characters?: unknown[]; environments?: unknown[]; scenes?: unknown[] }
      | null;

    const characters = (Array.isArray(data?.characters) ? (data!.characters as Character[]) : []).slice(
      0,
      MAX_CHARS,
    );
    const environments = (
      Array.isArray(data?.environments) ? (data!.environments as Environment[]) : []
    ).slice(0, MAX_ENVS);
    const scenes = (Array.isArray(data?.scenes) ? (data!.scenes as Scene[]) : []).slice(0, MAX_SCENES);

    const steps: PlannedStep[] = [];

    // Reusable character portraits.
    characters.forEach((c, idx) => {
      steps.push({
        key: `char:${c.id}:image`,
        name: `Character ${c.name ?? c.id}`,
        stepType: "image",
        dependsOn: [],
        input: {
          prompt: { $data: "analyze", path: `characters[${idx}].description` },
          aspectRatio: p.aspectRatio,
        },
        providerModelId: p.imageModelId,
        cost: ctx.cost("image", p.imageModelId),
      });
    });

    // Reusable environment plates.
    environments.forEach((e, idx) => {
      steps.push({
        key: `env:${e.id}:image`,
        name: `Environment ${e.name ?? e.id}`,
        stepType: "image",
        dependsOn: [],
        input: {
          prompt: { $data: "analyze", path: `environments[${idx}].description` },
          aspectRatio: p.aspectRatio,
        },
        providerModelId: p.imageModelId,
        cost: ctx.cost("image", p.imageModelId),
      });
    });

    // Per-scene reference-guided keyframe -> video.
    const sceneVideoKeys: string[] = [];
    scenes.forEach((s, i) => {
      const charIds = Array.isArray(s.characterIds) ? s.characterIds : [];
      const keyframeKey = `scene:${i}:keyframe`;
      const videoKey = `scene:${i}:video`;
      sceneVideoKeys.push(videoKey);

      const refDeps = [
        ...charIds.map((id) => `char:${id}:image`),
        `env:${s.environmentId}:image`,
      ];
      const imageUrls = [
        ...charIds.map((id) => ({ $asset: `char:${id}:image` })),
        { $asset: `env:${s.environmentId}:image` },
      ];

      steps.push({
        key: keyframeKey,
        name: `Scene ${i + 1} keyframe`,
        stepType: "image-edit",
        dependsOn: refDeps,
        input: {
          prompt: { $data: "analyze", path: `scenes[${i}].image_prompt` },
          image_urls: imageUrls,
          aspectRatio: p.aspectRatio,
        },
        providerModelId: p.imageEditModelId,
        cost: ctx.cost("image-edit", p.imageEditModelId),
      });

      steps.push({
        key: videoKey,
        name: `Scene ${i + 1} video`,
        stepType: "video",
        dependsOn: [keyframeKey],
        input: {
          prompt: { $data: "analyze", path: `scenes[${i}].video_prompt` },
          image_url: { $asset: keyframeKey },
        },
        providerModelId: p.videoModelId,
        cost: ctx.cost("video", p.videoModelId),
      });
    });

    // Keyed "concat" (NOT "merge") so the executor's sink rule picks this true
    // terminal step as the final asset.
    steps.push({
      key: "concat",
      name: "Concatenate scenes",
      stepType: "merge",
      dependsOn: sceneVideoKeys,
      input: { videos: sceneVideoKeys.map((k) => ({ $assetId: k })) },
      cost: ctx.cost("merge"),
    });

    return steps;
  },

  estimateUpperBound(params, ctx) {
    const p = params as SceneBuilderParams;
    return (
      ctx.cost("llm", p.scriptModelId) +
      MAX_CHARS * ctx.cost("image", p.imageModelId) +
      MAX_ENVS * ctx.cost("image", p.imageModelId) +
      MAX_SCENES * (ctx.cost("image-edit", p.imageEditModelId) + ctx.cost("video", p.videoModelId)) +
      ctx.cost("merge")
    );
  },
};
