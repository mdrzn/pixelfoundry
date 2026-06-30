"use server";

import { randomBytes } from "crypto";
import { JobType } from "@prisma/client";

import { createEditImageJob, createImageJob, createVideoJob } from "@/lib/jobs";
import { mergeLibraryMetadata, parseLibraryMetadata, type LibraryMetadata } from "@/lib/library";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function deleteAssetsAction(assetIds: string[]) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return { ok: false, error: "Select at least one asset to delete." };
  }

  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in to delete assets." };
  }

  await prisma.$transaction(async (tx) => {
    const validAssets = await tx.asset.findMany({
      where: {
        id: { in: assetIds },
        userId: session.user.id,
      },
      select: { id: true },
    });

    if (validAssets.length === 0) {
      return;
    }

    const validAssetIds = validAssets.map((asset) => asset.id);

    await tx.job.updateMany({
      where: {
        userId: session.user.id,
        outputAssetId: { in: validAssetIds },
      },
      data: {
        outputAssetId: null,
      },
    });

    await tx.asset.deleteMany({
      where: {
        id: { in: validAssetIds },
        userId: session.user.id,
      },
    });
  });

  return { ok: true };
}

export async function deleteJobsAction(jobIds: string[]) {
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return { ok: false, error: "Select at least one job to delete." };
  }

  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in to delete jobs." };
  }

  await prisma.$transaction(async (tx) => {
    const validJobs = await tx.job.findMany({
      where: {
        id: { in: jobIds },
        userId: session.user.id,
      },
      select: { id: true, outputAssetId: true },
    });

    if (validJobs.length === 0) {
      return;
    }

    const validJobIds = validJobs.map((job) => job.id);
    const assetIdsToDelete = validJobs
      .map((job) => job.outputAssetId)
      .filter((id): id is string => id !== null);

    // Delete associated assets
    if (assetIdsToDelete.length > 0) {
      await tx.asset.deleteMany({
        where: {
          id: { in: assetIdsToDelete },
          userId: session.user.id,
        },
      });
    }

    // Delete the jobs
    await tx.job.deleteMany({
      where: {
        id: { in: validJobIds },
        userId: session.user.id,
      },
    });
  });

  return { ok: true };
}

export async function updateAssetMetadataAction({
  assetId,
  favorite,
  tags,
  collections,
}: {
  assetId: string;
  favorite?: boolean;
  tags?: string[];
  collections?: string[];
}) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in to update assets." };
  }

  const asset = await prisma.asset.findFirst({
    where: {
      id: assetId,
      userId: session.user.id,
    },
    select: {
      id: true,
      metadata: true,
    },
  });

  if (!asset) {
    return { ok: false, error: "Asset not found." };
  }

  const { root, library } = parseLibraryMetadata(asset.metadata);

  const patch: Partial<LibraryMetadata> = {};

  if (typeof favorite === "boolean") {
    patch.favorite = favorite;
  }

  if (Array.isArray(tags)) {
    patch.tags = tags
      .map((tag) => tag.trim())
      .filter((tag, index, arr) => tag.length > 0 && arr.indexOf(tag) === index);
  }

  if (Array.isArray(collections)) {
    patch.collections = collections
      .map((value) => value.trim())
      .filter((value, index, arr) => value.length > 0 && arr.indexOf(value) === index);
  }

  await prisma.asset.update({
    where: { id: assetId },
    data: {
      metadata: mergeLibraryMetadata({ root, library, patch }),
    },
  });

  return { ok: true };
}

export async function createOrFetchShareLinkAction(assetId: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in to share assets." };
  }

  const asset = await prisma.asset.findFirst({
    where: {
      id: assetId,
      userId: session.user.id,
    },
    select: {
      id: true,
      metadata: true,
    },
  });

  if (!asset) {
    return { ok: false, error: "Asset not found." };
  }

  const { root, library } = parseLibraryMetadata(asset.metadata);

  const shareToken = library.shareToken ?? randomBytes(32).toString("hex");
  const shareCreatedAt = library.shareCreatedAt ?? new Date().toISOString();

  if (!library.shareToken || !library.shareCreatedAt) {
    await prisma.asset.update({
      where: { id: assetId },
      data: {
        metadata: mergeLibraryMetadata({
          root,
          library,
          patch: { shareToken, shareCreatedAt },
        }),
      },
    });
  }

  return {
    ok: true,
    shareUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/share/${shareToken}`,
    shareToken,
  };
}

export async function revokeShareLinkAction(assetId: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in to manage shares." };
  }

  const asset = await prisma.asset.findFirst({
    where: {
      id: assetId,
      userId: session.user.id,
    },
    select: {
      id: true,
      metadata: true,
    },
  });

  if (!asset) {
    return { ok: false, error: "Asset not found." };
  }

  const { root, library } = parseLibraryMetadata(asset.metadata);

  if (library.shareToken || library.shareCreatedAt) {
    await prisma.asset.update({
      where: { id: assetId },
      data: {
        metadata: mergeLibraryMetadata({
          root,
          library,
          patch: { shareToken: undefined, shareCreatedAt: undefined },
        }),
      },
    });
  }

  return { ok: true };
}

export async function rerunJobAction(jobId: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in to run jobs." };
  }

  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      userId: session.user.id,
    },
    select: {
      id: true,
      type: true,
      prompt: true,
      negativePrompt: true,
      inputImageUrl: true,
      status: true,
      payload: true,
    },
  });

  if (!job) {
    return { ok: false, error: "Job not found." };
  }

  if (!job.payload || typeof job.payload !== "object" || Array.isArray(job.payload)) {
    return { ok: false, error: "Job metadata missing required parameters." };
  }

  const payload = job.payload as Record<string, unknown>;
  const providerModelId = typeof payload.providerModelId === "string" ? payload.providerModelId : null;

  if (!providerModelId) {
    return { ok: false, error: "Original model is no longer referenced in this job." };
  }

  try {
    switch (job.type) {
      case JobType.CREATE_IMAGE:
        await createImageJob({
          userId: session.user.id,
          prompt: job.prompt,
          negativePrompt: job.negativePrompt ?? undefined,
          providerModelId,
          aspectRatio: typeof payload.aspectRatio === "string" ? payload.aspectRatio : undefined,
          metadata: {
            rerunFromJobId: job.id,
            requestedAt: new Date().toISOString(),
          },
        });
        break;
      case JobType.EDIT_IMAGE:
        await createEditImageJob({
          userId: session.user.id,
          prompt: job.prompt,
          negativePrompt: job.negativePrompt ?? undefined,
          providerModelId,
          mode:
            payload.mode === "INPAINT" || payload.mode === "OUTPAINT" || payload.mode === "STYLE"
              ? payload.mode
              : "INPAINT",
          inputImageUrl: job.inputImageUrl ?? undefined,
          maskUrl: typeof payload.maskUrl === "string" ? payload.maskUrl : undefined,
          metadata: {
            rerunFromJobId: job.id,
            requestedAt: new Date().toISOString(),
          },
        });
        break;
      case JobType.CREATE_VIDEO:
        await createVideoJob({
          userId: session.user.id,
          prompt: job.prompt,
          negativePrompt: job.negativePrompt ?? undefined,
          providerModelId,
          duration: typeof payload.duration === "number" ? payload.duration : undefined,
          frameRate: typeof payload.frameRate === "number" ? payload.frameRate : undefined,
          referenceUrl: typeof payload.referenceUrl === "string" ? payload.referenceUrl : undefined,
          metadata: {
            rerunFromJobId: job.id,
            requestedAt: new Date().toISOString(),
          },
        });
        break;
      default:
        return { ok: false, error: "Unsupported job type for rerun." };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to rerun job.",
    };
  }

  return { ok: true };
}

export async function getAssetUsageAction(assetId: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }

  const asset = await prisma.asset.findFirst({
    where: {
      id: assetId,
      userId: session.user.id,
    },
    include: {
      jobOutput: {
        select: {
          id: true,
          type: true,
          prompt: true,
          title: true,
          createdAt: true,
          status: true,
        },
        take: 10,
      },
      jobInputUsages: {
        select: {
          job: {
            select: {
              id: true,
              type: true,
              prompt: true,
              title: true,
              createdAt: true,
              status: true,
            },
          },
          role: true,
        },
        take: 10,
      },
      presetReferences: {
        select: {
          preset: {
            select: {
              id: true,
              name: true,
              description: true,
              createdAt: true,
            },
          },
        },
        take: 10,
      },
    },
  });

  if (!asset) {
    return { ok: false, error: "Asset not found." };
  }

  const usage = {
    asOutput: asset.jobOutput.map((job) => ({
      jobId: job.id,
      jobType: job.type,
      prompt: job.prompt,
      title: job.title,
      createdAt: job.createdAt.toISOString(),
      status: job.status,
    })),
    asInput: asset.jobInputUsages.map((usage) => ({
      jobId: usage.job.id,
      jobType: usage.job.type,
      prompt: usage.job.prompt,
      title: usage.job.title,
      createdAt: usage.job.createdAt.toISOString(),
      status: usage.job.status,
      role: usage.role,
    })),
    inPresets: asset.presetReferences.map((ref) => ({
      presetId: ref.preset.id,
      name: ref.preset.name,
      description: ref.preset.description,
      createdAt: ref.preset.createdAt.toISOString(),
    })),
    totalUsageCount:
      asset.jobOutput.length + asset.jobInputUsages.length + asset.presetReferences.length,
  };

  return { ok: true, usage };
}
