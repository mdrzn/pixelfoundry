"use server";

import { z } from "zod";
import { JobType, PipelineType, Provider } from "@prisma/client";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { submitPipeline } from "@/lib/pipeline/submit";
import { SCENE_BUILDER_MODEL_SLUGS } from "@/lib/pipeline/audio-models";

const schema = z.object({
  concept: z
    .string()
    .min(10, "Concept must be at least 10 characters")
    .max(2000, "Concept too long"),
  aspectRatio: z.string().default("16:9"),
});

export type SubmitSceneBuilderResult =
  | { ok: true; pipelineId: string; heldCost: number }
  | { ok: false; error: string };

const MODELS_ERROR = "Scene Builder models not configured yet.";

export async function submitSceneBuilderAction(input: unknown): Promise<SubmitSceneBuilderResult> {
  const session = await getSession();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { concept, aspectRatio } = parsed.data;

  // Slug-resolved models (script, imageEdit — seeded in P5-5).
  const slugModels = await prisma.providerModel.findMany({
    where: {
      provider: Provider.FAL,
      isActive: true,
      slug: { in: Object.values(SCENE_BUILDER_MODEL_SLUGS) },
    },
    select: { id: true, slug: true },
  });
  const bySlug = new Map(slugModels.map((m) => [m.slug, m.id]));
  const scriptModelId = bySlug.get(SCENE_BUILDER_MODEL_SLUGS.script);
  const imageEditModelId = bySlug.get(SCENE_BUILDER_MODEL_SLUGS.imageEdit);

  // Image + video: first active FAL model by job type.
  const [imageModel, videoModel] = await Promise.all([
    prisma.providerModel.findFirst({
      where: { provider: Provider.FAL, isActive: true, jobTypes: { has: JobType.CREATE_IMAGE } },
      orderBy: { displayName: "asc" },
      select: { id: true },
    }),
    prisma.providerModel.findFirst({
      where: { provider: Provider.FAL, isActive: true, jobTypes: { has: JobType.CREATE_VIDEO } },
      orderBy: { displayName: "asc" },
      select: { id: true },
    }),
  ]);

  const imageModelId = imageModel?.id;
  const videoModelId = videoModel?.id;

  if (!scriptModelId || !imageEditModelId || !imageModelId || !videoModelId) {
    return { ok: false, error: MODELS_ERROR };
  }

  try {
    const { pipelineId, heldCost } = await submitPipeline({
      userId: session.user.id,
      type: PipelineType.SCENE_BUILDER,
      params: {
        concept,
        aspectRatio,
        scriptModelId,
        imageModelId,
        imageEditModelId,
        videoModelId,
      },
    });
    return { ok: true, pipelineId, heldCost };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to start generation." };
  }
}
