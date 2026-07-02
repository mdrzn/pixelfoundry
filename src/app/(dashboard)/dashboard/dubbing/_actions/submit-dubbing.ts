"use server";

import { z } from "zod";
import { PipelineType, Provider, AssetType } from "@prisma/client";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { submitPipeline } from "@/lib/pipeline/submit";
import {
  AUDIO_MODEL_SLUGS,
  PODCAST_MODEL_SLUGS,
  SHORTS_MODEL_SLUGS,
} from "@/lib/pipeline/audio-models";

const schema = z.object({
  videoAssetId: z.string().min(1, "Upload a video."),
  targetLanguage: z.string().min(2, "Select a target language."),
  lipsync: z.boolean().default(false),
});

export type SubmitDubbingResult =
  | { ok: true; pipelineId: string; heldCost: number }
  | { ok: false; error: string };

export async function submitDubbingAction(input: unknown): Promise<SubmitDubbingResult> {
  const session = await getSession();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { videoAssetId, targetLanguage, lipsync } = parsed.data;

  const asset = await prisma.asset.findUnique({ where: { id: videoAssetId } });
  if (!asset || asset.userId !== session.user.id) {
    return { ok: false, error: "Video not found." };
  }
  if (asset.type !== AssetType.VIDEO) {
    return { ok: false, error: "Selected asset must be a video." };
  }

  const slugs = [
    AUDIO_MODEL_SLUGS.stt,
    AUDIO_MODEL_SLUGS.tts,
    AUDIO_MODEL_SLUGS.clone,
    PODCAST_MODEL_SLUGS.lipsync,
    SHORTS_MODEL_SLUGS.mux,
    SHORTS_MODEL_SLUGS.script,
  ];
  const models = await prisma.providerModel.findMany({
    where: {
      provider: Provider.FAL,
      isActive: true,
      slug: { in: slugs },
    },
    select: { id: true, slug: true },
  });
  const bySlug = new Map(models.map((m) => [m.slug, m.id]));
  const sttModelId = bySlug.get(AUDIO_MODEL_SLUGS.stt);
  const ttsModelId = bySlug.get(AUDIO_MODEL_SLUGS.tts);
  const cloneModelId = bySlug.get(AUDIO_MODEL_SLUGS.clone);
  const lipsyncModelId = bySlug.get(PODCAST_MODEL_SLUGS.lipsync);
  const muxModelId = bySlug.get(SHORTS_MODEL_SLUGS.mux);
  const llmModelId = bySlug.get(SHORTS_MODEL_SLUGS.script);

  if (
    !sttModelId ||
    !ttsModelId ||
    !cloneModelId ||
    !lipsyncModelId ||
    !muxModelId ||
    !llmModelId
  ) {
    return { ok: false, error: "Dubbing models are not configured yet." };
  }

  try {
    const { pipelineId, heldCost } = await submitPipeline({
      userId: session.user.id,
      type: PipelineType.DUBBING,
      params: {
        videoUrl: asset.url,
        videoAssetId,
        targetLanguage,
        lipsync,
        sttModelId,
        ttsModelId,
        cloneModelId,
        lipsyncModelId,
        muxModelId,
        llmModelId,
      },
    });
    return { ok: true, pipelineId, heldCost };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to start dubbing." };
  }
}
