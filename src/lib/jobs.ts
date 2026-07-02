import { CreditReason, JobAssetRole, JobProvider, JobStatus, JobType, Provider, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { persistUrlToStorage } from "@/lib/storage/persist";
import { runEditImageJob, runImageJob, runVideoJob } from "@/lib/providers";
import {
  EditImageJobInput as ProviderEditImageInput,
  ImageJobInput as ProviderImageJobInput,
  ProviderJobError,
  ProviderRunResult,
  VideoJobInput as ProviderVideoJobInput,
  ProviderModelInfo,
} from "@/lib/providers/types";

type BaseJobInput = {
  userId: string;
  prompt: string;
  negativePrompt?: string;
  providerModelId: string;
  metadata?: Record<string, unknown>;
};

type CreateImageJobInput = BaseJobInput & {
  aspectRatio?: string;
  width?: number;
  height?: number;
  cfgScale?: number;
  steps?: number;
  seed?: number;
  sampler?: string;
  upscale?: boolean;
  referenceAssetIds?: string[];
  appliedPresetId?: string;
  enhancedPrompt?: boolean;
};

type EditImageJobInput = BaseJobInput & {
  mode: "INPAINT" | "OUTPAINT" | "STYLE";
  inputImageUrl?: string;
  maskUrl?: string;
  referenceAssetIds?: string[];
};

type CreateVideoJobInput = BaseJobInput & {
  duration?: number;
  referenceUrl?: string;
  frameRate?: number;
};

async function deductCredits({
  userId,
  cost,
  tx,
}: {
  userId: string;
  cost: number;
  tx?: Prisma.TransactionClient;
}) {
  const client = tx ?? prisma;

  // Atomic decrement with a WHERE guard to prevent race conditions.
  // If credits < cost, updateMany matches 0 rows instead of going negative.
  const result = await client.user.updateMany({
    where: {
      id: userId,
      credits: { gte: cost },
    },
    data: {
      credits: { decrement: cost },
    },
  });

  if (result.count === 0) {
    // Either user doesn't exist or has insufficient credits
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new Error("User not found.");
    }
    throw new Error("Insufficient credits for this action.");
  }

  // Read back the new balance for the ledger entry
  const updated = await client.user.findUniqueOrThrow({
    where: { id: userId },
    select: { credits: true },
  });

  return updated.credits;
}

async function refundCredits({
  userId,
  jobId,
  amount,
  metadata,
  tx,
}: {
  userId: string;
  jobId: string;
  amount: number;
  metadata?: Record<string, unknown>;
  tx?: Prisma.TransactionClient;
}) {
  const client = tx ?? prisma;

  const user = await client.user.update({
    where: { id: userId },
    data: {
      credits: {
        increment: amount,
      },
    },
    select: { credits: true },
  });

  await client.creditLedger.create({
    data: {
      userId,
      jobId,
      delta: amount,
      balanceAfter: user.credits,
      reason: CreditReason.REFUND,
      metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
    },
  });
}

async function markJobFailed({
  jobId,
  userId,
  cost,
  error,
  providerJobId,
}: {
  jobId: string;
  userId: string;
  cost: number;
  error: unknown;
  providerJobId?: string | null;
}) {
  const message =
    error instanceof Error ? error.message : "The provider was unable to complete this request.";

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.FAILED,
        providerJobId: providerJobId ?? null,
        completedAt: new Date(),
        result: {
          error: message,
        } as Prisma.InputJsonValue,
      },
    });

    await refundCredits({
      userId,
      jobId,
      amount: cost,
      metadata: {
        reason: "provider_failed",
      },
      tx,
    });
  });
}

async function finalizeProviderJob({
  jobId,
  userId,
  result,
}: {
  jobId: string;
  userId: string;
  result: ProviderRunResult;
}) {
  if (!result.assets.length) {
    throw new Error("Provider returned no outputs.");
  }

  const primary = result.assets[0];

  const asset = await prisma.asset.create({
    data: {
      userId,
      type: primary.type,
      url: primary.url, // replaced below once stored
      thumbnail: primary.thumbnail ?? primary.url,
      metadata: primary.metadata ? (primary.metadata as Prisma.InputJsonValue) : undefined,
    },
  });

  const persisted = await persistUrlToStorage(storage, { kind: "asset", id: asset.id, url: primary.url });

  if (!persisted) {
    // Deliberate: persistence failed, but the generation already succeeded and
    // the user was already charged. We complete the job with the provider's
    // (temporary/expiring) URL rather than fail + refund. Durable persist-retry
    // is deferred to the Phase 2 worker.
    console.warn("[finalizeProviderJob] persistence failed; completing with provider URL", {
      jobId,
      assetId: asset.id,
      url: primary.url,
    });
  }

  await prisma.asset.update({
    where: { id: asset.id },
    data: persisted
      ? { url: persisted.url, thumbnail: persisted.url, storageKey: persisted.storageKey, mimeType: persisted.mimeType, sizeBytes: persisted.sizeBytes }
      : {},
  });

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: JobStatus.COMPLETED,
      providerJobId: result.providerJobId ?? null,
      completedAt: new Date(),
      outputAssetId: asset.id,
      result: result.rawResponse ? (result.rawResponse as Prisma.InputJsonValue) : undefined,
    },
  });
}

function toProviderModelInfo(model: {
  provider: Provider;
  slug: string;
  displayName: string;
  metadata: Prisma.JsonValue | null;
}): ProviderModelInfo {
  const metadata =
    model.metadata && typeof model.metadata === "object" ? (model.metadata as Record<string, unknown>) : null;

  return {
    provider: model.provider,
    slug: model.slug,
    displayName: model.displayName,
    metadata,
  };
}

export async function createImageJob(input: CreateImageJobInput) {
  const model = await resolveProviderModelOrThrow(input.providerModelId, JobType.CREATE_IMAGE);
  assertProviderSupportsJob(model.provider, JobType.CREATE_IMAGE);
  const cost = model.creditCost;

  const referenceAssetIds = input.referenceAssetIds ? Array.from(new Set(input.referenceAssetIds)) : [];
  let referenceAssets: Array<{ id: string; url: string; thumbnail: string | null }> = [];

  if (referenceAssetIds.length) {
    referenceAssets = await prisma.asset.findMany({
      where: {
        id: { in: referenceAssetIds },
        userId: input.userId,
      },
      select: {
        id: true,
        url: true,
        thumbnail: true,
      },
    });

    if (referenceAssets.length !== referenceAssetIds.length) {
      throw new Error("We couldn't locate one or more reference images you selected.");
    }
  }

  const metadataRoot: Record<string, unknown> = {
    ...(input.metadata ?? {}),
    aspectRatio: input.aspectRatio ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    cfgScale: input.cfgScale ?? null,
    steps: input.steps ?? null,
    seed: input.seed ?? null,
    sampler: input.sampler ?? null,
    upscale: input.upscale ?? false,
    appliedPresetId: input.appliedPresetId ?? null,
    enhancedPrompt: input.enhancedPrompt ?? false,
  };

  if (referenceAssets.length) {
    metadataRoot.referenceAssetIds = referenceAssets.map((asset) => asset.id);
  }

  const { job, balanceAfter } = await prisma.$transaction(async (tx) => {
    const balanceAfterDeduction = await deductCredits({
      userId: input.userId,
      cost,
      tx,
    });

    const jobRecord = await tx.job.create({
      data: {
        userId: input.userId,
        type: JobType.CREATE_IMAGE,
        status: JobStatus.QUEUED,
        provider: mapProviderToJobProvider(model.provider),
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        cost,
        payload: {
          providerModelId: model.id,
          provider: model.provider,
          slug: model.slug,
          displayName: model.displayName,
          aspectRatio: input.aspectRatio,
          width: input.width,
          height: input.height,
          cfgScale: input.cfgScale,
          steps: input.steps,
          seed: input.seed,
          sampler: input.sampler,
          upscale: input.upscale ?? false,
          referenceAssetIds: referenceAssets.map((asset) => asset.id),
          appliedPresetId: input.appliedPresetId ?? null,
          metadata: metadataRoot,
        } as Prisma.InputJsonValue,
      },
    });

    await tx.creditLedger.create({
      data: {
        userId: input.userId,
        jobId: jobRecord.id,
        delta: -cost,
        balanceAfter: balanceAfterDeduction,
        reason: CreditReason.DEDUCT,
        metadata: {
          jobType: JobType.CREATE_IMAGE,
          provider: model.provider,
          modelSlug: model.slug,
          creditCost: cost,
        },
      },
    });

    if (referenceAssets.length) {
      await tx.jobInputAsset.createMany({
        data: referenceAssets.map((asset) => ({
          jobId: jobRecord.id,
          assetId: asset.id,
          role: JobAssetRole.REFERENCE,
        })),
      });
    }

    return { job: jobRecord, balanceAfter: balanceAfterDeduction };
  });

  try {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: JobStatus.PROCESSING },
    });

    const providerResult = await runImageJob({
      jobId: job.id,
      userId: input.userId,
      model: toProviderModelInfo(model),
      input: {
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        aspectRatio: input.aspectRatio,
        width: input.width,
        height: input.height,
        cfgScale: input.cfgScale,
        steps: input.steps,
        seed: input.seed,
        sampler: input.sampler,
        upscale: input.upscale ?? false,
        referenceUrls: referenceAssets.map((asset) => asset.url),
        metadata: metadataRoot,
      } satisfies ProviderImageJobInput,
    });

    await finalizeProviderJob({
      jobId: job.id,
      userId: input.userId,
      result: providerResult,
    });
  } catch (error) {
    const providerJobId =
      error instanceof ProviderJobError ? error.providerJobId ?? null : undefined;

    await markJobFailed({
      jobId: job.id,
      userId: input.userId,
      cost,
      error,
      providerJobId,
    });

    if (error instanceof ProviderJobError) {
      throw new Error(error.message);
    }

    throw new Error("Unable to complete this request right now. Your credits have been refunded.");
  }

  return { jobId: job.id, balanceAfter };
}

export async function createEditImageJob(input: EditImageJobInput) {
  const model = await resolveProviderModelOrThrow(input.providerModelId, JobType.EDIT_IMAGE);
  assertProviderSupportsJob(model.provider, JobType.EDIT_IMAGE);
  const cost = model.creditCost;

  const referenceAssetIds = input.referenceAssetIds ? Array.from(new Set(input.referenceAssetIds)) : [];
  let referenceAssets: Array<{ id: string; url: string; thumbnail: string | null }> = [];

  if (referenceAssetIds.length) {
    referenceAssets = await prisma.asset.findMany({
      where: {
        id: { in: referenceAssetIds },
        userId: input.userId,
      },
      select: {
        id: true,
        url: true,
        thumbnail: true,
      },
    });

    if (referenceAssets.length !== referenceAssetIds.length) {
      throw new Error("We couldn't locate one or more reference images you selected.");
    }
  }

  const metadataRoot: Record<string, unknown> = {
    ...(input.metadata ?? {}),
    mode: input.mode,
    maskUrl: input.maskUrl ?? null,
  };

  if (referenceAssets.length) {
    metadataRoot.referenceAssetIds = referenceAssets.map((asset) => asset.id);
  }

  const { job, balanceAfter } = await prisma.$transaction(async (tx) => {
    const balanceAfterDeduction = await deductCredits({
      userId: input.userId,
      cost,
      tx,
    });

    const jobRecord = await tx.job.create({
      data: {
        userId: input.userId,
        type: JobType.EDIT_IMAGE,
        status: JobStatus.QUEUED,
        provider: mapProviderToJobProvider(model.provider),
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        cost,
        inputImageUrl: input.inputImageUrl,
        payload: {
          providerModelId: model.id,
          provider: model.provider,
          slug: model.slug,
          displayName: model.displayName,
          mode: input.mode,
          maskUrl: input.maskUrl,
          referenceAssetIds: referenceAssets.map((asset) => asset.id),
          metadata: metadataRoot,
        } as Prisma.InputJsonValue,
      },
    });

    await tx.creditLedger.create({
      data: {
        userId: input.userId,
        jobId: jobRecord.id,
        delta: -cost,
        balanceAfter: balanceAfterDeduction,
        reason: CreditReason.DEDUCT,
        metadata: {
          jobType: JobType.EDIT_IMAGE,
          provider: model.provider,
          modelSlug: model.slug,
          creditCost: cost,
        },
      },
    });

    if (referenceAssets.length) {
      await tx.jobInputAsset.createMany({
        data: referenceAssets.map((asset) => ({
          jobId: jobRecord.id,
          assetId: asset.id,
          role: JobAssetRole.REFERENCE,
        })),
      });
    }

    return { job: jobRecord, balanceAfter: balanceAfterDeduction };
  });

  try {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: JobStatus.PROCESSING },
    });

    const providerResult = await runEditImageJob({
      jobId: job.id,
      userId: input.userId,
      model: toProviderModelInfo(model),
      input: {
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        mode: input.mode,
        inputImageUrl: input.inputImageUrl,
        maskUrl: input.maskUrl,
        referenceUrls: referenceAssets.map((asset) => asset.url),
        metadata: metadataRoot,
      } satisfies ProviderEditImageInput,
    });

    await finalizeProviderJob({
      jobId: job.id,
      userId: input.userId,
      result: providerResult,
    });
  } catch (error) {
    const providerJobId =
      error instanceof ProviderJobError ? error.providerJobId ?? null : undefined;

    await markJobFailed({
      jobId: job.id,
      userId: input.userId,
      cost,
      error,
      providerJobId,
    });

    if (error instanceof ProviderJobError) {
      throw new Error(error.message);
    }

    throw new Error("Unable to complete this request right now. Your credits have been refunded.");
  }

  return { jobId: job.id, balanceAfter };
}

export async function createVideoJob(input: CreateVideoJobInput) {
  const model = await resolveProviderModelOrThrow(input.providerModelId, JobType.CREATE_VIDEO);
  assertProviderSupportsJob(model.provider, JobType.CREATE_VIDEO);
  const cost = model.creditCost;

  const { job, balanceAfter } = await prisma.$transaction(async (tx) => {
    const balanceAfterDeduction = await deductCredits({
      userId: input.userId,
      cost,
      tx,
    });

    const jobRecord = await tx.job.create({
      data: {
        userId: input.userId,
        type: JobType.CREATE_VIDEO,
        status: JobStatus.QUEUED,
        provider: mapProviderToJobProvider(model.provider),
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        cost,
        payload: {
          providerModelId: model.id,
          provider: model.provider,
          slug: model.slug,
          displayName: model.displayName,
          duration: input.duration,
          referenceUrl: input.referenceUrl,
          frameRate: input.frameRate,
          metadata: input.metadata,
        } as Prisma.InputJsonValue,
      },
    });

    await tx.creditLedger.create({
      data: {
        userId: input.userId,
        jobId: jobRecord.id,
        delta: -cost,
        balanceAfter: balanceAfterDeduction,
        reason: CreditReason.DEDUCT,
        metadata: {
          jobType: JobType.CREATE_VIDEO,
          provider: model.provider,
          modelSlug: model.slug,
          creditCost: cost,
        },
      },
    });

    return { job: jobRecord, balanceAfter: balanceAfterDeduction };
  });

  try {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: JobStatus.PROCESSING },
    });

    const providerResult = await runVideoJob({
      jobId: job.id,
      userId: input.userId,
      model: toProviderModelInfo(model),
      input: {
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        duration: input.duration,
        referenceUrl: input.referenceUrl,
        frameRate: input.frameRate,
        metadata: input.metadata ?? null,
      } satisfies ProviderVideoJobInput,
    });

    await finalizeProviderJob({
      jobId: job.id,
      userId: input.userId,
      result: providerResult,
    });
  } catch (error) {
    const providerJobId =
      error instanceof ProviderJobError ? error.providerJobId ?? null : undefined;

    await markJobFailed({
      jobId: job.id,
      userId: input.userId,
      cost,
      error,
      providerJobId,
    });

    if (error instanceof ProviderJobError) {
      throw new Error(error.message);
    }

    throw new Error("Unable to complete this request right now. Your credits have been refunded.");
  }

  return { jobId: job.id, balanceAfter };
}

async function resolveProviderModelOrThrow(id: string, expectedJobType: JobType) {
  const model = await prisma.providerModel.findUnique({
    where: { id },
  });

  if (!model) {
    throw new Error("Selected model is no longer available.");
  }

  if (!model.isActive) {
    throw new Error("Selected model is inactive. Choose another option.");
  }

  if (!model.jobTypes.includes(expectedJobType)) {
    throw new Error("Selected model is not compatible with this workflow.");
  }

  return model;
}

function mapProviderToJobProvider(provider: Provider): JobProvider {
  switch (provider) {
    case Provider.REPLICATE:
      return JobProvider.REPLICATE;
    case Provider.GEMINI:
      return JobProvider.GEMINI;
    case Provider.OPENAI:
      return JobProvider.OPENAI;
    default:
      return JobProvider.MOCK;
  }
}

function assertProviderSupportsJob(provider: Provider, jobType: JobType) {
  if (jobType === JobType.EDIT_IMAGE && provider === Provider.GEMINI) {
    throw new Error("Gemini edit-image workflows are not supported yet. Choose another provider.");
  }

  if (jobType === JobType.CREATE_VIDEO && provider !== Provider.REPLICATE) {
    throw new Error("Video generation is only available through Replicate at this time.");
  }
}

export async function getRecentJobs(userId: string, take = 15) {
  return prisma.job.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      outputAsset: true,
    },
  });
}

export async function getCreditLedger(userId: string, take = 20) {
  return prisma.creditLedger.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      job: {
        select: {
          id: true,
          type: true,
        },
      },
    },
  });
}

export async function getDashboardMetrics(userId: string) {
  const [jobs, credits] = await Promise.all([
    prisma.job.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.creditLedger.aggregate({
      where: { userId },
      _sum: { delta: true },
    }),
  ]);

  return {
    jobsByStatus: jobs,
    creditsDelta: credits._sum.delta ?? 0,
  };
}
