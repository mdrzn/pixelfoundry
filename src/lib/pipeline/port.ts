import {
  CreditReason,
  Prisma,
  StepStatus,
  type PipelineStatus,
  type PipelineType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { ProviderModelInfo, ProviderRunAsset } from "@/lib/providers/types";
import { storage } from "@/lib/storage";
import { persistUrlToStorage } from "@/lib/storage/persist";

import { buildCostFn } from "./costs";
import type { ExecStep, ExecutorPort } from "./executor";
import { getRunner, type RunnerContext } from "./runners";
import type { PlannedStep } from "./types";

type CreateExecutorPortArgs = {
  userId: string;
  params: Record<string, unknown>;
};

// Which param keys hold providerModelIds to preload (mirrors submit.ts).
// Expand-created steps reference the same model ids, so preloading from
// params is sufficient for the sync cost() fn.
const MODEL_PARAM_KEYS = ["imageModelId", "videoModelId", "llmModelId"];

/** Map a nullable Prisma JSON metadata value to ProviderModelMetadata. */
function toModelMetadata(
  metadata: Prisma.JsonValue | null,
): ProviderModelInfo["metadata"] {
  return metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>)
    : null;
}

export async function createExecutorPort({
  userId,
  params,
}: CreateExecutorPortArgs): Promise<ExecutorPort> {
  // Preload referenced model costs so cost() can stay synchronous.
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
  const costFn = buildCostFn(modelCosts);

  const getModel = async (providerModelId: string): Promise<ProviderModelInfo> => {
    const m = await prisma.providerModel.findUniqueOrThrow({ where: { id: providerModelId } });
    return {
      provider: m.provider,
      slug: m.slug,
      displayName: m.displayName,
      metadata: toModelMetadata(m.metadata),
    };
  };

  const readAsset = async (
    assetId: string,
  ): Promise<{ data: Buffer; contentType: string }> => {
    const asset = await prisma.asset.findUniqueOrThrow({
      where: { id: assetId },
      select: { storageKey: true },
    });
    if (!asset.storageKey) throw new Error(`readAsset: asset ${assetId} has no storageKey`);
    const obj = await storage.read(asset.storageKey);
    if (!obj) throw new Error(`readAsset: no stored bytes for asset ${assetId}`);
    return obj;
  };

  return {
    async loadPipeline(id) {
      const p = await prisma.pipeline.findUnique({ where: { id } });
      if (!p) return null;
      return {
        id: p.id,
        userId: p.userId,
        type: p.type as PipelineType,
        params: (p.params ?? {}) as Record<string, unknown>,
        heldCost: p.heldCost,
        status: p.status as PipelineStatus,
      };
    },

    async loadSteps(pipelineId) {
      // DETERMINISTIC ORDER REQUIRED for the scheduling loop / terminal-asset selection.
      const rows = await prisma.pipelineStep.findMany({
        where: { pipelineId },
        orderBy: { createdAt: "asc" },
        include: { outputAsset: { select: { url: true } } },
      });
      return rows.map(
        (row): ExecStep => ({
          id: row.id,
          key: row.key,
          name: row.name,
          stepType: row.stepType,
          status: row.status,
          dependsOn: row.dependsOn,
          input: row.input as unknown,
          providerModelId: row.providerModelId,
          cost: row.cost,
          output: row.output ?? undefined,
          outputAssetId: row.outputAssetId,
          assetUrl: row.outputAsset?.url ?? null,
          attempts: row.attempts,
          error: row.error,
        }),
      );
    },

    async addStep(pipelineId, planned: PlannedStep) {
      // IDEMPOTENT on (pipelineId, key).
      await prisma.pipelineStep.createMany({
        data: [
          {
            pipelineId,
            key: planned.key,
            name: planned.name,
            stepType: planned.stepType,
            status: StepStatus.PENDING,
            dependsOn: planned.dependsOn,
            input: planned.input as Prisma.InputJsonValue,
            providerModelId: planned.providerModelId ?? null,
            cost: planned.cost,
          },
        ],
        skipDuplicates: true,
      });
    },

    async patchStep(stepId, patch) {
      const data: Prisma.PipelineStepUpdateInput = {};
      if (patch.status !== undefined) data.status = patch.status;
      if (patch.output !== undefined) data.output = patch.output as Prisma.InputJsonValue;
      if (patch.outputAssetId !== undefined) {
        data.outputAsset =
          patch.outputAssetId === null
            ? { disconnect: true }
            : { connect: { id: patch.outputAssetId } };
      }
      if (patch.error !== undefined) data.error = patch.error;
      if (patch.attempts !== undefined) data.attempts = patch.attempts;
      if (patch.startedAt !== undefined) data.startedAt = patch.startedAt;
      if (patch.finishedAt !== undefined) data.finishedAt = patch.finishedAt;
      await prisma.pipelineStep.update({ where: { id: stepId }, data });
    },

    async setPipeline(id, patch) {
      const data: Prisma.PipelineUpdateInput = {};
      if (patch.status !== undefined) data.status = patch.status;
      if (patch.progress !== undefined) data.progress = patch.progress;
      if (patch.actualCost !== undefined) data.actualCost = patch.actualCost;
      if (patch.outputAssetId !== undefined) {
        data.outputAsset =
          patch.outputAssetId === null
            ? { disconnect: true }
            : { connect: { id: patch.outputAssetId } };
      }
      if (patch.error !== undefined) data.error = patch.error;
      if (patch.completedAt !== undefined) data.completedAt = patch.completedAt;
      await prisma.pipeline.update({ where: { id }, data });
    },

    async runStep(step, resolvedInput) {
      const runner = getRunner(step.stepType);
      const ctx: RunnerContext = { userId, stepId: step.id, getModel, readAsset };
      return runner(resolvedInput, step.providerModelId ?? undefined, ctx);
    },

    async persistAsset(stepId, ownerId, asset: ProviderRunAsset) {
      // create -> persist -> update (mirrors jobs.ts finalizeProviderJob).
      const row = await prisma.asset.create({
        data: {
          userId: ownerId,
          type: asset.type,
          url: asset.url, // replaced below once stored
          thumbnail: asset.thumbnail ?? asset.url,
          metadata: asset.metadata ? (asset.metadata as Prisma.InputJsonValue) : undefined,
        },
      });

      const persisted = await persistUrlToStorage(storage, {
        kind: "asset",
        id: row.id,
        url: asset.url,
      });

      if (!persisted) {
        // Generation already succeeded; keep the provider (temporary) URL rather
        // than failing the step. Mirrors finalizeProviderJob's deliberate choice.
        console.warn("[persistAsset] persistence failed; keeping provider URL", {
          stepId,
          assetId: row.id,
          url: asset.url,
        });
        return { assetId: row.id, assetUrl: row.url };
      }

      const updated = await prisma.asset.update({
        where: { id: row.id },
        data: {
          url: persisted.url,
          thumbnail: persisted.url,
          storageKey: persisted.storageKey,
          mimeType: persisted.mimeType,
          sizeBytes: persisted.sizeBytes,
        },
        select: { url: true },
      });
      return { assetId: row.id, assetUrl: updated.url };
    },

    async refund(refundUserId, pipelineId, amount) {
      // IDEMPOTENT per pipeline: at most one REFUND ledger row ever exists.
      await prisma.$transaction(async (tx) => {
        const existing = await tx.creditLedger.findFirst({
          where: { pipelineId, reason: CreditReason.REFUND },
        });
        if (existing) return; // already reconciled — never double-refund.
        if (amount <= 0) return;
        const u = await tx.user.update({
          where: { id: refundUserId },
          data: { credits: { increment: amount } },
          select: { credits: true },
        });
        await tx.creditLedger.create({
          data: {
            userId: refundUserId,
            pipelineId,
            delta: amount,
            balanceAfter: u.credits,
            reason: CreditReason.REFUND,
            metadata: { kind: "pipeline_reconcile" } as Prisma.InputJsonValue,
          },
        });
      });
    },

    cost(stepType, providerModelId) {
      return costFn(stepType, providerModelId);
    },
  };
}
