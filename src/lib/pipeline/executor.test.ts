import { describe, expect, it } from "vitest";
import { AssetType, PipelineStatus, PipelineType, StepStatus } from "@prisma/client";
import type { ProviderRunAsset } from "@/lib/providers/types";
import type { PlannedStep } from "./types";
import { runPipeline, type ExecStep, type ExecutorPort } from "./executor";

type RunStepFn = (
  step: ExecStep,
  resolvedInput: Record<string, unknown>,
) => Promise<{ data?: unknown; asset?: ProviderRunAsset }>;

type FakeOpts = {
  type?: PipelineType;
  userId?: string;
  params?: Record<string, unknown>;
  heldCost: number;
  seedSteps: ExecStep[];
  runStep: RunStepFn;
  cost: (stepType: string, providerModelId?: string | null) => number;
};

type FakePort = ExecutorPort & {
  runOrder: string[];
  ranKeys: Set<string>;
  refunds: { userId: string; pipelineId: string; amount: number }[];
  getStep: (key: string) => ExecStep | undefined;
  pipeline: { status: PipelineStatus; progress: number; actualCost: number; outputAssetId: string | null; error: string | null; completedAt?: Date };
};

function makeFakePort(opts: FakeOpts): FakePort {
  const pipelineId = "pipe-1";
  const userId = opts.userId ?? "user-1";
  const steps = new Map<string, ExecStep>();
  for (const s of opts.seedSteps) steps.set(s.key, { ...s });

  let idCounter = steps.size;
  const runOrder: string[] = [];
  const ranKeys = new Set<string>();
  const refunds: { userId: string; pipelineId: string; amount: number }[] = [];

  const pipeline = {
    id: pipelineId,
    userId,
    type: opts.type ?? PipelineType.MULTI_SHOT,
    params: opts.params ?? {},
    heldCost: opts.heldCost,
    status: PipelineStatus.QUEUED as PipelineStatus,
    progress: 0,
    actualCost: 0,
    outputAssetId: null as string | null,
    error: null as string | null,
    completedAt: undefined as Date | undefined,
  };

  const port: FakePort = {
    runOrder,
    ranKeys,
    refunds,
    pipeline,
    getStep: (key) => steps.get(key),

    async loadPipeline(id) {
      if (id !== pipelineId) return null;
      return {
        id: pipeline.id,
        userId: pipeline.userId,
        type: pipeline.type,
        params: pipeline.params,
        heldCost: pipeline.heldCost,
      };
    },

    async loadSteps() {
      // return copies to mimic a DB read (executor should not mutate directly)
      return [...steps.values()].map((s) => ({ ...s }));
    },

    async addStep(_pid, planned: PlannedStep) {
      if (steps.has(planned.key)) return; // idempotent on key
      steps.set(planned.key, {
        id: `step-${++idCounter}`,
        key: planned.key,
        name: planned.name,
        stepType: planned.stepType,
        status: StepStatus.PENDING,
        dependsOn: planned.dependsOn,
        input: planned.input,
        providerModelId: planned.providerModelId ?? null,
        cost: planned.cost,
        attempts: 0,
      });
    },

    async patchStep(stepId, patch) {
      const existing = [...steps.values()].find((s) => s.id === stepId);
      if (!existing) throw new Error(`patchStep: no step with id ${stepId}`);
      const { startedAt: _st, finishedAt: _fi, ...rest } = patch;
      Object.assign(existing, rest);
    },

    async setPipeline(_id, patch) {
      if (patch.status !== undefined) pipeline.status = patch.status;
      if (patch.progress !== undefined) pipeline.progress = patch.progress;
      if (patch.actualCost !== undefined) pipeline.actualCost = patch.actualCost;
      if (patch.outputAssetId !== undefined) pipeline.outputAssetId = patch.outputAssetId;
      if (patch.error !== undefined) pipeline.error = patch.error;
      if (patch.completedAt !== undefined) pipeline.completedAt = patch.completedAt;
    },

    async runStep(step, resolvedInput) {
      runOrder.push(step.key);
      ranKeys.add(step.key);
      return opts.runStep(step, resolvedInput);
    },

    async persistAsset(stepId, _userId, asset) {
      return { assetId: `asset-${stepId}`, assetUrl: `${asset.url}#persisted` };
    },

    async refund(uid, pid, amount) {
      refunds.push({ userId: uid, pipelineId: pid, amount });
    },

    cost: opts.cost,
  };

  return port;
}

function pending(over: Partial<ExecStep> & { key: string; id: string }): ExecStep {
  return {
    name: over.key,
    stepType: over.stepType ?? "llm",
    status: StepStatus.PENDING,
    dependsOn: [],
    input: {},
    providerModelId: null,
    cost: 0,
    attempts: 0,
    ...over,
  };
}

const asset = (url: string): ProviderRunAsset => ({ type: AssetType.VIDEO, url });

describe("runPipeline", () => {
  it("scenario 1: linear order + success reconciles credits", async () => {
    const port = makeFakePort({
      type: PipelineType.MULTI_SHOT,
      heldCost: 100,
      seedSteps: [
        pending({ id: "s-a", key: "A", stepType: "step", cost: 10, dependsOn: [] }),
        pending({ id: "s-b", key: "B", stepType: "step", cost: 20, dependsOn: ["A"] }),
      ],
      cost: () => 0,
      async runStep(step) {
        return { data: { from: step.key } };
      },
    });

    await runPipeline("pipe-1", port);

    expect(port.getStep("A")!.status).toBe(StepStatus.DONE);
    expect(port.getStep("B")!.status).toBe(StepStatus.DONE);
    expect(port.runOrder).toEqual(["A", "B"]); // B strictly after A
    expect(port.pipeline.status).toBe(PipelineStatus.COMPLETED);
    expect(port.pipeline.progress).toBe(100);
    expect(port.refunds).toEqual([{ userId: "user-1", pipelineId: "pipe-1", amount: 100 - 30 }]);
  });

  it("scenario 2: dynamic fan-out via real MULTI_SHOT definition", async () => {
    const COSTS: Record<string, number> = { llm: 1, image: 5, video: 8, merge: 2 };
    const port = makeFakePort({
      type: PipelineType.MULTI_SHOT,
      params: {
        story: "a story",
        imageModelId: "img-model",
        videoModelId: "vid-model",
        llmModelId: "llm-model",
        maxShots: 4,
      },
      heldCost: 1000,
      seedSteps: [
        pending({ id: "s-shots", key: "shots", stepType: "llm", cost: 1, dependsOn: [] }),
      ],
      cost: (stepType) => COSTS[stepType] ?? 0,
      async runStep(step) {
        if (step.stepType === "llm") {
          return {
            data: {
              shots: [
                { image_prompt: "a", video_prompt: "m" },
                { image_prompt: "b", video_prompt: "n" },
              ],
            },
          };
        }
        // image / video / merge produce assets
        return { asset: asset(`https://x/${step.key}.mp4`) };
      },
    });

    await runPipeline("pipe-1", port);

    // 2 image + 2 video + 1 merge created
    for (const k of ["shot:0:image", "shot:1:image", "shot:0:video", "shot:1:video", "merge"]) {
      expect(port.getStep(k), `missing step ${k}`).toBeDefined();
      expect(port.getStep(k)!.status, `step ${k} not done`).toBe(StepStatus.DONE);
    }
    expect(port.getStep("shots")!.status).toBe(StepStatus.DONE);

    // deps respected: each video after its image, merge after all videos
    const idx = (k: string) => port.runOrder.indexOf(k);
    expect(idx("shot:0:video")).toBeGreaterThan(idx("shot:0:image"));
    expect(idx("shot:1:video")).toBeGreaterThan(idx("shot:1:image"));
    expect(idx("merge")).toBeGreaterThan(idx("shot:0:video"));
    expect(idx("merge")).toBeGreaterThan(idx("shot:1:video"));

    expect(port.pipeline.status).toBe(PipelineStatus.COMPLETED);
    // terminal asset = merge's asset
    expect(port.pipeline.outputAssetId).toBe(`asset-${port.getStep("merge")!.id}`);
  });

  it("scenario 3: mid-graph failure stops downstream + reconciles", async () => {
    const port = makeFakePort({
      type: PipelineType.MULTI_SHOT,
      heldCost: 100,
      seedSteps: [
        pending({ id: "s-a", key: "A", stepType: "step", cost: 10, dependsOn: [] }),
        pending({ id: "s-b", key: "B", stepType: "step", cost: 20, dependsOn: ["A"] }),
        pending({ id: "s-c", key: "C", stepType: "step", cost: 30, dependsOn: ["B"] }),
      ],
      cost: () => 0,
      async runStep(step) {
        if (step.key === "B") throw new Error("boom-B");
        return { data: { from: step.key } };
      },
    });

    await runPipeline("pipe-1", port);

    expect(port.getStep("A")!.status).toBe(StepStatus.DONE);
    expect(port.getStep("B")!.status).toBe(StepStatus.FAILED);
    expect(port.getStep("B")!.attempts).toBe(1);
    expect(port.getStep("C")!.status).toBe(StepStatus.PENDING); // never ran
    expect(port.ranKeys.has("C")).toBe(false);
    // A done → PARTIAL
    expect(port.pipeline.status).toBe(PipelineStatus.PARTIAL);
    expect(port.pipeline.error).toContain("boom-B");
    // only A charged
    expect(port.refunds).toEqual([{ userId: "user-1", pipelineId: "pipe-1", amount: 100 - 10 }]);
  });

  it("scenario 4: resume skips DONE steps and uses persisted output", async () => {
    const port = makeFakePort({
      type: PipelineType.MULTI_SHOT,
      heldCost: 50,
      seedSteps: [
        pending({
          id: "s-a",
          key: "A",
          stepType: "step",
          cost: 10,
          dependsOn: [],
          status: StepStatus.DONE,
          output: { value: 42 },
          outputAssetId: null,
          assetUrl: null,
        }),
        pending({
          id: "s-b",
          key: "B",
          stepType: "step",
          cost: 20,
          dependsOn: ["A"],
          input: { fromA: { $data: "A", path: "value" } },
        }),
      ],
      cost: () => 0,
      async runStep(step, resolved) {
        return { data: { received: resolved } };
      },
    });

    await runPipeline("pipe-1", port);

    expect(port.ranKeys.has("A")).toBe(false); // A already DONE, not re-run
    expect(port.ranKeys.has("B")).toBe(true);
    expect(port.getStep("B")!.status).toBe(StepStatus.DONE);
    // B saw A's persisted output resolved via $data ref
    expect((port.getStep("B")!.output as { received: Record<string, unknown> }).received).toEqual({
      fromA: 42,
    });
    expect(port.pipeline.status).toBe(PipelineStatus.COMPLETED);
    // only B charged this run (A was already accounted): actualCost = done sum = 30, refund = 50-30
    expect(port.refunds).toEqual([{ userId: "user-1", pipelineId: "pipe-1", amount: 50 - 30 }]);
  });
});
