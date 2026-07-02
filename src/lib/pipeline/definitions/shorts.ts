import { PipelineType } from "@prisma/client";
import type { PipelineDefinition, PlannedStep } from "../types";

const MAX_SCENES = 10;

type ShortsParams = {
  topic: string;
  aspectRatio?: string;
  scriptModelId?: string;
  imageModelId: string;
  videoModelId: string;
  voiceModelId: string;
  musicModelId: string;
  subtitleModelId: string;
  muxModelId: string;
};

function scriptPrompt(topic: string): string {
  return [
    `Break the following topic into at most ${MAX_SCENES} short scenes for a narrated vertical video.`,
    `Return ONLY JSON: {"narration_script":"...","music_prompt":"...","scenes":[{"image_prompt":"...","video_prompt":"..."}]} with no prose.`,
    `narration_script is the full spoken voice-over for the whole short.`,
    `music_prompt describes background music. image_prompt describes a still keyframe; video_prompt describes the motion for that scene.`,
    `Topic: ${topic}`,
  ].join("\n");
}

export const shortsDefinition: PipelineDefinition = {
  type: PipelineType.SHORTS,

  plan(params, ctx) {
    const p = params as ShortsParams;
    return [
      {
        key: "script",
        name: "Write script + scenes",
        stepType: "llm",
        dependsOn: [],
        input: { prompt: scriptPrompt(p.topic), llmModelId: p.scriptModelId },
        providerModelId: p.scriptModelId,
        cost: ctx.cost("llm", p.scriptModelId),
      },
    ];
  },

  expand(completed, params, ctx) {
    if (completed.key !== "script") return [];
    const p = params as ShortsParams;
    const data = completed.output as { scenes?: unknown[] } | null;
    const scenes = Array.isArray(data?.scenes) ? (data!.scenes as unknown[]) : [];
    const capped = scenes.slice(0, MAX_SCENES);

    const steps: PlannedStep[] = [];

    steps.push({
      key: "voice",
      name: "Narration voice-over",
      stepType: "tts",
      dependsOn: [],
      input: { text: { $data: "script", path: "narration_script" } },
      providerModelId: p.voiceModelId,
      cost: ctx.cost("tts", p.voiceModelId),
    });

    steps.push({
      key: "music",
      name: "Background music",
      stepType: "music",
      dependsOn: [],
      input: { prompt: { $data: "script", path: "music_prompt" } },
      providerModelId: p.musicModelId,
      cost: ctx.cost("music", p.musicModelId),
    });

    const sceneVideoKeys: string[] = [];
    capped.forEach((_, i) => {
      const imageKey = `scene:${i}:image`;
      const videoKey = `scene:${i}:video`;
      sceneVideoKeys.push(videoKey);
      steps.push({
        key: imageKey,
        name: `Scene ${i + 1} keyframe`,
        stepType: "image",
        dependsOn: [],
        input: {
          prompt: { $data: "script", path: `scenes[${i}].image_prompt` },
          aspectRatio: p.aspectRatio,
        },
        providerModelId: p.imageModelId,
        cost: ctx.cost("image", p.imageModelId),
      });
      steps.push({
        key: videoKey,
        name: `Scene ${i + 1} video`,
        stepType: "video",
        dependsOn: [imageKey],
        input: {
          prompt: { $data: "script", path: `scenes[${i}].video_prompt` },
          image_url: { $asset: imageKey },
        },
        providerModelId: p.videoModelId,
        cost: ctx.cost("video", p.videoModelId),
      });
    });

    // Keyed "concat" (NOT "merge") so the executor's sink rule picks the true
    // terminal step (subtitle), not this mid-graph video concatenation.
    steps.push({
      key: "concat",
      name: "Concatenate scenes",
      stepType: "merge",
      dependsOn: sceneVideoKeys,
      input: { videos: sceneVideoKeys.map((k) => ({ $assetId: k })) },
      cost: ctx.cost("merge"),
    });

    steps.push({
      key: "narrate",
      name: "Add narration",
      stepType: "mux-audio",
      dependsOn: ["concat", "voice"],
      input: { video_url: { $asset: "concat" }, audio_url: { $asset: "voice" } },
      providerModelId: p.muxModelId,
      cost: ctx.cost("mux-audio", p.muxModelId),
    });

    steps.push({
      key: "score",
      name: "Add music",
      stepType: "mux-audio",
      dependsOn: ["narrate", "music"],
      input: { video_url: { $asset: "narrate" }, audio_url: { $asset: "music" } },
      providerModelId: p.muxModelId,
      cost: ctx.cost("mux-audio", p.muxModelId),
    });

    steps.push({
      key: "subtitle",
      name: "Burn in subtitles",
      stepType: "auto-subtitle",
      dependsOn: ["score"],
      input: { video_url: { $asset: "score" } },
      providerModelId: p.subtitleModelId,
      cost: ctx.cost("auto-subtitle", p.subtitleModelId),
    });

    return steps;
  },

  estimateUpperBound(params, ctx) {
    const p = params as ShortsParams;
    return (
      ctx.cost("llm", p.scriptModelId) +
      ctx.cost("tts", p.voiceModelId) +
      ctx.cost("music", p.musicModelId) +
      MAX_SCENES * (ctx.cost("image", p.imageModelId) + ctx.cost("video", p.videoModelId)) +
      ctx.cost("merge") +
      2 * ctx.cost("mux-audio", p.muxModelId) +
      ctx.cost("auto-subtitle", p.subtitleModelId)
    );
  },
};
