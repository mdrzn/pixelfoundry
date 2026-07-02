import { redirect } from "next/navigation";
import { JobType, Provider } from "@prisma/client";

import { SceneBuilderForm } from "@/app/(dashboard)/dashboard/scene-builder/scene-builder-form";
import { SCENE_BUILDER_MODEL_SLUGS } from "@/lib/pipeline/audio-models";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function SceneBuilderPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/auth/login");

  const [slugModels, imageCount, videoCount] = await Promise.all([
    prisma.providerModel.findMany({
      where: {
        provider: Provider.FAL,
        isActive: true,
        slug: { in: Object.values(SCENE_BUILDER_MODEL_SLUGS) },
      },
      select: { slug: true },
    }),
    prisma.providerModel.count({
      where: { provider: Provider.FAL, isActive: true, jobTypes: { has: JobType.CREATE_IMAGE } },
    }),
    prisma.providerModel.count({
      where: { provider: Provider.FAL, isActive: true, jobTypes: { has: JobType.CREATE_VIDEO } },
    }),
  ]);

  const slugs = new Set(slugModels.map((m) => m.slug));
  const modelsReady =
    Object.values(SCENE_BUILDER_MODEL_SLUGS).every((s) => slugs.has(s)) &&
    imageCount > 0 &&
    videoCount > 0;

  return <SceneBuilderForm modelsReady={modelsReady} />;
}
