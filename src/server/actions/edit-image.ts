"use server";

import { z } from "zod";

import { createEditImageJob } from "@/lib/jobs";
import { getSession } from "@/lib/session";

const schema = z.object({
  prompt: z
    .string()
    .min(5, "Prompt too short")
    .max(800, "Prompt too long"),
  mode: z.enum(["INPAINT", "OUTPAINT", "STYLE"]),
  providerModelId: z.string().min(1, "Select a model"),
  inputImageUrl: z.string().url("Enter a valid image URL").optional(),
  maskUrl: z.string().url("Enter a valid mask URL").optional(),
  referenceAssetIds: z.array(z.string()).optional(),
});

export type EditImageActionState = {
  ok: boolean;
  error?: string;
  balanceAfter?: number;
};

export async function submitEditImageAction(
  _prevState: EditImageActionState,
  formData: FormData,
): Promise<EditImageActionState> {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false, error: "Please sign in to edit images." };
  }

  // Parse referenceAssetIds from form data
  const referenceAssetIdsStr = formData.get("referenceAssetIds")?.toString();
  const referenceAssetIds = referenceAssetIdsStr
    ? referenceAssetIdsStr.split(",").filter((id) => id.trim().length > 0)
    : undefined;

  const parsed = schema.safeParse({
    prompt: formData.get("prompt")?.toString(),
    mode: formData.get("mode")?.toString(),
    providerModelId: formData.get("providerModelId")?.toString(),
    inputImageUrl: formData.get("inputImageUrl")?.toString() || undefined,
    maskUrl: formData.get("maskUrl")?.toString() || undefined,
    referenceAssetIds,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const result = await createEditImageJob({
      userId: session.user.id,
      prompt: parsed.data.prompt,
      mode: parsed.data.mode,
      providerModelId: parsed.data.providerModelId,
      inputImageUrl: parsed.data.inputImageUrl,
      maskUrl: parsed.data.maskUrl,
      referenceAssetIds: parsed.data.referenceAssetIds,
      metadata: { requestedAt: new Date().toISOString() },
    });

    return { ok: true, balanceAfter: result.balanceAfter };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to submit edit job.",
    };
  }
}
