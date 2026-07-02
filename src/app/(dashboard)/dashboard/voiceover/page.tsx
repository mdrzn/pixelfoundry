import { redirect } from "next/navigation";
import { Provider } from "@prisma/client";

import { VoiceoverForm } from "@/app/(dashboard)/dashboard/voiceover/voiceover-form";
import { AUDIO_MODEL_SLUGS } from "@/lib/pipeline/audio-models";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/languages";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function VoiceoverPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/auth/login");

  const models = await prisma.providerModel.findMany({
    where: {
      provider: Provider.FAL,
      isActive: true,
      slug: { in: Object.values(AUDIO_MODEL_SLUGS) },
    },
    select: { slug: true },
  });
  const slugs = new Set(models.map((m) => m.slug));
  const modelsReady = Object.values(AUDIO_MODEL_SLUGS).every((s) => slugs.has(s));

  return <VoiceoverForm modelsReady={modelsReady} languages={SUPPORTED_LANGUAGES} />;
}
