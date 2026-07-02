"use server";

import { z } from "zod";
import { JobType, PipelineType, Provider } from "@prisma/client";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { submitPipeline } from "@/lib/pipeline/submit";
import { PODCAST_MODEL_SLUGS } from "@/lib/pipeline/audio-models";

const schema = z
  .object({
    topic: z.string().max(2000, "Topic too long").optional(),
    script: z.string().max(8000, "Script too long").optional(),
    speaker1: z.string().min(1).default("Host"),
    speaker2: z.string().min(1).default("Guest"),
  })
  .refine((v) => (v.topic && v.topic.trim().length > 0) || (v.script && v.script.trim().length > 0), {
    message: "Provide a topic or a script.",
  });

export type SubmitPodcastResult =
  | { ok: true; pipelineId: string; heldCost: number }
  | { ok: false; error: string };

const MODELS_ERROR = "Podcast models not configured yet.";

export async function submitPodcastAction(input: unknown): Promise<SubmitPodcastResult> {
  const session = await getSession();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { topic, script, speaker1, speaker2 } = parsed.data;

  // Slug-resolved models (script, tts, stt, lipsync — seeded in P5-5).
  const slugModels = await prisma.providerModel.findMany({
    where: {
      provider: Provider.FAL,
      isActive: true,
      slug: { in: Object.values(PODCAST_MODEL_SLUGS) },
    },
    select: { id: true, slug: true },
  });
  const bySlug = new Map(slugModels.map((m) => [m.slug, m.id]));
  const scriptModelId = bySlug.get(PODCAST_MODEL_SLUGS.script);
  const ttsModelId = bySlug.get(PODCAST_MODEL_SLUGS.tts);
  const sttModelId = bySlug.get(PODCAST_MODEL_SLUGS.stt);
  const lipsyncModelId = bySlug.get(PODCAST_MODEL_SLUGS.lipsync);

  // Image: first active FAL model by job type.
  const imageModel = await prisma.providerModel.findFirst({
    where: { provider: Provider.FAL, isActive: true, jobTypes: { has: JobType.CREATE_IMAGE } },
    orderBy: { displayName: "asc" },
    select: { id: true },
  });
  const imageModelId = imageModel?.id;

  if (!scriptModelId || !ttsModelId || !sttModelId || !lipsyncModelId || !imageModelId) {
    return { ok: false, error: MODELS_ERROR };
  }

  try {
    const { pipelineId, heldCost } = await submitPipeline({
      userId: session.user.id,
      type: PipelineType.PODCAST,
      params: {
        topic,
        script,
        speaker1,
        speaker2,
        scriptModelId,
        imageModelId,
        ttsModelId,
        sttModelId,
        lipsyncModelId,
      },
    });
    return { ok: true, pipelineId, heldCost };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to start generation." };
  }
}
