import { prisma } from "@/lib/prisma";

export type PipelineStatusView = {
  id: string;
  status: string;
  progress: number;
  error: string | null;
  outputUrl: string | null;
  steps: { key: string; name: string; status: string }[];
};

/** Owner-guarded status lookup. Returns null if not found or not owned by userId. */
export async function getPipelineStatus(
  pipelineId: string,
  userId: string,
): Promise<PipelineStatusView | null> {
  const p = await prisma.pipeline.findUnique({
    where: { id: pipelineId },
    include: {
      steps: {
        orderBy: { createdAt: "asc" },
        select: { key: true, name: true, status: true },
      },
      outputAsset: { select: { url: true } },
    },
  });
  if (!p || p.userId !== userId) return null;
  return {
    id: p.id,
    status: p.status,
    progress: p.progress,
    error: p.error,
    outputUrl: p.outputAsset?.url ?? null,
    steps: p.steps.map((s) => ({ key: s.key, name: s.name, status: s.status })),
  };
}
