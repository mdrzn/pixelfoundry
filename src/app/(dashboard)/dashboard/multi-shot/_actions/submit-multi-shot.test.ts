import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineType } from "@prisma/client";

const getSession = vi.fn();
const submitPipeline = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
}));

vi.mock("@/lib/pipeline/submit", () => ({
  submitPipeline: (...args: unknown[]) => submitPipeline(...args),
}));

import { submitMultiShotAction } from "./submit-multi-shot";

const validInput = {
  story: "A dog learns to surf and wins the championship.",
  imageModelId: "img-1",
  videoModelId: "vid-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "u1" } });
  submitPipeline.mockResolvedValue({ pipelineId: "p1", heldCost: 147 });
});

describe("submitMultiShotAction", () => {
  it("submits with parsed params (defaults applied) when authed + valid", async () => {
    const result = await submitMultiShotAction(validInput);

    expect(submitPipeline).toHaveBeenCalledTimes(1);
    expect(submitPipeline).toHaveBeenCalledWith({
      userId: "u1",
      type: PipelineType.MULTI_SHOT,
      params: {
        story: validInput.story,
        imageModelId: "img-1",
        videoModelId: "vid-1",
        maxShots: 4,
        aspectRatio: "9:16",
      },
    });
    expect(result).toEqual({ ok: true, pipelineId: "p1", heldCost: 147 });
  });

  it("rejects when unauthenticated and does not call submitPipeline", async () => {
    getSession.mockResolvedValue(null);

    const result = await submitMultiShotAction(validInput);

    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects invalid input (story too short) without calling submitPipeline", async () => {
    const result = await submitMultiShotAction({ ...validInput, story: "short" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at least 10/);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("returns the error message when submitPipeline throws (insufficient credits)", async () => {
    submitPipeline.mockRejectedValue(new Error("Insufficient credits for this action."));

    const result = await submitMultiShotAction(validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/insufficient/i);
  });
});
