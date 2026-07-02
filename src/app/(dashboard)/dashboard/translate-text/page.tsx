import { redirect } from "next/navigation";
import { Provider } from "@prisma/client";

import { TranslateTextForm } from "@/app/(dashboard)/dashboard/translate-text/translate-text-form";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/languages";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const LLM_MODEL_SLUG = "fal-ai/any-llm";

export default async function TranslateTextPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/auth/login");

  const model = await prisma.providerModel.findFirst({
    where: { provider: Provider.FAL, isActive: true, slug: LLM_MODEL_SLUG },
    select: { id: true },
  });
  const modelsReady = Boolean(model);

  return <TranslateTextForm modelsReady={modelsReady} languages={SUPPORTED_LANGUAGES} />;
}
