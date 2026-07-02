import { PipelineType, PipelineStatus, StepStatus, CreditReason, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDefinition } from "./definitions";
import { buildCostFn } from "./costs";
import { enqueuePipeline } from "@/lib/queue/pipeline-queue";

type SubmitArgs = { userId: string; type: PipelineType; params: Record<string, unknown> };

// Which param keys hold providerModelIds to preload (per current definitions).
const MODEL_PARAM_KEYS = [
  "imageModelId",
  "videoModelId",
  "llmModelId",
  "sttModelId",
  "ttsModelId",
  "cloneModelId",
];

export async function submitPipeline(
  { userId, type, params }: SubmitArgs,
  deps: { enqueue?: (id: string) => Promise<void> } = {},
): Promise<{ pipelineId: string; heldCost: number }> {
  const enqueue = deps.enqueue ?? enqueuePipeline;
  const def = getDefinition(type);

  // Preload referenced model costs.
  const ids = MODEL_PARAM_KEYS.map((k) => params[k]).filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  const models = ids.length
    ? await prisma.providerModel.findMany({
        where: { id: { in: ids } },
        select: { id: true, creditCost: true },
      })
    : [];
  const modelCosts: Record<string, number> = {};
  for (const m of models) modelCosts[m.id] = m.creditCost;
  const cost = buildCostFn(modelCosts);

  const estimate = def.estimateUpperBound(params, { cost });
  const planned = def.plan(params, { cost });

  const pipelineId = await prisma.$transaction(async (tx) => {
    // Guarded atomic deduct (same pattern as jobs.ts deductCredits).
    const res = await tx.user.updateMany({
      where: { id: userId, credits: { gte: estimate } },
      data: { credits: { decrement: estimate } },
    });
    if (res.count === 0) throw new Error("Insufficient credits for this action.");
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });

    const pipeline = await tx.pipeline.create({
      data: {
        userId,
        type,
        status: PipelineStatus.QUEUED,
        params: params as Prisma.InputJsonValue,
        estimatedCost: estimate,
        heldCost: estimate,
      },
    });
    await tx.pipelineStep.createMany({
      data: planned.map((p) => ({
        pipelineId: pipeline.id,
        key: p.key,
        name: p.name,
        stepType: p.stepType,
        status: StepStatus.PENDING,
        dependsOn: p.dependsOn,
        input: p.input as Prisma.InputJsonValue,
        providerModelId: p.providerModelId ?? null,
        cost: p.cost,
      })),
    });
    await tx.creditLedger.create({
      data: {
        userId,
        pipelineId: pipeline.id,
        delta: -estimate,
        balanceAfter: user.credits,
        reason: CreditReason.DEDUCT,
        metadata: { kind: "pipeline_hold", type, estimate } as Prisma.InputJsonValue,
      },
    });
    return pipeline.id;
  });

  await enqueue(pipelineId);
  return { pipelineId, heldCost: estimate };
}
