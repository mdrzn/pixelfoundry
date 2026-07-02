import { redirect } from "next/navigation";
import { Provider } from "@prisma/client";

import { SubtitlesForm } from "@/app/(dashboard)/dashboard/subtitles/subtitles-form";
import { TRANSLATION_ASSET_MODEL_SLUGS } from "@/lib/pipeline/audio-models";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/languages";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function SubtitlesPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/auth/login");

  const model = await prisma.providerModel.findFirst({
    where: {
      provider: Provider.FAL,
      isActive: true,
      slug: TRANSLATION_ASSET_MODEL_SLUGS.subtitle,
    },
    select: { id: true },
  });
  const modelsReady = Boolean(model);

  return <SubtitlesForm modelsReady={modelsReady} languages={SUPPORTED_LANGUAGES} />;
}
