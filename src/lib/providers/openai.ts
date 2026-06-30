import { AssetType, Provider } from "@prisma/client";

import { getProviderCredentialSecret } from "@/lib/admin";
import {
  EditImageJobInput,
  ImageJobInput,
  ProviderJobError,
  ProviderJobOptions,
  ProviderRunResult,
  VideoJobInput,
} from "@/lib/providers/types";
import { assertSafeUrl } from "@/lib/url-validation";

const OPENAI_API_BASE = "https://api.openai.com/v1";

export async function runOpenAIImageJob(
  options: ProviderJobOptions<ImageJobInput>,
): Promise<ProviderRunResult> {
  const apiKey = await getOpenAIApiKey();
  const prompt = buildOpenAIPrompt(options.input);

  const response = await fetch(`${OPENAI_API_BASE}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model.slug,
      prompt,
      size: mapOpenAISize(options.input),
      response_format: "b64_json",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ProviderJobError(text || "OpenAI failed to generate an image.");
  }

  const body = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };

  const imageData = body.data?.find((item) => item.b64_json || item.url);
  if (!imageData) {
    throw new ProviderJobError("OpenAI returned an unexpected response with no image data.");
  }

  const imageUrl =
    imageData.url ??
    (imageData.b64_json ? `data:image/png;base64,${imageData.b64_json}` : undefined);

  if (!imageUrl) {
    throw new ProviderJobError("OpenAI returned no usable image data.");
  }

  return {
    assets: [
      {
        type: AssetType.IMAGE,
        url: imageUrl,
        thumbnail: imageUrl,
      },
    ],
    rawResponse: body,
  };
}

export async function runOpenAIEditImageJob(
  options: ProviderJobOptions<EditImageJobInput>,
): Promise<ProviderRunResult> {
  const apiKey = await getOpenAIApiKey();

  if (!options.input.inputImageUrl) {
    throw new ProviderJobError("Provide an image URL when editing with OpenAI.");
  }

  const form = new FormData();
  form.append("model", options.model.slug);
  form.append("prompt", buildOpenAIPrompt(options.input));
  form.append("n", "1");
  form.append("response_format", "b64_json");

  const imageBlob = await fetchBlob(options.input.inputImageUrl);
  form.append("image", imageBlob, "source.png");

  if (options.input.maskUrl) {
    const maskBlob = await fetchBlob(options.input.maskUrl);
    form.append("mask", maskBlob, "mask.png");
  }

  const response = await fetch(`${OPENAI_API_BASE}/images/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ProviderJobError(text || "OpenAI failed to edit the image.");
  }

  const body = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };

  const imageData = body.data?.find((item) => item.b64_json || item.url);
  if (!imageData) {
    throw new ProviderJobError("OpenAI returned an unexpected response with no edited image.");
  }

  const imageUrl =
    imageData.url ??
    (imageData.b64_json ? `data:image/png;base64,${imageData.b64_json}` : undefined);

  if (!imageUrl) {
    throw new ProviderJobError("OpenAI returned no usable image data.");
  }

  return {
    assets: [
      {
        type: AssetType.IMAGE,
        url: imageUrl,
        thumbnail: imageUrl,
      },
    ],
    rawResponse: body,
  };
}

export async function runOpenAIVideoJob(
  options: ProviderJobOptions<VideoJobInput>,
): Promise<ProviderRunResult> {
  throw new ProviderJobError(
    `OpenAI model ${options.model.slug} does not support video generation via the Images API.`,
  );
}

async function getOpenAIApiKey(): Promise<string> {
  const credential = await getProviderCredentialSecret(Provider.OPENAI);
  if (!credential.apiKey) {
    throw new ProviderJobError("OpenAI API key is not configured.");
  }
  return credential.apiKey;
}

async function fetchBlob(url: string): Promise<Blob> {
  assertSafeUrl(url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new ProviderJobError(`Unable to download required file from ${url}.`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Blob([arrayBuffer]);
}

function buildOpenAIPrompt(input: ImageJobInput | EditImageJobInput): string {
  const segments = [input.prompt];
  if (input.negativePrompt) {
    segments.push(`Avoid: ${input.negativePrompt}`);
  }
  return segments.join("\n\n");
}

function mapAspectRatioToOpenAISize(aspectRatio?: string): string | undefined {
  if (!aspectRatio) {
    return undefined;
  }

  const normalized = aspectRatio.trim();
  switch (normalized) {
    case "1:1":
      return "1024x1024";
    case "16:9":
      return "1792x1024";
    case "9:16":
      return "1024x1792";
    case "4:3":
      return "1536x1152";
    default:
      return undefined;
  }
}

function mapOpenAISize(input: ImageJobInput): string | undefined {
  if (input.width && input.height) {
    return `${Math.round(input.width)}x${Math.round(input.height)}`;
  }
  return mapAspectRatioToOpenAISize(input.aspectRatio);
}
