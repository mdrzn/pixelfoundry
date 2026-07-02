import { redirect } from "next/navigation";
import { JobType, Provider } from "@prisma/client";

import { ShortsForm } from "@/app/(dashboard)/dashboard/shorts/shorts-form";
import { SHORTS_MODEL_SLUGS } from "@/lib/pipeline/audio-models";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function ShortsPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/auth/login");

  const [slugModels, imageCount, videoCount] = await Promise.all([
    prisma.providerModel.findMany({
      where: {
        provider: Provider.FAL,
        isActive: true,
        slug: { in: Object.values(SHORTS_MODEL_SLUGS) },
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
    Object.values(SHORTS_MODEL_SLUGS).every((s) => slugs.has(s)) &&
    imageCount > 0 &&
    videoCount > 0;

  return <ShortsForm modelsReady={modelsReady} />;
}
