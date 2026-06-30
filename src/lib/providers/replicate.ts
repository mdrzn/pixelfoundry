import { AssetType, Provider } from "@prisma/client";

import { getProviderCredentialSecret } from "@/lib/admin";
import {
  EditImageJobInput,
  ImageJobInput,
  ProviderJobError,
  ProviderJobOptions,
  ProviderRunAsset,
  ProviderRunResult,
  VideoJobInput,
} from "@/lib/providers/types";
import { assertSafeUrl } from "@/lib/url-validation";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";
const DEFAULT_POLL_INTERVAL_MS = 2500;
const MAX_PREDICTION_WAIT_MS = 8 * 60 * 1000; // 8 minutes

type ReplicatePrediction = {
  id: string;
  status: string;
  error?: string | null;
  output?: unknown;
  logs?: string;
  urls?: {
    get?: string;
    cancel?: string;
  };
};

type ReplicateMetadataConfig = {
  inputMap?: Partial<Record<string, string>>;
  staticInputs?: Record<string, unknown>;
  upstream?: {
    provider?: Provider;
    apiKeyParam?: string;
  };
};

type ProviderMetadataShape = {
  replicate?: ReplicateMetadataConfig;
  owner?: string;
  pricing?: Record<string, unknown>;
  [key: string]: unknown;
};

export async function runReplicateImageJob(
  options: ProviderJobOptions<ImageJobInput>,
): Promise<ProviderRunResult> {
  return runReplicateJob({
    ...options,
    jobType: AssetType.IMAGE,
  });
}

export async function runReplicateEditImageJob(
  options: ProviderJobOptions<EditImageJobInput>,
): Promise<ProviderRunResult> {
  return runReplicateJob({
    ...options,
    jobType: AssetType.IMAGE,
  });
}

export async function runReplicateVideoJob(
  options: ProviderJobOptions<VideoJobInput>,
): Promise<ProviderRunResult> {
  return runReplicateJob({
    ...options,
    jobType: AssetType.VIDEO,
  });
}

async function runReplicateJob<TInput extends ImageJobInput | EditImageJobInput | VideoJobInput>({
  model,
  input,
  jobType,
}: ProviderJobOptions<TInput> & { jobType: AssetType }): Promise<ProviderRunResult> {
  const replicateCredential = await getProviderCredentialSecret(Provider.REPLICATE);
  const metadata = parseMetadataConfig(model.metadata);

  const upstreamCredentials = await resolveUpstreamCredentials(metadata, model);

  const predictionInput = buildInputPayload({
    jobType,
    input,
    metadata,
    upstreamCredentials,
  });

  const prediction = await createPrediction({
    apiKey: replicateCredential.apiKey,
    slug: model.slug,
    input: predictionInput,
  });

  const finalPrediction = await pollPrediction({
    apiKey: replicateCredential.apiKey,
    predictionId: prediction.id,
  });

  if (finalPrediction.status !== "succeeded") {
    throw new ProviderJobError(
      finalPrediction.error || "Replicate was unable to complete this request.",
      {
        providerJobId: finalPrediction.id,
      },
    );
  }

  const assets = extractAssetsFromPrediction(finalPrediction, jobType);
  if (!assets.length) {
    throw new ProviderJobError("Replicate returned no outputs for this model.", {
      providerJobId: finalPrediction.id,
    });
  }

  return {
    providerJobId: finalPrediction.id,
    assets,
    rawResponse: finalPrediction,
  };
}

async function createPrediction({
  apiKey,
  slug,
  input,
}: {
  apiKey: string;
  slug: string;
  input: Record<string, unknown>;
}): Promise<ReplicatePrediction> {
  const response = await fetch(`${REPLICATE_API_BASE}/models/${slug}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ProviderJobError(text || "Failed to start Replicate prediction.");
  }

  const prediction = (await response.json()) as ReplicatePrediction;
  if (!prediction?.id) {
    throw new ProviderJobError("Replicate returned an invalid prediction response.");
  }

  return prediction;
}

async function pollPrediction({
  apiKey,
  predictionId,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = MAX_PREDICTION_WAIT_MS,
}: {
  apiKey: string;
  predictionId: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}): Promise<ReplicatePrediction> {
  const end = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < end) {
    attempt += 1;

    const response = await fetch(`${REPLICATE_API_BASE}/predictions/${predictionId}`, {
      headers: {
        Authorization: `Token ${apiKey}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ProviderJobError(text || "Failed to poll Replicate prediction status.", {
        providerJobId: predictionId,
      });
    }

    const prediction = (await response.json()) as ReplicatePrediction;

    if (["succeeded", "failed", "canceled"].includes(prediction.status)) {
      return prediction;
    }

    const waitTime =
      attempt > 5 ? pollIntervalMs * Math.min(5, attempt) : pollIntervalMs;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  throw new ProviderJobError("Timed out waiting for Replicate to complete.", {
    providerJobId: predictionId,
  });
}

function extractAssetsFromPrediction(prediction: ReplicatePrediction, jobAssetType: AssetType): ProviderRunAsset[] {
  if (!prediction.output) {
    return [];
  }

  if (Array.isArray(prediction.output)) {
    const urls = prediction.output
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "url" in item && typeof item.url === "string") {
          return item.url;
        }
        return null;
      })
      .filter((value): value is string => Boolean(value));

    return urls.map((url) => ({
      type: jobAssetType,
      url,
      thumbnail: jobAssetType === AssetType.IMAGE ? url : undefined,
    }));
  }

  if (typeof prediction.output === "string") {
    return [
      {
        type: jobAssetType,
        url: prediction.output,
        thumbnail: jobAssetType === AssetType.IMAGE ? prediction.output : undefined,
      },
    ];
  }

  if (
    prediction.output &&
    typeof prediction.output === "object" &&
    "url" in prediction.output &&
    typeof (prediction.output as { url: unknown }).url === "string"
  ) {
    const url = (prediction.output as { url: string }).url;
    return [
      {
        type: jobAssetType,
        url,
        thumbnail: jobAssetType === AssetType.IMAGE ? url : undefined,
      },
    ];
  }

  return [];
}

function parseMetadataConfig(metadata: ProviderMetadataShape | null): ReplicateMetadataConfig {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  const replicateConfig = metadata.replicate;
  if (replicateConfig && typeof replicateConfig === "object") {
    return replicateConfig as ReplicateMetadataConfig;
  }

  return {};
}

async function resolveUpstreamCredentials(
  metadata: ReplicateMetadataConfig,
  model: ProviderJobOptions<ImageJobInput | EditImageJobInput | VideoJobInput>["model"],
) {
  // If upstream is explicitly configured, use it (even if null means "no upstream needed")
  if ("upstream" in metadata) {
    if (metadata.upstream?.provider) {
      const credential = await getProviderCredentialSecret(metadata.upstream.provider);
      const apiKeyParam =
        metadata.upstream.apiKeyParam ??
        getDefaultUpstreamApiKeyParam(metadata.upstream.provider, model.slug);

      return apiKeyParam && credential.apiKey
        ? {
            apiKeyParam,
            apiKey: credential.apiKey,
          }
        : null;
    }
    // upstream is explicitly set to null - skip automatic detection
    return null;
  }

  // No explicit upstream config - try automatic detection from owner
  const owner = inferModelOwner(model);
  if (!owner) {
    return null;
  }

  const upstreamProvider = mapOwnerToProvider(owner);
  if (!upstreamProvider) {
    return null;
  }

  try {
    const credential = await getProviderCredentialSecret(upstreamProvider);
    const apiKeyParam = getDefaultUpstreamApiKeyParam(upstreamProvider, model.slug);

    return apiKeyParam && credential.apiKey
      ? {
          apiKeyParam,
          apiKey: credential.apiKey,
        }
      : null;
  } catch (error) {
    // If the downstream provider is not configured yet, surface a useful message.
    throw new ProviderJobError(
      `Configure ${upstreamProvider} credentials in the admin console to run ${model.slug}.`,
      { cause: error instanceof Error ? error : undefined },
    );
  }
}

function inferModelOwner(model: ProviderJobOptions<ImageJobInput>["model"]) {
  const slugOwner = model.slug.includes("/") ? model.slug.split("/")[0] : null;
  const metadataOwner =
    model.metadata && typeof model.metadata === "object" && "owner" in model.metadata
      ? String((model.metadata as { owner?: unknown }).owner ?? "")
      : null;

  return (metadataOwner || slugOwner || "").toLowerCase();
}

function mapOwnerToProvider(owner: string): Provider | null {
  switch (owner) {
    case "openai":
      return Provider.OPENAI;
    case "google":
      return Provider.GEMINI;
    default:
      return null;
  }
}

function getDefaultUpstreamApiKeyParam(provider: Provider, slug: string): string | null {
  switch (provider) {
    case Provider.OPENAI:
      return "openai_api_key";
    case Provider.GEMINI:
      return slug.includes("nano") ? "google_api_key" : "google_api_key";
    default:
      return null;
  }
}

function buildInputPayload({
  jobType,
  input,
  metadata,
  upstreamCredentials,
}: {
  jobType: AssetType;
  input: ImageJobInput | EditImageJobInput | VideoJobInput;
  metadata: ReplicateMetadataConfig;
  upstreamCredentials: { apiKeyParam: string; apiKey: string } | null;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const inputMap = {
    prompt: "prompt",
    negativePrompt: "negative_prompt",
    aspectRatio: "aspect_ratio",
    width: "width",
    height: "height",
    cfgScale: "cfg_scale",
    steps: "steps",
    seed: "seed",
    sampler: "sampler",
    upscale: "upscale",
    referenceUrls: "input_image",
    inputImageUrl: "image",
    maskUrl: "mask",
    duration: "duration",
    referenceUrl: "reference_video",
    frameRate: "fps",
    ...(metadata.inputMap ?? {}),
  };

  if ("prompt" in input && input.prompt) {
    payload[inputMap.prompt ?? "prompt"] = input.prompt;
  }
  if ("negativePrompt" in input && input.negativePrompt) {
    const field = inputMap.negativePrompt ?? "negative_prompt";
    payload[field] = input.negativePrompt;
  }

  if (jobType === AssetType.IMAGE && "aspectRatio" in input && input.aspectRatio) {
    const field = inputMap.aspectRatio ?? "aspect_ratio";
    payload[field] = input.aspectRatio;
  }

  if ("width" in input && input.width) {
    const field = inputMap.width ?? "width";
    payload[field] = input.width;
  }

  if ("height" in input && input.height) {
    const field = inputMap.height ?? "height";
    payload[field] = input.height;
  }

  if ("cfgScale" in input && input.cfgScale) {
    const field = inputMap.cfgScale ?? "cfg_scale";
    payload[field] = input.cfgScale;
  }

  if ("steps" in input && input.steps) {
    const field = inputMap.steps ?? "steps";
    payload[field] = input.steps;
  }

  if ("seed" in input && typeof input.seed === "number") {
    const field = inputMap.seed ?? "seed";
    payload[field] = input.seed;
  }

  if ("sampler" in input && input.sampler) {
    const field = inputMap.sampler ?? "sampler";
    payload[field] = input.sampler;
  }

  if ("upscale" in input && typeof input.upscale === "boolean") {
    const field = inputMap.upscale ?? "upscale";
    payload[field] = input.upscale;
  }

  if ("referenceUrls" in input && Array.isArray(input.referenceUrls) && input.referenceUrls.length) {
    const safeReferenceUrls = input.referenceUrls.map((u) => assertSafeUrl(u));
    const field = inputMap.referenceUrls ?? "input_image";
    // Some models expect a single image URL string (e.g., "input_image", "image")
    // rather than an array of URLs. Check if the field name suggests singular usage.
    const isSingularField = ["input_image", "image", "source_image"].includes(field);
    payload[field] = isSingularField ? safeReferenceUrls[0] : safeReferenceUrls;
  }

  if ("mode" in input) {
    payload.mode = input.mode;
  }

  // For EDIT_IMAGE jobs, if inputImageUrl is not provided but referenceUrls are,
  // use the first reference URL as the input image (for models that require it)
  let effectiveInputImageUrl = "inputImageUrl" in input ? input.inputImageUrl : undefined;
  if (
    !effectiveInputImageUrl &&
    "referenceUrls" in input &&
    Array.isArray(input.referenceUrls) &&
    input.referenceUrls.length > 0
  ) {
    effectiveInputImageUrl = input.referenceUrls[0];
  }

  if (effectiveInputImageUrl) {
    assertSafeUrl(effectiveInputImageUrl);
    const field = inputMap.inputImageUrl ?? "image";
    payload[field] = effectiveInputImageUrl;
  }

  if ("maskUrl" in input && input.maskUrl) {
    assertSafeUrl(input.maskUrl);
    payload[inputMap.maskUrl ?? "mask"] = input.maskUrl;
  }

  if ("duration" in input && input.duration) {
    payload[inputMap.duration ?? "duration"] = input.duration;
  }

  if ("referenceUrl" in input && input.referenceUrl) {
    assertSafeUrl(input.referenceUrl);
    payload[inputMap.referenceUrl ?? "reference_video"] = input.referenceUrl;
  }

  if ("frameRate" in input && input.frameRate) {
    payload[inputMap.frameRate ?? "fps"] = input.frameRate;
  }

  if (metadata.staticInputs) {
    Object.assign(payload, metadata.staticInputs);
  }

  if (upstreamCredentials) {
    payload[upstreamCredentials.apiKeyParam] = upstreamCredentials.apiKey;
  }

  return payload;
}
