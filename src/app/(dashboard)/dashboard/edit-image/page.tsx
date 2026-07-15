import { AssetType, JobType, Provider } from "@prisma/client";

import { EditImageForm } from "@/app/(dashboard)/dashboard/edit-image/edit-image-form";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const providerLabels: Record<Provider, string> = {
  [Provider.REPLICATE]: "Replicate",
  [Provider.OPENAI]: "OpenAI",
  [Provider.GEMINI]: "Gemini",
  [Provider.FAL]: "fal",
};

export default async function EditImagePage() {
  const session = await getSession();
  const userId = session?.user?.id ?? null;

  const models = await prisma.providerModel.findMany({
    where: {
      jobTypes: {
        has: JobType.EDIT_IMAGE,
      },
      isActive: true,
    },
    orderBy: [
      { provider: "asc" },
      { displayName: "asc" },
    ],
  });

  const modelOptions = models.map((model) => ({
    value: model.id,
    label: model.displayName,
    description: model.description,
    creditCost: model.creditCost,
    provider: model.provider,
    providerLabel: providerLabels[model.provider],
    metadata: model.metadata,
  }));

  const recentAssets = userId
    ? await prisma.asset.findMany({
        where: {
          userId,
          type: AssetType.IMAGE,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          title: true,
          url: true,
          thumbnail: true,
          createdAt: true,
        },
        take: 24,
      })
    : [];

  const recentAssetOptions = recentAssets.map((asset) => ({
    id: asset.id,
    title: asset.title,
    url: asset.url,
    thumbnail: asset.thumbnail ?? asset.url,
    createdAt: asset.createdAt.toISOString(),
  }));

  return <EditImageForm modelOptions={modelOptions} recentAssets={recentAssetOptions} />;
}
