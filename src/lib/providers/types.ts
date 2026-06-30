import { AssetType, Provider } from "@prisma/client";

export type ProviderModelMetadata = Record<string, unknown> | null;

export type ProviderModelInfo = {
  provider: Provider;
  slug: string;
  displayName: string;
  metadata: ProviderModelMetadata;
};

export type ProviderJobOptions<TInput> = {
  jobId: string;
  userId: string;
  model: ProviderModelInfo;
  input: TInput;
};

export type ProviderRunAsset = {
  type: AssetType;
  url: string;
  thumbnail?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ProviderRunResult = {
  providerJobId?: string | null;
  assets: ProviderRunAsset[];
  rawResponse?: unknown;
};

export class ProviderJobError extends Error {
  providerJobId: string | null;
  cause?: unknown;

  constructor(message: string, options: { providerJobId?: string | null; cause?: unknown } = {}) {
    super(message);
    this.name = "ProviderJobError";
    this.providerJobId = options.providerJobId ?? null;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export type ImageJobInput = {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  cfgScale?: number;
  steps?: number;
  seed?: number;
  sampler?: string;
  upscale?: boolean;
  referenceUrls?: string[];
  metadata?: Record<string, unknown> | null;
};

export type EditImageJobInput = {
  prompt: string;
  negativePrompt?: string;
  mode: "INPAINT" | "OUTPAINT" | "STYLE";
  inputImageUrl?: string;
  maskUrl?: string;
  referenceUrls?: string[];
  metadata?: Record<string, unknown> | null;
};

export type VideoJobInput = {
  prompt: string;
  negativePrompt?: string;
  duration?: number;
  referenceUrl?: string;
  frameRate?: number;
  metadata?: Record<string, unknown> | null;
};
