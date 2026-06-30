"use server";

import { Provider, UserRole, CreditReason } from "@prisma/client";
import { z } from "zod";

import {
  updateProviderCredential,
  updateUserRole,
  getUserDetails,
  getUserCreditHistory,
  getUserJobHistory,
  addCreditsToUser,
} from "@/lib/admin";
import { getSession } from "@/lib/session";
import { refreshModelSchema as refreshModelSchemaImpl } from "@/server/actions/refresh-model-schemas";

const providerSchema = z.object({
  provider: z.nativeEnum(Provider),
  apiKey: z.string().optional(),
  label: z.string().max(120).optional(),
  isActive: z.boolean(),
});

export type ProviderActionState = {
  ok: boolean;
  message?: string;
};

export async function updateProviderAction(
  _prevState: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const parsed = providerSchema.safeParse({
    provider: formData.get("provider"),
    apiKey: formData.get("apiKey")?.toString().trim(),
    label: formData.get("label")?.toString().trim() || undefined,
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  const apiKey = parsed.data.apiKey && parsed.data.apiKey.length > 0 ? parsed.data.apiKey : undefined;

  try {
    await updateProviderCredential({ ...parsed.data, apiKey });
    return { ok: true, message: "Provider credentials saved." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to save provider credentials.",
    };
  }
}

const roleSchema = z.object({
  userId: z.string().cuid(),
  role: z.nativeEnum(UserRole),
});

export type RoleActionState = {
  ok: boolean;
  message?: string;
};

export async function updateRoleAction(
  _prevState: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const parsed = roleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    await updateUserRole(parsed.data);
    return { ok: true, message: "Role updated." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to update user role.",
    };
  }
}

const addCreditsSchema = z.object({
  userId: z.string().cuid(),
  amount: z.number().int(),
  reason: z.nativeEnum(CreditReason),
  notes: z.string().max(500).optional(),
});

export type AddCreditsActionState = {
  ok: boolean;
  message?: string;
  newBalance?: number;
};

export async function addCreditsAction(
  _prevState: AddCreditsActionState,
  formData: FormData,
): Promise<AddCreditsActionState> {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false, message: "Unauthorized" };
  }

  const amountStr = formData.get("amount")?.toString();
  const amount = amountStr ? parseInt(amountStr, 10) : NaN;

  const parsed = addCreditsSchema.safeParse({
    userId: formData.get("userId"),
    amount,
    reason: formData.get("reason"),
    notes: formData.get("notes")?.toString() || undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const result = await addCreditsToUser({
      ...parsed.data,
      adminId: session.user.id,
    });
    return {
      ok: true,
      message: `Successfully ${parsed.data.amount > 0 ? "added" : "deducted"} ${Math.abs(parsed.data.amount)} credits.`,
      newBalance: result.newBalance,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to adjust credits.",
    };
  }
}

export async function getUserDetailsAction(userId: string) {
  try {
    const details = await getUserDetails(userId);
    return { ok: true, data: details };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to fetch user details.",
    };
  }
}

export async function getUserCreditHistoryAction(userId: string, limit?: number) {
  try {
    const history = await getUserCreditHistory(userId, limit);
    return { ok: true, data: history };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to fetch credit history.",
    };
  }
}

export async function getUserJobHistoryAction(userId: string, limit?: number) {
  try {
    const jobs = await getUserJobHistory(userId, limit);
    return { ok: true, data: jobs };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to fetch job history.",
    };
  }
}

// Refresh model schema action
export async function refreshModelSchema(modelId: string) {
  return await refreshModelSchemaImpl(modelId);
}
