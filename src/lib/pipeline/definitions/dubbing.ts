import { PipelineType } from "@prisma/client";
import type { PipelineDefinition, PlannedStep } from "../types";

const MAX_SEGMENTS = 40;

type DubbingParams = {
  videoUrl: string;
  videoAssetId: string;
  targetLanguage: string;
  lipsync: boolean;
  sttModelId: string;
  ttsModelId: string;
  cloneModelId: string;
  lipsyncModelId?: string;
  muxModelId: string;
  llmModelId?: string;
};

function translateInstruction(targetLanguage: string): string {
  return [
    `Translate this transcript to ${targetLanguage} and return ONLY JSON`,
    `{"totalMs":<number>,"segments":[{"text":"...","startMs":<number>}]}`,
    `with no prose. Use the word start/end times (given in seconds — convert to`,
    `milliseconds) to set each segment's startMs, and set totalMs to the last`,
    `word's end time in ms. Keep segments in chronological order.`,
  ].join(" ");
}

export const dubbingDefinition: PipelineDefinition = {
  type: PipelineType.DUBBING,

  plan(params, ctx) {
    const p = params as DubbingParams;
    return [
      {
        key: "extract",
        name: "Extract audio",
        stepType: "extract-audio",
        dependsOn: [],
        // The source video asset id is a param, not a step output — passed
        // through untouched to the extract-audio runner (which reads the asset).
        input: { videoAssetId: p.videoAssetId },
        cost: ctx.cost("extract-audio"),
      },
    ];
  },

  expand(completed, params, ctx) {
    const p = params as DubbingParams;

    if (completed.key === "extract") {
      return [
        {
          key: "transcribe",
          name: "Transcribe audio",
          stepType: "stt",
          dependsOn: ["extract"],
          input: { audio_url: { $asset: "extract" } },
          providerModelId: p.sttModelId,
          cost: ctx.cost("stt", p.sttModelId),
        },
        {
          key: "clone",
          name: "Clone voice",
          stepType: "voice-clone",
          dependsOn: ["extract"],
          input: { audio_url: { $asset: "extract" } },
          providerModelId: p.cloneModelId,
          cost: ctx.cost("voice-clone", p.cloneModelId),
        },
      ];
    }

    if (completed.key === "transcribe") {
      return [
        {
          key: "translate",
          name: "Translate transcript",
          stepType: "llm",
          dependsOn: ["transcribe"],
          input: {
            prompt: translateInstruction(p.targetLanguage),
            context: { $data: "transcribe" },
            llmModelId: p.llmModelId,
          },
          providerModelId: p.llmModelId,
          cost: ctx.cost("llm", p.llmModelId),
        },
      ];
    }

    if (completed.key === "translate") {
      const data = completed.output as { segments?: unknown[] } | null;
      const all = Array.isArray(data?.segments) ? (data!.segments as unknown[]) : [];
      const segments = all.slice(0, MAX_SEGMENTS);

      const steps: PlannedStep[] = [];
      const ttsKeys: string[] = [];
      segments.forEach((_, i) => {
        const key = `seg:${i}:tts`;
        ttsKeys.push(key);
        steps.push({
          key,
          name: `Segment ${i + 1} speech`,
          stepType: "tts",
          dependsOn: ["clone"],
          input: {
            text: { $data: "translate", path: `segments[${i}].text` },
            voice_id: { $data: "clone", path: "voice_id" },
            language_boost: p.targetLanguage,
          },
          providerModelId: p.ttsModelId,
          cost: ctx.cost("tts", p.ttsModelId),
        });
      });

      steps.push({
        key: "dub",
        name: "Merge dubbed segments",
        stepType: "audio-merge",
        dependsOn: ttsKeys,
        input: {
          segments: segments.map((_, i) => ({
            startMs: { $data: "translate", path: `segments[${i}].startMs` },
            assetId: { $assetId: `seg:${i}:tts` },
          })),
          totalMs: { $data: "translate", path: "totalMs" },
        },
        cost: ctx.cost("audio-merge"),
      });

      if (p.lipsync) {
        steps.push({
          key: "lipsync",
          name: "Lip-sync dubbed audio",
          stepType: "lipsync",
          dependsOn: ["dub"],
          input: {
            video_url: p.videoUrl,
            audio_url: { $asset: "dub" },
          },
          providerModelId: p.lipsyncModelId,
          cost: ctx.cost("lipsync", p.lipsyncModelId),
        });
      } else {
        steps.push({
          key: "mux",
          name: "Mux dubbed audio into video",
          stepType: "mux-audio",
          dependsOn: ["dub"],
          input: {
            video_url: p.videoUrl,
            audio_url: { $asset: "dub" },
          },
          providerModelId: p.muxModelId,
          cost: ctx.cost("mux-audio", p.muxModelId),
        });
      }

      return steps;
    }

    return [];
  },

  estimateUpperBound(params, ctx) {
    const p = params as DubbingParams;
    return (
      ctx.cost("extract-audio") +
      ctx.cost("stt", p.sttModelId) +
      ctx.cost("llm", p.llmModelId) +
      ctx.cost("voice-clone", p.cloneModelId) +
      MAX_SEGMENTS * ctx.cost("tts", p.ttsModelId) +
      ctx.cost("audio-merge") +
      (p.lipsync ? ctx.cost("lipsync", p.lipsyncModelId) : ctx.cost("mux-audio", p.muxModelId))
    );
  },
};
