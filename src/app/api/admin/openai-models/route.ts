import { JobType, Provider } from "@prisma/client";
import { NextResponse } from "next/server";

import { getProviderCredentialSecret, requireAdminUser } from "@/lib/admin";

const OPENAI_API_BASE = "https://api.openai.com/v1";

type OpenAIModel = {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
  permission?: unknown;
  root?: string | null;
  parent?: string | null;
};

function inferJobType(modelId: string): JobType | null {
  const id = modelId.toLowerCase();
  if (id.includes("dall") || id.includes("image")) {
    return JobType.CREATE_IMAGE;
  }

  if (id.includes("video") || id.includes("sora")) {
    return JobType.CREATE_VIDEO;
  }

  if (id.includes("edit")) {
    return JobType.EDIT_IMAGE;
  }

  return null;
}

function formatDisplayName(modelId: string): string {
  if (modelId.includes("dall")) {
    return "DALL·E 3";
  }
  if (modelId.includes("gpt")) {
    return modelId.toUpperCase();
  }
  return modelId;
}

export async function GET() {
  await requireAdminUser();

  let credential;
  try {
    credential = await getProviderCredentialSecret(Provider.OPENAI);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenAI is not configured yet.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const response = await fetch(`${OPENAI_API_BASE}/models`, {
    headers: {
      Authorization: `Bearer ${credential.apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      {
        error: "Unable to fetch models from OpenAI",
        detail: text,
      },
      { status: response.status },
    );
  }

  const data = await response.json();
  const models = Array.isArray(data?.data)
    ? (data.data as OpenAIModel[])
        .map((model) => {
          const jobType = inferJobType(model.id);
          if (!jobType) {
            return null;
          }

          return {
            slug: model.id,
            displayName: formatDisplayName(model.id),
            description: `Owned by ${model.owned_by ?? "OpenAI"}`,
            defaultJobType: jobType,
            suggestedCreditCost: null,
            metadata: {
              ownedBy: model.owned_by ?? null,
              root: model.root ?? null,
              parent: model.parent ?? null,
            },
          };
        })
        .filter((model): model is NonNullable<typeof model> => model !== null)
    : [];

  return NextResponse.json({ models });
}
