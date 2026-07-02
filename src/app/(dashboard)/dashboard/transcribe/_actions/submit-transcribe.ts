"use server";

import { z } from "zod";
import { PipelineType, Provider } from "@prisma/client";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { submitPipeline } from "@/lib/pipeline/submit";
import { AUDIO_MODEL_SLUGS } from "@/lib/pipeline/audio-models";

const schema = z.object({
  audioAssetId: z.string().min(1, "Upload an audio file."),
});

export type SubmitTranscribeResult =
  | { ok: true; pipelineId: string; heldCost: number }
  | { ok: false; error: string };

export async function submitTranscribeAction(input: unknown): Promise<SubmitTranscribeResult> {
  const session = await getSession();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { audioAssetId } = parsed.data;

  const asset = await prisma.asset.findUnique({ where: { id: audioAssetId } });
  if (!asset || asset.userId !== session.user.id) {
    return { ok: false, error: "Audio file not found." };
  }

  const model = await prisma.providerModel.findFirst({
    where: { provider: Provider.FAL, isActive: true, slug: AUDIO_MODEL_SLUGS.stt },
    select: { id: true },
  });
  if (!model) {
    return { ok: false, error: "Transcription model is not configured yet." };
  }

  try {
    const { pipelineId, heldCost } = await submitPipeline({
      userId: session.user.id,
      type: PipelineType.TRANSCRIBE,
      params: { audioUrl: asset.url, audioAssetId, sttModelId: model.id },
    });
    return { ok: true, pipelineId, heldCost };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to start transcription." };
  }
}
