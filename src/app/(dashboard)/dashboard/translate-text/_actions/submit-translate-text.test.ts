import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineType, Provider } from "@prisma/client";

const getSession = vi.fn();
const submitPipeline = vi.fn();
const findFirst = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
}));

vi.mock("@/lib/pipeline/submit", () => ({
  submitPipeline: (...args: unknown[]) => submitPipeline(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    providerModel: { findFirst: (...args: unknown[]) => findFirst(...args) },
  },
}));

import { submitTranslateTextAction } from "./submit-translate-text";

const validInput = { text: "Hello world", targetLanguage: "es" };

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "u1" } });
  submitPipeline.mockResolvedValue({ pipelineId: "p1", heldCost: 1 });
  findFirst.mockResolvedValue({ id: "llm-id" });
});

describe("submitTranslateTextAction", () => {
  it("submits with resolved llm model id when authed + valid", async () => {
    const result = await submitTranslateTextAction(validInput);

    expect(submitPipeline).toHaveBeenCalledWith({
      userId: "u1",
      type: PipelineType.TRANSLATE_TEXT,
      params: { text: "Hello world", targetLanguage: "es", llmModelId: "llm-id" },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ provider: Provider.FAL, slug: "fal-ai/any-llm" }),
      }),
    );
    expect(result).toEqual({ ok: true, pipelineId: "p1", heldCost: 1 });
  });

  it("rejects when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const result = await submitTranslateTextAction(validInput);
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("rejects invalid input (empty text)", async () => {
    const result = await submitTranslateTextAction({ text: "", targetLanguage: "es" });
    expect(result.ok).toBe(false);
    expect(submitPipeline).not.toHaveBeenCalled();
  });

  it("returns configured-error when the model is missing", async () => {
    findFirst.mockResolvedValue(null);
    const result = await submitTranslateTextAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not configured yet/i);
    expect(submitPipeline).not.toHaveBeenCalled();
  });
});
