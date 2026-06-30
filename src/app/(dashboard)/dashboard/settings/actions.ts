"use server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const profileSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name too long"),
});

export type UpdateProfileState = {
  ok: boolean;
  error?: string;
};

export async function updateProfileAction(
  _prevState: UpdateProfileState,
  formData: FormData,
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = profileSchema.safeParse({
    name: formData.get("name")?.toString(),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: parsed.data.name,
      },
    });
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update profile.";
    return { ok: false, error: message };
  }
}

