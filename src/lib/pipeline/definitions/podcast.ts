import { PipelineType } from "@prisma/client";
import type { PipelineDefinition, PlannedStep } from "../types";
import { groupSpeakerSegments, type SpeakerWord } from "../speaker-segments";

const MAX_SEGMENTS = 30;

type PodcastParams = {
  topic?: string;
  script?: string;
  speaker1: string;
  speaker2: string;
  scriptModelId?: string;
  imageModelId: string;
  ttsModelId: string;
  sttModelId: string;
  lipsyncModelId: string;
  trimModelId?: never;
};

function scriptPrompt(p: PodcastParams): string {
  const shape = [
    `Return ONLY JSON with this shape and no prose:`,
    `{"lines":[{"speaker":"0","text":"..."},{"speaker":"1","text":"..."}],"ttsScript":"..."}`,
    `speaker "0" is ${p.speaker1}; speaker "1" is ${p.speaker2}. Alternate turns naturally.`,
    `ttsScript is the full spoken conversation as one string, in order, ready for text-to-speech.`,
  ];
  if (p.script && p.script.trim()) {
    return [
      `Format the following two-person podcast SCRIPT into the JSON structure below.`,
      `Assign each turn to speaker "0" (${p.speaker1}) or "1" (${p.speaker2}).`,
      ...shape,
      `SCRIPT: ${p.script}`,
    ].join("\n");
  }
  return [
    `Write a natural, engaging two-person podcast conversation about the TOPIC below,`,
    `between ${p.speaker1} and ${p.speaker2}.`,
    ...shape,
    `TOPIC: ${p.topic ?? ""}`,
  ].join("\n");
}

export const podcastDefinition: PipelineDefinition = {
  type: PipelineType.PODCAST,

  plan(params, ctx) {
    const p = params as PodcastParams;
    return [
      {
        key: "script",
        name: "Write podcast script",
        stepType: "llm",
        dependsOn: [],
        input: { prompt: scriptPrompt(p), llmModelId: p.scriptModelId },
        providerModelId: p.scriptModelId,
        cost: ctx.cost("llm", p.scriptModelId),
      },
    ];
  },

  expand(completed, params, ctx) {
    const p = params as PodcastParams;

    if (completed.key === "script") {
      return [
        {
          key: "portrait:0",
          name: `Portrait — ${p.speaker1}`,
          stepType: "image",
          dependsOn: [],
          input: { prompt: `A studio portrait of ${p.speaker1}, podcast host, sitting at a microphone` },
          providerModelId: p.imageModelId,
          cost: ctx.cost("image", p.imageModelId),
        },
        {
          key: "portrait:1",
          name: `Portrait — ${p.speaker2}`,
          stepType: "image",
          dependsOn: [],
          input: { prompt: `A studio portrait of ${p.speaker2}, podcast guest, sitting at a microphone` },
          providerModelId: p.imageModelId,
          cost: ctx.cost("image", p.imageModelId),
        },
        {
          key: "tts",
          name: "Synthesize conversation",
          stepType: "tts",
          dependsOn: [],
          input: { text: { $data: "script", path: "ttsScript" } },
          providerModelId: p.ttsModelId,
          cost: ctx.cost("tts", p.ttsModelId),
        },
      ];
    }

    if (completed.key === "tts") {
      return [
        {
          key: "transcribe",
          name: "Diarize conversation",
          stepType: "stt",
          dependsOn: ["tts"],
          input: { audio_url: { $asset: "tts" } },
          providerModelId: p.sttModelId,
          cost: ctx.cost("stt", p.sttModelId),
        },
      ];
    }

    if (completed.key === "transcribe") {
      const out = completed.output as { words?: unknown[] } | null;
      const words = (Array.isArray(out?.words) ? (out!.words as SpeakerWord[]) : []) ?? [];
      const segments = groupSpeakerSegments(words).slice(0, MAX_SEGMENTS);

      const steps: PlannedStep[] = [];
      const lipsyncKeys: string[] = [];

      segments.forEach((seg, i) => {
        const audioKey = `seg:${i}:audio`;
        const lipsyncKey = `seg:${i}:lipsync`;
        lipsyncKeys.push(lipsyncKey);
        // seg.speaker is the speaker_id from diarization; portraits are keyed by
        // that same id (portrait:0 / portrait:1).
        const portraitKey = `portrait:${seg.speaker}`;

        steps.push({
          key: audioKey,
          name: `Segment ${i + 1} audio`,
          stepType: "trim-audio",
          dependsOn: ["tts"],
          input: {
            assetId: { $assetId: "tts" },
            startMs: seg.startMs,
            durationMs: seg.endMs - seg.startMs,
          },
          cost: ctx.cost("trim-audio"),
        });

        steps.push({
          key: lipsyncKey,
          name: `Segment ${i + 1} lip-sync`,
          stepType: "lipsync",
          dependsOn: [audioKey, portraitKey],
          input: {
            image_url: { $asset: portraitKey },
            audio_url: { $asset: audioKey },
          },
          providerModelId: p.lipsyncModelId,
          cost: ctx.cost("lipsync", p.lipsyncModelId),
        });
      });

      // Keyed "concat" (NOT "merge") so the executor's sink rule picks the true
      // terminal step (mux), not this mid-graph video concatenation.
      steps.push({
        key: "concat",
        name: "Concatenate segments",
        stepType: "merge",
        dependsOn: lipsyncKeys,
        input: { videos: lipsyncKeys.map((k) => ({ $assetId: k })) },
        cost: ctx.cost("merge"),
      });

      // Replace the per-clip audio with the full original TTS track for clean,
      // gap-free sound across the whole episode.
      steps.push({
        key: "mux",
        name: "Attach full audio track",
        stepType: "mux-audio",
        dependsOn: ["concat", "tts"],
        input: { video_url: { $asset: "concat" }, audio_url: { $asset: "tts" } },
        cost: ctx.cost("mux-audio"),
      });

      return steps;
    }

    return [];
  },

  estimateUpperBound(params, ctx) {
    const p = params as PodcastParams;
    return (
      ctx.cost("llm", p.scriptModelId) +
      2 * ctx.cost("image", p.imageModelId) +
      ctx.cost("tts", p.ttsModelId) +
      ctx.cost("stt", p.sttModelId) +
      MAX_SEGMENTS * (ctx.cost("trim-audio") + ctx.cost("lipsync", p.lipsyncModelId)) +
      ctx.cost("merge") +
      ctx.cost("mux-audio")
    );
  },
};
