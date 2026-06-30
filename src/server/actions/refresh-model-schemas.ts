import { revalidatePath } from "next/cache";
import { Provider } from "@prisma/client";

import { getProviderCredentialSecret, requireAdminUser } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

type ReplicateModelDetail = {
  owner?: string | null;
  name?: string | null;
  latest_version?: {
    openapi_schema?: unknown;
  } | null;
};

export async function refreshModelSchema(modelId: string) {
  await requireAdminUser();

  try {
    const model = await prisma.providerModel.findUnique({
      where: { id: modelId },
      select: { provider: true, slug: true, metadata: true },
    });

    if (!model) {
      return { ok: false, error: "Model not found" };
    }

    if (model.provider !== Provider.REPLICATE) {
      return {
        ok: false,
        error: "Schema refresh is only supported for Replicate models",
      };
    }

    const credential = await getProviderCredentialSecret(Provider.REPLICATE);

    const response = await fetch(
      `${REPLICATE_API_BASE}/models/${model.slug}`,
      {
        headers: {
          Authorization: `Bearer ${credential.apiKey}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return {
        ok: false,
        error: `Replicate API error: ${response.status}`,
      };
    }

    const data = (await response.json()) as ReplicateModelDetail;
    const openapi_schema = data?.latest_version?.openapi_schema ?? null;

    const currentMetadata =
      typeof model.metadata === "object" && model.metadata !== null
        ? (model.metadata as Record<string, unknown>)
        : {};

    await prisma.providerModel.update({
      where: { id: modelId },
      data: {
        metadata: {
          ...currentMetadata,
          openapi_schema,
        },
      },
    });

    // Invalidate capabilities cache
    revalidatePath(`/api/models/${modelId}/capabilities`);

    return { ok: true };
  } catch (error) {
    console.error("Error refreshing model schema:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to refresh schema",
    };
  }
}
