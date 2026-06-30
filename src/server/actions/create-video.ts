"use server";

import { z } from "zod";

import { createVideoJob } from "@/lib/jobs";
import { getSession } from "@/lib/session";

const schema = z.object({
  prompt: z
    .string()
    .min(10, "Prompt must be at least 10 characters")
    .max(900, "Prompt too long"),
  providerModelId: z.string().min(1, "Select a model"),
  duration: z.coerce.number().min(2).max(30),
  referenceUrl: z.string().url().optional(),
  frameRate: z.coerce.number().min(8).max(60).optional(),
});

export type CreateVideoActionState = {
  ok: boolean;
  balanceAfter?: number;
  error?: string;
};

export async function submitCreateVideoAction(
  _prevState: CreateVideoActionState,
  formData: FormData,
): Promise<CreateVideoActionState> {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false, error: "Please sign in to request video jobs." };
  }

  const parsed = schema.safeParse({
    prompt: formData.get("prompt")?.toString(),
    providerModelId: formData.get("providerModelId")?.toString(),
    duration: formData.get("duration")?.toString(),
    referenceUrl: formData.get("referenceUrl")?.toString() || undefined,
    frameRate: formData.get("frameRate")?.toString(),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const result = await createVideoJob({
      userId: session.user.id,
      prompt: parsed.data.prompt,
      providerModelId: parsed.data.providerModelId,
      duration: parsed.data.duration,
      referenceUrl: parsed.data.referenceUrl,
      frameRate: parsed.data.frameRate,
      metadata: { requestedAt: new Date().toISOString() },
    });

    return { ok: true, balanceAfter: result.balanceAfter };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to submit video job.",
    };
  }
}
