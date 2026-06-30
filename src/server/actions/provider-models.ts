"use server";

import { JobType, Provider } from "@prisma/client";
import { z } from "zod";

import {
  deleteProviderModel,
  toggleProviderModel,
  upsertProviderModel,
} from "@/lib/admin";

export type ProviderModelActionResult = {
  ok: boolean;
  message?: string;
};

const metadataSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value || value.trim().length === 0) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Metadata must be a JSON object.",
      });
      return z.NEVER;
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Metadata must be valid JSON.",
      });
      return z.NEVER;
    }
  });

const createSchema = z.object({
  provider: z.nativeEnum(Provider),
  jobTypes: z.array(z.nativeEnum(JobType)).min(1, "Select at least one job type."),
  displayName: z.string().min(2, "Display name is required."),
  description: z.string().optional(),
  slug: z.string().min(2, "Slug is required."),
  creditCost: z.coerce.number().int().positive("Credit cost must be positive."),
  metadata: metadataSchema,
});

const updateSchema = createSchema.extend({
  id: z.string().cuid("Invalid provider model id."),
});

const toggleSchema = z.object({
  id: z.string().cuid("Invalid provider model id."),
  isActive: z.boolean(),
});

const deleteSchema = z.object({
  id: z.string().cuid("Invalid provider model id."),
});

export async function createProviderModelAction(
  input: unknown,
): Promise<ProviderModelActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid provider model details.",
    };
  }

  try {
    await upsertProviderModel({
      provider: parsed.data.provider,
      jobTypes: parsed.data.jobTypes,
      slug: parsed.data.slug.trim(),
      displayName: parsed.data.displayName.trim(),
      description: parsed.data.description?.trim(),
      creditCost: parsed.data.creditCost,
      metadata: parsed.data.metadata,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to save provider model.",
    };
  }
}

export async function updateProviderModelAction(
  input: unknown,
): Promise<ProviderModelActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid provider model details.",
    };
  }

  try {
    await upsertProviderModel({
      id: parsed.data.id,
      provider: parsed.data.provider,
      jobTypes: parsed.data.jobTypes,
      slug: parsed.data.slug.trim(),
      displayName: parsed.data.displayName.trim(),
      description: parsed.data.description?.trim(),
      creditCost: parsed.data.creditCost,
      metadata: parsed.data.metadata,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to save provider model.",
    };
  }
}

export async function toggleProviderModelAction(
  input: unknown,
): Promise<ProviderModelActionResult> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid toggle request.",
    };
  }

  await toggleProviderModel(parsed.data);
  return { ok: true };
}

export async function deleteProviderModelAction(
  input: unknown,
): Promise<ProviderModelActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid provider model id.",
    };
  }

  try {
    await deleteProviderModel(parsed.data.id);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to delete provider model.",
    };
  }
}
