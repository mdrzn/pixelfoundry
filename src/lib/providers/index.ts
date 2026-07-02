import { Provider } from "@prisma/client";

import {
  EditImageJobInput,
  ImageJobInput,
  ProviderJobError,
  ProviderJobOptions,
  ProviderRunResult,
  VideoJobInput,
} from "@/lib/providers/types";

export async function runImageJob(options: ProviderJobOptions<ImageJobInput>): Promise<ProviderRunResult> {
  switch (options.model.provider) {
    case Provider.REPLICATE:
      return runReplicateImageJob(options);
    case Provider.GEMINI:
      return runGeminiImageJob(options);
    case Provider.OPENAI:
      return runOpenAIImageJob(options);
    case Provider.FAL:
      return runFalImageJob(options);
    default:
      throw new ProviderJobError(`Provider ${options.model.provider} is not supported for image jobs.`);
  }
}

export async function runEditImageJob(
  options: ProviderJobOptions<EditImageJobInput>,
): Promise<ProviderRunResult> {
  switch (options.model.provider) {
    case Provider.REPLICATE:
      return runReplicateEditImageJob(options);
    case Provider.GEMINI:
      return runGeminiEditImageJob(options);
    case Provider.OPENAI:
      return runOpenAIEditImageJob(options);
    default:
      throw new ProviderJobError(`Provider ${options.model.provider} is not supported for edit jobs.`);
  }
}

export async function runVideoJob(options: ProviderJobOptions<VideoJobInput>): Promise<ProviderRunResult> {
  switch (options.model.provider) {
    case Provider.REPLICATE:
      return runReplicateVideoJob(options);
    case Provider.GEMINI:
      return runGeminiVideoJob(options);
    case Provider.OPENAI:
      return runOpenAIVideoJob(options);
    case Provider.FAL:
      return runFalVideoJob(options);
    default:
      throw new ProviderJobError(`Provider ${options.model.provider} is not supported for video jobs.`);
  }
}

// Provider-specific implementations will be supplied by the respective modules.
import { runReplicateEditImageJob, runReplicateImageJob, runReplicateVideoJob } from "@/lib/providers/replicate";
import { runGeminiEditImageJob, runGeminiImageJob, runGeminiVideoJob } from "@/lib/providers/gemini";
import { runOpenAIEditImageJob, runOpenAIImageJob, runOpenAIVideoJob } from "@/lib/providers/openai";
import { runFalImageJob, runFalVideoJob } from "@/lib/providers/fal";
