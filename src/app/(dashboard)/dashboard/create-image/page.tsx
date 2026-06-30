import Link from "next/link";
import { AssetType, JobType, PresetVisibility, Provider } from "@prisma/client";

import { CreateImageForm } from "@/app/(dashboard)/dashboard/create-image/create-image-form";
import { DashboardPageContainer } from "@/components/layout/dashboard-sidebar";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const providerLabels: Record<Provider, string> = {
  [Provider.REPLICATE]: "Replicate",
  [Provider.OPENAI]: "OpenAI",
  [Provider.GEMINI]: "Gemini",
};

export default async function CreateImagePage() {
  const session = await getSession();
  const userId = session?.user?.id ?? null;

  const models = await prisma.providerModel.findMany({
    where: {
      jobTypes: {
        has: JobType.CREATE_IMAGE,
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

  const presetVisibilityFilter = [
    { visibility: PresetVisibility.GLOBAL },
    { visibility: PresetVisibility.TEAM },
  ];

  const presets = await prisma.imagePreset.findMany({
    where: userId
      ? {
          OR: [...presetVisibilityFilter, { userId }],
        }
      : {
          OR: presetVisibilityFilter,
        },
    include: {
      references: {
        include: {
          asset: {
            select: {
              id: true,
              title: true,
              url: true,
              thumbnail: true,
              createdAt: true,
              type: true,
            },
          },
        },
      },
      providerModel: {
        select: {
          id: true,
          displayName: true,
          provider: true,
          creditCost: true,
          metadata: true,
        },
      },
    },
    orderBy: [
      { visibility: "asc" },
      { name: "asc" },
    ],
  });

  const presetOptions = presets.map((preset) => ({
    id: preset.id,
    userId: preset.userId,
    visibility: preset.visibility,
    name: preset.name,
    description: preset.description,
    providerModelId: preset.providerModelId,
    prompt: preset.prompt,
    negativePrompt: preset.negativePrompt,
    aspectRatio: preset.aspectRatio,
    width: preset.width,
    height: preset.height,
    cfgScale: preset.cfgScale,
    steps: preset.steps,
    seed: preset.seed,
    sampler: preset.sampler,
    outputCount: preset.outputCount,
    upscale: preset.upscale,
    metadata: preset.metadata,
    tags: preset.tags,
    createdAt: preset.createdAt.toISOString(),
    updatedAt: preset.updatedAt.toISOString(),
    references: preset.references
      .map((reference) =>
        reference.asset
          ? {
              assetId: reference.assetId,
              asset: {
                id: reference.asset.id,
                title: reference.asset.title,
                url: reference.asset.url,
                thumbnail: reference.asset.thumbnail ?? reference.asset.url,
                createdAt: reference.asset.createdAt.toISOString(),
                type: reference.asset.type,
              },
            }
          : null,
      )
      .filter((value): value is NonNullable<typeof value> => value !== null),
    providerModel: preset.providerModel
      ? {
          id: preset.providerModel.id,
          displayName: preset.providerModel.displayName,
          provider: preset.providerModel.provider,
          creditCost: preset.providerModel.creditCost,
          metadata: preset.providerModel.metadata,
        }
      : null,
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

  return (
    <DashboardPageContainer
      title="Create image"
      description="Send a prompt to one of the curated models and manage quality presets."
      action={
        <Button variant="secondary" asChild>
          <Link href="/dashboard/library">View library</Link>
        </Button>
      }
    >
      <CreateImageForm
        modelOptions={modelOptions}
        presets={presetOptions}
        recentAssets={recentAssetOptions}
        currentUserId={userId}
      />
    </DashboardPageContainer>
  );
}
