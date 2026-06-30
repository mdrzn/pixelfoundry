import { Asset, AssetType, Job, JobStatus, JobType, Prisma } from "@prisma/client";

import type { AssetLibraryItem, AssetSource, LibraryAsset, LibraryAssetType } from "@/types/library";

const SHARE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type LibraryMetadata = {
  favorite?: boolean;
  tags?: string[];
  collections?: string[];
  shareToken?: string;
  shareCreatedAt?: string;
};

export function isShareTokenExpired(shareCreatedAt: string | undefined | null): boolean {
  if (!shareCreatedAt) return true;
  const created = new Date(shareCreatedAt).getTime();
  if (isNaN(created)) return true;
  return Date.now() - created > SHARE_TOKEN_TTL_MS;
}

export function parseLibraryMetadata(
  metadata: Prisma.JsonValue | null | undefined,
): { root: Record<string, unknown>; library: LibraryMetadata } {
  const root =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};

  const libraryRaw =
    root.library && typeof root.library === "object" && !Array.isArray(root.library)
      ? (root.library as Record<string, unknown>)
      : {};

  const library: LibraryMetadata = {
    favorite: typeof libraryRaw.favorite === "boolean" ? libraryRaw.favorite : undefined,
    tags: Array.isArray(libraryRaw.tags)
      ? libraryRaw.tags.filter((tag): tag is string => typeof tag === "string")
      : undefined,
    collections: Array.isArray(libraryRaw.collections)
      ? libraryRaw.collections.filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        )
      : undefined,
    shareToken: typeof libraryRaw.shareToken === "string" ? libraryRaw.shareToken : undefined,
    shareCreatedAt:
      typeof libraryRaw.shareCreatedAt === "string" ? libraryRaw.shareCreatedAt : undefined,
  };

  return { root, library };
}

export function mergeLibraryMetadata({
  root,
  library,
  patch,
}: {
  root: Record<string, unknown>;
  library: LibraryMetadata;
  patch: Partial<LibraryMetadata>;
}) {
  const mergedLibrary: LibraryMetadata = {
    ...library,
    ...patch,
  };

  const cleanedLibrary = Object.fromEntries(
    Object.entries(mergedLibrary).filter(([, value]) => value !== undefined),
  );

  return {
    ...root,
    library: cleanedLibrary,
  } as Prisma.JsonObject;
}

function safeJson<T>(value: unknown): T | null {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return null;
  }
}

function mapJobTypeToAsset(jobType: JobType, assetType?: AssetType | null): LibraryAssetType {
  if (assetType === AssetType.IMAGE) {
    return "IMAGE";
  }
  if (assetType === AssetType.VIDEO) {
    return "VIDEO";
  }
  return jobType === JobType.CREATE_VIDEO ? "VIDEO" : "IMAGE";
}

function extractFailureReason(jobStatus: JobStatus, result: Prisma.JsonValue | null): string | null {
  if (jobStatus !== JobStatus.FAILED || !result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }

  const record = result as Record<string, unknown>;
  return typeof record.error === "string" ? record.error : null;
}

export function mapJobToLibraryAsset(job: Job & { outputAsset?: Asset | null }): LibraryAsset {
  const outputAsset = job.outputAsset ?? null;
  const payload =
    job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
      ? (job.payload as Record<string, unknown>)
      : {};

  const payloadJson = safeJson<Record<string, unknown>>(payload);

  const outputMetadata = outputAsset ? parseLibraryMetadata(outputAsset.metadata) : null;
  const metadataRaw = outputMetadata?.root
    ? safeJson<Record<string, unknown>>(outputMetadata.root) ?? {}
    : {};

  if (metadataRaw && typeof metadataRaw === "object" && "library" in metadataRaw) {
    delete (metadataRaw as Record<string, unknown>).library;
  }

  const previewUrl = outputAsset?.thumbnail ?? outputAsset?.url ?? null;
  const assetType = mapJobTypeToAsset(job.type, outputAsset?.type ?? null);

  const providerLabel =
    typeof payload.provider === "string"
      ? payload.provider
      : job.provider
        ? job.provider.toString()
        : null;

  return {
    id: outputAsset?.id ?? job.id,
    jobId: job.id,
    assetId: outputAsset?.id ?? null,
    jobType: job.type,
    jobStatus: job.status,
    assetType,
    title: job.title ?? job.prompt.slice(0, 80),
    prompt: job.prompt,
    negativePrompt: job.negativePrompt ?? null,
    providerModelId: typeof payload.providerModelId === "string" ? payload.providerModelId : null,
    providerDisplayName:
      typeof payload.displayName === "string" ? payload.displayName : null,
    providerSlug: typeof payload.slug === "string" ? payload.slug : null,
    providerLabel,
    aspectRatio: typeof payload.aspectRatio === "string" ? payload.aspectRatio : null,
    mode:
      payload.mode === "INPAINT" || payload.mode === "OUTPAINT" || payload.mode === "STYLE"
        ? payload.mode
        : null,
    duration: typeof payload.duration === "number" ? payload.duration : null,
    frameRate: typeof payload.frameRate === "number" ? payload.frameRate : null,
    referenceUrl: typeof payload.referenceUrl === "string" ? payload.referenceUrl : null,
    inputImageUrl: job.inputImageUrl ?? null,
    maskUrl: typeof payload.maskUrl === "string" ? payload.maskUrl : null,
    assetUrl: outputAsset?.url ?? null,
    previewUrl,
    thumbnailUrl: outputAsset?.thumbnail ?? null,
    hasAsset: Boolean(outputAsset?.url),
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    cost: job.cost,
    isFavorite: outputMetadata?.library.favorite ?? false,
    tags: (outputMetadata?.library.tags ?? []).filter((tag) => typeof tag === "string" && tag.trim().length > 0),
    collections: (outputMetadata?.library.collections ?? []).filter(
      (collection) => typeof collection === "string" && collection.trim().length > 0,
    ),
    shareToken: outputMetadata?.library.shareToken ?? null,
    shareCreatedAt: outputMetadata?.library.shareCreatedAt ?? null,
    failureReason: extractFailureReason(job.status, job.result),
    payload: payloadJson,
    result: safeJson<Record<string, unknown>>(job.result),
    metadata: metadataRaw,
  };
}

type AssetWithRelations = Asset & {
  jobOutput: Array<{ id: string }>;
  jobInputUsages: Array<{ id: string }>;
};

export function mapAssetToLibraryItem(asset: AssetWithRelations): AssetLibraryItem {
  const { root, library } = parseLibraryMetadata(asset.metadata);

  // Determine source
  const uploadMetadata =
    root.upload && typeof root.upload === "object" && !Array.isArray(root.upload)
      ? (root.upload as Record<string, unknown>)
      : null;

  const isJobOutput = asset.jobOutput.length > 0;
  const isUploaded = uploadMetadata !== null;

  let source: AssetSource = "uploaded";
  if (isJobOutput && !isUploaded) {
    source = "generated";
  } else if (isUploaded) {
    source = "uploaded";
  }

  // Parse upload info
  let uploadInfo: AssetLibraryItem["uploadInfo"] = null;
  if (uploadMetadata) {
    uploadInfo = {
      originalName:
        typeof uploadMetadata.originalName === "string" ? uploadMetadata.originalName : "Unknown",
      size: typeof uploadMetadata.size === "number" ? uploadMetadata.size : 0,
      uploadedAt:
        typeof uploadMetadata.uploadedAt === "string"
          ? uploadMetadata.uploadedAt
          : asset.createdAt.toISOString(),
    };
  }

  const metadataRaw = safeJson<Record<string, unknown>>(root) ?? {};
  if (metadataRaw && typeof metadataRaw === "object" && "library" in metadataRaw) {
    delete (metadataRaw as Record<string, unknown>).library;
  }

  return {
    id: asset.id,
    type: asset.type === AssetType.VIDEO ? "VIDEO" : "IMAGE",
    source,
    title: asset.title,
    url: asset.url,
    thumbnail: asset.thumbnail ?? asset.url,
    createdAt: asset.createdAt.toISOString(),
    isFavorite: library.favorite ?? false,
    tags: library.tags ?? [],
    collections: library.collections ?? [],
    shareToken: library.shareToken ?? null,
    shareCreatedAt: library.shareCreatedAt ?? null,
    uploadInfo,
    usageCount: asset.jobInputUsages.length,
    isJobOutput,
    outputJobId: asset.jobOutput.length > 0 ? asset.jobOutput[0].id : null,
    metadata: metadataRaw,
  };
}
