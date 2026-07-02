import { redirect } from "next/navigation";
import { Provider } from "@prisma/client";

import { DubbingForm } from "@/app/(dashboard)/dashboard/dubbing/dubbing-form";
import {
  AUDIO_MODEL_SLUGS,
  PODCAST_MODEL_SLUGS,
  SHORTS_MODEL_SLUGS,
} from "@/lib/pipeline/audio-models";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/languages";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function DubbingPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/auth/login");

  const slugs = [
    AUDIO_MODEL_SLUGS.stt,
    AUDIO_MODEL_SLUGS.tts,
    AUDIO_MODEL_SLUGS.clone,
    PODCAST_MODEL_SLUGS.lipsync,
    SHORTS_MODEL_SLUGS.mux,
    SHORTS_MODEL_SLUGS.script,
  ];
  const models = await prisma.providerModel.findMany({
    where: { provider: Provider.FAL, isActive: true, slug: { in: slugs } },
    select: { slug: true },
  });
  const present = new Set(models.map((m) => m.slug));
  const modelsReady = slugs.every((s) => present.has(s));

  return <DubbingForm modelsReady={modelsReady} languages={SUPPORTED_LANGUAGES} />;
}
