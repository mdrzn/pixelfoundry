"use server";

import { z } from "zod";
import { PipelineType, Provider } from "@prisma/client";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { submitPipeline } from "@/lib/pipeline/submit";

const LLM_MODEL_SLUG = "fal-ai/any-llm";

const schema = z.object({
  text: z.string().min(1, "Enter some text to translate.").max(5000, "Text is too long (max 5000 characters)."),
  targetLanguage: z.string().min(2, "Select a target language."),
});

export type SubmitTranslateTextResult =
  | { ok: true; pipelineId: string; heldCost: number }
  | { ok: false; error: string };

export async function submitTranslateTextAction(input: unknown): Promise<SubmitTranslateTextResult> {
  const session = await getSession();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { text, targetLanguage } = parsed.data;

  const model = await prisma.providerModel.findFirst({
    where: { provider: Provider.FAL, isActive: true, slug: LLM_MODEL_SLUG },
    select: { id: true },
  });
  if (!model) {
    return { ok: false, error: "Translation model is not configured yet." };
  }

  try {
    const { pipelineId, heldCost } = await submitPipeline({
      userId: session.user.id,
      type: PipelineType.TRANSLATE_TEXT,
      params: { text, targetLanguage, llmModelId: model.id },
    });
    return { ok: true, pipelineId, heldCost };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to start translation." };
  }
}
