"use server";

import { z } from "zod";
import { JobType, PipelineType, Provider } from "@prisma/client";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { submitPipeline } from "@/lib/pipeline/submit";
import { SHORTS_MODEL_SLUGS } from "@/lib/pipeline/audio-models";

const schema = z.object({
  topic: z.string().min(5, "Topic must be at least 5 characters").max(500, "Topic too long"),
  aspectRatio: z.string().default("9:16"),
  // Optional overrides from the page; fall back to first active FAL model by job type.
  imageModelId: z.string().optional(),
  videoModelId: z.string().optional(),
});

export type SubmitShortsResult =
  | { ok: true; pipelineId: string; heldCost: number }
  | { ok: false; error: string };

const MODELS_ERROR = "Shorts models not configured yet.";

export async function submitShortsAction(input: unknown): Promise<SubmitShortsResult> {
  const session = await getSession();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { topic, aspectRatio, imageModelId: imgOverride, videoModelId: vidOverride } = parsed.data;

  // Slug-resolved models (script, voice, music, subtitle, mux — seeded in P5-5).
  const slugModels = await prisma.providerModel.findMany({
    where: {
      provider: Provider.FAL,
      isActive: true,
      slug: { in: Object.values(SHORTS_MODEL_SLUGS) },
    },
    select: { id: true, slug: true },
  });
  const bySlug = new Map(slugModels.map((m) => [m.slug, m.id]));
  const scriptModelId = bySlug.get(SHORTS_MODEL_SLUGS.script);
  const voiceModelId = bySlug.get(SHORTS_MODEL_SLUGS.voice);
  const musicModelId = bySlug.get(SHORTS_MODEL_SLUGS.music);
  const subtitleModelId = bySlug.get(SHORTS_MODEL_SLUGS.subtitle);
  const muxModelId = bySlug.get(SHORTS_MODEL_SLUGS.mux);

  // Image + video: reuse the same fal models Multi-Shot uses (first active by job
  // type), or accept an explicit id from the page.
  const [imageModel, videoModel] = await Promise.all([
    imgOverride
      ? prisma.providerModel.findFirst({ where: { id: imgOverride }, select: { id: true } })
      : prisma.providerModel.findFirst({
          where: { provider: Provider.FAL, isActive: true, jobTypes: { has: JobType.CREATE_IMAGE } },
          orderBy: { displayName: "asc" },
          select: { id: true },
        }),
    vidOverride
      ? prisma.providerModel.findFirst({ where: { id: vidOverride }, select: { id: true } })
      : prisma.providerModel.findFirst({
          where: { provider: Provider.FAL, isActive: true, jobTypes: { has: JobType.CREATE_VIDEO } },
          orderBy: { displayName: "asc" },
          select: { id: true },
        }),
  ]);

  const imageModelId = imageModel?.id;
  const videoModelId = videoModel?.id;

  if (
    !scriptModelId ||
    !voiceModelId ||
    !musicModelId ||
    !subtitleModelId ||
    !muxModelId ||
    !imageModelId ||
    !videoModelId
  ) {
    return { ok: false, error: MODELS_ERROR };
  }

  try {
    const { pipelineId, heldCost } = await submitPipeline({
      userId: session.user.id,
      type: PipelineType.SHORTS,
      params: {
        topic,
        aspectRatio,
        scriptModelId,
        imageModelId,
        videoModelId,
        voiceModelId,
        musicModelId,
        subtitleModelId,
        muxModelId,
      },
    });
    return { ok: true, pipelineId, heldCost };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to start generation." };
  }
}
