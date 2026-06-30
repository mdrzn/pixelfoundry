"use server";

import { z } from "zod";

import { createImageJob } from "@/lib/jobs";
import { getSession } from "@/lib/session";

const aspectRatioPattern = /^(\d{1,2}):(\d{1,2})$/;

const numeric = (schema: z.ZodTypeAny) =>
  z.preprocess((value) => {
    if (value === null || value === undefined || value === "") {
      return undefined;
    }
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : value;
  }, schema);

const booleanOptional = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const normalized = value.toString().toLowerCase();
  return ["true", "1", "on", "yes"].includes(normalized);
}, z.boolean().optional());

const schema = z
  .object({
    prompt: z
      .string()
      .min(10, "Prompt must be at least 10 characters")
      .max(800, "Prompt too long"),
    negativePrompt: z.string().max(400).optional(),
    providerModelId: z.string().min(1, "Select a model"),
    aspectRatio: z
      .string()
      .regex(aspectRatioPattern, "Use aspect ratio format like 16:9.")
      .optional(),
    width: numeric(z.number().int().min(256).max(2048).optional()),
    height: numeric(z.number().int().min(256).max(2048).optional()),
    cfgScale: numeric(z.number().min(1).max(30).optional()),
    steps: numeric(z.number().int().min(10).max(250).optional()),
    seed: numeric(
      z
        .number()
        .int()
        .min(0)
        .max(2_147_483_647)
        .optional(),
    ),
    sampler: z.string().max(64).optional(),
    upscale: booleanOptional,
    enhancePrompt: booleanOptional,
    outputCount: numeric(z.number().int().min(1).max(8).default(1)),
    appliedPresetId: z.string().optional(),
    referenceAssetIds: z.array(z.string()).max(8).default([]),
  })
  .superRefine((value, ctx) => {
    if ((value.width && !value.height) || (!value.width && value.height)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide both width and height or leave both blank.",
        path: ["width"],
      });
    }
    if (!value.aspectRatio && !value.width && !value.height) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose an aspect ratio or set explicit dimensions.",
        path: ["aspectRatio"],
      });
    }
  });

export type CreateImageActionState = {
  ok: boolean;
  balanceAfter?: number;
  error?: string;
  jobCount?: number;
};

function enhancePromptText(prompt: string) {
  const additives = [
    "highly detailed",
    "cinematic lighting",
    "8k uhd",
    "sharp focus",
    "volumetric light",
  ];

  const normalized = prompt.toLowerCase();
  const missing = additives.filter((token) => !normalized.includes(token));

  if (!missing.length) {
    return prompt;
  }

  return `${prompt.trim()}, ${missing.join(", ")}`;
}

export async function submitCreateImageAction(
  _prevState: CreateImageActionState,
  formData: FormData,
): Promise<CreateImageActionState> {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false, error: "You need to be signed in to create images." };
  }

  const parsed = schema.safeParse({
    prompt: formData.get("prompt")?.toString(),
    negativePrompt: formData.get("negativePrompt")?.toString() || undefined,
    providerModelId: formData.get("providerModelId")?.toString(),
    aspectRatio: formData.get("aspectRatio")?.toString() || undefined,
    width: formData.get("width"),
    height: formData.get("height"),
    cfgScale: formData.get("cfgScale"),
    steps: formData.get("steps"),
    seed: formData.get("seed"),
    sampler: formData.get("sampler")?.toString() || undefined,
    upscale: formData.get("upscale"),
    enhancePrompt: formData.get("enhancePrompt"),
    outputCount: formData.get("outputCount"),
    appliedPresetId: formData.get("appliedPresetId")?.toString() || undefined,
    referenceAssetIds: Array.from(new Set(formData.getAll("referenceAssetIds").map((item) => item.toString()))).filter(
      (value) => value.length > 0,
    ),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const jobsCreated: string[] = [];
    let latestBalance = 0;
    const promptToUse = parsed.data.enhancePrompt
      ? enhancePromptText(parsed.data.prompt)
      : parsed.data.prompt;

    for (let index = 0; index < ((parsed.data.outputCount as number) ?? 1); index += 1) {
      const result = await createImageJob({
        userId: session.user.id,
        prompt: promptToUse,
        negativePrompt: parsed.data.negativePrompt,
        providerModelId: parsed.data.providerModelId,
        aspectRatio: parsed.data.aspectRatio,
        width: parsed.data.width as number | undefined,
        height: parsed.data.height as number | undefined,
        cfgScale: parsed.data.cfgScale as number | undefined,
        steps: parsed.data.steps as number | undefined,
        seed: parsed.data.seed !== undefined ? (parsed.data.seed as number) + index : undefined,
        sampler: parsed.data.sampler,
        upscale: parsed.data.upscale ?? false,
        referenceAssetIds: parsed.data.referenceAssetIds,
        appliedPresetId: parsed.data.appliedPresetId,
        enhancedPrompt: Boolean(parsed.data.enhancePrompt),
        metadata: {
          requestedAt: new Date().toISOString(),
          batchIndex: index,
          batchSize: (parsed.data.outputCount as number) ?? 1,
        },
      });
      jobsCreated.push(result.jobId);
      latestBalance = result.balanceAfter;
    }

    return { ok: true, balanceAfter: latestBalance, jobCount: jobsCreated.length };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to submit job.",
    };
  }
}
