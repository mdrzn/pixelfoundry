import { CreditReason, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";

import { STARTER_CREDIT_GRANT } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
};

export async function createUserWithStarterCredits(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existing) {
    throw new Error("An account with this email already exists.");
  }

  const hashedPassword = await hash(input.password, 10);
  const totalUsers = await prisma.user.count();

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        hashedPassword,
        credits: STARTER_CREDIT_GRANT,
        ...(totalUsers === 0 ? { role: UserRole.ADMIN } : {}),
      },
    });

    await tx.creditLedger.create({
      data: {
        userId: user.id,
        delta: STARTER_CREDIT_GRANT,
        balanceAfter: STARTER_CREDIT_GRANT,
        reason: CreditReason.GRANT,
        metadata: { description: "Starter pack" },
      },
    });

    return user;
  });
}

export function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      creditLedger: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });
}

