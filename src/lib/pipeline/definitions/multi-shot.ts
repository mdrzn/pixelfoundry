import { PipelineType } from "@prisma/client";
import type { PipelineDefinition, PlannedStep, PlanContext, CompletedStep } from "../types";

const MAX_SHOTS = 8;
const DEFAULT_SHOTS = 4;

type MultiShotParams = {
  story: string;
  imageModelId: string;
  videoModelId: string;
  llmModelId?: string;
  maxShots?: number;
  aspectRatio?: string;
};

function clampShots(n: number | undefined): number {
  if (!n || n < 1) return DEFAULT_SHOTS;
  return Math.min(n, MAX_SHOTS);
}

function shotsPrompt(story: string, maxShots: number): string {
  return [
    `Break the following story into at most ${maxShots} cinematic shots.`,
    `Return ONLY JSON: {"shots":[{"image_prompt":"...","video_prompt":"..."}]} with no prose.`,
    `image_prompt describes a still keyframe; video_prompt describes the motion for that shot.`,
    `Story: ${story}`,
  ].join("\n");
}

export const multiShotDefinition: PipelineDefinition = {
  type: PipelineType.MULTI_SHOT,

  plan(params, ctx) {
    const p = params as MultiShotParams;
    const maxShots = clampShots(p.maxShots);
    return [
      {
        key: "shots",
        name: "Break story into shots",
        stepType: "llm",
        dependsOn: [],
        input: { prompt: shotsPrompt(p.story, maxShots), llmModelId: p.llmModelId },
        providerModelId: p.llmModelId,
        cost: ctx.cost("llm", p.llmModelId),
      },
    ];
  },

  expand(completed, params, ctx) {
    if (completed.key !== "shots") return [];
    const p = params as MultiShotParams;
    const data = completed.output as { shots?: unknown[] } | null;
    const shots = Array.isArray(data?.shots) ? (data!.shots as unknown[]) : [];
    const capped = shots.slice(0, clampShots(p.maxShots));
    const steps: PlannedStep[] = [];
    const videoKeys: string[] = [];
    capped.forEach((_, i) => {
      const imageKey = `shot:${i}:image`;
      const videoKey = `shot:${i}:video`;
      videoKeys.push(videoKey);
      steps.push({
        key: imageKey,
        name: `Shot ${i + 1} keyframe`,
        stepType: "image",
        dependsOn: [],
        input: { prompt: { $data: "shots", path: `shots[${i}].image_prompt` }, aspectRatio: p.aspectRatio },
        providerModelId: p.imageModelId,
        cost: ctx.cost("image", p.imageModelId),
      });
      steps.push({
        key: videoKey,
        name: `Shot ${i + 1} video`,
        stepType: "video",
        dependsOn: [imageKey],
        input: {
          prompt: { $data: "shots", path: `shots[${i}].video_prompt` },
          image_url: { $asset: imageKey },
        },
        providerModelId: p.videoModelId,
        cost: ctx.cost("video", p.videoModelId),
      });
    });
    steps.push({
      key: "merge",
      name: "Merge shots",
      stepType: "merge",
      dependsOn: videoKeys,
      input: { videos: videoKeys.map((k) => ({ $asset: k })) },
      cost: ctx.cost("merge"),
    });
    return steps;
  },

  estimateUpperBound(params, ctx) {
    const p = params as MultiShotParams;
    const maxShots = clampShots(p.maxShots);
    return (
      ctx.cost("llm", p.llmModelId) +
      maxShots * (ctx.cost("image", p.imageModelId) + ctx.cost("video", p.videoModelId)) +
      ctx.cost("merge")
    );
  },
};
