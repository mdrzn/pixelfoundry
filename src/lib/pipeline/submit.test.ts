import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineType, CreditReason } from "@prisma/client";

// Fake tx client — reassigned per test.
const tx = {
  user: {
    updateMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  pipeline: { create: vi.fn() },
  pipelineStep: { createMany: vi.fn() },
  creditLedger: { create: vi.fn() },
};

const providerModelFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    providerModel: { findMany: (...args: unknown[]) => providerModelFindMany(...args) },
    $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
  },
}));

import { submitPipeline } from "./submit";

// MULTI_SHOT default 4 shots => estimate = llm(1) + 4*(img6 + vid30) + merge(2) = 147
const ESTIMATE = 1 + 4 * (6 + 30) + 2;

const baseArgs = {
  userId: "u1",
  type: PipelineType.MULTI_SHOT,
  params: { story: "x", imageModelId: "img", videoModelId: "vid" },
};

beforeEach(() => {
  vi.clearAllMocks();
  providerModelFindMany.mockResolvedValue([
    { id: "img", creditCost: 6 },
    { id: "vid", creditCost: 30 },
  ]);
  tx.user.findUniqueOrThrow.mockResolvedValue({ credits: 100 });
  tx.pipeline.create.mockResolvedValue({ id: "pipe-1" });
  tx.pipelineStep.createMany.mockResolvedValue({ count: 1 });
  tx.creditLedger.create.mockResolvedValue({});
});

describe("submitPipeline", () => {
  it("holds the estimate, creates rows, and enqueues when credits are enough", async () => {
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const result = await submitPipeline(baseArgs, { enqueue });

    expect(ESTIMATE).toBe(147);
    expect(result).toEqual({ pipelineId: "pipe-1", heldCost: ESTIMATE });

    // pipeline.create: heldCost === estimatedCost === estimate
    const createArg = tx.pipeline.create.mock.calls[0][0];
    expect(createArg.data.heldCost).toBe(ESTIMATE);
    expect(createArg.data.estimatedCost).toBe(ESTIMATE);

    // steps planned (>= 1)
    const stepsArg = tx.pipelineStep.createMany.mock.calls[0][0];
    expect(stepsArg.data.length).toBeGreaterThanOrEqual(1);

    // ledger DEDUCT, delta = -estimate
    const ledgerArg = tx.creditLedger.create.mock.calls[0][0];
    expect(ledgerArg.data.reason).toBe(CreditReason.DEDUCT);
    expect(ledgerArg.data.delta).toBe(-ESTIMATE);

    // enqueued once with the pipeline id
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith("pipe-1");
  });

  it("rejects and enqueues nothing / creates nothing when credits are insufficient", async () => {
    tx.user.updateMany.mockResolvedValue({ count: 0 });
    const enqueue = vi.fn().mockResolvedValue(undefined);

    await expect(submitPipeline(baseArgs, { enqueue })).rejects.toThrow(/insufficient/i);

    expect(enqueue).not.toHaveBeenCalled();
    expect(tx.pipeline.create).not.toHaveBeenCalled();
  });
});
