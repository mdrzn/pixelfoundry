"use server";

import { z } from "zod";
import { PipelineType, Provider } from "@prisma/client";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { submitPipeline } from "@/lib/pipeline/submit";
import { AUDIO_MODEL_SLUGS } from "@/lib/pipeline/audio-models";

const schema = z.object({
  audioAssetId: z.string().min(1, "Upload an audio file."),
  targetLanguage: z.string().min(2, "Select a target language."),
});

export type SubmitVoiceoverResult =
  | { ok: true; pipelineId: string; heldCost: number }
  | { ok: false; error: string };

export async function submitVoiceoverAction(input: unknown): Promise<SubmitVoiceoverResult> {
  const session = await getSession();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { audioAssetId, targetLanguage } = parsed.data;

  const asset = await prisma.asset.findUnique({ where: { id: audioAssetId } });
  if (!asset || asset.userId !== session.user.id) {
    return { ok: false, error: "Audio file not found." };
  }

  const models = await prisma.providerModel.findMany({
    where: {
      provider: Provider.FAL,
      isActive: true,
      slug: { in: Object.values(AUDIO_MODEL_SLUGS) },
    },
    select: { id: true, slug: true },
  });
  const bySlug = new Map(models.map((m) => [m.slug, m.id]));
  const sttModelId = bySlug.get(AUDIO_MODEL_SLUGS.stt);
  const ttsModelId = bySlug.get(AUDIO_MODEL_SLUGS.tts);
  const cloneModelId = bySlug.get(AUDIO_MODEL_SLUGS.clone);

  if (!sttModelId || !ttsModelId || !cloneModelId) {
    return { ok: false, error: "Voice-over models are not configured yet." };
  }

  try {
    const { pipelineId, heldCost } = await submitPipeline({
      userId: session.user.id,
      type: PipelineType.VOICEOVER,
      params: {
        audioUrl: asset.url,
        audioAssetId,
        targetLanguage,
        sttModelId,
        ttsModelId,
        cloneModelId,
      },
    });
    return { ok: true, pipelineId, heldCost };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to start generation." };
  }
}
