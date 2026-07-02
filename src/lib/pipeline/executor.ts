import { PipelineStatus, StepStatus, type PipelineType } from "@prisma/client";
import type { ProviderRunAsset } from "@/lib/providers/types";
import { getDefinition } from "./definitions";
import { resolveInput, type StepOutput } from "./refs";
import type { PlannedStep } from "./types";

export type ExecStep = {
  id: string;
  key: string;
  name: string;
  stepType: string;
  status: StepStatus;
  dependsOn: string[];
  input: unknown;
  providerModelId?: string | null;
  cost: number;
  output?: unknown;
  outputAssetId?: string | null;
  assetUrl?: string | null; // convenience for ref resolution / terminal output
  attempts: number;
  error?: string | null;
};

export type ExecutorPort = {
  loadPipeline(id: string): Promise<{
    id: string;
    userId: string;
    type: PipelineType;
    params: Record<string, unknown>;
    heldCost: number;
    /** Current status; used to short-circuit re-invocation on terminal pipelines. */
    status?: PipelineStatus;
  } | null>;
  loadSteps(pipelineId: string): Promise<ExecStep[]>;
  /** upsert a planned step (PENDING) by (pipelineId,key); ignore if key already exists */
  addStep(pipelineId: string, step: PlannedStep): Promise<void>;
  patchStep(
    stepId: string,
    patch: Partial<ExecStep> & { startedAt?: Date; finishedAt?: Date },
  ): Promise<void>;
  setPipeline(
    id: string,
    patch: {
      status?: PipelineStatus;
      progress?: number;
      actualCost?: number;
      outputAssetId?: string | null;
      error?: string | null;
      completedAt?: Date;
    },
  ): Promise<void>;
  runStep(
    step: ExecStep,
    resolvedInput: Record<string, unknown>,
  ): Promise<{ data?: unknown; asset?: ProviderRunAsset }>;
  /** persist an asset produced by a step; returns ids for wiring + ref resolution */
  persistAsset(
    stepId: string,
    userId: string,
    asset: ProviderRunAsset,
  ): Promise<{ assetId: string; assetUrl: string }>;
  /**
   * Refund unused held credits at reconciliation. The real port MUST make this
   * idempotent per pipeline (e.g. keyed on pipelineId), so a duplicate/retried
   * invocation cannot refund twice — enforced when the DB port lands.
   */
  refund(userId: string, pipelineId: string, amount: number): Promise<void>;
  cost(stepType: string, providerModelId?: string | null): number;
};

const TERMINAL_STATUSES: readonly PipelineStatus[] = [
  PipelineStatus.COMPLETED,
  PipelineStatus.PARTIAL,
  PipelineStatus.FAILED,
  PipelineStatus.CANCELED,
];

const CONCURRENCY = 4;

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message || String(err);
  return String(err);
}

/** Split an array into fixed-size chunks (simple concurrency pool). */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function runPipeline(pipelineId: string, port: ExecutorPort): Promise<void> {
  const pipeline = await port.loadPipeline(pipelineId);
  if (!pipeline) throw new Error(`runPipeline: no pipeline with id ${pipelineId}`);

  // C1: guard against re-invocation on an already-terminal pipeline (BullMQ
  // at-least-once delivery / worker restarts). Re-running would refund again.
  if (pipeline.status !== undefined && TERMINAL_STATUSES.includes(pipeline.status)) {
    return;
  }

  const { userId, type, params, heldCost } = pipeline;

  await port.setPipeline(pipelineId, { status: PipelineStatus.RUNNING });

  const definition = getDefinition(type);

  // C2: reset any steps left RUNNING by a crashed worker back to PENDING.
  // They were never persisted/charged (DONE + persistAsset happen atomically
  // from the executor's view), so re-running them is safe.
  const initialSteps = await port.loadSteps(pipelineId);
  for (const s of initialSteps) {
    if (s.status === StepStatus.RUNNING) {
      await port.patchStep(s.id, { status: StepStatus.PENDING });
      s.status = StepStatus.PENDING; // reflect in local view
    }
  }

  // Seed ref-resolution map from steps already DONE (so RESUME works).
  const outputsByKey: Record<string, StepOutput> = {};
  for (const s of initialSteps) {
    if (s.status === StepStatus.DONE) {
      outputsByKey[s.key] = {
        data: s.output,
        assetUrl: s.assetUrl ?? undefined,
        assetId: s.outputAssetId ?? undefined,
      };
    }
  }

  const progressFor = (steps: ExecStep[]): number => {
    const total = steps.length;
    if (total === 0) return 0;
    const done = steps.filter((s) => s.status === StepStatus.DONE).length;
    return Math.round((done / total) * 100);
  };

  let failed = false;

  // Scheduling loop: run all currently-runnable PENDING steps whose deps are DONE.
  for (;;) {
    const steps = await port.loadSteps(pipelineId);
    const runnable = steps.filter(
      (s) =>
        s.status === StepStatus.PENDING &&
        s.dependsOn.every((k) => steps.find((x) => x.key === k)?.status === StepStatus.DONE),
    );
    if (runnable.length === 0) break;

    for (const batch of chunk(runnable, CONCURRENCY)) {
      await Promise.all(
        batch.map(async (step) => {
          // I1: the ENTIRE per-step body is inside try/catch. A transient infra
          // error in any port call (patchStep/persistAsset/…) must not reject the
          // Promise.all and strand sibling steps — it fails just this step.
          try {
            const now = new Date();
            await port.patchStep(step.id, { status: StepStatus.RUNNING, startedAt: now });

            const resolved = resolveInput(step.input, outputsByKey) as Record<string, unknown>;
            const result = await port.runStep(step, resolved);

            if (result.asset) {
              const { assetId, assetUrl } = await port.persistAsset(step.id, userId, result.asset);
              await port.patchStep(step.id, {
                status: StepStatus.DONE,
                output: result.data,
                outputAssetId: assetId,
                assetUrl,
                finishedAt: new Date(),
              });
              outputsByKey[step.key] = { data: result.data, assetUrl, assetId };
            } else {
              await port.patchStep(step.id, {
                status: StepStatus.DONE,
                output: result.data,
                finishedAt: new Date(),
              });
              outputsByKey[step.key] = { data: result.data };
            }

            // EXPAND: a completed step may produce more steps (dynamic fan-out).
            const planned = definition.expand(
              { key: step.key, output: result.data ?? null },
              params,
              { cost: (stepType, providerModelId) => port.cost(stepType, providerModelId) },
            );
            for (const ps of planned) await port.addStep(pipelineId, ps);
          } catch (err) {
            failed = true;
            // Best-effort mark FAILED; guarded so a failing patch can't reject Promise.all.
            try {
              await port.patchStep(step.id, {
                status: StepStatus.FAILED,
                error: errMessage(err),
                attempts: step.attempts + 1,
                finishedAt: new Date(),
              });
            } catch {
              // swallow — nothing more we can do; finalize will treat it as leftover/failed.
            }
          }
        }),
      );

      // I4: recompute progress ONCE after the chunk settles (monotonic; avoids
      // concurrent writes racing as expand() grows the total).
      try {
        const fresh = await port.loadSteps(pipelineId);
        await port.setPipeline(pipelineId, { progress: progressFor(fresh) });
      } catch {
        // progress is advisory; ignore transient failures.
      }
    }

    // A failure halts scheduling of further steps.
    if (failed) break;
  }

  // Finalize.
  const finalSteps = await port.loadSteps(pipelineId);
  const done = finalSteps.filter((s) => s.status === StepStatus.DONE);
  const failedSteps = finalSteps.filter((s) => s.status === StepStatus.FAILED);
  // C3: steps still PENDING/RUNNING at loop exit mean the graph is stuck
  // (blocked by a failed/skipped dependency) — NOT successfully complete.
  const leftover = finalSteps.filter(
    (s) => s.status === StepStatus.PENDING || s.status === StepStatus.RUNNING,
  );

  // I2: definition contract — sum(cost of DONE steps) must be <= estimateUpperBound
  // (the held estimate). If it isn't, we still refund what we can, but flag it.
  const actualCost = done.reduce((a, s) => a + s.cost, 0);
  if (actualCost > heldCost) {
    console.warn("[pipeline] actualCost exceeded held estimate", {
      pipelineId,
      heldCost,
      actualCost,
    });
  }

  const refundAmount = Math.max(0, heldCost - actualCost);
  if (refundAmount > 0) await port.refund(userId, pipelineId, refundAmount);

  const now = new Date();

  if (failedSteps.length > 0 || leftover.length > 0) {
    const status = done.length > 0 ? PipelineStatus.PARTIAL : PipelineStatus.FAILED;
    const error =
      failedSteps[0]?.error ??
      `pipeline did not complete: ${leftover.length} step(s) unresolved`;
    await port.setPipeline(pipelineId, {
      status,
      actualCost,
      error,
      progress: progressFor(finalSteps),
      completedAt: now,
    });
    return;
  }

  // Success: terminal asset = a DONE "merge" step, else the last DONE step with an asset.
  const mergeStep = done.find((s) => s.key === "merge" && s.outputAssetId);
  const lastAssetStep = [...done].reverse().find((s) => s.outputAssetId);
  const outputAssetId = mergeStep?.outputAssetId ?? lastAssetStep?.outputAssetId ?? null;

  await port.setPipeline(pipelineId, {
    status: PipelineStatus.COMPLETED,
    actualCost,
    outputAssetId,
    progress: 100,
    completedAt: now,
  });
}
