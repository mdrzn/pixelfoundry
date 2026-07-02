import { prisma } from "@/lib/prisma";

export type PipelineStatusView = {
  id: string;
  status: string;
  progress: number;
  error: string | null;
  outputUrl: string | null;
  outputData: unknown | null;
  steps: { key: string; name: string; status: string }[];
};

type StepRow = {
  key: string;
  name: string;
  status: string;
  dependsOn: string[];
  output: unknown;
};

/**
 * Compute the terminal SINK step's output: a DONE step whose `key` is in no
 * other step's `dependsOn`. If multiple qualify, the last one wins. Returns
 * null if none.
 */
function computeOutputData(steps: StepRow[]): unknown | null {
  const dependedOn = new Set<string>();
  for (const s of steps) {
    for (const dep of s.dependsOn) dependedOn.add(dep);
  }
  let result: unknown | null = null;
  for (const s of steps) {
    if (s.status === "DONE" && !dependedOn.has(s.key)) {
      result = s.output ?? null;
    }
  }
  return result;
}

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
        select: { key: true, name: true, status: true, dependsOn: true, output: true },
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
    outputData: computeOutputData(p.steps as StepRow[]),
    steps: p.steps.map((s) => ({ key: s.key, name: s.name, status: s.status })),
  };
}
