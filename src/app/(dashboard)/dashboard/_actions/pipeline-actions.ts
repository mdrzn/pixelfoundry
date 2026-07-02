"use server";

import { getPipelineStatus } from "@/lib/pipeline/status";
import { getSession } from "@/lib/session";

export async function getPipelineStatusAction(pipelineId: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false as const, error: "Not authenticated" };
  }
  const view = await getPipelineStatus(pipelineId, session.user.id);
  if (!view) {
    return { ok: false as const, error: "Not found" };
  }
  return { ok: true as const, pipeline: view };
}
