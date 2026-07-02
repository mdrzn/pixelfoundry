import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreditReason } from "@prisma/client";

// Fake tx client — reassigned per test.
const tx = {
  creditLedger: { findFirst: vi.fn(), create: vi.fn() },
  user: { update: vi.fn() },
};

const providerModelFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    providerModel: { findMany: (...args: unknown[]) => providerModelFindMany(...args) },
    $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
  },
}));

import { createExecutorPort } from "./port";

beforeEach(() => {
  vi.clearAllMocks();
  // No model ids in params -> preloading skips the DB entirely, but keep it safe.
  providerModelFindMany.mockResolvedValue([]);
});

async function makePort() {
  return createExecutorPort({ userId: "u1", params: {} });
}

describe("createExecutorPort refund (money-critical, idempotent per pipeline)", () => {
  it("first refund: increments credits and writes one REFUND ledger row", async () => {
    tx.creditLedger.findFirst.mockResolvedValue(null);
    tx.user.update.mockResolvedValue({ credits: 100 });

    const port = await makePort();
    await port.refund("u1", "pipe-1", 40);

    expect(tx.user.update).toHaveBeenCalledTimes(1);
    const updateArg = tx.user.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "u1" });
    expect(updateArg.data).toEqual({ credits: { increment: 40 } });

    expect(tx.creditLedger.create).toHaveBeenCalledTimes(1);
    const ledgerArg = tx.creditLedger.create.mock.calls[0][0];
    expect(ledgerArg.data).toMatchObject({
      userId: "u1",
      pipelineId: "pipe-1",
      delta: 40,
      balanceAfter: 100,
      reason: CreditReason.REFUND,
    });
  });

  it("idempotent second refund: an existing REFUND row means no side effects", async () => {
    tx.creditLedger.findFirst.mockResolvedValue({ id: "led-1", reason: CreditReason.REFUND });

    const port = await makePort();
    await port.refund("u1", "pipe-1", 40);

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.creditLedger.create).not.toHaveBeenCalled();
  });

  it("zero/negative amount: no refund even when no prior ledger row exists", async () => {
    tx.creditLedger.findFirst.mockResolvedValue(null);

    const port = await makePort();
    await port.refund("u1", "pipe-1", 0);
    await port.refund("u1", "pipe-1", -5);

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.creditLedger.create).not.toHaveBeenCalled();
  });
});
