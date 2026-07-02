"use server";

import { z } from "zod";
import { PipelineType } from "@prisma/client";

import { getSession } from "@/lib/session";
import { submitPipeline } from "@/lib/pipeline/submit";

const schema = z.object({
  story: z.string().min(10, "Story must be at least 10 characters").max(2000, "Story too long"),
  imageModelId: z.string().min(1, "Select an image model"),
  videoModelId: z.string().min(1, "Select a video model"),
  llmModelId: z.string().optional(),
  maxShots: z.coerce.number().int().min(1).max(8).default(4),
  aspectRatio: z.string().default("9:16"),
});

export type SubmitMultiShotResult =
  | { ok: true; pipelineId: string; heldCost: number }
  | { ok: false; error: string };

export async function submitMultiShotAction(input: unknown): Promise<SubmitMultiShotResult> {
  const session = await getSession();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const { pipelineId, heldCost } = await submitPipeline({
      userId: session.user.id,
      type: PipelineType.MULTI_SHOT,
      params: parsed.data,
    });
    return { ok: true, pipelineId, heldCost };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to start generation." };
  }
}
