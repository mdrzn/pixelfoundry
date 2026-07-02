import { redirect } from "next/navigation";
import { JobType, Provider } from "@prisma/client";

import { PodcastForm } from "@/app/(dashboard)/dashboard/podcast/podcast-form";
import { PODCAST_MODEL_SLUGS } from "@/lib/pipeline/audio-models";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function PodcastPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/auth/login");

  const [slugModels, imageCount] = await Promise.all([
    prisma.providerModel.findMany({
      where: {
        provider: Provider.FAL,
        isActive: true,
        slug: { in: Object.values(PODCAST_MODEL_SLUGS) },
      },
      select: { slug: true },
    }),
    prisma.providerModel.count({
      where: { provider: Provider.FAL, isActive: true, jobTypes: { has: JobType.CREATE_IMAGE } },
    }),
  ]);

  const slugs = new Set(slugModels.map((m) => m.slug));
  const modelsReady =
    Object.values(PODCAST_MODEL_SLUGS).every((s) => slugs.has(s)) && imageCount > 0;

  return <PodcastForm modelsReady={modelsReady} />;
}
