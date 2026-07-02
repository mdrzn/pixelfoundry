"use server";

import { z } from "zod";
import { PipelineType, Provider } from "@prisma/client";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { submitPipeline } from "@/lib/pipeline/submit";
import { TRANSLATION_ASSET_MODEL_SLUGS } from "@/lib/pipeline/audio-models";

const schema = z.object({
  videoAssetId: z.string().min(1, "Upload a video."),
  targetLanguage: z.string().optional(),
});

export type SubmitSubtitlesResult =
  | { ok: true; pipelineId: string; heldCost: number }
  | { ok: false; error: string };

export async function submitSubtitlesAction(
  input: unknown,
): Promise<SubmitSubtitlesResult> {
  const session = await getSession();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { videoAssetId, targetLanguage } = parsed.data;

  const asset = await prisma.asset.findUnique({ where: { id: videoAssetId } });
  if (!asset || asset.userId !== session.user.id) {
    return { ok: false, error: "Video not found." };
  }

  const model = await prisma.providerModel.findFirst({
    where: {
      provider: Provider.FAL,
      isActive: true,
      slug: TRANSLATION_ASSET_MODEL_SLUGS.subtitle,
    },
    select: { id: true },
  });
  if (!model) {
    return { ok: false, error: "Subtitle model is not configured yet." };
  }

  try {
    const { pipelineId, heldCost } = await submitPipeline({
      userId: session.user.id,
      type: PipelineType.SUBTITLES,
      params: {
        videoUrl: asset.url,
        videoAssetId,
        ...(targetLanguage ? { targetLanguage } : {}),
        subtitleModelId: model.id,
      },
    });
    return { ok: true, pipelineId, heldCost };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to start subtitle generation.",
    };
  }
}
