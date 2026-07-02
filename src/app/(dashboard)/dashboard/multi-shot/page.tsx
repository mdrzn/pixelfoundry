import { redirect } from "next/navigation";
import { JobType, Provider } from "@prisma/client";

import { MultiShotForm } from "@/app/(dashboard)/dashboard/multi-shot/multi-shot-form";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function MultiShotPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/auth/login");

  const [imageModels, videoModels] = await Promise.all([
    prisma.providerModel.findMany({
      where: {
        provider: Provider.FAL,
        isActive: true,
        jobTypes: { has: JobType.CREATE_IMAGE },
      },
      orderBy: { displayName: "asc" },
    }),
    prisma.providerModel.findMany({
      where: {
        provider: Provider.FAL,
        isActive: true,
        jobTypes: { has: JobType.CREATE_VIDEO },
      },
      orderBy: { displayName: "asc" },
    }),
  ]);

  const toOpt = (m: { id: string; displayName: string; creditCost: number }) => ({
    value: m.id,
    label: m.displayName,
    creditCost: m.creditCost,
  });

  return (
    <MultiShotForm
      imageModels={imageModels.map(toOpt)}
      videoModels={videoModels.map(toOpt)}
    />
  );
}
