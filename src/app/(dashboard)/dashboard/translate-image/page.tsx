import { redirect } from "next/navigation";
import { Provider } from "@prisma/client";

import { TranslateImageForm } from "@/app/(dashboard)/dashboard/translate-image/translate-image-form";
import { TRANSLATION_ASSET_MODEL_SLUGS } from "@/lib/pipeline/audio-models";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/languages";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function TranslateImagePage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/auth/login");

  const model = await prisma.providerModel.findFirst({
    where: {
      provider: Provider.FAL,
      isActive: true,
      slug: TRANSLATION_ASSET_MODEL_SLUGS.translateImage,
    },
    select: { id: true },
  });
  const modelsReady = Boolean(model);

  return <TranslateImageForm modelsReady={modelsReady} languages={SUPPORTED_LANGUAGES} />;
}
