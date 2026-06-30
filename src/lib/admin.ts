"use server";

import { Prisma, Provider, UserRole, JobType, CreditReason } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function requireAdminUser() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!user || user.role !== UserRole.ADMIN) {
    redirect("/dashboard");
  }

  return user;
}

export async function getAdminDashboardData() {
  await requireAdminUser();

  const [
    totalUsers,
    totalJobs,
    creditsGrantedAgg,
    creditsSpentAgg,
    jobsByType,
    jobsByStatus,
    recentJobs,
    providerCredentials,
    providerModels,
    users,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.job.count(),
    prisma.creditLedger.aggregate({
      where: { delta: { gt: 0 } },
      _sum: { delta: true },
    }),
    prisma.creditLedger.aggregate({
      where: { delta: { lt: 0 } },
      _sum: { delta: true },
    }),
    prisma.job.groupBy({
      by: ["type"],
      _count: { _all: true },
    }),
    prisma.job.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.job.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        type: true,
        status: true,
        provider: true,
        createdAt: true,
        user: {
          select: {
            email: true,
            name: true,
          },
        },
        cost: true,
        prompt: true,
      },
    }),
    prisma.providerCredential.findMany({
      orderBy: { provider: "asc" },
    }),
    prisma.providerModel.findMany({
      orderBy: [
        { provider: "asc" },
        { displayName: "asc" },
      ],
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        credits: true,
        createdAt: true,
        _count: {
          select: {
            jobs: true,
            creditLedger: true,
          },
        },
      },
    }),
  ]);

  return {
    metrics: {
      totalUsers,
      totalJobs,
      creditsGranted: creditsGrantedAgg._sum.delta ?? 0,
      creditsSpent: Math.abs(creditsSpentAgg._sum.delta ?? 0),
    },
    jobsByType,
    jobsByStatus,
    recentJobs,
    providerCredentials,
    providerModels,
    users,
  };
}

export async function updateProviderCredential({
  provider,
  apiKey,
  label,
  isActive,
  metadata,
}: {
  provider: Provider;
  apiKey?: string | null;
  label?: string | null;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}) {
  const admin = await requireAdminUser();

  let resolvedKey = apiKey?.trim();
  if (!resolvedKey) {
    const existing = await prisma.providerCredential.findUnique({
      where: { provider },
      select: { apiKey: true },
    });

    if (!existing) {
      throw new Error("API key is required for new provider integration.");
    }

    resolvedKey = existing.apiKey;
  }

  const payload = {
    apiKey: resolvedKey,
    label,
    isActive,
    metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
    updatedBy: admin.id,
  };

  await prisma.providerCredential.upsert({
    where: { provider },
    create: {
      provider,
      apiKey: resolvedKey,
      label,
      isActive,
      metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
      createdBy: admin.id,
      updatedBy: admin.id,
    },
    update: payload,
  });

  revalidatePath("/dashboard/admin");
}

export async function updateUserRole({
  userId,
  role,
}: {
  userId: string;
  role: UserRole;
}) {
  const admin = await requireAdminUser();

  if (admin.id === userId && role !== UserRole.ADMIN) {
    throw new Error("Administrators cannot demote themselves.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  revalidatePath("/dashboard/admin");
}

export async function upsertProviderModel({
  id,
  provider,
  slug,
  displayName,
  description,
  jobTypes,
  creditCost,
  metadata,
  isActive,
}: {
  id?: string;
  provider: Provider;
  slug: string;
  displayName: string;
  description?: string;
  jobTypes: JobType[];
  creditCost: number;
  metadata?: Record<string, unknown>;
  isActive?: boolean;
}) {
  await requireAdminUser();

  const data = {
    provider,
    slug,
    displayName,
    description: description || undefined,
    jobTypes,
    creditCost,
    metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
    ...(typeof isActive === "boolean" ? { isActive } : {}),
  };

  if (id) {
    await prisma.providerModel.update({
      where: { id },
      data,
    });
  } else {
    await prisma.providerModel.create({
      data,
    });
  }

  revalidatePath("/dashboard/admin");
}

export async function toggleProviderModel({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  await requireAdminUser();

  await prisma.providerModel.update({
    where: { id },
    data: { isActive },
  });

  revalidatePath("/dashboard/admin");
}

export async function deleteProviderModel(id: string) {
  await requireAdminUser();

  await prisma.providerModel.delete({
    where: { id },
  });

  revalidatePath("/dashboard/admin");
}

export async function getProviderCredentialSecret(provider: Provider) {
  const credential = await prisma.providerCredential.findUnique({
    where: { provider },
  });

  if (!credential?.apiKey || !credential.isActive) {
    throw new Error(
      `${provider} is not configured. Add an API key and enable it in the admin console.`,
    );
  }

  return credential;
}

export async function getUserDetails(userId: string) {
  await requireAdminUser();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      credits: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          jobs: true,
          creditLedger: true,
          assets: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Get credit statistics
  const [creditsGranted, creditsSpent] = await Promise.all([
    prisma.creditLedger.aggregate({
      where: {
        userId,
        delta: { gt: 0 },
      },
      _sum: { delta: true },
    }),
    prisma.creditLedger.aggregate({
      where: {
        userId,
        delta: { lt: 0 },
      },
      _sum: { delta: true },
    }),
  ]);

  return {
    ...user,
    creditsGranted: creditsGranted._sum.delta ?? 0,
    creditsSpent: Math.abs(creditsSpent._sum.delta ?? 0),
  };
}

export async function getUserCreditHistory(userId: string, limit = 20) {
  await requireAdminUser();

  const creditHistory = await prisma.creditLedger.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      delta: true,
      balanceAfter: true,
      reason: true,
      metadata: true,
      createdAt: true,
      job: {
        select: {
          id: true,
          type: true,
          prompt: true,
        },
      },
    },
  });

  return creditHistory;
}

export async function getUserJobHistory(userId: string, limit = 20) {
  await requireAdminUser();

  const jobs = await prisma.job.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      status: true,
      provider: true,
      prompt: true,
      cost: true,
      createdAt: true,
      completedAt: true,
    },
  });

  return jobs;
}

export async function addCreditsToUser({
  userId,
  amount,
  reason,
  adminId,
  notes,
}: {
  userId: string;
  amount: number;
  reason: CreditReason;
  adminId: string;
  notes?: string;
}) {
  await requireAdminUser();

  return await prisma.$transaction(async (tx) => {
    // Get current user balance
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const newBalance = user.credits + amount;

    if (newBalance < 0) {
      throw new Error("Insufficient credits. User balance cannot go negative.");
    }

    // Update user balance
    await tx.user.update({
      where: { id: userId },
      data: { credits: newBalance },
    });

    // Create credit ledger entry
    const ledgerEntry = await tx.creditLedger.create({
      data: {
        userId,
        delta: amount,
        balanceAfter: newBalance,
        reason,
        metadata: {
          adminId,
          notes,
          timestamp: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    return {
      newBalance,
      ledgerEntry,
    };
  });
}

export async function getEnhancedUserList() {
  await requireAdminUser();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      credits: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          jobs: true,
        },
      },
    },
  });

  // Get credit statistics for each user
  const usersWithStats = await Promise.all(
    users.map(async (user) => {
      const [creditsGranted, creditsSpent] = await Promise.all([
        prisma.creditLedger.aggregate({
          where: {
            userId: user.id,
            delta: { gt: 0 },
          },
          _sum: { delta: true },
        }),
        prisma.creditLedger.aggregate({
          where: {
            userId: user.id,
            delta: { lt: 0 },
          },
          _sum: { delta: true },
        }),
      ]);

      return {
        ...user,
        jobCount: user._count.jobs,
        creditsGranted: creditsGranted._sum.delta ?? 0,
        creditsSpent: Math.abs(creditsSpent._sum.delta ?? 0),
      };
    })
  );

  return usersWithStats;
}
