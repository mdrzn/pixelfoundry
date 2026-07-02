import { AssetType, JobType, Provider } from "@prisma/client";

import { CreateVideoForm } from "@/app/(dashboard)/dashboard/create-video/create-video-form";
import { DashboardPageContainer } from "@/components/layout/dashboard-sidebar";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const providerLabels: Record<Provider, string> = {
  [Provider.REPLICATE]: "Replicate",
  [Provider.OPENAI]: "OpenAI",
  [Provider.GEMINI]: "Gemini",
  [Provider.FAL]: "fal",
};

export default async function CreateVideoPage() {
  const session = await getSession();
  const userId = session?.user?.id ?? null;

  const models = await prisma.providerModel.findMany({
    where: {
      jobTypes: {
        has: JobType.CREATE_VIDEO,
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
          type: AssetType.VIDEO,
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

  return (
    <DashboardPageContainer
      title="Create video"
      description="Synthesize motion from text or extend existing footage with curated vendors."
    >
      <CreateVideoForm modelOptions={modelOptions} recentAssets={recentAssetOptions} />
    </DashboardPageContainer>
  );
}
