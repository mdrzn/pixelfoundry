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
import { assertSafeUrls } from "@/lib/url-validation";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function runGeminiImageJob(
  options: ProviderJobOptions<ImageJobInput>,
): Promise<ProviderRunResult> {
  const apiKey = await getGeminiApiKey();
  const prompt = options.input.prompt.trim();

  if (!prompt) {
    throw new ProviderJobError("Prompt is required to generate an image with Gemini.");
  }

  const url = new URL(`${GEMINI_API_BASE}/models/${options.model.slug}:generateContent`);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildGeminiPrompt(options) }],
        },
      ],
      generationConfig: {
        responseMimeType: "image/png",
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ProviderJobError(text || "Gemini failed to generate an image.");
  }

  const body = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
        }>;
      };
    }>;
  };

  const inlineData =
    body.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];

  const imagePart = inlineData.find((part) => part.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new ProviderJobError("Gemini returned an unexpected response with no image data.");
  }

  const mimeType = imagePart.inlineData.mimeType ?? "image/png";
  const base64 = imagePart.inlineData.data;
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return {
    assets: [
      {
        type: AssetType.IMAGE,
        url: dataUrl,
        thumbnail: dataUrl,
      },
    ],
    rawResponse: body,
  };
}

export async function runGeminiEditImageJob(
  options: ProviderJobOptions<EditImageJobInput>,
): Promise<ProviderRunResult> {
  throw new ProviderJobError(
    `Gemini model ${options.model.slug} does not support image editing yet.`,
  );
}

export async function runGeminiVideoJob(
  options: ProviderJobOptions<VideoJobInput>,
): Promise<ProviderRunResult> {
  throw new ProviderJobError(
    `Gemini model ${options.model.slug} does not support video generation at this time.`,
  );
}

async function getGeminiApiKey(): Promise<string> {
  const credential = await getProviderCredentialSecret(Provider.GEMINI);
  if (!credential.apiKey) {
    throw new ProviderJobError("Gemini API key is not configured.");
  }
  return credential.apiKey;
}

function buildGeminiPrompt(options: ProviderJobOptions<ImageJobInput>): string {
  const parts = [options.input.prompt];
  if (options.input.negativePrompt) {
    parts.push(`Avoid: ${options.input.negativePrompt}`);
  }
  if (options.input.aspectRatio) {
    parts.push(`Aspect ratio: ${options.input.aspectRatio}`);
  }
  if (options.input.width && options.input.height) {
    parts.push(`Target resolution: ${options.input.width}x${options.input.height}`);
  }
  if (options.input.referenceUrls?.length) {
    assertSafeUrls(options.input.referenceUrls);
    parts.push(`Reference images: ${options.input.referenceUrls.join(", ")}`);
  }
  return parts.join("\n\n");
}
