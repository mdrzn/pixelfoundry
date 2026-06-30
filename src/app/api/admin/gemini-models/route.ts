import { JobType, Provider } from "@prisma/client";
import { NextResponse } from "next/server";

import { getProviderCredentialSecret, requireAdminUser } from "@/lib/admin";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

type GeminiAPIModel = {
  name?: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  version?: string;
  temperature?: number;
  topK?: number;
  topP?: number;
};

function inferJobType(methods: string[] | undefined): JobType {
  if (!methods) {
    return JobType.CREATE_IMAGE;
  }

  const normalized = methods.map((method) => method.toLowerCase());
  if (normalized.some((method) => method.includes("video"))) {
    return JobType.CREATE_VIDEO;
  }
  if (normalized.some((method) => method.includes("image"))) {
    return JobType.CREATE_IMAGE;
  }
  if (normalized.some((method) => method.includes("edit"))) {
    return JobType.EDIT_IMAGE;
  }
  return JobType.CREATE_IMAGE;
}

export async function GET() {
  await requireAdminUser();

  let credential;
  try {
    credential = await getProviderCredentialSecret(Provider.GEMINI);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini is not configured yet.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const url = new URL(`${GEMINI_API_BASE}/models`);
  url.searchParams.set("key", credential.apiKey);
  url.searchParams.set("pageSize", "50");

  const response = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    console.error("Gemini API error:", response.status, await response.text());
    return NextResponse.json(
      {
        error: "Unable to fetch models from Gemini. Check credentials and try again.",
      },
      { status: 502 },
    );
  }

  const data = await response.json();
  const models = Array.isArray(data?.models)
    ? data.models.map((modelRaw: unknown) => {
        const model = modelRaw as GeminiAPIModel;
        const slug = model?.name ?? "";
        const displayName = model?.displayName ?? slug ?? "Gemini model";
        const supportedGenerationMethods = model?.supportedGenerationMethods ?? [];

        return {
          slug,
          displayName,
          description: model?.description ?? "",
          defaultJobType: inferJobType(supportedGenerationMethods),
          suggestedCreditCost: null,
          metadata: {
            supportedGenerationMethods,
            inputTokenLimit: model?.inputTokenLimit ?? null,
            outputTokenLimit: model?.outputTokenLimit ?? null,
            version: model?.version ?? null,
            temperature: model?.temperature ?? null,
            topK: model?.topK ?? null,
            topP: model?.topP ?? null,
          },
        };
      })
    : [];

  return NextResponse.json({ models });
}
