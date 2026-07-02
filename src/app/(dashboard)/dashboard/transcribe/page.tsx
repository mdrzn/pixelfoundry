import { redirect } from "next/navigation";
import { Provider } from "@prisma/client";

import { TranscribeForm } from "@/app/(dashboard)/dashboard/transcribe/transcribe-form";
import { AUDIO_MODEL_SLUGS } from "@/lib/pipeline/audio-models";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function TranscribePage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/auth/login");

  const model = await prisma.providerModel.findFirst({
    where: { provider: Provider.FAL, isActive: true, slug: AUDIO_MODEL_SLUGS.stt },
    select: { id: true },
  });
  const modelsReady = Boolean(model);

  return <TranscribeForm modelsReady={modelsReady} />;
}
