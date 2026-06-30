"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { checkRateLimit } from "@/lib/rate-limit";
import { createUserWithStarterCredits } from "@/lib/users";

const REGISTER_RATE_LIMIT = {
  name: "register",
  maxRequests: 5,
  windowSeconds: 3600, // 5 registrations per hour per IP
};

const registerSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name too long"),
  email: z.string().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[A-Za-z])(?=.*\d).+$/,
      "Password must contain letters and numbers",
    ),
});

export type RegisterActionState = {
  ok: boolean;
  error?: string;
};

export async function registerAction(
  _prevState: RegisterActionState,
  formData: FormData,
) {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = checkRateLimit(REGISTER_RATE_LIMIT, ip);
  if (!allowed) {
    return {
      ok: false,
      error: "Too many registration attempts. Please try again later.",
    };
  }

  try {
    await createUserWithStarterCredits(parsed.data);
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create account.";
    return { ok: false, error: message };
  }
}
